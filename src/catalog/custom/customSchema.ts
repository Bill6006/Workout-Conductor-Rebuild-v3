import { z } from 'zod'
import { equipmentIdSchema } from '../equipment/equipment'
import { muscleIdSchema } from '../muscles/muscles'
import { movementPatternIdSchema } from '../movementPatterns/movementPatterns'
import { jointStressTagSchema } from '../taxonomy/joints'
import {
  DIFFICULTY_SCALE,
  GRIP_DEMAND_SCALE,
  STABILITY_DEMAND_SCALE,
  SUITABILITY_SCALE,
} from '../taxonomy/scales'
import {
  limitationFlagSchema,
  loadModelSchema,
  locationSuitabilitySchema,
  progressionFamilySchema,
  trainingRoleSchema,
} from '../taxonomy/taxonomy'
import { repRangeSchema } from '../exercises/exerciseSchema'
import { CUSTOM_ID_PREFIX, EXERCISE_ID_PATTERN, isCatalogExerciseId } from '../exercises/exerciseId'

/**
 * USER-AUTHORED CONTENT: a custom exercise, an instruction override on a built-in
 * one, and user-owned media.
 *
 * THREE RULES SHAPE EVERYTHING HERE.
 *
 * 1. NAMESPACED IDS. Every id a user creates begins with a prefix containing `:`,
 *    which no built-in id may contain. A custom exercise therefore cannot collide
 *    with a built-in one — including a built-in the app ships NEXT year, which is
 *    the collision that actually happens and the one a "check it is not taken"
 *    rule would miss.
 *
 * 2. DURABLE, SO LOOSE. These records live in IndexedDB and travel through backup
 *    and restore. Every object is a `z.looseObject`, so a record written by a
 *    later build keeps the fields this build has never heard of. They also carry
 *    their own `schemaVersion`, so they can be migrated on their own timetable
 *    rather than being dragged along by the profile's.
 *
 * 3. BACKUP-SHAPED FROM THE START. Every record is plain JSON: no Blob, no Date,
 *    no Map. Custom media references its bytes by `blobKey` rather than embedding
 *    them, so a backup envelope can carry the record cheaply and the exporter can
 *    decide separately how to carry the bytes. Phase 8 joins these to the envelope
 *    without reshaping anything.
 *
 * INCOMPLETE METADATA IS ALLOWED, AND IS NOT SCHEDULABLE. A person adding "the
 * weird machine in the corner" should not have to answer twenty questions to log
 * it. So the metadata fields are optional here, and `isSchedulableCustomExercise`
 * is the one place that says whether an entry knows enough about itself to be put
 * into a generated session. Anything short of that can still be logged by hand.
 */

export const CUSTOM_CONTENT_SCHEMA_VERSION = 1

/** `custom:` — see rule 1 above. Re-exported so callers need one import. */
export { CUSTOM_ID_PREFIX }

export const CUSTOM_MEDIA_ID_PREFIX = 'custom-media:'

const customExerciseIdSchema = z
  .string()
  .min(CUSTOM_ID_PREFIX.length + 1)
  .max(80)
  .refine(
    (value) =>
      value.startsWith(CUSTOM_ID_PREFIX) && EXERCISE_ID_PATTERN.test(value.slice(CUSTOM_ID_PREFIX.length)),
    { message: `A custom exercise id is "${CUSTOM_ID_PREFIX}" followed by a kebab-case slug` },
  )

const customMediaIdSchema = z
  .string()
  .min(CUSTOM_MEDIA_ID_PREFIX.length + 1)
  .max(80)
  .refine(
    (value) =>
      value.startsWith(CUSTOM_MEDIA_ID_PREFIX) &&
      EXERCISE_ID_PATTERN.test(value.slice(CUSTOM_MEDIA_ID_PREFIX.length)),
    { message: `A custom media id is "${CUSTOM_MEDIA_ID_PREFIX}" followed by a kebab-case slug` },
  )

/** Either kind of exercise id — what an override or a piece of media may point at. */
const anyExerciseIdSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(isCatalogExerciseId, { message: 'Expected a built-in or custom exercise id' })

const isoTimestamp = z.string().min(1).max(40)
const proseLine = z.string().min(1).max(240)

/* ------------------------------------------------------------------ *
 * Custom exercise
 * ------------------------------------------------------------------ */

export const customExerciseSchema = z.looseObject({
  schemaVersion: z.number().int().min(1),
  id: customExerciseIdSchema,
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().min(1).max(80)).max(12).default([]),
  /** The built-in this was started from, when it was. Never a rename of one. */
  basedOnExerciseId: anyExerciseIdSchema.nullable().default(null),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  /** The user's own note. Always allowed, even on an entry that knows nothing else. */
  notes: z.string().max(1000).default(''),

  // Everything below is metadata. Optional here; required for scheduling.
  primaryMuscles: z.array(muscleIdSchema).max(4).default([]),
  secondaryMuscles: z.array(muscleIdSchema).max(8).default([]),
  movementPattern: movementPatternIdSchema.nullable().default(null),
  trainingRole: trainingRoleSchema.nullable().default(null),
  strengthSuitability: SUITABILITY_SCALE.schema.nullable().default(null),
  hypertrophySuitability: SUITABILITY_SCALE.schema.nullable().default(null),
  equipment: z.array(equipmentIdSchema).max(6).default([]),
  locationSuitability: z.array(locationSuitabilitySchema).max(3).default([]),
  setupTimeSeconds: z.number().int().min(0).max(600).nullable().default(null),
  typicalRepRange: repRangeSchema.nullable().default(null),
  unilateral: z.boolean().default(false),
  safeForDropSet: z.boolean().default(false),
  stabilityDemand: STABILITY_DEMAND_SCALE.schema.nullable().default(null),
  gripDemand: GRIP_DEMAND_SCALE.schema.nullable().default(null),
  difficulty: DIFFICULTY_SCALE.schema.nullable().default(null),
  jointStressTags: z.array(jointStressTagSchema).max(7).default([]),
  contraindicatedFor: z.array(limitationFlagSchema).max(4).default([]),
  instructionSteps: z.array(proseLine).max(10).default([]),
  progressionFamily: progressionFamilySchema.nullable().default(null),
  load: loadModelSchema.nullable().default(null),
  /** A user's own media for this exercise, by id. Never a production asset. */
  mediaIds: z.array(customMediaIdSchema).max(4).default([]),
})

export type CustomExercise = z.infer<typeof customExerciseSchema>

/**
 * The fields generation cannot work without. A session is built from muscles,
 * pattern, equipment, time cost, and load meaning; without them an entry cannot be
 * placed, timed, conflict-checked, or progressed.
 */
export const SCHEDULING_REQUIRED_FIELDS = [
  'primaryMuscles',
  'movementPattern',
  'trainingRole',
  'locationSuitability',
  'setupTimeSeconds',
  'typicalRepRange',
  'load',
] as const

/** What is still missing before a custom exercise could be generated into a session. */
export function missingSchedulingFields(exercise: CustomExercise): string[] {
  const missing: string[] = []
  if (exercise.primaryMuscles.length === 0) missing.push('primaryMuscles')
  if (exercise.movementPattern === null) missing.push('movementPattern')
  if (exercise.trainingRole === null) missing.push('trainingRole')
  if (exercise.locationSuitability.length === 0) missing.push('locationSuitability')
  if (exercise.setupTimeSeconds === null) missing.push('setupTimeSeconds')
  if (exercise.typicalRepRange === null) missing.push('typicalRepRange')
  if (exercise.load === null) missing.push('load')
  return missing
}

/**
 * True when a custom exercise knows enough about itself to be scheduled.
 *
 * `equipment` is deliberately absent from the requirement: an empty list is a real
 * answer ("I need nothing"), not a missing one.
 */
export function isSchedulableCustomExercise(exercise: CustomExercise): boolean {
  return missingSchedulingFields(exercise).length === 0
}

/* ------------------------------------------------------------------ *
 * Custom instruction override
 * ------------------------------------------------------------------ */

/**
 * A user's rewrite of the instructions on an exercise — usually a built-in one.
 *
 * It is stored SEPARATELY from the exercise rather than as an edited copy of it.
 * A copy would fork: the built-in gets a corrected cue in a later release and the
 * user never sees it, because they are reading a snapshot taken months ago. An
 * override layers on top, so untouched fields keep improving.
 *
 * An absent field means "no override" and the built-in shows through. An empty
 * array means "the user cleared this", which is a different thing and is kept.
 */
export const customInstructionOverrideSchema = z.looseObject({
  schemaVersion: z.number().int().min(1),
  exerciseId: anyExerciseIdSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  /** Replaces the built-in steps entirely when present. */
  instructionSteps: z.array(proseLine).max(10).nullable().default(null),
  /** Replaces the built-in mistakes entirely when present. */
  commonMistakes: z.array(proseLine).max(6).nullable().default(null),
  /** Added alongside whatever the built-in says, never instead of it. */
  personalNotes: z.string().max(1000).default(''),
})

export type CustomInstructionOverride = z.infer<typeof customInstructionOverrideSchema>

/** Applies an override to a built-in's instruction fields. Pure; absent means keep. */
export function applyInstructionOverride<T extends { instructionSteps: string[]; commonMistakes: string[] }>(
  base: T,
  override: CustomInstructionOverride | null,
): { instructionSteps: string[]; commonMistakes: string[]; personalNotes: string } {
  return {
    instructionSteps: override?.instructionSteps ?? base.instructionSteps,
    commonMistakes: override?.commonMistakes ?? base.commonMistakes,
    personalNotes: override?.personalNotes ?? '',
  }
}

/* ------------------------------------------------------------------ *
 * Custom media
 * ------------------------------------------------------------------ */

/**
 * Media the user made or supplied.
 *
 * A SEPARATE TYPE FROM `MediaAsset`, ON PURPOSE. Production media carries a
 * licence and a redistribution flag because the product ships it; this carries
 * neither, because it never leaves the device and the rights are the user's. One
 * type with an `isCustom` flag would put a redistribution question on a user's
 * phone video, and sooner or later something would answer it.
 *
 * The bytes live in IndexedDB under `blobKey`; this record is the JSON half, so it
 * fits a backup envelope without a base64 blob inside every row.
 */
export const CUSTOM_MEDIA_SOURCES = ['user-recorded', 'user-supplied'] as const
export type CustomMediaSource = (typeof CUSTOM_MEDIA_SOURCES)[number]

export const customMediaSchema = z.looseObject({
  schemaVersion: z.number().int().min(1),
  id: customMediaIdSchema,
  exerciseId: anyExerciseIdSchema,
  kind: z.enum(['poster', 'demonstration']),
  source: z.enum(CUSTOM_MEDIA_SOURCES),
  mimeType: z.string().min(1).max(100),
  byteSize: z.number().int().min(1),
  width: z.number().int().min(1).max(8000).nullable().default(null),
  height: z.number().int().min(1).max(8000).nullable().default(null),
  durationMs: z.number().int().min(1).max(600000).nullable().default(null),
  /** Key into the media object store. The bytes are never inlined here. */
  blobKey: z.string().min(1).max(120),
  createdAt: isoTimestamp,
})

export type CustomMedia = z.infer<typeof customMediaSchema>

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** A blank custom exercise: named, timestamped, and knowing nothing else yet. */
export function createCustomExercise(id: string, name: string, now: string): CustomExercise {
  return customExerciseSchema.parse({
    schemaVersion: CUSTOM_CONTENT_SCHEMA_VERSION,
    id,
    name,
    createdAt: now,
    updatedAt: now,
  })
}
