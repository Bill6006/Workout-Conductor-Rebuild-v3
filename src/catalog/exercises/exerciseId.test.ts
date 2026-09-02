import { describe, expect, it } from 'vitest'
import {
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

describe('the built-in id shape', () => {
  it('accepts lowercase kebab-case with digits', () => {
    for (const id of ['squat', 'incline-dumbbell-press', 'db-row-45', 'a']) {
      expect(EXERCISE_ID_PATTERN.test(id)).toBe(true)
      expect(isBuiltInExerciseId(id)).toBe(true)
    }
  })

  it('refuses anything a stored id must never be', () => {
    for (const id of [
      'Incline-Press',
      'incline_press',
      'incline press',
      '-incline',
      'incline-',
      'incline--press',
      '1-press',
      '',
      'custom:my-thing',
    ]) {
      expect(isBuiltInExerciseId(id), `${id} should not be a built-in id`).toBe(false)
    }
  })

  it('bounds the length, so a corrupt record cannot carry an unbounded string', () => {
    expect(isBuiltInExerciseId('a'.repeat(MAX_EXERCISE_ID_LENGTH))).toBe(true)
    expect(isBuiltInExerciseId('a'.repeat(MAX_EXERCISE_ID_LENGTH + 1))).toBe(false)
  })

  it('refuses a value that is not a string at all', () => {
    expect(isBuiltInExerciseId(undefined)).toBe(false)
    expect(isBuiltInExerciseId(12)).toBe(false)
    expect(isBuiltInExerciseId(['squat'])).toBe(false)
  })
})

describe('the custom namespace', () => {
  it('keeps a user id in a space a built-in can never enter', () => {
    // `:` is illegal in a built-in id, so a custom exercise cannot collide with a
    // built-in the app ships NEXT year — the collision that actually happens.
    expect(CUSTOM_ID_PREFIX).toContain(':')
    expect(EXERCISE_ID_PATTERN.test(CUSTOM_ID_PREFIX)).toBe(false)

    expect(isCustomExerciseId('custom:my-machine')).toBe(true)
    expect(isCustomExerciseId('my-machine')).toBe(false)
    expect(isCustomExerciseId('custom:')).toBe(false)
    expect(isCustomExerciseId('custom:My-Machine')).toBe(false)
    expect(isCustomExerciseId('CUSTOM:my-machine')).toBe(false)
    expect(isCustomExerciseId(null)).toBe(false)
  })

  it('counts either kind as a storable reference, and nothing else', () => {
    expect(isCatalogExerciseId('barbell-back-squat')).toBe(true)
    expect(isCatalogExerciseId('custom:my-machine')).toBe(true)
    expect(isCatalogExerciseId('Barbell Back Squat')).toBe(false)
    expect(isCatalogExerciseId('')).toBe(false)
  })

  it('slugs whatever a person typed into a legal custom id', () => {
    expect(customExerciseId('Incline Dumbbell Press!')).toBe('custom:incline-dumbbell-press')
    expect(customExerciseId('  the weird machine  ')).toBe('custom:the-weird-machine')
    expect(customExerciseId('Café press')).toBe('custom:cafe-press')
    expect(isCustomExerciseId(customExerciseId('Row (wide grip)'))).toBe(true)
  })
})

describe('normaliseExerciseName', () => {
  it('folds case, punctuation, accents, and whitespace runs', () => {
    expect(normaliseExerciseName('Incline Dumbbell Press')).toBe('incline dumbbell press')
    expect(normaliseExerciseName('  incline-dumbbell_press!  ')).toBe('incline dumbbell press')
    expect(normaliseExerciseName('INCLINE   DB   PRESS')).toBe('incline db press')
    expect(normaliseExerciseName('Café Press')).toBe('cafe press')
  })

  it('gives the same key to every spelling of one name', () => {
    const spellings = ['Pull-up', 'pull up', 'PULL   UP', 'pull-up!']
    const keys = new Set(spellings.map(normaliseExerciseName))
    expect(keys.size).toBe(1)
  })

  it('does NOT stem, de-pluralise, or drop words', () => {
    // The matching this feeds has to be exact: a near-match silently changes what
    // the user asked for.
    expect(normaliseExerciseName('squats')).not.toBe(normaliseExerciseName('squat'))
    expect(normaliseExerciseName('incline press')).not.toBe(normaliseExerciseName('incline dumbbell press'))
  })

  it('takes a string with nothing in it to an empty key', () => {
    expect(normaliseExerciseName('')).toBe('')
    expect(normaliseExerciseName('   ')).toBe('')
    expect(normaliseExerciseName('!!!')).toBe('')
  })
})

describe('humaniseExerciseId', () => {
  it('reads an id back as a name a person recognises', () => {
    expect(humaniseExerciseId('incline-dumbbell-press')).toBe('Incline dumbbell press')
    expect(humaniseExerciseId('squat')).toBe('Squat')
  })

  it('drops the custom namespace, which is plumbing rather than a name', () => {
    expect(humaniseExerciseId('custom:my-own-machine')).toBe('My own machine')
  })

  it('falls back to the id itself rather than rendering nothing', () => {
    expect(humaniseExerciseId('custom:')).toBe('custom:')
    expect(humaniseExerciseId('')).toBe('')
  })
})
