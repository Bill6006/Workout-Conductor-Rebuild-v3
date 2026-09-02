import { defineExercise, type Exercise, type ExerciseInput } from '../../catalog/exercises/exerciseSchema'
import { buildAlternativesIndex, type AlternativesIndex } from './catalogIndex'
import { defineSessionSlot, type AlternativesContext, type SessionSlot, type SessionSlotInput } from './types'

/**
 * FIXTURES FOR THIS MODULE'S TESTS. Nothing outside `engine/alternatives/*.test.ts`
 * imports this file, and no application code ever may.
 *
 * WHY A SYNTHETIC CATALOG RATHER THAN THE REAL ONE. The exercise data is being
 * authored concurrently, so a test written against real entries would be testing
 * whoever last edited them. These entries are built for the property under test —
 * a candidate that differs from another in exactly one field, so that when the
 * ordering changes there is only one thing it can be about. They are still REAL
 * exercises in shape: every one goes through `defineExercise`, and
 * `testFixtures.test.ts` parses the whole set with `exerciseSchema`, so a fixture
 * that could not exist in the catalog fails rather than quietly proving nothing.
 *
 * The names are ordinary gym names because the plain-language strings the ranker
 * produces are part of what is being tested, and `Test Exercise 3` would make
 * every one of those assertions unreadable.
 */

/**
 * A workable default for every field, so a fixture states only what the test is
 * about. It describes a mid-range dumbbell chest press: nothing extreme, so any
 * field a test does not mention cannot be the reason a candidate wins.
 */
const BASE: ExerciseInput = {
  id: 'base-exercise',
  name: 'Base exercise',
  primaryMuscles: ['mid-chest'],
  movementPattern: 'horizontal-push',
  trainingRole: 'primary-hypertrophy',
  strengthSuitability: 'good',
  hypertrophySuitability: 'good',
  equipment: ['dumbbells', 'flat-bench'],
  locationSuitability: ['gym', 'home'],
  setupTimeSeconds: 60,
  transitionCost: 'moderate',
  typicalRepRange: { min: 8, max: 12 },
  safeForDropSet: true,
  supersetCompatibility: { eligible: true, stationId: null, gripHeavy: false, competingDemands: [] },
  unilateral: false,
  compoundOrIsolation: 'compound',
  stabilityDemand: 'moderate',
  gripDemand: 'low',
  instructionSteps: ['Set up.', 'Press.'],
  difficulty: 'intermediate',
  mediaId: 'base-exercise',
  progressionFamily: 'horizontal-press-dumbbell',
  load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false, plateMath: false },
  warmUpSuitability: 'specific-ramp',
}

/** One fixture exercise: the base, with whatever the test cares about overridden. */
export function exercise(overrides: Partial<ExerciseInput> & Pick<ExerciseInput, 'id' | 'name'>): Exercise {
  const mediaId = 'mediaId' in overrides ? overrides.mediaId : overrides.id
  return defineExercise({ ...BASE, ...overrides, mediaId })
}

/* ------------------------------------------------------------------ *
 * A small chest-and-back catalog
 * ------------------------------------------------------------------ */

/** The exercise most scenarios replace: a flat barbell bench press. */
export const BARBELL_BENCH = exercise({
  id: 'barbell-bench-press',
  name: 'Barbell bench press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-lateral-head'],
  trainingRole: 'primary-strength',
  strengthSuitability: 'excellent',
  hypertrophySuitability: 'good',
  equipment: ['barbell', 'flat-bench', 'squat-rack'],
  locationSuitability: ['gym'],
  setupTimeSeconds: 120,
  transitionCost: 'high',
  typicalRepRange: { min: 5, max: 8 },
  supersetCompatibility: {
    eligible: false,
    stationId: 'bench-station',
    gripHeavy: false,
    competingDemands: [],
  },
  stabilityDemand: 'high',
  jointStressTags: [{ joint: 'shoulder', intensity: 'high' }],
  contraindicatedFor: ['shoulder'],
  commonSubstitutions: ['dumbbell-bench-press', 'machine-chest-press', 'landmine-press'],
  progressionFamily: 'horizontal-press-barbell',
  load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
})

/** The obvious swap: same movement, same muscles, kit most people have. */
export const DUMBBELL_BENCH = exercise({
  id: 'dumbbell-bench-press',
  name: 'Dumbbell bench press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-lateral-head'],
  trainingRole: 'primary-strength',
  strengthSuitability: 'good',
  hypertrophySuitability: 'excellent',
  equipment: ['dumbbells', 'flat-bench'],
  setupTimeSeconds: 45,
  typicalRepRange: { min: 6, max: 10 },
  supersetCompatibility: {
    eligible: true,
    stationId: 'bench-station',
    gripHeavy: false,
    competingDemands: [],
  },
  stabilityDemand: 'high',
  jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }],
  commonSubstitutions: ['machine-chest-press'],
  progressionFamily: 'horizontal-press-dumbbell',
})

/** Same movement on a fixed path: gentler, and easy to set up. */
export const MACHINE_PRESS = exercise({
  id: 'machine-chest-press',
  name: 'Machine chest press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-lateral-head'],
  trainingRole: 'primary-hypertrophy',
  strengthSuitability: 'moderate',
  hypertrophySuitability: 'excellent',
  equipment: ['selectorised-machines'],
  locationSuitability: ['gym'],
  setupTimeSeconds: 30,
  transitionCost: 'low',
  supersetCompatibility: {
    eligible: true,
    stationId: 'selectorised-machine',
    gripHeavy: false,
    competingDemands: [],
  },
  stabilityDemand: 'low',
  jointStressTags: [{ joint: 'shoulder', intensity: 'low' }],
  progressionFamily: 'horizontal-press-machine',
  load: { basis: 'machine-stack', measure: 'total', usesBar: false, plateMath: false },
})

/** A different emphasis in the same group: upper chest as well as mid. */
export const INCLINE_DUMBBELL = exercise({
  id: 'incline-dumbbell-press',
  name: 'Incline dumbbell press',
  primaryMuscles: ['upper-chest', 'mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-lateral-head'],
  equipment: ['dumbbells', 'adjustable-bench'],
  setupTimeSeconds: 60,
  jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }],
  progressionFamily: 'incline-press-dumbbell',
})

/** An isolation on an overlapping pattern: a real alternative, a worse match. */
export const CABLE_FLY = exercise({
  id: 'cable-fly',
  name: 'Cable fly',
  primaryMuscles: ['mid-chest'],
  movementPattern: 'isolation-fly',
  trainingRole: 'isolation',
  strengthSuitability: 'limited',
  hypertrophySuitability: 'good',
  equipment: ['cable-machine'],
  locationSuitability: ['gym'],
  setupTimeSeconds: 50,
  typicalRepRange: { min: 12, max: 20 },
  compoundOrIsolation: 'isolation',
  stabilityDemand: 'low',
  supersetCompatibility: { eligible: true, stationId: 'cable-tower', gripHeavy: false, competingDemands: [] },
  progressionFamily: 'chest-fly',
  load: { basis: 'cable-stack', measure: 'total', usesBar: false, plateMath: false },
})

/** Bodyweight, needs nothing, works anywhere. The travel answer. */
export const PUSH_UP = exercise({
  id: 'push-up',
  name: 'Push-up',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-lateral-head'],
  trainingRole: 'secondary-hypertrophy',
  strengthSuitability: 'limited',
  hypertrophySuitability: 'moderate',
  equipment: [],
  locationSuitability: ['gym', 'home', 'travel'],
  setupTimeSeconds: 10,
  transitionCost: 'low',
  typicalRepRange: { min: 10, max: 20 },
  difficulty: 'beginner',
  progressionFamily: 'horizontal-press-bodyweight',
  load: { basis: 'bodyweight', measure: 'none', usesBar: false, plateMath: false },
})

/** Unfinished: in the catalog, never proposed. */
export const UNFINISHED_PRESS = exercise({
  id: 'landmine-press',
  name: 'Landmine press',
  equipment: ['landmine'],
  productionEnabled: false,
  mediaId: null,
})

/** A pull, so it never belongs in a list of chest alternatives. */
export const BARBELL_ROW = exercise({
  id: 'barbell-row',
  name: 'Barbell row',
  primaryMuscles: ['lats', 'upper-back'],
  movementPattern: 'horizontal-pull',
  equipment: ['barbell'],
  locationSuitability: ['gym'],
  gripDemand: 'high',
  supersetCompatibility: { eligible: true, stationId: null, gripHeavy: true, competingDemands: ['grip'] },
  jointStressTags: [{ joint: 'lower-back', intensity: 'moderate' }],
  progressionFamily: 'horizontal-row-barbell',
  load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
})

/** A back exercise for the same group as the row — a partner, or a duplicate. */
export const LAT_PULLDOWN = exercise({
  id: 'lat-pulldown',
  name: 'Lat pulldown',
  primaryMuscles: ['lats'],
  movementPattern: 'vertical-pull',
  equipment: ['lat-pulldown'],
  locationSuitability: ['gym'],
  gripDemand: 'moderate',
  supersetCompatibility: {
    eligible: true,
    stationId: 'lat-pulldown-station',
    gripHeavy: true,
    competingDemands: ['grip'],
  },
  progressionFamily: 'vertical-pull-machine',
  load: { basis: 'machine-stack', measure: 'total', usesBar: false, plateMath: false },
})

/** A squat, for a session that needs something entirely unrelated in it. */
export const BACK_SQUAT = exercise({
  id: 'back-squat',
  name: 'Back squat',
  primaryMuscles: ['quads'],
  secondaryMuscles: ['glute-max'],
  movementPattern: 'squat',
  trainingRole: 'primary-strength',
  equipment: ['barbell', 'squat-rack'],
  locationSuitability: ['gym'],
  setupTimeSeconds: 150,
  typicalRepRange: { min: 4, max: 8 },
  supersetCompatibility: { eligible: false, stationId: 'squat-rack', gripHeavy: false, competingDemands: [] },
  jointStressTags: [
    { joint: 'knee', intensity: 'high' },
    { joint: 'lower-back', intensity: 'high' },
  ],
  contraindicatedFor: ['knee', 'barbell-squat'],
  progressionFamily: 'squat-barbell',
  load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
})

export const CATALOG: readonly Exercise[] = [
  BARBELL_BENCH,
  DUMBBELL_BENCH,
  MACHINE_PRESS,
  INCLINE_DUMBBELL,
  CABLE_FLY,
  PUSH_UP,
  UNFINISHED_PRESS,
  BARBELL_ROW,
  LAT_PULLDOWN,
  BACK_SQUAT,
]

export function testIndex(exercises: readonly Exercise[] = CATALOG): AlternativesIndex {
  return buildAlternativesIndex(exercises)
}

/* ------------------------------------------------------------------ *
 * Sessions and contexts
 * ------------------------------------------------------------------ */

export function slot(input: SessionSlotInput): SessionSlot {
  return defineSessionSlot(input)
}

/** A fully equipped gym. Everything the fixtures need, and nothing bodyweight-only. */
export const FULL_GYM = [
  'barbell',
  'dumbbells',
  'adjustable-dumbbells',
  'flat-bench',
  'adjustable-bench',
  'squat-rack',
  'cable-machine',
  'lat-pulldown',
  'selectorised-machines',
  'landmine',
] as const

/**
 * The default context: one bench-press slot in an otherwise empty session, at a
 * gym with everything, no limitations, no preferences, no clock, no fatigue.
 *
 * Every test starts here and changes ONE thing, so that when an assertion moves
 * there is exactly one candidate explanation for why.
 */
export function context(overrides: Partial<AlternativesContext> = {}): AlternativesContext {
  const base: AlternativesContext = {
    session: [slot({ slotId: 'a', exercise: BARBELL_BENCH })],
    targetSlotId: 'a',
    availableEquipment: [...FULL_GYM],
    location: 'gym',
    limitations: [],
    preferences: {
      preferred: { exerciseIds: [], freeText: [] },
      disliked: { exerciseIds: [], freeText: [] },
    },
    goal: 'hybrid',
    remainingSeconds: null,
    fatigue: null,
  }
  return { ...base, ...overrides }
}
