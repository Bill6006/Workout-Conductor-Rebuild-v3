import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { jointLabel, movementPatternLabel, muscleGroupLabel } from '../../catalog/labels/catalogLabels'
import { getMovementPattern, patternsOverlap } from '../../catalog/movementPatterns/movementPatterns'
import { STRESS_WEIGHTS } from '../../catalog/taxonomy/joints'
import { SUITABILITY_SCALE } from '../../catalog/taxonomy/scales'
import type { LoadBasis, TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { TrainingStyle } from '../../core/validation/schemas'
import type { Conflict } from './conflictPort'
import type { PreferenceMatch } from './preferences'
import { gripLevel, jaccard, peakOverlap, primaryGroups, type SessionView } from './sessionView'
import type {
  AlternativesContext,
  FactorScore,
  PerformanceRecord,
  ProgressionContinuity,
  ReasonCode,
  SupersetImpact,
} from './types'
import { FACTOR_BASELINES, FACTOR_KEYS, FACTOR_WEIGHTS, TOTAL_WEIGHT, type FactorKey } from './weights'

/**
 * THE FACTORS. Each one answers a single question about a candidate on 0..1, and
 * says in one line what it found. `weights.ts` decides how much each answer is
 * worth; this file decides what the answer IS.
 *
 * EVERY FACTOR IS A PURE FUNCTION OF THE CANDIDATE AND THE CONTEXT. No clock, no
 * randomness, no accumulated state between candidates. That is what makes the
 * whole ranker deterministic, and it is why `factors.test.ts` can pin the shape
 * of each curve independently of the ordering tests.
 *
 * A FACTOR NEVER RETURNS A HARD NO. If a fact should remove a candidate, it is a
 * filter and it lives in `exclusions.ts`. A factor that scores 0 is saying "this
 * is the worst answer to my question", not "this must not be shown" — and the two
 * being different is the reason a person who has run out of equipment still gets
 * a list.
 */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

interface RawFactor {
  readonly score: number
  readonly code: ReasonCode
  readonly text: string
}

export interface ScoringInput {
  readonly candidate: Exercise
  readonly current: Exercise
  readonly context: AlternativesContext
  readonly view: SessionView
  readonly available: ReadonlySet<EquipmentId>
  readonly preference: PreferenceMatch
  readonly performance: PerformanceRecord | null
  readonly conflicts: readonly Conflict[]
  readonly estimatedSeconds: number
  readonly progression: ProgressionContinuity
  readonly superset: SupersetImpact
}

/* ------------------------------------------------------------------ *
 * Applicability — see the note in weights.ts on why this ignores the candidate
 * ------------------------------------------------------------------ */

export interface FactorApplicability {
  readonly keys: readonly FactorKey[]
  /** Multiplier that scales the applicable weights back up to 100. */
  readonly scale: number
}

/**
 * Which factors have anything to say in this context.
 *
 * IT MUST NOT LOOK AT A CANDIDATE, EVER. Applicability sets the denominator every
 * score is divided by; if one candidate could change it, two candidates in the
 * same call would be measured on different scales and the ordering would be
 * nonsense. A test asserts every candidate in a call carries the same weights.
 */
export function factorApplicability(
  context: AlternativesContext,
  view: SessionView,
  hasPreferences: boolean,
): FactorApplicability {
  const keys = FACTOR_KEYS.filter((key) => {
    switch (key) {
      case 'remaining-time':
        return context.remainingSeconds !== null
      case 'fatigue':
        return context.fatigue !== null
      case 'preference':
        return hasPreferences
      case 'previous-performance':
        return (context.performance ?? []).length > 0
      case 'superset-compatibility':
        return view.target.supersetId !== null && view.supersetPartners.length > 0
      case 'drop-set-compatibility':
        return view.target.usesDropSet
      case 'hand-picked-substitution':
        return view.target.exercise.commonSubstitutions.length > 0
      default:
        return true
    }
  })
  const total = keys.reduce((sum, key) => sum + FACTOR_WEIGHTS[key], 0)
  return { keys, scale: total === 0 ? 0 : TOTAL_WEIGHT / total }
}

/* ------------------------------------------------------------------ *
 * Does it do the same job?
 * ------------------------------------------------------------------ */

function sharedGroupNames(candidate: Exercise, current: Exercise): string {
  const currentGroups = new Set(primaryGroups(current))
  const shared = primaryGroups(candidate).filter((group) => currentGroups.has(group))
  return shared.map((group) => muscleGroupLabel(group).toLowerCase()).join(' and ')
}

/**
 * The exact muscles carry most of the weight and the group carries the rest, so
 * that a flat press can stand in for an incline press (same group, different
 * emphasis) while an exercise that matches the emphasis exactly wins.
 */
function primaryMuscleFactor(candidate: Exercise, current: Exercise): RawFactor {
  const exact = jaccard(candidate.primaryMuscles, current.primaryMuscles)
  const group = jaccard(primaryGroups(candidate), primaryGroups(current))
  const score = 0.65 * exact + 0.35 * group
  const names = sharedGroupNames(candidate, current)
  if (exact === 1) {
    return { score, code: 'same-primary-muscle', text: `Hits exactly the same muscles (${names})` }
  }
  return { score, code: 'same-muscle-group', text: `Still ${names} work, with a different emphasis` }
}

function movementPatternFactor(candidate: Exercise, current: Exercise): RawFactor {
  const candidateName = movementPatternLabel(candidate.movementPattern).toLowerCase()
  if (candidate.movementPattern === current.movementPattern) {
    return { score: 1, code: 'same-movement-pattern', text: `The same ${candidateName} movement` }
  }
  if (patternsOverlap(candidate.movementPattern, current.movementPattern)) {
    return { score: 0.7, code: 'similar-movement-pattern', text: `A close ${candidateName} variation` }
  }
  const a = getMovementPattern(candidate.movementPattern)
  const b = getMovementPattern(current.movementPattern)
  if (a.chain === b.chain) {
    return {
      score: 0.4,
      code: 'similar-movement-pattern',
      text: `Works the same chain as a ${candidateName}`,
    }
  }
  if (a.plane === b.plane) {
    return {
      score: 0.2,
      code: 'similar-movement-pattern',
      text: `Moves in the same plane, as a ${candidateName}`,
    }
  }
  return { score: 0.05, code: 'similar-movement-pattern', text: `A ${candidateName} instead` }
}

/**
 * Roles sit in tiers because the distance that matters is "how central to the
 * session is this", not the alphabet. Swapping a primary strength lift for a
 * secondary one is a real change; swapping it for a warm-up is not a swap.
 */
const ROLE_TIER: Readonly<Record<TrainingRole, number>> = {
  'primary-strength': 0,
  'primary-hypertrophy': 0,
  'secondary-strength': 1,
  'secondary-hypertrophy': 1,
  specialisation: 1,
  isolation: 2,
  finisher: 2,
  corrective: 3,
  'warm-up': 3,
}

function trainingRoleFactor(candidate: Exercise, current: Exercise): RawFactor {
  if (candidate.trainingRole === current.trainingRole) {
    return { score: 1, code: 'same-training-role', text: 'Plays the same part in the session' }
  }
  const distance = Math.abs(ROLE_TIER[candidate.trainingRole] - ROLE_TIER[current.trainingRole])
  const score = Math.max(0, 0.85 - 0.3 * distance)
  return {
    score,
    code: 'same-training-role',
    text: distance === 0 ? 'A near-identical part in the session' : 'A lighter part in the session',
  }
}

/** How much of the score each suitability carries, by what the person is here for. */
const GOAL_WEIGHTS: Readonly<Record<TrainingStyle, { strength: number; hypertrophy: number }>> = {
  strength: { strength: 0.8, hypertrophy: 0.2 },
  hypertrophy: { strength: 0.2, hypertrophy: 0.8 },
  hybrid: { strength: 0.5, hypertrophy: 0.5 },
}

function weightedSuitability(exercise: Exercise, goal: TrainingStyle): number {
  const weights = GOAL_WEIGHTS[goal]
  return (
    weights.strength * SUITABILITY_SCALE.rank(exercise.strengthSuitability) +
    weights.hypertrophy * SUITABILITY_SCALE.rank(exercise.hypertrophySuitability)
  )
}

/**
 * Similar stimulus, measured against what the person is training FOR. A candidate
 * BETTER suited than the exercise it replaces scores full marks — that is an
 * upgrade, not a mismatch — and only a drop is penalised.
 */
function stimulusFactor(candidate: Exercise, current: Exercise, goal: TrainingStyle): RawFactor {
  const delta = weightedSuitability(candidate, goal) - weightedSuitability(current, goal)
  const suitability = delta >= 0 ? 1 : clamp01(1 + delta / (SUITABILITY_SCALE.values.length - 1))
  const shape = candidate.compoundOrIsolation === current.compoundOrIsolation ? 1 : 0
  return {
    score: 0.75 * suitability + 0.25 * shape,
    code: 'similar-stimulus',
    text:
      delta >= 0 ? 'At least as good a fit for your goal' : 'A slightly softer version of the same stimulus',
  }
}

/**
 * RANGE OF MOTION IS A PROXY, AND THIS PARAGRAPH IS THE DISCLOSURE.
 *
 * The catalog has no range-of-motion field. Adding one would mean an authored
 * judgement on every entry, and Phase 2 did not commit to that. So this factor
 * reads the three structural facts that most decide how a movement FEELS through
 * its range: whether the path is guided (a machine or a cable) or free, whether
 * one joint moves or several, and whether it is done a side at a time.
 *
 * It is honest about being coarse. If Phase 5 finds it is not enough, the fix is a
 * real field on the exercise schema, not a cleverer formula here.
 */
const GUIDED_BASES: readonly LoadBasis[] = ['machine-stack', 'plate-loaded-machine', 'cable-stack']
const UNLOADED_BASES: readonly LoadBasis[] = ['bodyweight', 'bodyweight-loadable', 'unloaded', 'band']

export function pathClass(exercise: Exercise): 'guided' | 'free' | 'bodyweight' {
  if (GUIDED_BASES.includes(exercise.load.basis)) return 'guided'
  if (UNLOADED_BASES.includes(exercise.load.basis)) return 'bodyweight'
  return 'free'
}

function rangeOfMotionFactor(candidate: Exercise, current: Exercise): RawFactor {
  const path = pathClass(candidate) === pathClass(current) ? 1 : 0
  const joints = candidate.compoundOrIsolation === current.compoundOrIsolation ? 1 : 0
  const sides = candidate.unilateral === current.unilateral ? 1 : 0
  const score = 0.5 * path + 0.3 * joints + 0.2 * sides
  return {
    score,
    code: 'similar-range-of-motion',
    text: score >= 0.8 ? 'Moves through much the same range' : 'A different feel through the range',
  }
}

/* ------------------------------------------------------------------ *
 * Can they do it well, right now?
 * ------------------------------------------------------------------ */

/**
 * Required equipment is already guaranteed by the filter, so what is left to
 * reward is kit that is literally already out: a swap using the same dumbbells is
 * better than one that sends them across the gym, even though both are possible.
 */
function equipmentFactor(
  candidate: Exercise,
  current: Exercise,
  available: ReadonlySet<EquipmentId>,
): RawFactor {
  const shared = jaccard(candidate.equipment, current.equipment)
  const optional =
    candidate.optionalEquipment.length === 0
      ? 1
      : candidate.optionalEquipment.filter((id) => available.has(id)).length /
        candidate.optionalEquipment.length
  const score = clamp01(0.6 + 0.25 * shared + 0.15 * optional)
  return {
    score,
    code: 'equipment-on-hand',
    text: shared === 1 ? 'Uses the kit you already have out' : 'Everything it needs is here',
  }
}

/** Three minutes slower to set up is the point at which a swap stops being free. */
export const SETUP_TIME_TOLERANCE_SECONDS = 180

function setupTimeFactor(candidate: Exercise, current: Exercise): RawFactor {
  const delta = candidate.setupTimeSeconds - current.setupTimeSeconds
  const score = clamp01(1 - Math.max(0, delta) / SETUP_TIME_TOLERANCE_SECONDS)
  if (delta <= -15) {
    return { score, code: 'quicker-setup', text: `Sets up about ${Math.round(-delta)} s quicker` }
  }
  return { score, code: 'quicker-setup', text: delta <= 0 ? 'No slower to set up' : 'Takes longer to set up' }
}

/**
 * Anything that would not fit was already excluded, so this scores HEADROOM.
 * Filling the last minute of a session exactly is worse than leaving room, because
 * every estimate here is approximate and the person is the one who pays for it.
 */
export const COMFORTABLE_TIME_RATIO = 0.6

function remainingTimeFactor(estimatedSeconds: number, remainingSeconds: number): RawFactor {
  if (remainingSeconds <= 0) return { score: 0, code: 'fits-remaining-time', text: 'No time left' }
  const ratio = estimatedSeconds / remainingSeconds
  const score =
    ratio <= COMFORTABLE_TIME_RATIO ? 1 : ratio >= 1 ? 0 : (1 - ratio) / (1 - COMFORTABLE_TIME_RATIO)
  return {
    score,
    code: 'fits-remaining-time',
    text: `About ${Math.round(estimatedSeconds / 60)} min of the ${Math.floor(remainingSeconds / 60)} you have`,
  }
}

/* ------------------------------------------------------------------ *
 * Will it wreck the rest of the session?
 * ------------------------------------------------------------------ */

function sessionOverlapFactor(candidate: Exercise, view: SessionView): RawFactor {
  const worst = peakOverlap(candidate, view.others)
  return {
    score: clamp01(1 - worst),
    code: 'avoids-session-overlap',
    text:
      worst <= 0.25
        ? 'Adds something the session does not already have'
        : 'Some overlap with the rest of the session',
  }
}

function fatigueFactor(candidate: Exercise, context: AlternativesContext): RawFactor {
  const fatigue = context.fatigue
  if (!fatigue) return { score: 0.5, code: 'low-fatigue-cost', text: 'Fatigue not measured' }
  const groupFatigue = primaryGroups(candidate).reduce(
    (worst, group) => Math.max(worst, fatigue.byMuscleGroup[group] ?? 0),
    0,
  )
  // A compound movement draws on the whole system; an isolation mostly does not.
  const systemicDraw = candidate.compoundOrIsolation === 'compound' ? 1 : 0.6
  const cost = 0.6 * clamp01(groupFatigue) + 0.4 * clamp01(fatigue.systemic) * systemicDraw
  const score = clamp01(1 - cost)
  return {
    score,
    code: 'low-fatigue-cost',
    text: score >= 0.7 ? 'You still have this in you' : 'Asks a lot of what is left',
  }
}

/**
 * Grip is scored separately from fatigue because it fails on its own schedule: a
 * back session can leave the lats fresh and the hands finished, and the exercise
 * that then goes wrong is the one nobody thought to check.
 *
 * A grip-heavy movement costs something even when the hands are fresh — the 0.3
 * floor — and costs progressively more as the remaining work piles onto them.
 */
export const GRIP_BASE_COST = 0.3

function gripFactor(candidate: Exercise, context: AlternativesContext, view: SessionView): RawFactor {
  const demand = gripLevel(candidate)
  const pressure = Math.max(context.fatigue?.grip ?? 0, view.gripPressure)
  const score = clamp01(1 - demand * (GRIP_BASE_COST + (1 - GRIP_BASE_COST) * clamp01(pressure)))
  return {
    score,
    code: 'spares-grip',
    text:
      demand === 0 ? 'Asks nothing of your grip' : score >= 0.7 ? 'Easy on the grip' : 'Leans on your grip',
  }
}

/**
 * Joint stress is measured in the catalog's own units (`STRESS_WEIGHTS`, where
 * each rung is worth two of the one below) and is charged MORE when the session
 * has already loaded that joint. The divisor is a scale, not a measurement: it is
 * set so that one high-stress tag on a fresh joint is a mild cost and two of them
 * on an already-loaded joint is most of the factor.
 */
export const JOINT_PRESSURE_DIVISOR = 18
const JOINT_LOAD_SENSITIVITY = 8

function totalJointStress(exercise: Exercise): number {
  return exercise.jointStressTags.reduce((total, tag) => total + STRESS_WEIGHTS[tag.intensity], 0)
}

function jointStressFactor(candidate: Exercise, current: Exercise, view: SessionView): RawFactor {
  let pressure = 0
  for (const tag of candidate.jointStressTags) {
    const already = view.jointLoad[tag.joint] ?? 0
    pressure += STRESS_WEIGHTS[tag.intensity] * (1 + already / JOINT_LOAD_SENSITIVITY)
  }
  const score = clamp01(1 - pressure / JOINT_PRESSURE_DIVISOR)
  const gentler = totalJointStress(candidate) < totalJointStress(current)
  const worst = [...candidate.jointStressTags].sort(
    (a, b) => STRESS_WEIGHTS[b.intensity] - STRESS_WEIGHTS[a.intensity],
  )[0]
  if (gentler) {
    return { score, code: 'gentler-on-joints', text: `Easier on your joints than ${current.name}` }
  }
  return {
    score,
    code: 'gentler-on-joints',
    text: worst ? `Some ${jointLabel(worst.joint).toLowerCase()} load` : 'No joint stress worth flagging',
  }
}

/**
 * WHAT THE SESSION STILL OBJECTS TO.
 *
 * Anything blocking was excluded, so what reaches here is the engine's `strong`
 * and `advisory` rungs. They cost score in proportion to how much the engine says
 * they matter — a `strong` conflict is worth two advisories — because a candidate
 * the engine grumbles about should rank below an otherwise identical one it does
 * not, and because the person is still being shown it and allowed to choose.
 */
export const STRONG_CONFLICT_COST = 0.34
export const ADVISORY_CONFLICT_COST = 0.17

function conflictCautionFactor(conflicts: readonly Conflict[]): RawFactor {
  const cost = conflicts.reduce(
    (total, conflict) =>
      conflict.severity === 'strong'
        ? total + STRONG_CONFLICT_COST
        : conflict.severity === 'advisory'
          ? total + ADVISORY_CONFLICT_COST
          : total,
    0,
  )
  return {
    score: clamp01(1 - cost),
    code: 'no-conflicts',
    text: conflicts.length === 0 ? 'Nothing in the session objects' : conflicts[0].reason,
  }
}

/* ------------------------------------------------------------------ *
 * What the person wants, and what they have built
 * ------------------------------------------------------------------ */

function preferenceFactor(preference: PreferenceMatch): RawFactor {
  if (preference.side === 'preferred') {
    if (preference.route === 'progression-family') {
      return { score: 0.75, code: 'preferred-exercise', text: 'Close to one you asked for' }
    }
    return { score: 1, code: 'preferred-exercise', text: 'One you asked for' }
  }
  return { score: 0.5, code: 'preferred-exercise', text: 'Nothing recorded either way' }
}

/** Sessions logged before familiarity stops adding confidence. */
export const FAMILIARITY_SESSIONS = 6

function previousPerformanceFactor(record: PerformanceRecord | null): RawFactor {
  const sessions = record?.sessions ?? 0
  const success = record?.successRate ?? 0.5
  const score = clamp01(0.4 + 0.4 * clamp01(sessions / FAMILIARITY_SESSIONS) + 0.2 * clamp01(success))
  if (sessions === 0) {
    return { score, code: 'proven-history', text: 'New to you' }
  }
  return { score, code: 'proven-history', text: `You have done this ${sessions} times` }
}

/**
 * Whether progression history carries is decided by `progressionCarriesAcross` in
 * the taxonomy, which owns that rule; this only turns its answer into a score.
 * The middle rung — a different family but the same movement on the same kind of
 * implement — is a hedge: history does not formally transfer, but the person's
 * working load is at least in the right neighbourhood.
 */
function progressionFactor(
  candidate: Exercise,
  current: Exercise,
  progression: ProgressionContinuity,
): RawFactor {
  if (progression.preservesHistory) {
    return { score: 1, code: 'keeps-progression', text: 'Keeps your progression and working weight' }
  }
  const nearby =
    candidate.movementPattern === current.movementPattern && candidate.load.basis === current.load.basis
  return {
    score: nearby ? 0.45 : 0.2,
    code: 'keeps-progression',
    text: nearby ? 'Starts fresh, but at a familiar load' : 'Starts its own progression',
  }
}

function supersetFactor(superset: SupersetImpact): RawFactor {
  switch (superset.effect) {
    case 'preserved':
      return { score: 1, code: 'superset-safe', text: 'Your superset still works' }
    case 'changed':
      return { score: 0.6, code: 'superset-safe', text: superset.text }
    case 'broken':
      return { score: 0.15, code: 'superset-safe', text: superset.text }
    default:
      return { score: 1, code: 'superset-safe', text: 'Not part of a superset' }
  }
}

function dropSetFactor(candidate: Exercise): RawFactor {
  return candidate.safeForDropSet
    ? { score: 1, code: 'drop-set-safe', text: 'Safe to drop-set' }
    : { score: 0, code: 'drop-set-safe', text: 'Cannot be drop-setted safely' }
}

function handPickedFactor(candidate: Exercise, current: Exercise): RawFactor {
  const position = current.commonSubstitutions.indexOf(candidate.id)
  if (position === -1) {
    return { score: 0, code: 'hand-picked-substitution', text: 'Not a listed substitution' }
  }
  return {
    score: Math.max(0.6, 1 - position * 0.08),
    code: 'hand-picked-substitution',
    text: `A named substitution for ${current.name}`,
  }
}

/* ------------------------------------------------------------------ *
 * Putting them together
 * ------------------------------------------------------------------ */

function rawFactor(key: FactorKey, input: ScoringInput): RawFactor {
  const { candidate, current, context, view } = input
  switch (key) {
    case 'primary-muscle':
      return primaryMuscleFactor(candidate, current)
    case 'movement-pattern':
      return movementPatternFactor(candidate, current)
    case 'training-role':
      return trainingRoleFactor(candidate, current)
    case 'stimulus':
      return stimulusFactor(candidate, current, context.goal)
    case 'range-of-motion':
      return rangeOfMotionFactor(candidate, current)
    case 'equipment':
      return equipmentFactor(candidate, current, input.available)
    case 'setup-time':
      return setupTimeFactor(candidate, current)
    case 'remaining-time':
      return remainingTimeFactor(input.estimatedSeconds, context.remainingSeconds ?? 0)
    case 'session-overlap':
      return sessionOverlapFactor(candidate, view)
    case 'fatigue':
      return fatigueFactor(candidate, context)
    case 'grip':
      return gripFactor(candidate, context, view)
    case 'joint-stress':
      return jointStressFactor(candidate, current, view)
    case 'preference':
      return preferenceFactor(input.preference)
    case 'previous-performance':
      return previousPerformanceFactor(input.performance)
    case 'progression-continuity':
      return progressionFactor(candidate, current, input.progression)
    case 'superset-compatibility':
      return supersetFactor(input.superset)
    case 'drop-set-compatibility':
      return dropSetFactor(candidate)
    case 'hand-picked-substitution':
      return handPickedFactor(candidate, current)
    case 'conflict-caution':
      return conflictCautionFactor(input.conflicts)
  }
}

export interface CandidateScore {
  /** 0..100, whole number. */
  readonly matchScore: number
  /** Unrounded, for a stable sort that rounding would otherwise flatten. */
  readonly rawScore: number
  readonly factors: readonly FactorScore[]
}

export function scoreCandidate(input: ScoringInput, applicability: FactorApplicability): CandidateScore {
  const factors: FactorScore[] = []
  let raw = 0

  for (const key of applicability.keys) {
    const { score, code, text } = rawFactor(key, input)
    const bounded = clamp01(score)
    const weight = FACTOR_WEIGHTS[key] * applicability.scale
    const contribution = weight * bounded
    raw += contribution
    factors.push({
      key,
      weight,
      score: bounded,
      contribution,
      standout: weight * (bounded - FACTOR_BASELINES[key]),
      code,
      text,
    })
  }

  return {
    matchScore: Math.round(Math.min(TOTAL_WEIGHT, Math.max(0, raw))),
    rawScore: raw,
    factors,
  }
}
