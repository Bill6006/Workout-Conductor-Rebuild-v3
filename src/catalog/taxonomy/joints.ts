import { z } from 'zod'

/**
 * Joints, and the stress an exercise puts through them.
 *
 * TWO LISTS, ON PURPOSE, AND ONE IS A SUBSET OF THE OTHER.
 *
 *   `JOINT_IDS`             — every joint the catalog can name as the joint a
 *                             movement pattern is built around. Includes `ankle`,
 *                             because a calf raise has to name something.
 *   `JOINT_STRESS_TAG_IDS`  — the joints an exercise can be TAGGED as stressing.
 *                             This is the product's list of joints a person is
 *                             asked about and a session accumulates load on. It
 *                             omits `ankle`: nothing in the product asks about
 *                             ankles, and a tag no rule reads is a tag that rots.
 *
 * A test asserts the second is a subset of the first, so the two cannot drift.
 *
 * INTENSITY, NOT PRESENCE. Almost every lower-body exercise puts something
 * through a knee. A tag that only said "knee" would fire on all of them and mean
 * nothing, so each tag carries an intensity and the conflict engine accumulates
 * it — that is how "three high-stress lower-back movements in one session" is
 * detectable while "a session containing any lower-back work at all" is not.
 */

export const JOINT_IDS = ['shoulder', 'elbow', 'wrist', 'knee', 'hip', 'ankle', 'lower-back', 'neck'] as const

export type JointId = (typeof JOINT_IDS)[number]

/** The joints an exercise may be tagged as stressing. `JOINT_IDS` minus `ankle`. */
export const JOINT_STRESS_TAG_IDS = [
  'shoulder',
  'elbow',
  'wrist',
  'knee',
  'hip',
  'lower-back',
  'neck',
] as const

export type JointStressTagId = (typeof JOINT_STRESS_TAG_IDS)[number]

/** Ordered low -> high. Exported as an order, so a comparison is never a string guess. */
export const STRESS_INTENSITIES = ['low', 'moderate', 'high'] as const
export type StressIntensity = (typeof STRESS_INTENSITIES)[number]

export const jointIdSchema = z.enum(JOINT_IDS)
export const jointStressTagIdSchema = z.enum(JOINT_STRESS_TAG_IDS)
export const stressIntensitySchema = z.enum(STRESS_INTENSITIES)

/** One joint, one intensity. An exercise carries at most one tag per joint. */
export const jointStressTagSchema = z.strictObject({
  joint: jointStressTagIdSchema,
  intensity: stressIntensitySchema,
})

export type JointStressTag = z.infer<typeof jointStressTagSchema>

/** 0-based rank in `STRESS_INTENSITIES`; -1 for anything unrecognised. */
export function stressRank(intensity: StressIntensity): number {
  return STRESS_INTENSITIES.indexOf(intensity)
}

/**
 * A numeric weight for accumulation.
 *
 * GEOMETRIC, NOT A 1-2-3 COUNT: each rung is worth exactly two of the rung below
 * it. A count would make four light movements and two heavy ones look the same to
 * a threshold, when they are not remotely the same on a joint. Doubling means a
 * session's total rises with how HEAVY its worst movements are rather than with
 * how many it has, which is the judgement the conflict engine is being asked for.
 *
 * The exact numbers are a scale, not a measurement: only the ratios between them
 * carry meaning, and a threshold written against them should be expressed in
 * these units rather than in a count of exercises.
 */
export const STRESS_WEIGHTS: Readonly<Record<StressIntensity, number>> = {
  low: 1,
  moderate: 2,
  high: 4,
}

/** Total stress a list of tags puts through one joint. */
export function jointStressLoad(tags: readonly JointStressTag[], joint: JointStressTagId): number {
  return tags.reduce((total, tag) => (tag.joint === joint ? total + STRESS_WEIGHTS[tag.intensity] : total), 0)
}

/** The tag for a joint, or null when the exercise does not stress it. */
export function tagForJoint(tags: readonly JointStressTag[], joint: JointStressTagId): JointStressTag | null {
  return tags.find((tag) => tag.joint === joint) ?? null
}
