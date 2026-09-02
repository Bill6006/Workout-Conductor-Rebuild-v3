import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { SessionSlot } from './types'

/**
 * HOW LONG A SLOT TAKES — a local estimate, deliberately crude, and NOT the
 * duration model.
 *
 * Phase 3 owns duration fitting. This module needs a number for two narrow jobs:
 * deciding whether a candidate fits the time that is actually left (an exclusion),
 * and preferring the candidate that leaves the most room (a factor). Both are
 * comparisons between candidates in the same call, so a consistent estimate is
 * worth more here than an accurate one, and building an accurate one would be
 * building Phase 3's engine in the wrong directory.
 *
 * SO IT IS AN INJECTION POINT. `rankAlternatives` takes an `estimateSlotSeconds`
 * option; when the real duration model lands, pass it in and delete nothing here
 * except this paragraph. The default below is what runs until then.
 *
 * The model: setup, then a work interval per set, then rest between sets.
 * `repUnit` decides what a rep range MEANS — a 45-second plank is 45 seconds of
 * work, not 45 reps of it — and a unilateral exercise is done twice per set.
 */

/** Seconds a single rep takes, tempo and turnaround included. */
export const SECONDS_PER_REP = 3

export interface SlotEstimateInput {
  readonly exercise: Exercise
  readonly sets: number
  readonly restSeconds: number
}

export type SlotEstimator = (input: SlotEstimateInput) => number

export const defaultSlotEstimator: SlotEstimator = ({ exercise, sets, restSeconds }) => {
  const midpoint = (exercise.typicalRepRange.min + exercise.typicalRepRange.max) / 2
  const workPerSide = exercise.repUnit === 'seconds' ? midpoint : midpoint * SECONDS_PER_REP
  const workPerSet = workPerSide * (exercise.unilateral ? 2 : 1)
  const workingSets = Math.max(0, sets)
  const restIntervals = Math.max(0, workingSets - 1)
  return Math.round(exercise.setupTimeSeconds + workingSets * workPerSet + restIntervals * restSeconds)
}

/** Estimates the slot as it would be if `exercise` were put into it. */
export function estimateSlotWith(estimate: SlotEstimator, slot: SessionSlot, exercise: Exercise): number {
  return estimate({ exercise, sets: slot.plannedSets, restSeconds: slot.restSeconds })
}
