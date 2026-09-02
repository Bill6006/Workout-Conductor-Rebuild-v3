/**
 * THE exercise-preference surface. One picker, shared by setup and Settings.
 *
 * It lives in its own feature module rather than inside either screen, because
 * both edit the same two profile lists and a copy in each is how two screens end
 * up disagreeing about what a person chose.
 *
 * NOTHING HERE PULLS IN THE CATALOG. `useExerciseCatalog` reaches it through a
 * dynamic `import()`, so a screen that merely renders a preference row does not
 * put 127 exercises on its chunk — the chunk arrives when the picker opens.
 */

export { ExercisePicker, MAX_PREFERENCE_ENTRIES } from './ExercisePicker'
export type { ExercisePickerProps } from './ExercisePicker'
export { ExercisePreferenceField } from './ExercisePreferenceField'
export type { ExercisePreferenceFieldProps } from './ExercisePreferenceField'
export { resetExerciseCatalogCache, useExerciseCatalog } from './useExerciseCatalog'
export type { ExerciseCatalog, ExerciseCatalogState, ExerciseCatalogStatus } from './useExerciseCatalog'
