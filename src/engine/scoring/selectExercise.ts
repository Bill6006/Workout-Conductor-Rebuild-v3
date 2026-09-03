/**
 * Choosing the exercise for one slot.
 *
 * Exclusions are FILTERS, not penalties — the same distinction the alternatives
 * ranker makes. Something that needs equipment you do not have, or that a
 * recorded limitation rules out, or that you told us you dislike, does not
 * appear at a low score; it does not appear.
 *
 * Conflict judgements are not made here. The conflict engine owns those, and it
 * is reached through the checker the caller supplies, so there is exactly one
 * place in the app that decides whether two exercises clash.
 */
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import { muscleGroupOf } from '../../catalog/muscles/muscles'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Profile } from '../../core/validation/schemas'
import type { RejectedCandidate } from '../../core/validation/workoutSchema'
import { SECONDARY_MUSCLE_CREDIT } from '../volume/volume'

export interface SelectionContext {
  readonly profile: Profile
  readonly equipment: ReadonlySet<EquipmentId>
  readonly locationKind: 'gym' | 'home' | 'travel'
  /** Exercise ids already placed in this session. */
  readonly used: ReadonlySet<string>
  /** Movement patterns already used, and how often. */
  readonly patternCounts: ReadonlyMap<MovementPatternId, number>
  readonly preferredIds: ReadonlySet<string>
  readonly dislikedIds: ReadonlySet<string>
  /** Seconds left in the budget. A candidate that cannot fit is excluded, not ranked. */
  readonly remainingSeconds: number
}

export interface Candidate {
  readonly exercise: Exercise
  readonly score: number
}

/**
 * Why a candidate was ruled out. These map onto the recalibration metadata's
 * rejection stages so the generator can explain itself without re-deriving.
 */
export type ExclusionCode =
  | 'equipment-unavailable'
  | 'location-unsuitable'
  | 'limitation-contraindicated'
  | 'disliked'
  | 'already-in-session'
  | 'wrong-muscle'

const LIMITATION_TAGS = {
  shoulder: 'shoulder',
  knee: 'knee',
  lowerBack: 'lower-back',
  avoidBarbellSquat: 'barbell-squat',
} as const

/** The hard filters. Returns the reason it is out, or `null` when it stays in. */
export function excludeReason(
  exercise: Exercise,
  group: MuscleGroupId,
  context: SelectionContext,
): ExclusionCode | null {
  if (context.used.has(exercise.id)) return 'already-in-session'
  if (context.dislikedIds.has(exercise.id)) return 'disliked'

  if (!trainsGroup(exercise, group)) return 'wrong-muscle'

  if (!exercise.locationSuitability.includes(context.locationKind)) return 'location-unsuitable'
  for (const needed of exercise.equipment) {
    if (!context.equipment.has(needed)) return 'equipment-unavailable'
  }

  const limits = context.profile.limitations
  for (const [key, tag] of Object.entries(LIMITATION_TAGS) as [keyof typeof LIMITATION_TAGS, string][]) {
    if (limits[key] && exercise.contraindicatedFor.includes(tag as never)) {
      return 'limitation-contraindicated'
    }
  }

  return null
}

/** How much of this exercise's work lands on the group we are training. */
function groupCredit(exercise: Exercise, group: MuscleGroupId): number {
  const primary = exercise.primaryMuscles.some((muscle) => muscleGroupOf(muscle) === group)
  if (primary) return 1
  const secondary = exercise.secondaryMuscles.some((muscle) => muscleGroupOf(muscle) === group)
  return secondary ? SECONDARY_MUSCLE_CREDIT : 0
}

function trainsGroup(exercise: Exercise, group: MuscleGroupId): boolean {
  return groupCredit(exercise, group) > 0
}

const SUITABILITY_SCORE = {
  unsuitable: 0,
  limited: 0.25,
  moderate: 0.5,
  good: 0.8,
  excellent: 1,
} as const

/**
 * Score a candidate for a slot. Higher is better.
 *
 * The weights are deliberate rather than tuned: how well it trains the target
 * dominates, because a slot exists to train something; role fit comes next,
 * because a strength slot filled with a cable fly is a worse session than one
 * filled with a second-choice press; and the cheap signals — setup cost, pattern
 * variety, preference — break ties without ever outvoting the first two.
 */
export function scoreCandidate(
  exercise: Exercise,
  group: MuscleGroupId,
  role: TrainingRole,
  context: SelectionContext,
): number {
  const credit = groupCredit(exercise, group)

  const wantsStrength = role === 'primary-strength' || role === 'secondary-strength'
  const suitability = wantsStrength
    ? SUITABILITY_SCORE[exercise.strengthSuitability]
    : SUITABILITY_SCORE[exercise.hypertrophySuitability]

  const compoundFit =
    role === 'primary-strength' || role === 'primary-hypertrophy'
      ? exercise.compoundOrIsolation === 'compound'
        ? 1
        : 0.3
      : exercise.compoundOrIsolation === 'isolation'
        ? 1
        : 0.6

  // Repeating a movement pattern is not forbidden, but the second horizontal
  // press of a session is worth less than the first.
  const patternUses = context.patternCounts.get(exercise.movementPattern) ?? 0
  const variety = 1 / (1 + patternUses)

  // Setup cost matters more when there is less time left.
  const setupCost = Math.min(1, exercise.setupTimeSeconds / 180)
  const timePressure = context.remainingSeconds < 12 * 60 ? 1 : 0.35
  const cheapness = 1 - setupCost * timePressure

  const preferred = context.preferredIds.has(exercise.id) ? 1 : 0

  // Joint stress is a soft cost here — the hard cases were already filtered by
  // the limitation check above, and the conflict engine judges accumulation.
  const stress =
    exercise.jointStressTags.reduce(
      (sum, tag) => sum + (tag.intensity === 'high' ? 0.3 : tag.intensity === 'moderate' ? 0.15 : 0),
      0,
    ) / 2

  return (
    credit * 3 +
    suitability * 2 +
    compoundFit * 1.2 +
    variety * 0.8 +
    cheapness * 0.6 +
    preferred * 0.9 -
    Math.min(stress, 0.6)
  )
}

export interface SelectionResult {
  readonly ranked: readonly Candidate[]
  readonly rejected: readonly RejectedCandidate[]
}

/**
 * Rank every catalog entry for one slot.
 *
 * `blocked` is the conflict engine's verdict, injected by the caller. A
 * candidate the conflict engine blocks is rejected at the `conflict` stage, so
 * the reason survives into the recalibration metadata and the generator can say
 * what it turned down and why.
 */
export function selectForSlot(
  exercises: readonly Exercise[],
  group: MuscleGroupId,
  role: TrainingRole,
  context: SelectionContext,
  blocked?: (exercise: Exercise) => string | null,
): SelectionResult {
  const ranked: Candidate[] = []
  const rejected: RejectedCandidate[] = []

  for (const exercise of exercises) {
    const excluded = excludeReason(exercise, group, context)
    if (excluded) {
      // "Wrong muscle" is the overwhelming majority of a 127-entry catalog and
      // says nothing interesting, so it is not worth reporting.
      if (excluded !== 'wrong-muscle' && excluded !== 'already-in-session') {
        rejected.push({ exerciseId: exercise.id, stage: 'excluded', text: excludedText(excluded) })
      }
      continue
    }

    const conflict = blocked?.(exercise) ?? null
    if (conflict) {
      rejected.push({ exerciseId: exercise.id, stage: 'conflict', text: conflict.slice(0, 200) })
      continue
    }

    ranked.push({ exercise, score: scoreCandidate(exercise, group, role, context) })
  }

  // Score, then id — a stable order that does not depend on catalog file order.
  ranked.sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id))
  return { ranked, rejected }
}

function excludedText(code: ExclusionCode): string {
  switch (code) {
    case 'equipment-unavailable':
      return 'Needs equipment you do not have here.'
    case 'location-unsuitable':
      return 'Does not suit where you are training today.'
    case 'limitation-contraindicated':
      return 'Ruled out by a limitation you recorded.'
    case 'disliked':
      return 'On your list of exercises to avoid.'
    default:
      return 'Not suitable for this slot.'
  }
}
