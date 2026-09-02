import { describe, expect, it } from 'vitest'
import {
  isMigratedPreferenceList,
  migrateExercisePreferencesToV2,
  migratePreferenceList,
  migratePreferenceSide,
  type ExerciseIdResolver,
} from './exercisePreferencesMigration'
import { createExerciseNameResolver } from '../../catalog/exercises/exerciseSchema'
import { normaliseExerciseName } from '../../catalog/exercises/exerciseId'

/**
 * A stand-in catalog, deliberately tiny. The point of injecting the resolver is
 * that this test never loads catalog data, so the resolver here is the REAL one
 * (`createExerciseNameResolver`) over three hand-written entries. A stub function
 * would have tested the migration against a fiction.
 */
const CATALOG = [
  { id: 'incline-dumbbell-press', name: 'Incline dumbbell press', aliases: ['Incline DB press'] },
  { id: 'barbell-back-squat', name: 'Barbell back squat', aliases: ['Back squat', 'Squat'] },
  { id: 'romanian-deadlift', name: 'Romanian deadlift', aliases: ['RDL'] },
]

const resolve: ExerciseIdResolver = createExerciseNameResolver(CATALOG, normaliseExerciseName)

describe('migratePreferenceList', () => {
  it('promotes an exact name match to an id', () => {
    expect(migratePreferenceList(['Incline dumbbell press'], resolve)).toEqual({
      exerciseIds: ['incline-dumbbell-press'],
      freeText: [],
    })
  })

  it('promotes an alias the same way a name is promoted', () => {
    expect(migratePreferenceList(['RDL', 'Back squat'], resolve)).toEqual({
      exerciseIds: ['romanian-deadlift', 'barbell-back-squat'],
      freeText: [],
    })
  })

  it('sees through case, punctuation, accents, and stray whitespace', () => {
    const typed = ['  incline   DUMBBELL-press ', 'romanian déadlift']
    expect(migratePreferenceList(typed, resolve)).toEqual({
      exerciseIds: ['incline-dumbbell-press', 'romanian-deadlift'],
      freeText: [],
    })
  })

  it('keeps anything it cannot match with certainty, verbatim', () => {
    // "Incline press" is NOT "Incline dumbbell press", and a near-match here would
    // silently change what the person asked for. Their words are kept instead.
    const typed = ['Incline press', 'that machine by the window', 'squats']
    expect(migratePreferenceList(typed, resolve)).toEqual({
      exerciseIds: [],
      freeText: ['Incline press', 'that machine by the window', 'squats'],
    })
  })

  it('keeps the exact spelling, including the whitespace, of an unmatched entry', () => {
    expect(migratePreferenceList(['  Weird  Machine  '], resolve).freeText).toEqual(['  Weird  Machine  '])
  })

  it('takes an empty list to an empty pair', () => {
    expect(migratePreferenceList([], resolve)).toEqual({ exerciseIds: [], freeText: [] })
    expect(migratePreferenceList([])).toEqual({ exerciseIds: [], freeText: [] })
  })

  it('collapses duplicates, keeping the first of each', () => {
    const typed = ['Back squat', 'Barbell back squat', 'squat', 'My own thing', 'My own thing']
    expect(migratePreferenceList(typed, resolve)).toEqual({
      exerciseIds: ['barbell-back-squat'],
      freeText: ['My own thing'],
    })
  })

  it('keeps two spellings of one unmatched entry, because neither is wrong', () => {
    // Deduplication is by the exact string. Folding "Burpees" and "burpees"
    // together would be an edit to what somebody typed, on no evidence.
    expect(migratePreferenceList(['Burpees', 'burpees'], resolve).freeText).toEqual(['Burpees', 'burpees'])
  })

  it('preserves order within each list', () => {
    const typed = ['first thing', 'RDL', 'second thing', 'Back squat']
    expect(migratePreferenceList(typed, resolve)).toEqual({
      exerciseIds: ['romanian-deadlift', 'barbell-back-squat'],
      freeText: ['first thing', 'second thing'],
    })
  })

  it('keeps every entry as free text when no resolver is injected', () => {
    expect(migratePreferenceList(['RDL', 'Back squat'])).toEqual({
      exerciseIds: [],
      freeText: ['RDL', 'Back squat'],
    })
  })

  it('treats a resolver that throws as a resolver that found nothing', () => {
    const broken: ExerciseIdResolver = () => {
      throw new Error('catalog unavailable')
    }
    expect(migratePreferenceList(['RDL'], broken)).toEqual({ exerciseIds: [], freeText: ['RDL'] })
  })

  it('refuses anything from a resolver that is not a catalog id', () => {
    const wrong: ExerciseIdResolver = () => 'Incline Dumbbell Press'
    expect(migratePreferenceList(['RDL'], wrong)).toEqual({ exerciseIds: [], freeText: ['RDL'] })
  })

  it('keeps an entry that normalises to nothing rather than dropping it', () => {
    expect(migratePreferenceList(['!!!', '   '], resolve)).toEqual({
      exerciseIds: [],
      freeText: ['!!!', '   '],
    })
  })
})

describe('migratePreferenceSide', () => {
  it('returns an already-migrated side untouched', () => {
    const already = { exerciseIds: ['romanian-deadlift'], freeText: ['My own thing'] }
    expect(migratePreferenceSide(already, resolve)).toEqual(already)
  })

  it('is a no-op the second time it runs', () => {
    const once = migratePreferenceSide(['RDL', 'My own thing'], resolve)
    expect(migratePreferenceSide(once, resolve)).toEqual(once)
    expect(migratePreferenceSide(migratePreferenceSide(once, resolve), resolve)).toEqual(once)
  })

  it('takes a missing side to an empty pair', () => {
    expect(migratePreferenceSide(undefined, resolve)).toEqual({ exerciseIds: [], freeText: [] })
  })

  it('drops non-strings out of a v1 array rather than storing them', () => {
    expect(migratePreferenceSide([1, null, 'RDL', {}], resolve)).toEqual({
      exerciseIds: ['romanian-deadlift'],
      freeText: [],
    })
  })

  it('takes a side that is neither shape to an empty pair', () => {
    expect(migratePreferenceSide('Incline press', resolve)).toEqual({ exerciseIds: [], freeText: [] })
    expect(migratePreferenceSide(42, resolve)).toEqual({ exerciseIds: [], freeText: [] })
  })
})

describe('isMigratedPreferenceList', () => {
  it('recognises the v2 shape and nothing else', () => {
    expect(isMigratedPreferenceList({ exerciseIds: [], freeText: [] })).toBe(true)
    expect(isMigratedPreferenceList({ exerciseIds: ['a'], freeText: ['b'] })).toBe(true)
    expect(isMigratedPreferenceList({ exerciseIds: [], freeText: [1] })).toBe(false)
    expect(isMigratedPreferenceList({ exerciseIds: [] })).toBe(false)
    expect(isMigratedPreferenceList(['Incline press'])).toBe(false)
    expect(isMigratedPreferenceList(null)).toBe(false)
  })
})

describe('migrateExercisePreferencesToV2', () => {
  it('migrates both sides and leaves the rest of the record alone', () => {
    const before = {
      schemaVersion: 1,
      experience: 'beginner',
      exercisePreferences: { preferred: ['RDL', 'Weird machine'], disliked: ['Back squat'] },
    }

    expect(migrateExercisePreferencesToV2(before, resolve)).toEqual({
      schemaVersion: 1,
      experience: 'beginner',
      exercisePreferences: {
        preferred: { exerciseIds: ['romanian-deadlift'], freeText: ['Weird machine'] },
        disliked: { exerciseIds: ['barbell-back-squat'], freeText: [] },
      },
    })
  })

  it('carries an unknown key on the preferences object through', () => {
    const before = {
      schemaVersion: 1,
      exercisePreferences: { preferred: ['RDL'], disliked: [], neverHeardOf: { from: 'a later build' } },
    }
    const after = migrateExercisePreferencesToV2(before, resolve)

    expect(after.exercisePreferences).toEqual({
      preferred: { exerciseIds: ['romanian-deadlift'], freeText: [] },
      disliked: { exerciseIds: [], freeText: [] },
      neverHeardOf: { from: 'a later build' },
    })
  })

  it('does not mutate the record it was given', () => {
    const before = { schemaVersion: 1, exercisePreferences: { preferred: ['RDL'], disliked: [] } }
    migrateExercisePreferencesToV2(before, resolve)
    expect(before.exercisePreferences.preferred).toEqual(['RDL'])
  })

  it('leaves a record whose preferences are missing or damaged exactly as it found it', () => {
    // Writing an empty field over a damaged one would turn "this profile is
    // damaged, here is what was in it" into "you have no preferences".
    const missing = { schemaVersion: 1, experience: 'beginner' }
    expect(migrateExercisePreferencesToV2(missing, resolve)).toEqual(missing)

    const damaged = { schemaVersion: 1, exercisePreferences: 'Incline press' }
    expect(migrateExercisePreferencesToV2(damaged, resolve)).toEqual(damaged)
  })

  it('is a no-op on its own output', () => {
    const before = {
      schemaVersion: 1,
      exercisePreferences: { preferred: ['RDL', 'Weird machine'], disliked: [] },
    }
    const once = migrateExercisePreferencesToV2(before, resolve)
    expect(migrateExercisePreferencesToV2(once, resolve)).toEqual(once)
  })
})
