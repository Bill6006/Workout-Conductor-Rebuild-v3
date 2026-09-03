import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { ExercisePreferences } from '../../core/validation/schemas'
import { anExercise } from '../conflicts/testFixtures'
import type { SelectionContext, SlotRequest } from './selectionTypes'

/**
 * HAND-BUILT PROBES FOR THE SELECTION RANKER'S TESTS.
 *
 * The exercises are built one field apart from `conflicts/testFixtures`' base
 * record, so when an ordering changes there is exactly one thing it can be
 * about. That is the point of testing a scoring function with fixtures rather
 * than with the real catalog: a test that reads as trivia about a bench press
 * cannot say which factor moved.
 *
 * IT IS NOT SHIPPED. Only `*.test.ts` files import this module, so the bundler
 * never sees it from an application entry point — the same arrangement as
 * `engine/conflicts/testFixtures.ts`, which this builds on rather than
 * duplicating.
 */

export const NO_PREFERENCES: ExercisePreferences = {
  preferred: { exerciseIds: [], freeText: [] },
  disliked: { exerciseIds: [], freeText: [] },
}

/** A compound chest press. The obvious fill for a chest anchor slot. */
export const DB_PRESS = anExercise({
  id: 'db-press',
  name: 'Dumbbell bench press',
  primaryMuscles: ['mid-chest', 'upper-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
  movementPattern: 'horizontal-push',
  trainingRole: 'primary-hypertrophy',
  strengthSuitability: 'good',
  hypertrophySuitability: 'excellent',
  compoundOrIsolation: 'compound',
  jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }],
  progressionFamily: 'horizontal-press-dumbbell',
})

/** An incline press: the same group, a different head emphasis. */
export const INCLINE_PRESS = anExercise({
  id: 'incline-press',
  name: 'Incline dumbbell press',
  primaryMuscles: ['upper-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
  movementPattern: 'horizontal-push',
  trainingRole: 'primary-hypertrophy',
  strengthSuitability: 'good',
  hypertrophySuitability: 'excellent',
  compoundOrIsolation: 'compound',
  progressionFamily: 'incline-press-dumbbell',
})

/** A chest isolation, for role-fit contrasts. */
export const CABLE_FLY = anExercise({
  id: 'cable-fly',
  name: 'Cable fly',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: [],
  movementPattern: 'isolation-fly',
  trainingRole: 'isolation',
  strengthSuitability: 'limited',
  hypertrophySuitability: 'good',
  compoundOrIsolation: 'isolation',
  equipment: ['cable-machine'],
  setupTimeSeconds: 120,
  transitionCost: 'high',
  supersetCompatibility: { eligible: true, stationId: 'cable-tower', gripHeavy: false, competingDemands: [] },
  progressionFamily: 'chest-fly',
})

/** Reaches the chest only as an assisting muscle. The tail of the pool. */
export const DIP = anExercise({
  id: 'dip',
  name: 'Dip',
  primaryMuscles: ['triceps-long-head'],
  secondaryMuscles: ['lower-chest', 'front-delt'],
  movementPattern: 'vertical-push',
  trainingRole: 'secondary-hypertrophy',
  compoundOrIsolation: 'compound',
  equipment: ['dip-bars'],
  progressionFamily: 'triceps-dip',
})

/** A back movement, so a session can be given something to balance against. */
export const ROW = anExercise({
  id: 'row',
  name: 'Dumbbell row',
  primaryMuscles: ['lats', 'upper-back'],
  secondaryMuscles: ['biceps-long-head'],
  movementPattern: 'horizontal-pull',
  trainingRole: 'primary-hypertrophy',
  compoundOrIsolation: 'compound',
  gripDemand: 'high',
  progressionFamily: 'horizontal-row-dumbbell',
})

/** Advanced, technical, and never a warm-up. */
export const BARBELL_BENCH = anExercise({
  id: 'barbell-bench',
  name: 'Barbell bench press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
  movementPattern: 'horizontal-push',
  trainingRole: 'primary-strength',
  strengthSuitability: 'excellent',
  hypertrophySuitability: 'good',
  compoundOrIsolation: 'compound',
  difficulty: 'advanced',
  equipment: ['barbell', 'flat-bench'],
  warmUpSuitability: 'unsuitable',
  safeForDropSet: false,
  supersetCompatibility: {
    eligible: false,
    stationId: 'bench-station',
    gripHeavy: false,
    competingDemands: [],
  },
  contraindicatedFor: ['shoulder'],
  jointStressTags: [{ joint: 'shoulder', intensity: 'high' }],
  progressionFamily: 'horizontal-press-barbell',
})

/** A bodyweight press: nothing to fetch, usable anywhere, good as a general warm-up. */
export const PUSH_UP = anExercise({
  id: 'push-up',
  name: 'Push-up',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
  movementPattern: 'horizontal-push',
  trainingRole: 'secondary-hypertrophy',
  strengthSuitability: 'moderate',
  hypertrophySuitability: 'good',
  compoundOrIsolation: 'compound',
  difficulty: 'beginner',
  equipment: [],
  locationSuitability: ['gym', 'home', 'travel'],
  setupTimeSeconds: 10,
  transitionCost: 'low',
  warmUpSuitability: 'general',
  load: { basis: 'bodyweight', measure: 'none', usesBar: false, plateMath: false },
  progressionFamily: 'horizontal-press-bodyweight',
})

/** An unfinished entry: reachable by id, never programmable. */
export const DRAFT_PRESS = anExercise({
  id: 'draft-press',
  name: 'Draft press',
  primaryMuscles: ['mid-chest'],
  productionEnabled: false,
  mediaId: null,
  progressionFamily: 'horizontal-press-machine',
})

export const CATALOG: readonly Exercise[] = [
  DB_PRESS,
  INCLINE_PRESS,
  CABLE_FLY,
  DIP,
  ROW,
  BARBELL_BENCH,
  PUSH_UP,
  DRAFT_PRESS,
]

/** A chest slot, with whatever a test needs changed. */
export function aSlot(overrides: Partial<SlotRequest> = {}): SlotRequest {
  return {
    slotId: 'slot-1',
    targetGroup: 'chest',
    role: 'primary-hypertrophy',
    priority: 'normal',
    plannedSets: 3,
    restSeconds: 90,
    ...overrides,
  }
}

/** A well-equipped gym, no limitations, nothing chosen yet. */
export function aContext(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    chosen: [],
    availableEquipment: ['dumbbells', 'barbell', 'flat-bench', 'cable-machine', 'dip-bars'],
    location: 'gym',
    limitations: [],
    preferences: NO_PREFERENCES,
    trainingStyle: 'hybrid',
    experience: 'intermediate',
    techniques: { supersets: true, dropSets: true, circuits: false },
    ...overrides,
  }
}
