import { normaliseExerciseName } from '../../catalog/exercises/exerciseId'
import { createExerciseNameResolver, type Exercise } from '../../catalog/exercises/exerciseSchema'
import type { ExercisePreferences } from '../../core/validation/schemas'
import type { AlternativesIndex } from './catalogIndex'

/**
 * WHAT THE PERSON SAID THEY WANT.
 *
 * The profile stores preferences as two lists per side: `exerciseIds` the catalog
 * recognised, and `freeText` in the person's own words. Reading only the ids
 * would be a real bug rather than a simplification — every profile written before
 * the catalog existed put EVERY entry in `freeText`, so an id-only reading would
 * ignore the dislikes of every user who has been here since Phase 1.
 *
 * So free text is resolved through `createExerciseNameResolver`, the catalog's own
 * exact name-and-alias lookup. That is the same resolver the v1 -> v2 migration
 * uses, which means "the app matched what I typed" means one thing across the
 * product rather than two. It is exact: no stemming, no edit distance. Anything it
 * cannot resolve stays unmatched and influences nothing — a wrong match here would
 * silently delete a candidate the person never objected to.
 *
 * DISLIKE BEATS PREFERENCE. An exercise on both sides is excluded. Somebody who
 * has managed to say both things is being told no, because the cost of wrongly
 * hiding an exercise they can still pick by hand is far below the cost of
 * programming one they asked to avoid.
 *
 * A PREFERENCE SPREADS ALONG ITS PROGRESSION FAMILY, but only in the positive
 * direction. Liking the incline dumbbell press says something about the flat
 * dumbbell press; disliking it says nothing about the flat one, because a dislike
 * is usually about a specific movement — the one that hurts, or the one they are
 * bored of — and widening it would quietly delete half a muscle group.
 */

export const PREFERENCE_SIDES = ['preferred', 'disliked', 'neutral'] as const
export type PreferenceSide = (typeof PREFERENCE_SIDES)[number]

/** How the match was made, so a message can say "you listed this" honestly. */
export const PREFERENCE_ROUTES = ['id', 'free-text', 'progression-family', 'none'] as const
export type PreferenceRoute = (typeof PREFERENCE_ROUTES)[number]

export interface PreferenceMatch {
  readonly side: PreferenceSide
  readonly route: PreferenceRoute
}

const NEUTRAL: PreferenceMatch = { side: 'neutral', route: 'none' }

export interface PreferenceLookup {
  match(exercise: Exercise): PreferenceMatch
  /** True when the person expressed anything at all. Drives factor applicability. */
  readonly hasAnyPreference: boolean
}

function collectSide(
  side: { readonly exerciseIds: readonly string[]; readonly freeText: readonly string[] },
  resolve: (typed: string) => string | null,
): Map<string, PreferenceRoute> {
  const routes = new Map<string, PreferenceRoute>()
  for (const id of side.exerciseIds) routes.set(id, 'id')
  for (const typed of side.freeText) {
    const resolved = resolve(typed)
    // An id already listed explicitly keeps its stronger route.
    if (resolved !== null && !routes.has(resolved)) routes.set(resolved, 'free-text')
  }
  return routes
}

export function buildPreferenceLookup(
  preferences: ExercisePreferences,
  index: AlternativesIndex,
): PreferenceLookup {
  const resolve = createExerciseNameResolver(index.exercises, normaliseExerciseName)
  const disliked = collectSide(preferences.disliked, resolve)
  const preferred = collectSide(preferences.preferred, resolve)

  const preferredFamilies = new Set<string>()
  for (const id of preferred.keys()) {
    const exercise = index.byId(id)
    if (exercise) preferredFamilies.add(exercise.progressionFamily)
  }

  const hasAnyPreference = disliked.size > 0 || preferred.size > 0

  return {
    hasAnyPreference,
    match(exercise) {
      const dislikedRoute = disliked.get(exercise.id)
      if (dislikedRoute) return { side: 'disliked', route: dislikedRoute }
      const preferredRoute = preferred.get(exercise.id)
      if (preferredRoute) return { side: 'preferred', route: preferredRoute }
      if (preferredFamilies.has(exercise.progressionFamily)) {
        return { side: 'preferred', route: 'progression-family' }
      }
      return NEUTRAL
    },
  }
}
