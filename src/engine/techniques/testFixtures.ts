import { defineExercise } from '../../catalog/exercises/exerciseSchema'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { TechniqueCandidate } from './types'

/**
 * HAND-BUILT EXERCISES AND SLOTS FOR THE TECHNIQUE TESTS.
 *
 * The shipped catalog is authored elsewhere and is still growing, so nothing here
 * depends on a particular exercise existing. These are the smallest legal records
 * that make one rule fire, which also means a test reads as the rule it is testing
 * rather than as trivia about a lateral raise.
 *
 * IT IS NOT SHIPPED. Only `*.test.ts` files import this module, so no application
 * entry point ever reaches it. It lives beside the tests rather than in the
 * catalog because these are not exercises — they are probes.
 *
 * THE BASE IS DELIBERATELY THE EASY CASE: an isolation dumbbell movement that is
 * eligible for a superset, safe for a drop set, good for size, cheap to move to,
 * on no station, at beginner difficulty. Every fixture below is that record with
 * exactly one thing changed, so a failing test points at the change.
 */

export const BASE_EXERCISE: Exercise = defineExercise({
  id: 'base-move',
  name: 'Base move',
  primaryMuscles: ['side-delt'],
  movementPattern: 'isolation-raise',
  trainingRole: 'isolation',
  strengthSuitability: 'limited',
  hypertrophySuitability: 'good',
  equipment: ['dumbbells'],
  locationSuitability: ['gym', 'home'],
  setupTimeSeconds: 30,
  transitionCost: 'low',
  typicalRepRange: { min: 8, max: 12 },
  safeForDropSet: true,
  supersetCompatibility: { eligible: true, stationId: null, gripHeavy: false, competingDemands: [] },
  unilateral: false,
  compoundOrIsolation: 'isolation',
  stabilityDemand: 'low',
  gripDemand: 'low',
  difficulty: 'beginner',
  instructionSteps: ['Set up.', 'Do the repetitions.'],
  mediaId: 'base-move',
  progressionFamily: 'lateral-raise',
  load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false, plateMath: false },
  warmUpSuitability: 'specific-ramp',
})

/** The base record with whatever a test needs changed. `id` is always required. */
export function anExercise(overrides: Partial<Exercise> & Pick<Exercise, 'id'>): Exercise {
  return { ...BASE_EXERCISE, ...overrides }
}

/**
 * A slot, so a test does not have to spell out what it does not care about.
 *
 * The defaults are the easy case again: an ordinary accessory slot of three sets
 * with 90 seconds of rest, which is a pairing that comfortably clears the time
 * threshold. A test that wants a pairing refused changes one thing.
 */
export function aSlot(
  slotId: string,
  exercise: Exercise,
  overrides: Partial<Omit<TechniqueCandidate, 'slotId' | 'exercise'>> = {},
): TechniqueCandidate {
  return {
    slotId,
    exercise,
    priority: overrides.priority ?? 'accessory',
    role: overrides.role ?? exercise.trainingRole,
    plannedSets: overrides.plannedSets ?? 3,
    restSeconds: overrides.restSeconds ?? 90,
    position: overrides.position ?? 0,
  }
}

/** Two ordinary accessory slots that pair cleanly. The starting point for most tests. */
export function aPair(
  first: Partial<Exercise> = {},
  second: Partial<Exercise> = {},
): [TechniqueCandidate, TechniqueCandidate] {
  return [
    aSlot('slot-a', anExercise({ id: 'move-a', primaryMuscles: ['side-delt'], ...first }), {
      position: 0,
    }),
    aSlot(
      'slot-b',
      anExercise({
        id: 'move-b',
        primaryMuscles: ['triceps-long-head'],
        progressionFamily: 'triceps-extension-dumbbell',
        ...second,
      }),
      { position: 1 },
    ),
  ]
}
