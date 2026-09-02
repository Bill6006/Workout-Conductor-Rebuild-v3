import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { patternsOverlap } from '../../catalog/movementPatterns/movementPatterns'
import { rollUpMuscles, type MuscleGroupId } from '../../catalog/muscles/muscles'
import { STRESS_WEIGHTS, type JointStressTagId } from '../../catalog/taxonomy/joints'
import { GRIP_DEMAND_SCALE } from '../../catalog/taxonomy/scales'
import type { AlternativesContext, SessionSlot } from './types'

/**
 * ONE READING OF THE SESSION, computed once per ranking call and handed to every
 * filter and every factor.
 *
 * Both the exclusion pass and the scoring pass need the same handful of session
 * facts — which slot is being replaced, what else is still to come, how much load
 * each joint has already taken, how much grip work is left. Deriving them twice
 * would be the usual way two answers quietly disagree, so they are derived once
 * here and passed down.
 *
 * COMPLETED WORK STILL COUNTS, AND FORWARD-LOOKING WORK IS A SEPARATE LIST. The
 * distinction matters and getting it backwards is a real bug either way:
 *
 *   `others`    — every other slot, finished or not. Joint stress you have
 *                 already put through a shoulder happened; overlap with an
 *                 exercise you have already done is still overlap. Anything
 *                 ACCUMULATED over a session reads this.
 *   `remaining` — the work still to come. A superset partner that is already
 *                 finished is not a partner, and grip you have not spent yet is
 *                 the only grip a later exercise can compete for. Anything about
 *                 what happens NEXT reads this.
 *   `upcoming`  — what comes after the target. Only these can still be spoiled by
 *                 a swap, which is what the priority escalation acts on.
 */

export interface SessionView {
  readonly target: SessionSlot
  /** Every other slot in the session, finished or not, in session order. */
  readonly others: readonly SessionSlot[]
  /** The other slots still to be done. */
  readonly remaining: readonly SessionSlot[]
  /** Slots after the target — the ones a swap can still spoil. */
  readonly upcoming: readonly SessionSlot[]
  /** Unfinished slots supersetted with the target. Empty when it is not one. */
  readonly supersetPartners: readonly SessionSlot[]
  /** Load the whole session has put through each joint, the target aside. */
  readonly jointLoad: Readonly<Partial<Record<JointStressTagId, number>>>
  /** 0..1 — how much of the work STILL TO COME is grip-limited. */
  readonly gripPressure: number
}

/** Thrown when the context names a slot the session does not contain. */
export class UnknownSlotError extends Error {}

export function readSession(context: AlternativesContext): SessionView {
  const index = context.session.findIndex((slot) => slot.slotId === context.targetSlotId)
  if (index === -1) {
    throw new UnknownSlotError(`targetSlotId "${context.targetSlotId}" is not a slot in this session`)
  }
  const target = context.session[index]

  const others = context.session.filter((slot) => slot.slotId !== target.slotId)
  const remaining = others.filter((slot) => slot.status !== 'completed')
  const upcoming = context.session.filter((slot, position) => position > index && slot.status !== 'completed')
  const supersetPartners =
    target.supersetId === null ? [] : remaining.filter((slot) => slot.supersetId === target.supersetId)

  const jointLoad: Partial<Record<JointStressTagId, number>> = {}
  for (const slot of others) {
    for (const tag of slot.exercise.jointStressTags) {
      jointLoad[tag.joint] = (jointLoad[tag.joint] ?? 0) + STRESS_WEIGHTS[tag.intensity]
    }
  }

  // Grip pressure is the mean grip demand of the remaining work, on the 0..1
  // scale the demand rungs describe. A session whose back half is rows and
  // carries leaves nothing for a grip-heavy alternative, and that is a ranking
  // fact rather than a conflict — nobody is unsafe, the last exercise is just bad.
  const gripPressure =
    remaining.length === 0
      ? 0
      : remaining.reduce((total, slot) => total + gripLevel(slot.exercise), 0) / remaining.length

  return { target, others, remaining, upcoming, supersetPartners, jointLoad, gripPressure }
}

/** 0..1 position of an exercise's grip demand on its scale. */
export function gripLevel(exercise: Exercise): number {
  const values = GRIP_DEMAND_SCALE.values
  return GRIP_DEMAND_SCALE.rank(exercise.gripDemand) / (values.length - 1)
}

/** The muscle groups an exercise's PRIMARY muscles roll up into. */
export function primaryGroups(exercise: Exercise): MuscleGroupId[] {
  return rollUpMuscles(exercise.primaryMuscles)
}

/** |A ∩ B| / |A ∪ B|, with two empty sets counting as identical. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const left = new Set(a)
  const right = new Set(b)
  let shared = 0
  for (const value of left) if (right.has(value)) shared += 1
  const union = left.size + right.size - shared
  return union === 0 ? 1 : shared / union
}

/**
 * HOW MUCH TWO EXERCISES ARE THE SAME WORK. 0 is unrelated, 1 is "why are both of
 * these in the session".
 *
 * Half of it is the muscle groups they share and half is whether their patterns
 * overlap, because either one alone gets it wrong: a lat pulldown and a barbell
 * row share every group and are not the same movement, while a barbell row and a
 * chest-supported row are the same movement whichever groups they happen to list.
 */
export function overlapScore(a: Exercise, b: Exercise): number {
  const groups = jaccard(primaryGroups(a), primaryGroups(b))
  const pattern = patternsOverlap(a.movementPattern, b.movementPattern) ? 1 : 0
  return 0.5 * groups + 0.5 * pattern
}

/** The worst overlap between one exercise and any of a set of slots. */
export function peakOverlap(exercise: Exercise, slots: readonly SessionSlot[]): number {
  return slots.reduce((worst, slot) => Math.max(worst, overlapScore(exercise, slot.exercise)), 0)
}
