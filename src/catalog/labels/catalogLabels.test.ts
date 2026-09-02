import { describe, expect, it } from 'vitest'
import {
  CATALOG_LABEL_SETS,
  MUSCLE_GROUP_LABELS,
  bodyRegionLabel,
  competingDemandLabel,
  difficultyLabel,
  gripDemandLabel,
  jointLabel,
  limitationFlagLabel,
  loadBasisLabel,
  loadMeasureLabel,
  locationSuitabilityLabel,
  mediaKindLabel,
  movementChainLabel,
  movementPatternLabel,
  movementPlaneLabel,
  muscleGroupLabel,
  muscleLabel,
  repUnitLabel,
  stabilityDemandLabel,
  stationLabel,
  stressIntensityLabel,
  suitabilityLabel,
  trainingRoleLabel,
  transitionCostLabel,
  warmUpSuitabilityLabel,
} from './catalogLabels'
import { bodyRegionSchema, muscleGroupIdSchema, muscleIdSchema } from '../muscles/muscles'
import {
  movementChainSchema,
  movementPatternIdSchema,
  movementPlaneSchema,
} from '../movementPatterns/movementPatterns'
import { jointIdSchema, stressIntensitySchema } from '../taxonomy/joints'
import {
  DIFFICULTY_SCALE,
  GRIP_DEMAND_SCALE,
  STABILITY_DEMAND_SCALE,
  SUITABILITY_SCALE,
  TRANSITION_COST_SCALE,
  WARM_UP_SUITABILITY_SCALE,
} from '../taxonomy/scales'
import {
  competingDemandSchema,
  limitationFlagSchema,
  loadBasisSchema,
  loadMeasureSchema,
  locationSuitabilitySchema,
  repUnitSchema,
  stationIdSchema,
  trainingRoleSchema,
} from '../taxonomy/taxonomy'
import { mediaKindSchema } from '../media/mediaSchema'

/**
 * The vocabulary each catalogue covers, taken from the ZOD ENUM rather than from
 * the array beside it.
 *
 * That is the whole point of this file. A value added to an enum without copy is
 * the defect this catalogue exists to prevent, and driving the check off the
 * schema means the new value fails HERE — before it reaches a screen as a raw
 * kebab-case id.
 */
const ENUM_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  MuscleGroup: muscleGroupIdSchema.options,
  Muscle: muscleIdSchema.options,
  BodyRegion: bodyRegionSchema.options,
  MovementPattern: movementPatternIdSchema.options,
  MovementPlane: movementPlaneSchema.options,
  MovementChain: movementChainSchema.options,
  TrainingRole: trainingRoleSchema.options,
  Joint: jointIdSchema.options,
  StressIntensity: stressIntensitySchema.options,
  Suitability: SUITABILITY_SCALE.schema.options,
  GripDemand: GRIP_DEMAND_SCALE.schema.options,
  StabilityDemand: STABILITY_DEMAND_SCALE.schema.options,
  Difficulty: DIFFICULTY_SCALE.schema.options,
  TransitionCost: TRANSITION_COST_SCALE.schema.options,
  WarmUpSuitability: WARM_UP_SUITABILITY_SCALE.schema.options,
  LocationSuitability: locationSuitabilitySchema.options,
  Station: stationIdSchema.options,
  CompetingDemand: competingDemandSchema.options,
  LoadBasis: loadBasisSchema.options,
  LoadMeasure: loadMeasureSchema.options,
  RepUnit: repUnitSchema.options,
  LimitationFlag: limitationFlagSchema.options,
  MediaKind: mediaKindSchema.options,
}

describe('the catalogue registry', () => {
  it('covers every vocabulary that has copy, and no more', () => {
    expect(CATALOG_LABEL_SETS.map((set) => set.name).sort()).toEqual(Object.keys(ENUM_OPTIONS).sort())
  })

  it('names each vocabulary once', () => {
    const names = CATALOG_LABEL_SETS.map((set) => set.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(CATALOG_LABEL_SETS)('$name covers exactly its Zod enum, in order', (set) => {
    const options = ENUM_OPTIONS[set.name]
    expect(options, `${set.name} has no enum in this test`).toBeDefined()
    expect(set.values).toEqual([...options])
    expect(set.entries.map((label) => label.value)).toEqual([...options])
  })

  it.each(CATALOG_LABEL_SETS)('$name gives every value a label, exactly once', (set) => {
    const values = set.entries.map((label) => label.value)
    expect(new Set(values).size).toBe(values.length)

    for (const entry of set.entries) {
      expect(entry.label.trim(), `${set.name}.${entry.value} has no label`).not.toBe('')
      // A label that IS the id is a raw id reaching a person by another route.
      expect(entry.label).not.toBe(entry.value)
    }
  })

  it.each(CATALOG_LABEL_SETS)('$name writes labels a person reads, not slugs', (set) => {
    for (const entry of set.entries) {
      expect(entry.label, `${set.name}.${entry.value}`).not.toMatch(/_/)
      expect(entry.label[0], `${set.name}.${entry.value} should start capitalised`).toBe(
        entry.label[0].toUpperCase(),
      )
      expect(entry.label.length).toBeLessThanOrEqual(30)
      if (entry.shortLabel !== undefined) {
        expect(entry.shortLabel.trim()).not.toBe('')
        expect(entry.shortLabel.length).toBeLessThanOrEqual(entry.label.length)
        expect(entry.shortLabel.length).toBeLessThanOrEqual(20)
      }
    }
  })
})

describe('the label functions', () => {
  it('return the copy for a value rather than the value', () => {
    expect(muscleLabel('rectus-abdominis')).toBe('Abs')
    expect(muscleGroupLabel('adductors')).toBe('Inner thigh')
    expect(bodyRegionLabel('upper')).toBe('Upper body')
    expect(movementPatternLabel('knee-flexion')).toBe('Leg curl')
    expect(movementPlaneLabel('transverse')).toBe('Across the body')
    expect(movementChainLabel('loaded-carry')).toBe('Loaded carry')
    expect(trainingRoleLabel('primary-strength')).toBe('Main strength lift')
    expect(jointLabel('lower-back')).toBe('Lower back')
    expect(stressIntensityLabel('high')).toBe('Heavy load')
    expect(suitabilityLabel('unsuitable')).toBe('Not suited')
    expect(gripDemandLabel('high')).toBe('Grip-limited')
    expect(stabilityDemandLabel('very-high')).toBe('Very unstable')
    expect(difficultyLabel('advanced')).toBe('Advanced')
    expect(transitionCostLabel('high')).toBe('Slow to set up')
    expect(warmUpSuitabilityLabel('specific-ramp')).toBe('Ramp up on it')
    expect(locationSuitabilityLabel('travel')).toBe('Travel')
    expect(stationLabel('selectorised-machine')).toBe('Machine')
    expect(competingDemandLabel('core-bracing')).toBe('Core bracing')
    expect(loadBasisLabel('bodyweight-loadable')).toBe('Bodyweight plus load')
    expect(loadMeasureLabel('per-hand')).toBe('Per hand')
    expect(repUnitLabel('seconds')).toBe('Seconds held')
    expect(limitationFlagLabel('barbell-squat')).toBe('Avoiding barbell squats')
    expect(mediaKindLabel('poster')).toBe('Still image')
  })

  it('answer for every value of every vocabulary, never with a blank', () => {
    const byName = new Map(CATALOG_LABEL_SETS.map((set) => [set.name, set]))

    for (const [name, options] of Object.entries(ENUM_OPTIONS)) {
      const set = byName.get(name)
      expect(set, `${name} has no catalogue`).toBeDefined()
      for (const value of options) {
        const entry = set?.entries.find((candidate) => candidate.value === value)
        expect(entry, `${name}.${value} has no label`).toBeDefined()
      }
    }
  })

  it('fall back to the value rather than rendering nothing for an unknown one', () => {
    // A corrupt record should read oddly, not disappear.
    expect(muscleLabel('pectoralis-tertius' as never)).toBe('pectoralis-tertius')
    expect(stationLabel('the-corner' as never)).toBe('the-corner')
  })
})

describe('the catalogue and the profile-label catalogue stay separate owners', () => {
  it('does not restate a muscle group as a profile enum, or the other way round', () => {
    // `labels.ts` owns the profile's enums; this file owns the catalog's. The one
    // thing that would make them rivals is a value appearing in both.
    const groups = MUSCLE_GROUP_LABELS.map((entry) => entry.value)
    expect(groups).toContain('chest')
    expect(groups).not.toContain('build-muscle')
  })
})
