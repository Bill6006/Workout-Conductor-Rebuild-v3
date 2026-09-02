import { defineExercise } from '../../catalog/exercises/exerciseSchema'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { SessionEntry } from './conflictContext'

/**
 * HAND-BUILT EXERCISES FOR THE ENGINE'S TESTS.
 *
 * The real catalog is authored elsewhere and is still growing, so nothing here
 * depends on a particular exercise existing. These are the smallest legal
 * `Exercise` records that make one rule fire, which also means a test reads as
 * the rule it is testing rather than as trivia about a bench press.
 *
 * IT IS NOT SHIPPED. Only `*.test.ts` files import this module, so the bundler
 * never sees it from an application entry point. It lives beside the tests rather
 * than in the catalog because these are not exercises — they are probes.
 *
 * `exerciseSchema` validates the base record in `testFixtures.test.ts`, so a
 * fixture cannot drift into a shape the real catalog could never produce.
 */

export const BASE_EXERCISE: Exercise = defineExercise({
  id: 'base-exercise',
  name: 'Base exercise',
  primaryMuscles: ['mid-chest'],
  movementPattern: 'horizontal-push',
  trainingRole: 'secondary-hypertrophy',
  strengthSuitability: 'moderate',
  hypertrophySuitability: 'good',
  equipment: ['dumbbells'],
  locationSuitability: ['gym', 'home'],
  setupTimeSeconds: 60,
  transitionCost: 'low',
  typicalRepRange: { min: 8, max: 12 },
  safeForDropSet: true,
  supersetCompatibility: { eligible: true, stationId: null, gripHeavy: false, competingDemands: [] },
  unilateral: false,
  compoundOrIsolation: 'compound',
  stabilityDemand: 'moderate',
  gripDemand: 'low',
  instructionSteps: ['Set up.', 'Do the repetitions.'],
  difficulty: 'intermediate',
  mediaId: 'base-exercise',
  progressionFamily: 'horizontal-press-dumbbell',
  load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false, plateMath: false },
  warmUpSuitability: 'specific-ramp',
})

/** The base record with whatever a test needs changed. `id` is always required. */
export function anExercise(overrides: Partial<Exercise> & Pick<Exercise, 'id'>): Exercise {
  return { ...BASE_EXERCISE, ...overrides }
}

/** A session entry, so a test does not have to spell out the optional fields. */
export function anEntry(exercise: Exercise, extras: Omit<SessionEntry, 'exercise'> = {}): SessionEntry {
  return { exercise, ...extras }
}
