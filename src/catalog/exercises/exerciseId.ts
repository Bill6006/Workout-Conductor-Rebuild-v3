/**
 * Exercise identity: the id shape, the custom namespace, and the one name
 * normaliser.
 *
 * DELIBERATELY DEPENDENCY-FREE. This module imports nothing — not zod, not the
 * catalog. That is what lets the boot path (core/validation/schemas.ts and
 * core/storage/migrations.ts) reason about an exercise id without pulling a byte
 * of exercise DATA into the first-paint chunk.
 *
 * IDS ARE PERMANENT. An exercise id is written into saved profiles, workout
 * history, personal records, and progression state. It may be added, and its
 * display name may change, but an id may never be renamed, reused for a different
 * movement, or removed — doing so silently rewrites a user's history.
 */

/** Built-in ids are lowercase kebab-case: `incline-dumbbell-press`. */
export const EXERCISE_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * The namespace every user-authored id carries. `:` is not legal in a built-in
 * id, so a custom exercise can never collide with one the app ships — including
 * one the app ships LATER, which is the collision that actually bites.
 */
export const CUSTOM_ID_PREFIX = 'custom:'

/** Ids are bounded so a corrupt record cannot carry an unbounded string. */
export const MAX_EXERCISE_ID_LENGTH = 80

export function isBuiltInExerciseId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_EXERCISE_ID_LENGTH && EXERCISE_ID_PATTERN.test(value)
  )
}

export function isCustomExerciseId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_EXERCISE_ID_LENGTH &&
    value.startsWith(CUSTOM_ID_PREFIX) &&
    EXERCISE_ID_PATTERN.test(value.slice(CUSTOM_ID_PREFIX.length))
  )
}

/** True for either kind of id — what a stored reference is allowed to be. */
export function isCatalogExerciseId(value: unknown): value is string {
  return isBuiltInExerciseId(value) || isCustomExerciseId(value)
}

/** `Incline Dumbbell Press!` -> `custom:incline-dumbbell-press`. */
export function customExerciseId(slug: string): string {
  const kebab = slug
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${CUSTOM_ID_PREFIX}${kebab}`
}

/**
 * THE name normaliser. One implementation, used by the catalog when it builds its
 * name -> id index and by the v1 -> v2 profile migration when it looks a typed
 * string up in that index. Two normalisers would mean a name that indexes one way
 * and looks up another, which reads to a user as "the app ignored what I typed".
 *
 * It folds case, accents, punctuation, and whitespace runs. It does NOT stem,
 * de-pluralise, drop words, or measure edit distance: the matching this feeds has
 * to be exact, because a wrong match silently changes what the user asked for.
 */
export function normaliseExerciseName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The LAST-RESORT display name for an id: `incline-dumbbell-press` reads as
 * `Incline dumbbell press`, `custom:my-machine` as `My machine`.
 *
 * It is a fallback, never the source of a name. A screen that has the catalog
 * loaded shows `exercise.name`, which is written by a person and can say things a
 * slug cannot. This exists so a screen that holds a stored id and no catalog —
 * settings, the review step, anything on the boot path — renders something a
 * person recognises instead of a raw slug, without dragging the catalog into its
 * chunk to do it.
 */
export function humaniseExerciseId(id: string): string {
  const slug = id.startsWith(CUSTOM_ID_PREFIX) ? id.slice(CUSTOM_ID_PREFIX.length) : id
  const words = slug.replace(/-+/g, ' ').trim()
  if (words === '') return id
  return words.charAt(0).toUpperCase() + words.slice(1)
}
