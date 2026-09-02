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
  TRANSITION_COST_SCALE,
  WARM_UP_SUITABILITY_SCALE,
} from '../taxonomy/scales'
import {
  competingDemandSchema,
  limitationFlagSchema,
  loadModelSchema,
  locationSuitabilitySchema,
  progressionFamilySchema,
  repUnitSchema,
  stationIdSchema,
  trainingRoleSchema,
} from '../taxonomy/taxonomy'
import { EXERCISE_ID_PATTERN } from './exerciseId'

/**
 * THE exercise contract.
 *
 * This file defines the shape of a catalog exercise and nothing else. It contains
 * no exercise DATA — not one entry — so importing it costs the schema and its
 * vocabularies, never the catalog. The data lives in its own module and is reached
 * through a dynamic `import()`; see `./index.ts`.
 *
 * IDS ARE PERMANENT. `id` is written into workout history, personal records,
 * progression state, and a user's saved preferences. An id may be added, and a
 * `name` may be rewritten, but an id may never be renamed, removed, or reused for
 * a different movement — every one of those silently rewrites somebody's history.
 *
 * NOTHING HERE IS A NAME. Every field exists so that the conflict engine, the
 * generator, and the alternatives ranker can reason structurally. If a rule cannot
 * be expressed from these fields, the fix is a new field, never a comparison of
 * `name` strings.
 *
 * STRICT ON PURPOSE. Unlike the durable profile schemas, this is `z.strictObject`:
 * catalog data is authored in this repository and validated in tests, so a
 * mistyped field name should fail loudly at development time rather than be
 * carried along as an unknown key nothing reads.
 */

const exerciseIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(EXERCISE_ID_PATTERN, 'An exercise id is lowercase kebab-case')

const proseLine = z.string().min(1).max(240)

/**
 * How much of one set the exercise is normally programmed for, in whatever unit
 * its `repUnit` names. The ceiling is generous because a hold is counted in
 * seconds on the same scale: a two-minute plank is a legal range, a 200-rep set
 * is not something the catalog needs to describe.
 */
export const repRangeSchema = z
  .strictObject({
    min: z.number().int().min(1).max(300),
    max: z.number().int().min(1).max(300),
  })
  .refine((range) => range.min <= range.max, {
    message: 'A rep range must not run backwards',
    path: ['max'],
  })

export type RepRange = z.infer<typeof repRangeSchema>

/**
 * What the conflict engine needs to judge a superset pairing.
 *
 * `stationId` is the same-station fact: two exercises on one station cannot
 * alternate. `gripHeavy` and `competingDemands` are the fatigue facts: a pair can
 * be fine on muscles and still ruin the second movement.
 */
export const supersetCompatibilitySchema = z.strictObject({
  /** False when the exercise must never be paired — a maximal lift, a technical one. */
  eligible: z.boolean(),
  /** The station occupied while working. `null` for floor, mat, or standing work. */
  stationId: stationIdSchema.nullable(),
  /** True when the grip gives out before the target muscle does. */
  gripHeavy: z.boolean(),
  /** Demands that a partner exercise also making them would compromise. */
  competingDemands: z.array(competingDemandSchema).max(5),
})

export type SupersetCompatibility = z.infer<typeof supersetCompatibilitySchema>

/**
 * The defaults applied to an omitted field, in one place.
 *
 * They exist twice by necessity — once as the schema's `.default()` and once in
 * `defineExercise`, which applies them without paying for a parse on every entry
 * in a large catalog. `exerciseSchema.test.ts` asserts the two agree, so they
 * cannot drift.
 */
export const EXERCISE_DEFAULTS = {
  repUnit: 'reps',
  shoulderConsiderations: '',
  kneeConsiderations: '',
  lowerBackConsiderations: '',
  mediaId: null,
  productionEnabled: true,
} as const

/** Every list-valued field defaults to empty; named here so the rule is readable. */
export const EXERCISE_LIST_DEFAULTS = [
  'aliases',
  'secondaryMuscles',
  'optionalEquipment',
  'jointStressTags',
  'contraindicatedFor',
  'commonSubstitutions',
  'commonMistakes',
] as const

export const exerciseSchema = z
  .strictObject({
    /** Permanent, kebab-case. Never renamed, never reused. */
    id: exerciseIdSchema,
    /** What a person reads. Sentence case. May be rewritten; the id may not. */
    name: z.string().min(1).max(80),
    /**
     * Other names for the same movement. Used ONLY to resolve typed text to an id
     * (setup, search, the v1 -> v2 profile migration) — never by the conflict
     * engine, which reasons from structure.
     */
    aliases: z.array(z.string().min(1).max(80)).max(12).default([]),

    primaryMuscles: z.array(muscleIdSchema).min(1).max(4),
    secondaryMuscles: z.array(muscleIdSchema).max(8).default([]),
    movementPattern: movementPatternIdSchema,
    trainingRole: trainingRoleSchema,

    /** Ordered scales, not booleans: an exercise is rarely simply "for strength". */
    strengthSuitability: SUITABILITY_SCALE.schema,
    hypertrophySuitability: SUITABILITY_SCALE.schema,

    /**
     * Everything that MUST be present. An exercise is viable at a location only
     * when the location has every id listed here. "Barbell or EZ bar" is two
     * catalog entries, not a clause — an either/or here would make the equipment
     * conflict undecidable.
     */
    equipment: z.array(equipmentIdSchema).max(6),
    /** Improves the exercise but is not required. A bench for a dumbbell press. */
    optionalEquipment: z.array(equipmentIdSchema).max(6).default([]),
    locationSuitability: z.array(locationSuitabilitySchema).min(1).max(3),

    /** Finding, loading, and setting up — the seconds duration fitting charges. */
    setupTimeSeconds: z.number().int().min(0).max(600),
    /** The rung session ordering uses, so a person is not crossing the gym twice. */
    transitionCost: TRANSITION_COST_SCALE.schema,
    typicalRepRange: repRangeSchema,
    /**
     * What one unit of `typicalRepRange` IS. `reps` for almost everything;
     * `seconds` for a hold or a carry, which the set logger must not write a rep
     * count into. Defaulted, because `reps` is the honest answer for the great
     * majority of entries and an unstated one would be that anyway.
     */
    repUnit: repUnitSchema.default('reps'),

    /** False when dropping the load mid-set is unsafe or impossible on this setup. */
    safeForDropSet: z.boolean(),
    supersetCompatibility: supersetCompatibilitySchema,

    unilateral: z.boolean(),
    compoundOrIsolation: z.enum(['compound', 'isolation']),
    stabilityDemand: STABILITY_DEMAND_SCALE.schema,
    gripDemand: GRIP_DEMAND_SCALE.schema,

    /** At most one tag per joint; intensity is what makes accumulation measurable. */
    jointStressTags: z.array(jointStressTagSchema).max(7).default([]),
    /**
     * The declared limitations that rule this exercise out. Machine-readable, and
     * always a blocking conflict. The `*Considerations` strings below explain it
     * to a person; THIS is what the engine reads.
     */
    contraindicatedFor: z.array(limitationFlagSchema).max(4).default([]),

    /** Plain-language notes shown to a user. Empty string means "nothing to add". */
    shoulderConsiderations: z.string().max(240).default(''),
    kneeConsiderations: z.string().max(240).default(''),
    lowerBackConsiderations: z.string().max(240).default(''),

    /** Hand-picked swaps, by exercise id. The ranker seeds from these. */
    commonSubstitutions: z.array(exerciseIdSchema).max(8).default([]),

    instructionSteps: z.array(proseLine).min(2).max(10),
    commonMistakes: z.array(proseLine).max(6).default([]),
    difficulty: DIFFICULTY_SCALE.schema,

    /**
     * Key into the media manifest. `null` means no media entry — legal only while
     * `productionEnabled` is false, which the refinement below enforces.
     */
    mediaId: z.string().min(1).max(80).regex(EXERCISE_ID_PATTERN).nullable().default(null),
    /**
     * False keeps an exercise out of generated sessions and out of the media
     * completeness check. It is how an entry that is not finished is declared
     * unfinished, rather than quietly skipped.
     */
    productionEnabled: z.boolean().default(true),

    /** Same family => progression history carries across a substitution. */
    progressionFamily: progressionFamilySchema,
    /** What Plate Math and the set logger read. See `taxonomy/taxonomy.ts`. */
    load: loadModelSchema,
    /** Whether the exercise can serve as a warm-up, and in which sense. */
    warmUpSuitability: WARM_UP_SUITABILITY_SCALE.schema,
  })
  .superRefine((exercise, ctx) => {
    const joints = exercise.jointStressTags.map((tag) => tag.joint)
    if (new Set(joints).size !== joints.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['jointStressTags'],
        message: 'One tag per joint: two intensities for the same joint cannot both be true',
      })
    }

    if (exercise.productionEnabled && exercise.mediaId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['mediaId'],
        message: 'A production-enabled exercise must reference a media entry',
      })
    }

    if (exercise.commonSubstitutions.includes(exercise.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['commonSubstitutions'],
        message: 'An exercise cannot be its own substitution',
      })
    }

    const overlap = exercise.secondaryMuscles.filter((muscle) => exercise.primaryMuscles.includes(muscle))
    if (overlap.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['secondaryMuscles'],
        message: `A muscle is primary or secondary, not both: ${overlap.join(', ')}`,
      })
    }

    if (exercise.compoundOrIsolation === 'isolation' && exercise.trainingRole === 'primary-strength') {
      ctx.addIssue({
        code: 'custom',
        path: ['trainingRole'],
        message: 'An isolation movement cannot be the primary strength lift of a session',
      })
    }
  })

/** What a catalog entry is written as — fields with defaults may be omitted. */
export type ExerciseInput = z.input<typeof exerciseSchema>
/** What every consumer reads. Every field present; nothing optional. */
export type Exercise = z.output<typeof exerciseSchema>

/**
 * Writes one catalog entry, filling the documented defaults.
 *
 * It does NOT parse: a catalog of several hundred entries would pay a Zod parse on
 * every one of them at import time, on a chunk that is already the largest thing
 * the app loads. Validation is a test's job (`exerciseSchema.parse` over the whole
 * catalog), where it costs nobody anything, and the type checker catches the rest.
 */
export function defineExercise(input: ExerciseInput): Exercise {
  return {
    ...input,
    aliases: input.aliases ?? [],
    secondaryMuscles: input.secondaryMuscles ?? [],
    optionalEquipment: input.optionalEquipment ?? [],
    jointStressTags: input.jointStressTags ?? [],
    contraindicatedFor: input.contraindicatedFor ?? [],
    commonSubstitutions: input.commonSubstitutions ?? [],
    commonMistakes: input.commonMistakes ?? [],
    shoulderConsiderations: input.shoulderConsiderations ?? EXERCISE_DEFAULTS.shoulderConsiderations,
    kneeConsiderations: input.kneeConsiderations ?? EXERCISE_DEFAULTS.kneeConsiderations,
    lowerBackConsiderations: input.lowerBackConsiderations ?? EXERCISE_DEFAULTS.lowerBackConsiderations,
    repUnit: input.repUnit ?? EXERCISE_DEFAULTS.repUnit,
    mediaId: input.mediaId ?? EXERCISE_DEFAULTS.mediaId,
    productionEnabled: input.productionEnabled ?? EXERCISE_DEFAULTS.productionEnabled,
  }
}

/**
 * Builds a name -> id index for exact resolution of typed text.
 *
 * Keys are produced by `normaliseExerciseName`, and BOTH the display name and
 * every alias are indexed. The first entry to claim a key keeps it, so a duplicate
 * alias across two exercises resolves to the earlier one rather than flipping with
 * catalog order; `exerciseSchema.test.ts` and the catalog's own tests assert there
 * are no such duplicates in shipped data.
 */
export function buildExerciseNameIndex(
  exercises: readonly Pick<Exercise, 'id' | 'name' | 'aliases'>[],
  normalise: (value: string) => string,
): Map<string, string> {
  const index = new Map<string, string>()
  for (const exercise of exercises) {
    for (const candidate of [exercise.name, ...exercise.aliases]) {
      const key = normalise(candidate)
      if (key !== '' && !index.has(key)) index.set(key, exercise.id)
    }
  }
  return index
}

/**
 * THE injectable lookup: typed text in, an exercise id or `null` out.
 *
 * This is what a caller holding the catalog hands to the v1 -> v2 profile
 * migration (`migrateProfileRecord(raw, { resolveExerciseId })`). It lives here,
 * beside the index it is built from, so that exactly one normaliser is used to
 * write the index and to read it — a name that indexes one way and looks up
 * another reads to a user as "the app ignored what I typed".
 *
 * IT IS EXACT, AND IT SAYS NO. There is no stemming, no de-pluralising, and no
 * edit distance: an entry that is not an exact name or alias match returns `null`
 * and its caller keeps the user's words verbatim. A wrong match silently changes
 * what the person asked for, which is worse than no match at all.
 */
export function createExerciseNameResolver(
  exercises: readonly Pick<Exercise, 'id' | 'name' | 'aliases'>[],
  normalise: (value: string) => string,
): (typed: string) => string | null {
  const index = buildExerciseNameIndex(exercises, normalise)
  return (typed) => index.get(normalise(typed)) ?? null
}
