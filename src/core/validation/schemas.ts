import { z } from 'zod'
import { equipmentIdSchema, defaultEquipmentFor } from '../../catalog/equipment/equipment'
import { MAX_EXERCISE_ID_LENGTH, isCatalogExerciseId } from '../../catalog/exercises/exerciseId'
import { isIsoTimestamp } from '../time/clock'

/**
 * The single source of truth for the durable data shape.
 *
 * Nothing else in the app may declare a rival profile schema or a rival profile
 * type. Screens import the types from here; storage validates against these
 * schemas; migrations move older records up to `SCHEMA_VERSION`.
 *
 * FORWARD COMPATIBILITY. Every object schema here is a `z.looseObject`, so a record
 * written by a FUTURE build of the app — carrying fields this build has never heard
 * of — parses successfully and keeps those fields. That is what makes a read → write
 * cycle non-destructive for a user who moves between app versions. Do not "tighten"
 * these to `z.object`: that silently strips a future user's data on the first save.
 */

export const SCHEMA_VERSION = 2

/**
 * Strips the `[key: string]: unknown` carry-through slot that `z.looseObject`
 * adds to its inferred type, so consumers get exact object types (a typo in a
 * patch is a compile error) while the runtime value still carries unknown keys.
 *
 * Exported because `workoutSchema.ts` is built the same way and needs the same
 * treatment. One helper, not two: a second copy would drift the day this one is
 * taught about a new exotic type.
 */
export type KnownFields<T> = T extends readonly (infer U)[]
  ? KnownFields<U>[]
  : T extends object
    ? { [K in keyof T as string extends K ? never : K]: KnownFields<T[K]> }
    : T

/** Lenient ISO timestamp: anything `Date.parse` accepts, which includes offsets. */
export const isoTimestampSchema = z
  .string()
  .refine(isIsoTimestamp, { message: 'Expected an ISO 8601 timestamp' })

export const goalSchema = z.enum([
  'build-muscle',
  'bigger-arms',
  'bigger-chest',
  'overall-size',
  'get-stronger',
  'balanced-development',
  'stay-consistent',
])
export type Goal = z.infer<typeof goalSchema>

export const experienceSchema = z.enum(['beginner', 'intermediate', 'advanced'])
export type Experience = z.infer<typeof experienceSchema>

export const trainingStyleSchema = z.enum(['hybrid', 'hypertrophy', 'strength'])
export type TrainingStyle = z.infer<typeof trainingStyleSchema>

export const restStyleSchema = z.enum(['short', 'standard', 'long'])
export type RestStyle = z.infer<typeof restStyleSchema>

export const unitsSchema = z.enum(['metric', 'imperial'])
export type Units = z.infer<typeof unitsSchema>

export const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
export type Weekday = z.infer<typeof weekdaySchema>

/** Calendar order, for anything that renders a week. */
export const WEEKDAYS: readonly Weekday[] = weekdaySchema.options

export const locationKindSchema = z.enum(['home', 'gym', 'travel', 'custom'])
export type LocationKind = z.infer<typeof locationKindSchema>

export const locationProfileShape = {
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  kind: locationKindSchema,
  equipment: z.array(equipmentIdSchema).max(200),
  notes: z.string().max(500),
}
export const locationProfileSchema = z.looseObject(locationProfileShape)
export type LocationProfile = KnownFields<z.infer<typeof locationProfileSchema>>

export const bodyweightSchema = z.looseObject({
  value: z.number().finite().positive().max(1000),
  unit: z.enum(['kg', 'lb']),
})
export type Bodyweight = KnownFields<z.infer<typeof bodyweightSchema>>

export const goalsSchema = z.looseObject({
  primary: goalSchema.default('build-muscle'),
  secondary: goalSchema.nullable(),
})

export const scheduleSchema = z.looseObject({
  sessionsPerWeek: z.number().int().min(1).max(7),
  typicalDurationMin: z.number().int().min(15).max(180),
  availableDays: z.array(weekdaySchema).max(7),
})

export const techniquesSchema = z.looseObject({
  supersets: z.boolean(),
  dropSets: z.boolean(),
  circuits: z.boolean(),
})

export const limitationsSchema = z.looseObject({
  shoulder: z.boolean(),
  knee: z.boolean(),
  lowerBack: z.boolean(),
  avoidBarbellSquat: z.boolean(),
  notes: z.string().max(500),
})

/**
 * One side of the exercise preferences: what the catalog recognised, and what the
 * person typed that it did not.
 *
 * TWO LISTS, NOT ONE, AND NEITHER IS A FALLBACK FOR THE OTHER.
 *
 *   `exerciseIds` — resolved, structural, and what the generator reads. An id
 *                   survives a rename of the exercise's display name.
 *   `freeText`    — the person's own words, kept verbatim. Phase 1 stored every
 *                   entry this way because there was no catalog to resolve
 *                   against; the v1 -> v2 migration promotes only what it can
 *                   match with certainty and leaves the rest here, unedited.
 *
 * A single list of strings could not tell the two apart, so a generator would
 * have to guess whether `bench-press` was an id or something a person typed, and
 * a display would render one of them wrongly. Nothing is ever moved from
 * `freeText` by inference — an entry leaves it only when a person picks the
 * exercise it meant.
 *
 * `exerciseIds` accepts a built-in id or a `custom:`-prefixed one, so a user's own
 * exercise is as referenceable as a shipped one.
 */
export const exercisePreferenceListSchema = z.looseObject({
  exerciseIds: z
    .array(
      z
        .string()
        .min(1)
        .max(MAX_EXERCISE_ID_LENGTH)
        .refine(isCatalogExerciseId, { message: 'Expected a built-in or custom exercise id' }),
    )
    .max(100),
  freeText: z.array(z.string().min(1).max(80)).max(100),
})
export type ExercisePreferenceList = KnownFields<z.infer<typeof exercisePreferenceListSchema>>

export const exercisePreferencesSchema = z.looseObject({
  preferred: exercisePreferenceListSchema,
  disliked: exercisePreferenceListSchema,
})
export type ExercisePreferences = KnownFields<z.infer<typeof exercisePreferencesSchema>>

/** An empty side. Written by `createDefaultProfile` and by the v1 -> v2 migration. */
export function emptyExercisePreferenceList(): ExercisePreferenceList {
  return { exerciseIds: [], freeText: [] }
}

/** How many entries a side holds, whichever list they landed in. */
export function exercisePreferenceCount(list: ExercisePreferenceList): number {
  return list.exerciseIds.length + list.freeText.length
}

export const profileShape = {
  schemaVersion: z.number().int().min(1),
  id: z.literal('primary'),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  goals: goalsSchema,
  experience: experienceSchema,
  trainingStyle: trainingStyleSchema.default('hybrid'),
  schedule: scheduleSchema,
  techniques: techniquesSchema,
  restStyle: restStyleSchema,
  units: unitsSchema,
  bodyweight: bodyweightSchema.nullable(),
  limitations: limitationsSchema,
  exercisePreferences: exercisePreferencesSchema,
  locations: z.array(locationProfileSchema).min(1).max(20),
  activeLocationId: z.string().min(1),
  onboardingCompletedAt: isoTimestampSchema.nullable(),
}

/**
 * There is exactly one profile record, keyed `'primary'`.
 *
 * Kept free of cross-field refinements so `.shape` stays reachable for UI code.
 * Cross-field rules live in `profileIntegrityIssues` and run inside `parseProfile`.
 */
export const profileSchema = z.looseObject(profileShape)
export type Profile = KnownFields<z.infer<typeof profileSchema>>

export const PROFILE_ID = 'primary'
export const DEFAULT_GYM_LOCATION_ID = 'loc-gym'
export const DEFAULT_HOME_LOCATION_ID = 'loc-home'

/** Stable, collision-resistant id for a location the user creates. */
export function newLocationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `loc-${uuid.slice(0, 8)}`
  return `loc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** A blank location seeded with the equipment its kind usually has. */
export function createLocation(kind: LocationKind, name: string, id = newLocationId()): LocationProfile {
  return { id, name, kind, equipment: defaultEquipmentFor(kind), notes: '' }
}

/**
 * The documented Phase 1 defaults. `now` comes from the clock — this function
 * never reads the wall clock itself.
 */
export function createDefaultProfile(now: string): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: PROFILE_ID,
    createdAt: now,
    updatedAt: now,
    goals: { primary: 'build-muscle', secondary: null },
    experience: 'intermediate',
    trainingStyle: 'hybrid',
    schedule: { sessionsPerWeek: 4, typicalDurationMin: 60, availableDays: ['mon', 'tue', 'thu', 'sat'] },
    techniques: { supersets: true, dropSets: true, circuits: false },
    restStyle: 'standard',
    units: 'imperial',
    bodyweight: null,
    limitations: { shoulder: false, knee: false, lowerBack: false, avoidBarbellSquat: false, notes: '' },
    exercisePreferences: {
      preferred: emptyExercisePreferenceList(),
      disliked: emptyExercisePreferenceList(),
    },
    locations: [
      createLocation('gym', 'Gym', DEFAULT_GYM_LOCATION_ID),
      createLocation('home', 'Home', DEFAULT_HOME_LOCATION_ID),
    ],
    activeLocationId: DEFAULT_GYM_LOCATION_ID,
    onboardingCompletedAt: null,
  }
}

/** Cross-field rules that a per-field schema cannot express. */
export function profileIntegrityIssues(profile: Profile): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []

  const ids = profile.locations.map((location) => location.id)
  if (!ids.includes(profile.activeLocationId)) {
    issues.push({
      path: 'activeLocationId',
      message: `activeLocationId "${profile.activeLocationId}" does not match any saved location`,
    })
  }
  if (new Set(ids).size !== ids.length) {
    issues.push({ path: 'locations', message: 'Location ids must be unique' })
  }
  if (profile.schemaVersion > SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `Record is schema version ${profile.schemaVersion}; this build understands ${SCHEMA_VERSION}`,
    })
  }

  return issues
}

/** The active location, falling back to the first one so UI always has something. */
export function activeLocation(profile: Profile): LocationProfile {
  return (
    profile.locations.find((location) => location.id === profile.activeLocationId) ?? profile.locations[0]
  )
}
