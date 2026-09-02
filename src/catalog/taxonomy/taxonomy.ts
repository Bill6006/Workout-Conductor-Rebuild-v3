import { z } from 'zod'
import { EXERCISE_ID_PATTERN } from '../exercises/exerciseId'

/**
 * The shared vocabularies the catalog, the conflict engine, and the alternatives
 * ranker all speak. Ordered scales live in `./scales`, joints in `./joints`; this
 * file holds the flat vocabularies and the progression-family rule.
 */

/* ------------------------------------------------------------------ *
 * Training role
 * ------------------------------------------------------------------ */

/**
 * What an exercise is FOR inside a session. Generation fills roles; the conflict
 * engine reports a session that has lost its only exercise in a required role.
 */
export const TRAINING_ROLES = [
  'primary-strength',
  'secondary-strength',
  'primary-hypertrophy',
  'secondary-hypertrophy',
  'isolation',
  'specialisation',
  'corrective',
  'warm-up',
  'finisher',
] as const

export type TrainingRole = (typeof TRAINING_ROLES)[number]

export const trainingRoleSchema = z.enum(TRAINING_ROLES)

/**
 * The roles that carry the session. An exercise in one of these is the reason the
 * session exists, which is why a superset may never pair two of them and why
 * losing one is a `progression-role` conflict rather than a tidy-up.
 */
const ANCHOR_ROLES: readonly TrainingRole[] = ['primary-strength', 'primary-hypertrophy']

export function isAnchorRole(role: TrainingRole): boolean {
  return ANCHOR_ROLES.includes(role)
}

/* ------------------------------------------------------------------ *
 * Location suitability
 * ------------------------------------------------------------------ */

/**
 * Where an exercise is viable, independent of equipment. A cable row needs a
 * cable machine (equipment); a loud jumping movement is a bad idea in a flat at
 * 6am (location). Both facts are needed, and only the first is answered by the
 * equipment list.
 *
 * The values mirror the profile's `LocationKind` minus `custom` — a location of no
 * fixed kind cannot be reasoned about, so nothing claims suitability for it.
 * `taxonomy.test.ts` asserts that correspondence, so the two cannot drift; the
 * runtime dependency is deliberately absent, because `core/validation` sits above
 * `src/catalog` and must not be imported back down into it.
 */
export const LOCATION_SUITABILITIES = ['gym', 'home', 'travel'] as const
export type LocationSuitability = (typeof LOCATION_SUITABILITIES)[number]
export const locationSuitabilitySchema = z.enum(LOCATION_SUITABILITIES)

/* ------------------------------------------------------------------ *
 * Stations
 * ------------------------------------------------------------------ */

/**
 * The physical thing an exercise occupies while it is being done.
 *
 * This is what a `station` conflict is detected from. Two exercises on the same
 * station cannot be supersetted — you would be unracking and reracking between
 * every set — and two people cannot be told to use one rack at once. `null` on an
 * exercise means "no station": floor work, a mat, standing with dumbbells.
 */
export const STATION_IDS = [
  'squat-rack',
  'bench-station',
  'smith-machine',
  'cable-tower',
  'lat-pulldown-station',
  'seated-row-station',
  'leg-press-station',
  'selectorised-machine',
  'pull-up-bar',
  'dip-station',
  'preacher-station',
  'back-extension-station',
  'dumbbell-rack',
  'platform',
] as const

export type StationId = (typeof STATION_IDS)[number]
export const stationIdSchema = z.enum(STATION_IDS)

/* ------------------------------------------------------------------ *
 * Superset facts
 * ------------------------------------------------------------------ */

/**
 * The demands that make two exercises a bad pair even when their muscles do not
 * overlap. A grip-limited row straight into a grip-limited carry fails on grip,
 * not on the back.
 */
export const COMPETING_DEMANDS = ['grip', 'core-bracing', 'lower-back', 'balance', 'systemic'] as const
export type CompetingDemand = (typeof COMPETING_DEMANDS)[number]
export const competingDemandSchema = z.enum(COMPETING_DEMANDS)

/* ------------------------------------------------------------------ *
 * Load model — what Plate Math needs
 * ------------------------------------------------------------------ */

/**
 * How an exercise is loaded. Plate Math (Phase 6) reads this to decide whether it
 * can propose plates at all, and the set logger reads `measure` to decide what a
 * typed number MEANS.
 */
export const LOAD_BASES = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine-stack',
  'plate-loaded-machine',
  'cable-stack',
  'band',
  'bodyweight',
  'bodyweight-loadable',
  'weight-plate',
  'unloaded',
] as const

export type LoadBasis = (typeof LOAD_BASES)[number]
export const loadBasisSchema = z.enum(LOAD_BASES)

/**
 * How a logged number is read.
 *   `per-hand` — a pair of 20s is logged as 20. Dumbbells, kettlebells.
 *   `total`    — the number is everything on the bar or the stack.
 *   `none`     — the exercise carries no external load at all.
 *
 * Getting this wrong doubles or halves a user's history, so it is a required
 * field with no default.
 */
export const LOAD_MEASURES = ['per-hand', 'total', 'none'] as const
export type LoadMeasure = (typeof LOAD_MEASURES)[number]
export const loadMeasureSchema = z.enum(LOAD_MEASURES)

export const loadModelSchema = z
  .strictObject({
    basis: loadBasisSchema,
    measure: loadMeasureSchema,
    /**
     * True when the load sits on a bar whose own weight counts. Plate Math starts
     * from the bar and adds pairs; without this it would propose plates totalling
     * the target and be 20 kg over.
     */
    usesBar: z.boolean(),
    /** True when a plate breakdown is meaningful — false for a pin stack or a band. */
    plateMath: z.boolean(),
  })
  .refine((model) => !(model.usesBar && !model.plateMath), {
    message: 'An exercise loaded on a bar must allow plate math',
    path: ['plateMath'],
  })
  .refine(
    (model) => (model.measure === 'none') === (model.basis === 'bodyweight' || model.basis === 'unloaded'),
    {
      message: 'measure "none" is for bodyweight and unloaded exercises, and only for those',
      path: ['measure'],
    },
  )

export type LoadModel = z.infer<typeof loadModelSchema>

/**
 * What one rep of this exercise IS.
 *
 * A plank and a carry are not counted, they are held, and a set logger that only
 * understands reps writes "3" into a field a person meant as "30 seconds". The
 * `anti-extension` and `carry` patterns are both in the vocabulary, so the product
 * ships exercises that need this from the first entry.
 *
 * It also tells the warm-up ramp what to shorten and duration fitting what a
 * `typicalRepRange` means, which is why the range is bounded generously enough to
 * hold a two-minute hold as well as a set of twenty.
 */
export const REP_UNITS = ['reps', 'seconds'] as const
export type RepUnit = (typeof REP_UNITS)[number]
export const repUnitSchema = z.enum(REP_UNITS)

/* ------------------------------------------------------------------ *
 * Limitation flags
 * ------------------------------------------------------------------ */

/**
 * The limitations a person actually declares on their profile, as the catalog
 * names them. An exercise lists the flags it is contraindicated for, and a
 * `limitation` conflict is always blocking — there is no severity at which a
 * declared injury is overridden.
 *
 * These mirror `Profile['limitations']`, whose keys are camelCase because they are
 * an object; here they are kebab ids because they are a list. `taxonomy.test.ts`
 * pins the correspondence.
 */
export const LIMITATION_FLAGS = ['shoulder', 'knee', 'lower-back', 'barbell-squat'] as const
export type LimitationFlag = (typeof LIMITATION_FLAGS)[number]
export const limitationFlagSchema = z.enum(LIMITATION_FLAGS)

/* ------------------------------------------------------------------ *
 * Progression families
 * ------------------------------------------------------------------ */

/**
 * THE PROGRESSION-FAMILY RULE.
 *
 * Two exercises in the SAME family may carry progression history across a
 * substitution. Swap an incline dumbbell press for a flat dumbbell press and the
 * working load, the rep target, and the success streak travel with you. Swap it
 * for a cable fly and they do not: the load means something different, and
 * inheriting it would prescribe a weight nobody chose.
 *
 * A family is therefore "the same movement on the same implement, at loads that
 * mean the same thing". Implement is part of the id (`-barbell`, `-dumbbell`,
 * `-machine`) precisely because a 60 kg barbell press and a 60 kg dumbbell press
 * are not the same lift.
 *
 * THE ID SPACE IS OPEN, THE REGISTRY IS ADVISORY. A closed enum here would block
 * the catalog from describing a movement nobody thought of, so the schema accepts
 * any kebab-case id and `KNOWN_PROGRESSION_FAMILIES` lists the ones the product
 * plans for. Catalog tests assert their data uses a known family; adding a new
 * family means adding it HERE first, so the list stays the place you can read to
 * find out what inherits from what.
 */
export const KNOWN_PROGRESSION_FAMILIES = [
  'horizontal-press-barbell',
  'horizontal-press-dumbbell',
  'horizontal-press-machine',
  'horizontal-press-smith',
  'horizontal-press-bodyweight',
  'incline-press-barbell',
  'incline-press-dumbbell',
  'incline-press-machine',
  'overhead-press-barbell',
  'overhead-press-dumbbell',
  'overhead-press-machine',
  'chest-fly',
  'horizontal-row-barbell',
  'horizontal-row-dumbbell',
  'horizontal-row-cable',
  'horizontal-row-machine',
  'vertical-pull-bodyweight',
  'vertical-pull-cable',
  'vertical-pull-machine',
  'pullover',
  'shrug-barbell',
  'shrug-dumbbell',
  'rear-delt',
  'lateral-raise',
  'front-raise',
  'biceps-curl-barbell',
  'biceps-curl-dumbbell',
  'biceps-curl-cable',
  'triceps-extension-barbell',
  'triceps-extension-dumbbell',
  'triceps-extension-cable',
  'triceps-dip',
  'forearm-curl',
  'squat-barbell',
  'squat-dumbbell',
  'squat-machine',
  'squat-bodyweight',
  'leg-press',
  'lunge-barbell',
  'lunge-dumbbell',
  'lunge-bodyweight',
  'hinge-barbell',
  'hinge-dumbbell',
  'hinge-machine',
  'hip-thrust-barbell',
  'hip-thrust-bodyweight',
  'back-extension',
  'leg-curl',
  'leg-extension',
  'hip-abduction',
  'hip-adduction',
  'calf-raise-standing',
  'calf-raise-seated',
  'carry',
  'anti-extension',
  'anti-rotation',
  'anti-lateral-flexion',
  'trunk-rotation',
  'trunk-flexion',
] as const

export type KnownProgressionFamily = (typeof KNOWN_PROGRESSION_FAMILIES)[number]

/** Any kebab-case id. See the note above on why this is open rather than an enum. */
export const progressionFamilySchema = z
  .string()
  .min(1)
  .max(60)
  .regex(EXERCISE_ID_PATTERN, 'A progression family id is lowercase kebab-case')

export type ProgressionFamilyId = string

const KNOWN_FAMILIES = new Set<string>(KNOWN_PROGRESSION_FAMILIES)

export function isKnownProgressionFamily(value: unknown): value is KnownProgressionFamily {
  return typeof value === 'string' && KNOWN_FAMILIES.has(value)
}

/**
 * True when progression history may travel from `a` to `b`. Identity is the whole
 * rule today; it is a function rather than an `===` at every call site so that a
 * future "these two families are close enough" decision has exactly one place to
 * live, and one place to be tested.
 */
export function progressionCarriesAcross(a: ProgressionFamilyId, b: ProgressionFamilyId): boolean {
  return a === b
}
