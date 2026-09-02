import type { EquipmentId } from '../equipment/equipment'
import type { MovementPatternId } from '../movementPatterns/movementPatterns'
import { MUSCLE_GROUPS, rollUpMuscles, type MuscleGroupId, type MuscleId } from '../muscles/muscles'
import { armsShouldersExercises } from './data/armsAndShoulders'
import { pushPullExercises } from './data/chestAndBack'
import { lowerCoreExercises } from './data/lowerAndCore'
import { normaliseExerciseName } from './exerciseId'
import { buildExerciseNameIndex, type Exercise } from './exerciseSchema'

/**
 * THE EXERCISE CATALOG — the three authored regions assembled into one list, plus
 * every lookup the rest of the product reads it through.
 *
 * THIS MODULE IS LAZY, AND MUST STAY LAZY. It is the largest data in the app.
 * Nothing on the boot path may `import` it statically; the only legal way in is
 *
 *     const { EXERCISES } = await import('../../catalog/exercises/catalog')
 *
 * `./index.ts` re-exports the schema and the pure helpers and deliberately does
 * NOT re-export this file, because a barrel re-export would statically link the
 * whole catalog into everything that merely touches an exercise id — including
 * the profile schema, which every launch loads. If you find yourself adding
 * `export * from './catalog'` to the barrel, that is the bug.
 *
 * IT IS NOT VALIDATED AT RUNTIME. `defineExercise` fills defaults without parsing,
 * so importing the catalog costs an array literal and the index build below and
 * not 127 Zod parses on a phone. Correctness is a test's job: `catalog.test.ts`
 * parses every entry against `exerciseSchema` and checks every cross-reference —
 * substitutions, muscles, patterns, equipment, families, and name collisions —
 * where the cost lands on CI rather than on a person opening the app.
 *
 * EVERY INDEX IS BUILT ONCE, AT MODULE SCOPE. A lookup is a `Map.get`, never a
 * scan: the alternatives ranker and the picker both call these per keystroke and
 * per swap, and an O(n) scan behind an innocent-looking `exercisesForMuscle()` is
 * how a catalog this size becomes a frame drop.
 *
 * ORDER IS THE AUTHORED ORDER, AND IT IS STABLE. Upper-body push and pull, then
 * arms and shoulders, then legs and core — each region exactly as its file lists
 * it. Every list this module returns preserves it, so two screens showing "chest
 * exercises" show them in the same order, and a test that pins an order is
 * pinning a decision rather than an accident of iteration.
 */

export const EXERCISES: readonly Exercise[] = Object.freeze([
  ...pushPullExercises,
  ...armsShouldersExercises,
  ...lowerCoreExercises,
])

export const EXERCISE_COUNT = EXERCISES.length

/** Every id in catalog order. Handy for tests and for exhaustive checks. */
export const EXERCISE_IDS: readonly string[] = Object.freeze(EXERCISES.map((exercise) => exercise.id))

/* ------------------------------------------------------------------ *
 * The indexes
 * ------------------------------------------------------------------ */

function bucket<K>(map: Map<K, Exercise[]>, key: K, exercise: Exercise): void {
  const existing = map.get(key)
  if (existing) existing.push(exercise)
  else map.set(key, [exercise])
}

const BY_ID = new Map<string, Exercise>()
const BY_PRIMARY_MUSCLE = new Map<MuscleId, Exercise[]>()
const BY_MUSCLE_GROUP = new Map<MuscleGroupId, Exercise[]>()
const BY_PATTERN = new Map<MovementPatternId, Exercise[]>()
const BY_EQUIPMENT = new Map<EquipmentId, Exercise[]>()
const BY_FAMILY = new Map<string, Exercise[]>()
/** Primary muscles rolled up to groups, once per exercise rather than per query. */
const GROUPS_OF = new Map<string, readonly MuscleGroupId[]>()
/** Normalised name and aliases, joined, for substring search. */
const SEARCH_TEXT = new Map<string, string>()

for (const exercise of EXERCISES) {
  // First entry wins on a duplicate id, matching `buildExerciseNameIndex` and the
  // alternatives index. A duplicate is a catalog bug that `catalog.test.ts` fails
  // on; resolving it consistently everywhere means the bug cannot also make two
  // modules disagree about which entry is real.
  if (BY_ID.has(exercise.id)) continue
  BY_ID.set(exercise.id, exercise)

  for (const muscle of exercise.primaryMuscles) bucket(BY_PRIMARY_MUSCLE, muscle, exercise)

  const groups = rollUpMuscles(exercise.primaryMuscles)
  GROUPS_OF.set(exercise.id, Object.freeze(groups))
  for (const group of groups) bucket(BY_MUSCLE_GROUP, group, exercise)

  bucket(BY_PATTERN, exercise.movementPattern, exercise)
  bucket(BY_FAMILY, exercise.progressionFamily, exercise)
  for (const item of exercise.equipment) bucket(BY_EQUIPMENT, item, exercise)

  SEARCH_TEXT.set(exercise.id, [exercise.name, ...exercise.aliases].map(normaliseExerciseName).join(' | '))
}

/**
 * Normalised name-or-alias -> id, built with THE one normaliser.
 *
 * This is what makes typed text resolvable: the setup picker, the search box, and
 * the v1 -> v2 profile migration all read this same index through the same
 * normaliser, so "the app matched what I typed" means one thing everywhere.
 */
const NAME_INDEX = buildExerciseNameIndex(EXERCISES, normaliseExerciseName)

const EMPTY: readonly Exercise[] = Object.freeze([])
const EMPTY_GROUPS: readonly MuscleGroupId[] = Object.freeze([])

function frozen(list: Exercise[] | undefined): readonly Exercise[] {
  return list ? Object.freeze(list) : EMPTY
}

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

/** The exercise with this id, or `null`. Never throws on an unknown id. */
export function getExercise(id: string): Exercise | null {
  return BY_ID.get(id) ?? null
}

/**
 * The exercise with this id, or a throw naming it.
 *
 * For call sites holding an id that the catalog itself produced, where a miss is
 * a programming error rather than a stored value that has gone stale. Anything
 * reading a saved profile wants `getExercise` — a user's stored id may name an
 * exercise this build no longer ships, and that is data to show, not to crash on.
 */
export function requireExercise(id: string): Exercise {
  const exercise = BY_ID.get(id)
  if (!exercise) throw new Error(`Unknown exercise id: ${id}`)
  return exercise
}

export function isExerciseId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value)
}

/** The display name for an id, or `null` when the catalog does not have it. */
export function exerciseNameOf(id: string): string | null {
  return BY_ID.get(id)?.name ?? null
}

/**
 * Typed text -> an exercise id, or `null`. EXACT: name or alias, case, accents,
 * punctuation and whitespace folded, and nothing else. No stemming, no
 * de-pluralising, no edit distance — a wrong match silently changes what the
 * person asked for, which is worse than telling them plainly that there was no
 * match and keeping their words.
 *
 * This is the function to hand to `migrateProfileRecord(raw, { resolveExerciseId })`.
 */
export function resolveExerciseId(typed: string): string | null {
  return NAME_INDEX.get(normaliseExerciseName(typed)) ?? null
}

/** The same lookup, returning the entry rather than the id. */
export function findExerciseByName(typed: string): Exercise | null {
  const id = resolveExerciseId(typed)
  return id === null ? null : (BY_ID.get(id) ?? null)
}

/** Everything naming this muscle as PRIMARY, in catalog order. */
export function exercisesForMuscle(muscle: MuscleId): readonly Exercise[] {
  return frozen(BY_PRIMARY_MUSCLE.get(muscle))
}

/** Everything whose primary muscles roll up into this group, in catalog order. */
export function exercisesForMuscleGroup(group: MuscleGroupId): readonly Exercise[] {
  return frozen(BY_MUSCLE_GROUP.get(group))
}

export function exercisesForPattern(pattern: MovementPatternId): readonly Exercise[] {
  return frozen(BY_PATTERN.get(pattern))
}

/**
 * Everything that REQUIRES this equipment. Optional equipment is deliberately not
 * indexed here: "what can I do with a bench" is a question about what a bench
 * makes possible, and an exercise that merely prefers one is available without it.
 */
export function exercisesForEquipment(equipment: EquipmentId): readonly Exercise[] {
  return frozen(BY_EQUIPMENT.get(equipment))
}

/** Everything in one progression family — the set load history may travel across. */
export function exercisesInFamily(family: string): readonly Exercise[] {
  return frozen(BY_FAMILY.get(family))
}

/** Every progression family present in the catalog, in first-appearance order. */
export const PROGRESSION_FAMILIES_IN_CATALOG: readonly string[] = Object.freeze([...BY_FAMILY.keys()])

/**
 * The muscle GROUPS an exercise trains primarily, precomputed.
 *
 * A caller could roll this up itself, but then every render of a 127-row list
 * would redo 127 rollups. It is also the one place the answer is defined, so a
 * screen and the ranker cannot disagree about which group an exercise belongs to.
 */
export function muscleGroupsOf(exercise: Exercise): readonly MuscleGroupId[] {
  return GROUPS_OF.get(exercise.id) ?? EMPTY_GROUPS
}

/**
 * The muscle groups that actually have exercises, in canonical group order.
 *
 * A filter offering a group with nothing behind it is a dead end, so the picker
 * asks the catalog which groups exist rather than listing all thirteen.
 */
export const MUSCLE_GROUPS_IN_CATALOG: readonly MuscleGroupId[] = Object.freeze(
  MUSCLE_GROUPS.filter((group) => BY_MUSCLE_GROUP.has(group.id)).map((group) => group.id),
)

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export interface ExerciseSearchOptions {
  /** Keep only exercises whose PRIMARY work lands in one of these groups. */
  readonly muscleGroups?: readonly MuscleGroupId[]
  /** Cap the result. Omit for everything that matches. */
  readonly limit?: number
  /**
   * Include entries marked `productionEnabled: false`. Off by default: an
   * unfinished entry is not something to offer a person as a choice.
   */
  readonly includeUnfinished?: boolean
}

/**
 * Name-and-alias search for a person typing into a box.
 *
 * RANKED, NOT MERELY FILTERED, and the ranking is the useful part. Typing "row"
 * should not bury `Barbell row` under `Cable rope hammer curl`, so a match is
 * scored by WHERE it landed:
 *
 *   0  the query is the whole name         ("bench press")
 *   1  a name starts with it               ("bench" -> Bench dip)
 *   2  a word inside the name starts with it ("press" -> Barbell bench press)
 *   3  anywhere in the name
 *   4  anywhere in an alias                (aliases are the last resort, because
 *                                           the matched text is not on screen)
 *
 * Ties keep catalog order, so the same query always returns the same list in the
 * same order — a result list that reshuffles between keystrokes is unusable on a
 * phone, where the finger is already moving towards a row.
 *
 * An empty query is not an error and not empty: it returns the filtered catalog
 * in order, which is what an opened picker with no text in it should show.
 */
export function searchExercises(query: string, options: ExerciseSearchOptions = {}): readonly Exercise[] {
  const { muscleGroups, limit, includeUnfinished = false } = options
  const wanted = muscleGroups && muscleGroups.length > 0 ? new Set(muscleGroups) : null
  const needle = normaliseExerciseName(query)

  const matches: { exercise: Exercise; rank: number; position: number }[] = []

  EXERCISES.forEach((exercise, position) => {
    if (!includeUnfinished && !exercise.productionEnabled) return
    if (wanted && !muscleGroupsOf(exercise).some((group) => wanted.has(group))) return

    if (needle === '') {
      matches.push({ exercise, rank: 0, position })
      return
    }

    const rank = rankMatch(exercise, needle)
    if (rank !== null) matches.push({ exercise, rank, position })
  })

  matches.sort((a, b) => a.rank - b.rank || a.position - b.position)
  const kept = limit === undefined ? matches : matches.slice(0, Math.max(0, limit))
  return Object.freeze(kept.map((match) => match.exercise))
}

/** How well `needle` (already normalised) matches. Lower is better; `null` misses. */
function rankMatch(exercise: Exercise, needle: string): number | null {
  const name = normaliseExerciseName(exercise.name)
  if (name === needle) return 0
  if (name.startsWith(needle)) return 1
  // Normalisation reduces every separator to a single space, so a word boundary
  // inside the name is exactly ' ' + needle. That is what makes "press" find
  // `Barbell bench press` at rank 2 rather than at the same rank as a mid-word hit.
  if (name.includes(` ${needle}`)) return 2
  if (name.includes(needle)) return 3
  return (SEARCH_TEXT.get(exercise.id) ?? '').includes(needle) ? 4 : null
}
