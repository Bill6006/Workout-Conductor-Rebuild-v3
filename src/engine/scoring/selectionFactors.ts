import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { getMovementPattern, patternsOverlap } from '../../catalog/movementPatterns/movementPatterns'
import { STRESS_WEIGHTS } from '../../catalog/taxonomy/joints'
import {
  DIFFICULTY_SCALE,
  SUITABILITY_SCALE,
  TRANSITION_COST_SCALE,
  WARM_UP_SUITABILITY_SCALE,
} from '../../catalog/taxonomy/scales'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { Experience, TrainingStyle } from '../../core/validation/schemas'
import type { Conflict } from '../alternatives/conflictPort'
import { ADVISORY_CONFLICT_COST, STRONG_CONFLICT_COST } from '../alternatives/factors'
import type { PreferenceMatch } from '../alternatives/preferences'
import { overlapScore } from '../alternatives/sessionView'
import { limitedJoints } from '../conflicts/conflictContext'
import { resolveConflictPolicy } from '../conflicts/conflictPolicy'
import { reachOf } from '../volume/credit'
import type { SessionState } from './sessionState'
import type { SelectionContext, SlotRequest } from './selectionTypes'
import {
  SELECTION_BASELINES,
  SELECTION_FACTOR_KEYS,
  SELECTION_WEIGHTS,
  TOTAL_SELECTION_WEIGHT,
  type SelectionFactorKey,
} from './selectionWeights'

/**
 * THE FACTORS. Each answers a single question about a candidate on 0..1.
 * `selectionWeights.ts` decides what each answer is worth; this file decides
 * what the answer IS.
 *
 * EVERY FACTOR IS A PURE FUNCTION OF THE CANDIDATE, THE SLOT, AND THE SESSION SO
 * FAR. No clock, no randomness, no state carried between candidates. That is
 * what makes the whole ranker deterministic, and it is why each curve can be
 * pinned by its own test independently of the ordering tests.
 *
 * A FACTOR NEVER RETURNS A HARD NO. If a fact should remove a candidate it is a
 * filter and it lives in `selectionFilters.ts`. A factor scoring 0 is saying
 * "this is the worst answer to my question", not "this must not be programmed" —
 * and the two being different is why a person training in a hotel room with no
 * kit still gets a session.
 *
 * NO PROSE. Unlike the alternatives ranker, which renders a line for a swap
 * screen, selection returns factor keys and numbers only. The workout explanation
 * is owned elsewhere in Phase 3; a sentence written here would be a second
 * owner of the product's words.
 *
 * TWO SMALL TABLES ARE DUPLICATED FROM `alternatives/factors.ts` AND THIS IS THE
 * DISCLOSURE. `STYLE_SUITABILITY_WEIGHTS` (how much strength and hypertrophy
 * suitability each count, per training style) and `ROLE_TIERS` (how central a
 * training role is to a session) exist there as module-private constants. They
 * are the same judgements, they must not drift, and they belong in a module both
 * rankers import. Copying them is the smaller wrong than reaching into another
 * agent's file mid-phase; the return note for this work asks for them to be
 * lifted into a shared home.
 */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** How much each suitability counts, by what the person trains for. */
export const STYLE_SUITABILITY_WEIGHTS: Readonly<
  Record<TrainingStyle, { readonly strength: number; readonly hypertrophy: number }>
> = {
  strength: { strength: 0.8, hypertrophy: 0.2 },
  hypertrophy: { strength: 0.2, hypertrophy: 0.8 },
  hybrid: { strength: 0.5, hypertrophy: 0.5 },
}

/**
 * How central a role is to a session. Tiers rather than an alphabet, because the
 * distance that matters is "could this carry the session", not the letter it
 * starts with.
 */
export const ROLE_TIERS: Readonly<Record<TrainingRole, number>> = {
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

/** Setup slower than this is as slow as the factor bothers to distinguish. */
export const SETUP_CEILING_SECONDS = 240

/** Days after which repeating an exercise costs nothing in variety terms. */
export const VARIETY_WINDOW_DAYS = 14

export interface SelectionFactorScore {
  readonly key: SelectionFactorKey
  /** The factor's share of 100, AFTER renormalising over applicable factors. */
  readonly weight: number
  /** 0..1. */
  readonly score: number
  /** `weight * score`. These sum to the candidate's score before rounding. */
  readonly contribution: number
  /**
   * How far this candidate sits above the factor's boring baseline, in the same
   * units as `contribution`. This — not raw contribution — picks the leading
   * factor, because "trains the target muscle" is true of every candidate and
   * therefore explains none of them.
   */
  readonly standout: number
}

export interface FactorApplicability {
  readonly keys: readonly SelectionFactorKey[]
  /** Multiplier that scales the applicable weights back up to 100. */
  readonly scale: number
}

/**
 * Which factors have anything to say for this slot, in this context.
 *
 * IT MUST NOT LOOK AT A CANDIDATE, EVER. Applicability sets the denominator every
 * score is divided by; if one candidate could change it, two candidates in the
 * same call would be measured on different scales and the ordering would be
 * nonsense. A test asserts every candidate in a call carries the same weights.
 */
export function factorApplicability(
  slot: SlotRequest,
  context: SelectionContext,
  hasPreferences: boolean,
): FactorApplicability {
  const keys = SELECTION_FACTOR_KEYS.filter((key) => {
    switch (key) {
      case 'pattern-balance':
      case 'session-overlap':
        return context.chosen.length > 0
      case 'preference':
        return hasPreferences
      case 'recent-exposure':
        return (context.recentExercises ?? []).length > 0
      case 'progression-continuity':
        return (context.progression ?? []).length > 0
      case 'warm-up-fit':
        return slot.role === 'warm-up'
      case 'technique-fit':
        return slot.wantsSuperset === true || slot.wantsDropSet === true
      default:
        return true
    }
  })
  const total = keys.reduce((sum, key) => sum + SELECTION_WEIGHTS[key], 0)
  return { keys, scale: total === 0 ? 0 : TOTAL_SELECTION_WEIGHT / total }
}

/* ------------------------------------------------------------------ *
 * Does it fill the slot?
 * ------------------------------------------------------------------ */

/**
 * A primary hit on the slot's group is the baseline of an acceptable fill; a
 * secondary hit is a reach, and scores like one. On top of the primary hit, the
 * exact heads the priorities named decide the rest — which is what makes an
 * incline press win a slot that asked for `upper-chest`.
 */
export function targetMuscleScore(candidate: Exercise, slot: SlotRequest): number {
  const reach = reachOf(candidate, slot.targetGroup)
  if (reach === 'none') return 0
  if (reach === 'secondary') return 0.35

  const wanted = slot.targetMuscles ?? []
  if (wanted.length === 0) return 1
  const primary = new Set<string>(candidate.primaryMuscles)
  const secondary = new Set<string>(candidate.secondaryMuscles)
  const covered =
    wanted.reduce((total, muscle) => total + (primary.has(muscle) ? 1 : secondary.has(muscle) ? 0.5 : 0), 0) /
    wanted.length
  return clamp01(0.6 + 0.4 * covered)
}

/**
 * The role the slot asked for, and the SHAPE that role implies. An anchor slot
 * wants a compound movement and an isolation slot wants an isolation one, which
 * the role alone does not quite say — several roles are filled by both.
 */
export function roleFitScore(candidate: Exercise, slot: SlotRequest): number {
  const distance = Math.abs(ROLE_TIERS[candidate.trainingRole] - ROLE_TIERS[slot.role])
  const tier = candidate.trainingRole === slot.role ? 1 : Math.max(0, 0.85 - 0.3 * distance)
  const wantsCompound = ROLE_TIERS[slot.role] <= 1
  const isCompound = candidate.compoundOrIsolation === 'compound'
  const shape = wantsCompound === isCompound ? 1 : 0.4
  return clamp01(0.7 * tier + 0.3 * shape)
}

/** How well the exercise serves the style the person trains in, on its own terms. */
export function styleSuitabilityScore(candidate: Exercise, style: TrainingStyle): number {
  const weights = STYLE_SUITABILITY_WEIGHTS[style]
  const top = SUITABILITY_SCALE.values.length - 1
  const weighted =
    weights.strength * SUITABILITY_SCALE.rank(candidate.strengthSuitability) +
    weights.hypertrophy * SUITABILITY_SCALE.rank(candidate.hypertrophySuitability)
  return clamp01(weighted / top)
}

/* ------------------------------------------------------------------ *
 * Does it fit the session being built?
 * ------------------------------------------------------------------ */

/**
 * A ladder, not a formula. Repeating a pattern already in the session is the
 * worst answer, a pattern the catalog calls overlapping is nearly as bad, the
 * same chain is unremarkable, and a chain nothing has touched is the best.
 */
export function patternBalanceScore(candidate: Exercise, state: SessionState): number {
  if (state.chosen.length === 0) return 1
  if (state.usedPatterns.has(candidate.movementPattern)) return 0
  for (const used of state.usedPatterns) {
    if (patternsOverlap(candidate.movementPattern, used)) return 0.35
  }
  const chain = getMovementPattern(candidate.movementPattern).chain
  for (const used of state.usedPatterns) {
    if (getMovementPattern(used).chain === chain) return 0.7
  }
  return 1
}

/** 1 when nothing in the session does the same work; 0 when something already does. */
export function sessionOverlapScore(candidate: Exercise, state: SessionState): number {
  if (state.chosen.length === 0) return 1
  const worst = state.chosen.reduce(
    (peak, entry) => Math.max(peak, overlapScore(candidate, entry.exercise)),
    0,
  )
  return clamp01(1 - worst)
}

/**
 * How much room is left on the joints this candidate would load.
 *
 * The ceiling is the conflict policy's `jointStressStrong`, halved on a joint the
 * person has flagged by the policy's own `limitedJointFactor`. Reusing the
 * engine's thresholds is the point: a candidate this factor scores badly is one
 * the engine is about to start warning about, and two sets of numbers would put
 * those two moments in different places.
 */
export function jointStressScore(
  candidate: Exercise,
  state: SessionState,
  context: SelectionContext,
): number {
  if (candidate.jointStressTags.length === 0) return 1
  const policy = resolveConflictPolicy(context.policy)
  const limited = limitedJoints(context.limitations)

  let worst = 0
  for (const tag of candidate.jointStressTags) {
    const ceiling = policy.jointStressStrong * (limited.has(tag.joint) ? policy.limitedJointFactor : 1)
    const used = state.jointLoad[tag.joint] ?? 0
    const headroom = Math.max(1, ceiling - used)
    worst = Math.max(worst, STRESS_WEIGHTS[tag.intensity] / headroom)
  }
  return clamp01(1 - worst)
}

/* ------------------------------------------------------------------ *
 * Does the person want it?
 * ------------------------------------------------------------------ */

/**
 * Preferred ranks up. Dislikes are EXCLUDED upstream rather than penalised, so
 * this factor only ever pushes a candidate above the middle — a preference is a
 * reason to choose something, never a reason to have programmed something worse.
 */
export function preferenceScore(match: PreferenceMatch): number {
  if (match.side !== 'preferred') return 0.5
  return match.route === 'progression-family' ? 0.8 : 1
}

/** Something done recently is a poorer pick than something not done for a while. */
export function recentExposureScore(candidate: Exercise, context: SelectionContext): number {
  const recent = context.recentExercises ?? []
  if (recent.length === 0) return 1
  let closest: number | null = null
  for (const entry of recent) {
    if (entry.exerciseId !== candidate.id || entry.daysAgo < 0) continue
    closest = closest === null ? entry.daysAgo : Math.min(closest, entry.daysAgo)
  }
  if (closest === null) return 1
  return clamp01(closest / VARIETY_WINDOW_DAYS)
}

/* ------------------------------------------------------------------ *
 * Can they do it well, here, now?
 * ------------------------------------------------------------------ */

/**
 * Required kit is already guaranteed by the filter, so what is left to reward is
 * kit that is literally already out. A second dumbbell exercise costs nothing to
 * set up; a cable exercise between two dumbbell ones costs a walk.
 */
export function equipmentScore(
  candidate: Exercise,
  state: SessionState,
  available: ReadonlySet<EquipmentId>,
): number {
  const needed = candidate.equipment
  const staged =
    needed.length === 0 ? 1 : needed.filter((id) => state.stagedEquipment.has(id)).length / needed.length
  const optional =
    candidate.optionalEquipment.length === 0
      ? 1
      : candidate.optionalEquipment.filter((id) => available.has(id)).length /
        candidate.optionalEquipment.length
  return clamp01(0.55 + 0.3 * staged + 0.15 * optional)
}

/**
 * Setup seconds and the transition rung together, with a discount for a station
 * the session is already standing at. The two catalog fields say different
 * things — one is minutes of loading, the other is how far across the gym — and
 * a session that ignores the second sends a person back and forth all evening.
 */
export function setupCostScore(candidate: Exercise, state: SessionState): number {
  const time = clamp01(1 - candidate.setupTimeSeconds / SETUP_CEILING_SECONDS)
  const rungs = TRANSITION_COST_SCALE.values.length - 1
  const station = candidate.supersetCompatibility.stationId
  const alreadyThere = station !== null && state.stagedStations.has(station)
  const transition = alreadyThere ? 1 : 1 - TRANSITION_COST_SCALE.rank(candidate.transitionCost) / rungs
  return clamp01(0.6 * time + 0.4 * transition)
}

/** Handing a beginner an advanced lift is a bad pick, not an unsafe one. */
export function experienceFitScore(candidate: Exercise, experience: Experience): number {
  const gap = DIFFICULTY_SCALE.rank(candidate.difficulty) - DIFFICULTY_SCALE.rank(experience)
  if (gap === 0) return 1
  if (gap < 0) return 0.85
  return gap === 1 ? 0.4 : 0.1
}

/* ------------------------------------------------------------------ *
 * Does it keep what they have built, and do what the slot asked?
 * ------------------------------------------------------------------ */

/**
 * Staying in a family the person already has a working load in is what stops a
 * session starting from "unknown weight" on every lift. Inapplicable until Phase
 * 6 supplies progression state — never a penalty for a fact nobody knows yet.
 */
export function progressionScore(candidate: Exercise, context: SelectionContext): number {
  const known = context.progression ?? []
  if (known.length === 0) return 1
  if (known.some((entry) => entry.exerciseId === candidate.id)) return 1
  if (known.some((entry) => entry.progressionFamily === candidate.progressionFamily)) return 0.75
  return 0.3
}

/** Only asked when the slot IS a warm-up. `unsuitable` was excluded upstream. */
export function warmUpFitScore(candidate: Exercise): number {
  const rungs = WARM_UP_SUITABILITY_SCALE.values.length - 1
  return clamp01(WARM_UP_SUITABILITY_SCALE.rank(candidate.warmUpSuitability) / rungs)
}

/** Only asked when the slot wants a superset, a drop set, or both. */
export function techniqueFitScore(candidate: Exercise, slot: SlotRequest): number {
  const asks: number[] = []
  if (slot.wantsSuperset) asks.push(candidate.supersetCompatibility.eligible ? 1 : 0)
  if (slot.wantsDropSet) asks.push(candidate.safeForDropSet ? 1 : 0)
  if (asks.length === 0) return 1
  return asks.reduce((total, value) => total + value, 0) / asks.length
}

/** What the engine's non-blocking findings cost. The costs are the shared ones. */
export function conflictCautionScore(conflicts: readonly Conflict[]): number {
  const cost = conflicts.reduce((total, conflict) => {
    if (conflict.severity === 'strong') return total + STRONG_CONFLICT_COST
    if (conflict.severity === 'advisory') return total + ADVISORY_CONFLICT_COST
    return total
  }, 0)
  return clamp01(1 - cost)
}

/* ------------------------------------------------------------------ *
 * Putting them together
 * ------------------------------------------------------------------ */

export interface ScoringInput {
  readonly candidate: Exercise
  readonly slot: SlotRequest
  readonly context: SelectionContext
  readonly state: SessionState
  readonly available: ReadonlySet<EquipmentId>
  readonly preference: PreferenceMatch
  readonly conflicts: readonly Conflict[]
  readonly applicability: FactorApplicability
}

export interface CandidateScore {
  /** 0-100, whole number. 100 is a perfect fill FOR THIS SLOT. */
  readonly total: number
  readonly factors: readonly SelectionFactorScore[]
  /** The factor sitting furthest above its baseline. Never null. */
  readonly leadingFactor: SelectionFactorKey
}

function rawScore(key: SelectionFactorKey, input: ScoringInput): number {
  switch (key) {
    case 'target-muscle':
      return targetMuscleScore(input.candidate, input.slot)
    case 'role-fit':
      return roleFitScore(input.candidate, input.slot)
    case 'style-suitability':
      return styleSuitabilityScore(input.candidate, input.context.trainingStyle)
    case 'pattern-balance':
      return patternBalanceScore(input.candidate, input.state)
    case 'session-overlap':
      return sessionOverlapScore(input.candidate, input.state)
    case 'joint-stress':
      return jointStressScore(input.candidate, input.state, input.context)
    case 'preference':
      return preferenceScore(input.preference)
    case 'recent-exposure':
      return recentExposureScore(input.candidate, input.context)
    case 'equipment-on-hand':
      return equipmentScore(input.candidate, input.state, input.available)
    case 'setup-cost':
      return setupCostScore(input.candidate, input.state)
    case 'experience-fit':
      return experienceFitScore(input.candidate, input.context.experience)
    case 'progression-continuity':
      return progressionScore(input.candidate, input.context)
    case 'warm-up-fit':
      return warmUpFitScore(input.candidate)
    case 'technique-fit':
      return techniqueFitScore(input.candidate, input.slot)
    case 'conflict-caution':
      return conflictCautionScore(input.conflicts)
  }
}

/** Scores one candidate against one slot. Pure; the same input scores the same. */
export function scoreCandidate(input: ScoringInput): CandidateScore {
  const { keys, scale } = input.applicability
  const factors: SelectionFactorScore[] = keys.map((key) => {
    const weight = SELECTION_WEIGHTS[key] * scale
    const score = clamp01(rawScore(key, input))
    return {
      key,
      weight: Math.round(weight * 1000) / 1000,
      score: Math.round(score * 1000) / 1000,
      contribution: Math.round(weight * score * 1000) / 1000,
      standout: Math.round(weight * (score - SELECTION_BASELINES[key]) * 1000) / 1000,
    }
  })

  const total = factors.reduce((sum, factor) => sum + factor.contribution, 0)

  // The leading factor is the biggest standout. On an exact tie the earlier key
  // in `SELECTION_FACTOR_KEYS` wins, which is weight order — a documented,
  // stable rule rather than whichever the sort happened to visit first.
  let leading = factors[0]
  for (const factor of factors) {
    if (factor.standout > leading.standout) leading = factor
  }

  return {
    total: Math.round(total),
    factors,
    leadingFactor: leading?.key ?? 'target-muscle',
  }
}
