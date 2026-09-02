import { describe, expect, it } from 'vitest'
import type { ExercisePreferences } from '../../core/validation/schemas'
import { buildPreferenceLookup } from './preferences'
import { DUMBBELL_BENCH, INCLINE_DUMBBELL, MACHINE_PRESS, PUSH_UP, exercise, testIndex } from './testFixtures'

function preferences(overrides: {
  preferredIds?: string[]
  preferredText?: string[]
  dislikedIds?: string[]
  dislikedText?: string[]
}): ExercisePreferences {
  return {
    preferred: { exerciseIds: overrides.preferredIds ?? [], freeText: overrides.preferredText ?? [] },
    disliked: { exerciseIds: overrides.dislikedIds ?? [], freeText: overrides.dislikedText ?? [] },
  }
}

describe('reading a person’s preferences', () => {
  it('says nothing about an exercise they never mentioned', () => {
    const lookup = buildPreferenceLookup(preferences({}), testIndex())
    expect(lookup.hasAnyPreference).toBe(false)
    expect(lookup.match(DUMBBELL_BENCH)).toEqual({ side: 'neutral', route: 'none' })
  })

  it('matches a resolved id', () => {
    const lookup = buildPreferenceLookup(preferences({ preferredIds: [DUMBBELL_BENCH.id] }), testIndex())
    expect(lookup.match(DUMBBELL_BENCH)).toEqual({ side: 'preferred', route: 'id' })
    expect(lookup.hasAnyPreference).toBe(true)
  })

  it('matches FREE TEXT through the catalog’s own name resolver', () => {
    // Every profile written before the catalog existed put every entry here. An
    // id-only reading would ignore the dislikes of every user since Phase 1.
    const lookup = buildPreferenceLookup(preferences({ dislikedText: ['machine chest press'] }), testIndex())
    expect(lookup.match(MACHINE_PRESS)).toEqual({ side: 'disliked', route: 'free-text' })
  })

  it('folds case, punctuation and accents the way the rest of the product does', () => {
    const lookup = buildPreferenceLookup(preferences({ dislikedText: ['  PUSH-UP!  '] }), testIndex())
    expect(lookup.match(PUSH_UP).side).toBe('disliked')
  })

  it('matches an alias as readily as a display name', () => {
    const aliased = exercise({ id: 'pec-deck', name: 'Pec deck', aliases: ['Chest fly machine'] })
    const lookup = buildPreferenceLookup(
      preferences({ preferredText: ['chest fly machine'] }),
      testIndex([aliased]),
    )
    expect(lookup.match(aliased)).toEqual({ side: 'preferred', route: 'free-text' })
  })

  it('refuses to guess: near misses stay unmatched rather than becoming a wrong match', () => {
    const lookup = buildPreferenceLookup(
      preferences({ dislikedText: ['machine presses', 'chest press machine', 'bench'] }),
      testIndex(),
    )
    expect(lookup.match(MACHINE_PRESS).side).toBe('neutral')
  })

  it('spreads a LIKE along its progression family, because that is a fact about the movement', () => {
    const lookup = buildPreferenceLookup(preferences({ preferredIds: [DUMBBELL_BENCH.id] }), testIndex())
    const sameFamily = exercise({
      id: 'dumbbell-floor-press',
      name: 'Dumbbell floor press',
      progressionFamily: DUMBBELL_BENCH.progressionFamily,
    })
    expect(lookup.match(sameFamily)).toEqual({ side: 'preferred', route: 'progression-family' })
  })

  it('does NOT spread a dislike along a family — a dislike is usually about one movement', () => {
    const lookup = buildPreferenceLookup(preferences({ dislikedIds: [DUMBBELL_BENCH.id] }), testIndex())
    const sameFamily = exercise({
      id: 'dumbbell-floor-press',
      name: 'Dumbbell floor press',
      progressionFamily: DUMBBELL_BENCH.progressionFamily,
    })
    expect(lookup.match(sameFamily).side).toBe('neutral')
  })

  it('lets a dislike beat a like when somebody has managed to say both', () => {
    const lookup = buildPreferenceLookup(
      preferences({ preferredIds: [INCLINE_DUMBBELL.id], dislikedIds: [INCLINE_DUMBBELL.id] }),
      testIndex(),
    )
    expect(lookup.match(INCLINE_DUMBBELL).side).toBe('disliked')
  })

  it('keeps the explicit id route when the same exercise is also typed as free text', () => {
    const lookup = buildPreferenceLookup(
      preferences({ preferredIds: [PUSH_UP.id], preferredText: ['Push-up'] }),
      testIndex(),
    )
    expect(lookup.match(PUSH_UP)).toEqual({ side: 'preferred', route: 'id' })
  })
})
