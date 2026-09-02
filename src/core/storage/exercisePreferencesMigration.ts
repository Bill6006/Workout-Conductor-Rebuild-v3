import { isCatalogExerciseId, normaliseExerciseName } from '../../catalog/exercises/exerciseId'

/**
 * The v1 -> v2 move of `exercisePreferences`, as a pure function.
 *
 * Phase 1 stored what a person typed:
 *
 *     exercisePreferences: { preferred: string[], disliked: string[] }
 *
 * Phase 2 has a catalog, so the field becomes catalog-backed:
 *
 *     exercisePreferences: {
 *       preferred: { exerciseIds: string[], freeText: string[] },
 *       disliked:  { exerciseIds: string[], freeText: string[] },
 *     }
 *
 * THE RULES, IN PRIORITY ORDER.
 *
 * 1. NOTHING THE USER TYPED IS LOST. Every v1 entry ends up somewhere. An entry
 *    that cannot be matched with certainty is copied into `freeText` VERBATIM —
 *    not trimmed, not title-cased, not "corrected". The only entries that do not
 *    appear in the result are exact duplicates of an entry that already does.
 *
 * 2. MATCHING IS EXACT, AND CONSERVATIVE. `resolveExerciseId` is injected, and the
 *    resolver the catalog builds (`createExerciseNameResolver`) folds case,
 *    accents, punctuation, and whitespace before comparing against a name or an
 *    alias. There is no stemming, no de-pluralising, and no edit distance: a wrong
 *    match silently changes what the person asked for, which is worse than no
 *    match at all. Anything the resolver is unsure about it returns `null` for,
 *    and the words stay in `freeText`.
 *
 * 3. NO CATALOG ON THE BOOT PATH. This module imports the id helpers, which import
 *    nothing at all — no zod, and not one byte of exercise data. A caller that has
 *    the catalog loaded injects the resolver; a caller that does not omits it, and
 *    every entry stays as free text. That is lossless, and it is the default,
 *    because loading a few hundred kilobytes of catalog to open a saved profile
 *    would cost every user every launch to help the few with typed preferences.
 *
 * 4. RUNNING IT TWICE CHANGES NOTHING. A side that already has the v2 shape is
 *    returned as it is. The migration runner will not call this twice — it stamps
 *    the version — but a function whose idempotency depends on its caller is one
 *    bug away from eating data.
 */

/** Typed text in, a catalog exercise id out, or `null` when nothing matched. */
export type ExerciseIdResolver = (typed: string) => string | null

/** The v2 shape of one side. Structurally the schema's, without importing it. */
export interface MigratedPreferenceList {
  exerciseIds: string[]
  freeText: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/** True for a side that has already been migrated. See rule 4. */
export function isMigratedPreferenceList(value: unknown): value is MigratedPreferenceList {
  return isRecord(value) && isStringArray(value.exerciseIds) && isStringArray(value.freeText)
}

/**
 * One v1 list of typed strings to the v2 pair.
 *
 * Order is preserved on both sides: the ids come out in the order the entries that
 * matched them were typed, and so does the free text.
 */
export function migratePreferenceList(
  entries: readonly string[],
  resolve?: ExerciseIdResolver,
): MigratedPreferenceList {
  const exerciseIds: string[] = []
  const freeText: string[] = []
  const seenIds = new Set<string>()
  const seenText = new Set<string>()

  for (const entry of entries) {
    if (typeof entry !== 'string') continue

    // A resolver may be absent, may throw on odd input, and may — if somebody
    // wires up the wrong one — hand back something that is not an id at all.
    // None of those may cost the user their words, so each is a miss, not a crash.
    let matched: string | null = null
    if (resolve && normaliseExerciseName(entry) !== '') {
      let candidate: string | null
      try {
        candidate = resolve(entry)
      } catch {
        candidate = null
      }
      if (typeof candidate === 'string' && isCatalogExerciseId(candidate)) matched = candidate
    }

    if (matched !== null) {
      if (!seenIds.has(matched)) {
        seenIds.add(matched)
        exerciseIds.push(matched)
      }
      continue
    }

    if (!seenText.has(entry)) {
      seenText.add(entry)
      freeText.push(entry)
    }
  }

  return { exerciseIds, freeText }
}

/**
 * One side of `exercisePreferences`, whatever shape it arrived in.
 *
 *   - already v2  -> returned untouched (rule 4);
 *   - a v1 array  -> split by `migratePreferenceList`;
 *   - missing     -> an empty pair, which is what "the user listed nothing" is;
 *   - anything else -> an empty pair. A number where a list belongs is not
 *     something a person typed, and there is no verbatim form to keep.
 */
export function migratePreferenceSide(value: unknown, resolve?: ExerciseIdResolver): MigratedPreferenceList {
  if (isMigratedPreferenceList(value)) return value
  if (Array.isArray(value)) {
    return migratePreferenceList(
      value.filter((entry): entry is string => typeof entry === 'string'),
      resolve,
    )
  }
  return { exerciseIds: [], freeText: [] }
}

/**
 * The whole field. Unknown keys on the `exercisePreferences` object ride along —
 * a later build's addition survives a downgrade and an upgrade both.
 *
 * A record whose `exercisePreferences` is missing or is not an object is returned
 * UNCHANGED rather than repaired. Writing an empty field over a corrupt one would
 * turn "this saved profile is damaged, here is what was in it" into "you have no
 * preferences", and the load path already keeps the raw record so a repair screen
 * can show what was found.
 */
export function migrateExercisePreferencesToV2(
  record: Record<string, unknown>,
  resolve?: ExerciseIdResolver,
): Record<string, unknown> {
  const current = record.exercisePreferences
  if (!isRecord(current)) return record

  return {
    ...record,
    exercisePreferences: {
      ...current,
      preferred: migratePreferenceSide(current.preferred, resolve),
      disliked: migratePreferenceSide(current.disliked, resolve),
    },
  }
}
