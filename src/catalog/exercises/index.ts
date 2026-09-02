/**
 * The exercise module's public surface: identity, the schema, and the helpers
 * that reason about them.
 *
 * NOTHING HERE PULLS IN EXERCISE DATA, AND NOTHING ADDED HERE EVER MAY.
 *
 * The catalog is the largest data in the product, and the first-paint budget is
 * already close to its ceiling. Every module in this barrel is schema and pure
 * functions — a few kilobytes of code that a boot-path file (`core/validation`,
 * `core/storage/migrations`) can import without consequence.
 *
 * The DATA lives in `./catalog.ts` (which assembles the three region files under
 * `./data/`) and is reached only through a dynamic `import()`, so the bundler
 * gives it a chunk of its own:
 *
 *     const { EXERCISES, searchExercises } = await import('./catalog')
 *
 * Re-exporting that module from here would statically link the catalog into
 * everything that touches an exercise id — including the profile schema — and put
 * the whole thing back on the boot path. Do not do it, however convenient the
 * import site would look. `catalog.test.ts` asserts this barrel exposes no
 * exercise data, so the mistake fails a test rather than a bundle report.
 */

export {
  CUSTOM_ID_PREFIX,
  EXERCISE_ID_PATTERN,
  MAX_EXERCISE_ID_LENGTH,
  customExerciseId,
  humaniseExerciseId,
  isBuiltInExerciseId,
  isCatalogExerciseId,
  isCustomExerciseId,
  normaliseExerciseName,
} from './exerciseId'

export {
  EXERCISE_DEFAULTS,
  EXERCISE_LIST_DEFAULTS,
  buildExerciseNameIndex,
  createExerciseNameResolver,
  defineExercise,
  exerciseSchema,
  repRangeSchema,
  supersetCompatibilitySchema,
} from './exerciseSchema'
export type { Exercise, ExerciseInput, RepRange, SupersetCompatibility } from './exerciseSchema'
