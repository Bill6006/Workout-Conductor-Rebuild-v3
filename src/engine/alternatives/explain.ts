import { equipmentLabel } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import {
  difficultyLabel,
  gripDemandLabel,
  movementPatternLabel,
  repUnitLabel,
  stabilityDemandLabel,
} from '../../catalog/labels/catalogLabels'
import { patternsOverlap } from '../../catalog/movementPatterns/movementPatterns'
import { DIFFICULTY_SCALE, GRIP_DEMAND_SCALE, STABILITY_DEMAND_SCALE } from '../../catalog/taxonomy/scales'
import { progressionCarriesAcross, type CompetingDemand } from '../../catalog/taxonomy/taxonomy'
import { SUPERSET_CONFLICT_KINDS, type Conflict } from './conflictPort'
import { pathClass } from './factors'
import { jaccard, type SessionView } from './sessionView'
import {
  DIFFERENCE_CODES,
  DIFFERENCE_MAGNITUDES,
  MATCH_QUALITIES,
  type AlternativeDifference,
  type AlternativeReason,
  type DifferenceMagnitude,
  type FactorScore,
  type MatchQuality,
  type ProgressionContinuity,
  type SupersetImpact,
} from './types'
import { FACTOR_BASELINES, MATCH_QUALITY_THRESHOLDS } from './weights'

/**
 * WHAT THE SCREEN IS OWED.
 *
 * Phase 5 has to show, for every alternative: why it ranks where it does, what
 * will feel different, whether progression survives, and what happens to a
 * superset. This file produces all four as STRUCTURED data with a short line
 * attached — never a sentence a screen has to take apart again.
 *
 * WHY THE PRIMARY REASON IS NOT THE BIGGEST NUMBER. Every candidate that got this
 * far trains the right muscle; the filter guaranteed it. So "trains the same
 * muscle" has the largest contribution on almost every one of them and explains
 * none of them. The reason shown is instead the factor furthest above its
 * BASELINE — the one where this candidate is unusual — which is what a person
 * asking "why is this one first" is actually asking.
 */

/* ------------------------------------------------------------------ *
 * Progression
 * ------------------------------------------------------------------ */

/**
 * `progressionCarriesAcross` in the taxonomy owns the rule. This reports it, and
 * says it in words, so no screen ever compares two family ids itself.
 */
export function progressionContinuity(candidate: Exercise, current: Exercise): ProgressionContinuity {
  const preservesHistory = progressionCarriesAcross(current.progressionFamily, candidate.progressionFamily)
  return {
    preservesHistory,
    currentFamily: current.progressionFamily,
    candidateFamily: candidate.progressionFamily,
    text: preservesHistory
      ? 'Your working weight and streak carry straight over'
      : 'Starts its own progression — the logged weight does not carry over',
  }
}

/* ------------------------------------------------------------------ *
 * Supersets
 * ------------------------------------------------------------------ */

function sharedDemandsWith(candidate: Exercise, partner: Exercise): CompetingDemand[] {
  return candidate.supersetCompatibility.competingDemands.filter((demand) =>
    partner.supersetCompatibility.competingDemands.includes(demand),
  )
}

/**
 * What the swap does to the pairing.
 *
 * THE JUDGEMENT IS THE CONFLICT ENGINE'S. `broken` is reported when the engine
 * raises a BLOCKING superset or station conflict — nothing here decides that two
 * exercises cannot be paired. When the caller has not pre-authorised a break, such
 * a candidate never reaches this function because it was excluded; when it has,
 * the candidate survives and this is where the break is reported.
 *
 * `changed` is the softer half: the engine had something non-blocking to say, or
 * the pairing still works but no longer works the SAME way — a different station,
 * a demand both movements now make. Those are facts read straight off the catalog
 * entries, not rules.
 */
export function supersetImpact(
  candidate: Exercise,
  view: SessionView,
  conflicts: readonly Conflict[],
): SupersetImpact {
  const partner = view.supersetPartners[0]
  if (view.target.supersetId === null || partner === undefined) {
    return {
      effect: 'not-in-superset',
      partnerSlotId: null,
      partnerExerciseId: null,
      stationClash: false,
      sharedDemands: [],
      text: 'Not part of a superset',
    }
  }

  const station = candidate.supersetCompatibility.stationId
  const partnerStation = partner.exercise.supersetCompatibility.stationId
  const stationClash = station !== null && station === partnerStation
  const sharedDemands = sharedDemandsWith(candidate, partner.exercise)
  const pairing = conflicts.filter((conflict) => SUPERSET_CONFLICT_KINDS.includes(conflict.kind))
  const broken = pairing.some((conflict) => conflict.severity === 'blocking')

  const base = {
    partnerSlotId: partner.slotId,
    partnerExerciseId: partner.exercise.id,
    stationClash,
    sharedDemands,
  }

  if (broken) {
    return {
      ...base,
      effect: 'broken',
      text: pairing[0]?.reason ?? `Ends the superset with ${partner.exercise.name}`,
    }
  }
  // A different station FROM THE ONE BEING REPLACED changes where the person
  // stands between sets. A different station from the PARTNER's is what a
  // superset is for, and comparing against that would call every clean pairing
  // a change.
  const movesStation = station !== view.target.exercise.supersetCompatibility.stationId
  if (pairing.length > 0 || sharedDemands.length > 0 || movesStation) {
    return {
      ...base,
      effect: 'changed',
      text: pairing[0]?.reason ?? `Changes how it pairs with ${partner.exercise.name}`,
    }
  }
  return { ...base, effect: 'preserved', text: `Still pairs with ${partner.exercise.name}` }
}

/* ------------------------------------------------------------------ *
 * Differences
 * ------------------------------------------------------------------ */

function difference(
  code: AlternativeDifference['code'],
  magnitude: DifferenceMagnitude,
  text: string,
): AlternativeDifference {
  return { code, magnitude, text }
}

function equipmentPhrase(exercise: Exercise): string {
  if (exercise.equipment.length === 0) return 'no equipment'
  return exercise.equipment.map((id) => equipmentLabel(id).toLowerCase()).join(' and ')
}

function midpoint(exercise: Exercise): number {
  return (exercise.typicalRepRange.min + exercise.typicalRepRange.max) / 2
}

/** How far apart two rep ranges have to be before it is worth mentioning. */
export const REP_RANGE_SHIFT_RATIO = 1.4
/** Seconds of setup difference worth mentioning, and the point it becomes notable. */
export const SETUP_DIFFERENCE_SECONDS = 45
export const NOTABLE_SETUP_DIFFERENCE_SECONDS = 90

/**
 * Everything that will feel different, strongest first.
 *
 * The list is exhaustive on purpose and the ORDER is what a screen should trust:
 * `keyDifference` is simply the first of them. Sorting is by magnitude and then by
 * the canonical code order, so two differences of equal weight never swap places
 * between two runs.
 */
export function describeDifferences(
  candidate: Exercise,
  current: Exercise,
  view: SessionView,
  progression: ProgressionContinuity,
  superset: SupersetImpact,
): AlternativeDifference[] {
  const differences: AlternativeDifference[] = []

  if (!progression.preservesHistory) {
    differences.push(
      difference(
        'progression-resets',
        candidate.movementPattern === current.movementPattern ? 'notable' : 'major',
        progression.text,
      ),
    )
  }

  if (superset.effect === 'broken') {
    differences.push(difference('superset-changes', 'major', superset.text))
  } else if (superset.effect === 'changed') {
    differences.push(difference('superset-changes', 'notable', superset.text))
  }

  const equipmentOverlap = jaccard(candidate.equipment, current.equipment)
  if (equipmentOverlap < 1) {
    differences.push(
      difference(
        'different-equipment',
        equipmentOverlap === 0 ? 'major' : 'notable',
        `Uses ${equipmentPhrase(candidate)} instead of ${equipmentPhrase(current)}`,
      ),
    )
  }

  if (candidate.movementPattern !== current.movementPattern) {
    differences.push(
      difference(
        'different-pattern',
        patternsOverlap(candidate.movementPattern, current.movementPattern) ? 'notable' : 'major',
        `A ${movementPatternLabel(candidate.movementPattern).toLowerCase()} rather than a ${movementPatternLabel(
          current.movementPattern,
        ).toLowerCase()}`,
      ),
    )
  }

  if (candidate.compoundOrIsolation !== current.compoundOrIsolation) {
    differences.push(
      difference(
        'compound-isolation-change',
        'major',
        candidate.compoundOrIsolation === 'isolation'
          ? 'Works one joint rather than several'
          : 'Works several joints rather than one',
      ),
    )
  }

  const muscleOverlap = jaccard(candidate.primaryMuscles, current.primaryMuscles)
  if (muscleOverlap < 1) {
    differences.push(
      difference(
        'muscle-emphasis-shift',
        muscleOverlap < 0.34 ? 'notable' : 'slight',
        'Puts the emphasis on a different part of the same muscles',
      ),
    )
  }

  if (pathClass(candidate) !== pathClass(current)) {
    differences.push(
      difference(
        'range-of-motion-change',
        'notable',
        pathClass(candidate) === 'guided'
          ? 'Follows a fixed path rather than a free one'
          : 'You control the path rather than a machine',
      ),
    )
  }

  if (candidate.unilateral !== current.unilateral) {
    differences.push(
      difference(
        'unilateral-change',
        'notable',
        candidate.unilateral ? 'Done one side at a time' : 'Done with both sides together',
      ),
    )
  }

  const stability = STABILITY_DEMAND_SCALE.compare(candidate.stabilityDemand, current.stabilityDemand)
  if (stability !== 0) {
    differences.push(
      difference(
        'stability-change',
        Math.abs(stability) >= 2 ? 'notable' : 'slight',
        `${stabilityDemandLabel(candidate.stabilityDemand)} balance demand`,
      ),
    )
  }

  const grip = GRIP_DEMAND_SCALE.compare(candidate.gripDemand, current.gripDemand)
  if (grip !== 0) {
    differences.push(
      difference(
        'grip-change',
        Math.abs(grip) >= 2 ? 'notable' : 'slight',
        `${gripDemandLabel(candidate.gripDemand)} grip demand`,
      ),
    )
  }

  if (candidate.repUnit !== current.repUnit) {
    differences.push(
      difference(
        'rep-unit-change',
        'major',
        `Measured in ${repUnitLabel(candidate.repUnit).toLowerCase()}, not ${repUnitLabel(
          current.repUnit,
        ).toLowerCase()}`,
      ),
    )
  } else {
    const ratio = midpoint(candidate) / midpoint(current)
    if (ratio >= REP_RANGE_SHIFT_RATIO || ratio <= 1 / REP_RANGE_SHIFT_RATIO) {
      differences.push(
        difference(
          'rep-range-shift',
          'notable',
          `Usually ${candidate.typicalRepRange.min}-${candidate.typicalRepRange.max} ${repUnitLabel(
            candidate.repUnit,
          ).toLowerCase()}`,
        ),
      )
    }
  }

  const difficulty = DIFFICULTY_SCALE.compare(candidate.difficulty, current.difficulty)
  if (difficulty !== 0) {
    differences.push(
      difference(
        'difficulty-change',
        Math.abs(difficulty) >= 2 ? 'notable' : 'slight',
        `${difficultyLabel(candidate.difficulty)} level`,
      ),
    )
  }

  const setupDelta = candidate.setupTimeSeconds - current.setupTimeSeconds
  if (Math.abs(setupDelta) >= SETUP_DIFFERENCE_SECONDS) {
    differences.push(
      difference(
        'setup-time-change',
        Math.abs(setupDelta) >= NOTABLE_SETUP_DIFFERENCE_SECONDS ? 'notable' : 'slight',
        setupDelta > 0
          ? `About ${Math.round(setupDelta)} s longer to set up`
          : `About ${Math.round(-setupDelta)} s quicker to set up`,
      ),
    )
  }

  if (view.target.usesDropSet && !candidate.safeForDropSet) {
    differences.push(
      difference(
        'drop-set-unavailable',
        'notable',
        'This slot is a drop set, and this one cannot be dropped',
      ),
    )
  }

  const magnitudeRank = (value: DifferenceMagnitude) => DIFFERENCE_MAGNITUDES.indexOf(value)
  const codeRank = (value: AlternativeDifference['code']) => DIFFERENCE_CODES.indexOf(value)
  return differences.sort(
    (a, b) => magnitudeRank(b.magnitude) - magnitudeRank(a.magnitude) || codeRank(a.code) - codeRank(b.code),
  )
}

/* ------------------------------------------------------------------ *
 * Reasons
 * ------------------------------------------------------------------ */

function toReason(factor: FactorScore): AlternativeReason {
  const headroom = factor.weight * (1 - FACTOR_BASELINES[factor.key])
  return {
    code: factor.code,
    text: factor.text,
    factor: factor.key,
    strength: headroom <= 0 ? 0 : Math.min(1, Math.max(0, factor.standout / headroom)),
  }
}

export interface ExplainedReasons {
  readonly primary: AlternativeReason
  readonly supporting: readonly AlternativeReason[]
}

/**
 * The reasons, strongest standout first.
 *
 * When nothing stands out — every factor is merely average, which is what an
 * unremarkable-but-workable alternative looks like — the fall-back is the largest
 * plain contribution, so `primaryReason` is never null and a screen never has to
 * handle an alternative that declines to explain itself.
 */
export function explainReasons(factors: readonly FactorScore[]): ExplainedReasons {
  const byStandout = [...factors].sort((a, b) => b.standout - a.standout || a.key.localeCompare(b.key))
  const positive = byStandout.filter((factor) => factor.standout > 0)

  if (positive.length === 0) {
    const byContribution = [...factors].sort(
      (a, b) => b.contribution - a.contribution || a.key.localeCompare(b.key),
    )
    return { primary: toReason(byContribution[0]), supporting: [] }
  }

  const seen = new Set<string>()
  const chosen: FactorScore[] = []
  for (const factor of positive) {
    if (seen.has(factor.code)) continue
    seen.add(factor.code)
    chosen.push(factor)
    if (chosen.length === 3) break
  }

  return { primary: toReason(chosen[0]), supporting: chosen.slice(1).map(toReason) }
}

/* ------------------------------------------------------------------ *
 * Score presentation
 * ------------------------------------------------------------------ */

export function matchQualityFor(matchScore: number): MatchQuality {
  if (matchScore >= MATCH_QUALITY_THRESHOLDS.excellent) return 'excellent'
  if (matchScore >= MATCH_QUALITY_THRESHOLDS.strong) return 'strong'
  if (matchScore >= MATCH_QUALITY_THRESHOLDS.fair) return 'fair'
  return MATCH_QUALITIES[0]
}

/** One compact line: why it is here, and what will feel different. */
export function summarise(primary: AlternativeReason, keyDifference: AlternativeDifference | null): string {
  const parts = [primary.text]
  if (keyDifference) parts.push(keyDifference.text)
  return `${parts.join('. ')}.`
}
