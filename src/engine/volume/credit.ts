import { rollUpMuscles, type MuscleGroupId } from '../../catalog/muscles/muscles'
import type { SetKind } from '../../core/validation/workoutSchema'
import type { VolumeExercise } from './volumeTypes'

/**
 * WHAT A SET IS WORTH. This file is the volume policy, and it is the file to
 * argue with.
 *
 * THE SECONDARY-MUSCLE DISCOUNT, AND WHY IT IS 0.5.
 *
 * A bench press names the chest primary and the front delt and triceps
 * secondary. Counting the triceps at a full set would say a person who presses
 * six times a week already does eighteen sets of triceps work and needs none;
 * counting them at zero would say the same person has never trained their
 * triceps at all. Both are visibly wrong to anybody who lifts, and the second is
 * worse in this product specifically: `bigger-arms` is a shipped goal, and a
 * counter that scores every press as zero arm work would keep prescribing direct
 * arm volume on top of an arm load that is already there.
 *
 * So a secondary muscle earns HALF a set. The number is the widely used
 * "fractional volume" convention, and the reasoning that makes it defensible
 * here is a ratio rather than a measurement: whatever the fraction is, it has to
 * be strictly between 0 and 1, and 0.5 is the value at which two compound sets
 * are worth one direct set — which is roughly what the working sets of a heavy
 * press feel like against the working sets of a curl. It is a scale, not a
 * physiological claim, and every threshold in `targets.ts` is written in the same
 * units, so moving this number moves both sides of every comparison together.
 *
 * A MUSCLE IS PRIMARY OR SECONDARY, NEVER BOTH — `exerciseSchema` refuses an
 * entry that lists one in both places, so nothing here has to resolve a clash.
 *
 * WARM-UP SETS EARN NOTHING. A ramp set is preparation, not stimulus; counting
 * it would make a session with a long warm-up look like more work than the same
 * session without one. Back-off and drop sets earn a partial credit for the same
 * reason in reverse: they are real work at a reduced load, and scoring them as
 * full working sets would let a drop set inflate a week.
 */

/** Credit one set of each kind earns. See the file note. */
export const SET_KIND_CREDIT: Readonly<Record<SetKind, number>> = {
  'warm-up': 0,
  working: 1,
  'back-off': 0.75,
  drop: 0.5,
}

/** What a set is worth to a muscle it only assists. See the file note. */
export const SECONDARY_MUSCLE_CREDIT = 0.5

/**
 * Rounds to two decimals so that a ledger built twice from the same input is
 * byte-identical. Every credit is a multiple of 0.25 today and would be exact
 * anyway; the goal multipliers in `targets.ts` are not, and one rounding rule for
 * both is one fewer thing to get inconsistent.
 */
export function roundSets(value: number): number {
  return Math.round(value * 100) / 100
}

/** Effective working sets for a list of programmed or performed set kinds. */
export function creditSets(kinds: readonly SetKind[]): number {
  return roundSets(kinds.reduce((total, kind) => total + SET_KIND_CREDIT[kind], 0))
}

/** How a group was reached by one exercise. */
export type MuscleReach = 'primary' | 'secondary' | 'none'

/**
 * How an exercise reaches a group: through a primary muscle, only through a
 * secondary one, or not at all.
 *
 * The rollup is `rollUpMuscles`, the catalog's own, called on each list
 * separately. Nothing here re-derives a group from an id string.
 */
export function reachOf(exercise: VolumeExercise, group: MuscleGroupId): MuscleReach {
  if (rollUpMuscles(exercise.primaryMuscles).includes(group)) return 'primary'
  if (rollUpMuscles(exercise.secondaryMuscles).includes(group)) return 'secondary'
  return 'none'
}

/** Every group an exercise reaches, with how it reaches it, in canonical order. */
export function groupReach(
  exercise: VolumeExercise,
): readonly { group: MuscleGroupId; reach: MuscleReach }[] {
  const primary = rollUpMuscles(exercise.primaryMuscles)
  const secondary = rollUpMuscles(exercise.secondaryMuscles)
  const seen = new Set<MuscleGroupId>(primary)
  return [
    ...primary.map((group) => ({ group, reach: 'primary' as const })),
    ...secondary.filter((group) => !seen.has(group)).map((group) => ({ group, reach: 'secondary' as const })),
  ]
}

/** What `sets` sets of this exercise are worth to one group, discount applied. */
export function groupCreditFor(exercise: VolumeExercise, group: MuscleGroupId, sets: number): number {
  const reach = reachOf(exercise, group)
  if (reach === 'none') return 0
  return roundSets(reach === 'primary' ? sets : sets * SECONDARY_MUSCLE_CREDIT)
}
