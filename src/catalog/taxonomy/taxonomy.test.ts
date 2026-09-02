import { describe, expect, it } from 'vitest'
import {
  COMPETING_DEMANDS,
  KNOWN_PROGRESSION_FAMILIES,
  LIMITATION_FLAGS,
  LOAD_BASES,
  LOAD_MEASURES,
  LOCATION_SUITABILITIES,
  REP_UNITS,
  STATION_IDS,
  TRAINING_ROLES,
  competingDemandSchema,
  isAnchorRole,
  isKnownProgressionFamily,
  limitationFlagSchema,
  loadBasisSchema,
  loadMeasureSchema,
  loadModelSchema,
  locationSuitabilitySchema,
  progressionCarriesAcross,
  progressionFamilySchema,
  repUnitSchema,
  stationIdSchema,
  trainingRoleSchema,
  type LoadModel,
} from './taxonomy'
import { createDefaultProfile, locationKindSchema } from '../../core/validation/schemas'

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Every flat vocabulary this module owns, so a new one cannot skip the id rules. */
const VOCABULARIES = [
  { name: 'TrainingRole', values: TRAINING_ROLES, schema: trainingRoleSchema },
  { name: 'LocationSuitability', values: LOCATION_SUITABILITIES, schema: locationSuitabilitySchema },
  { name: 'Station', values: STATION_IDS, schema: stationIdSchema },
  { name: 'CompetingDemand', values: COMPETING_DEMANDS, schema: competingDemandSchema },
  { name: 'LoadBasis', values: LOAD_BASES, schema: loadBasisSchema },
  { name: 'LoadMeasure', values: LOAD_MEASURES, schema: loadMeasureSchema },
  { name: 'RepUnit', values: REP_UNITS, schema: repUnitSchema },
  { name: 'LimitationFlag', values: LIMITATION_FLAGS, schema: limitationFlagSchema },
] as const

describe('every taxonomy vocabulary', () => {
  it.each(VOCABULARIES)('$name lists each id once, in lowercase kebab-case', ({ values }) => {
    expect(new Set(values).size).toBe(values.length)
    for (const value of values) expect(value).toMatch(KEBAB)
  })

  it.each(VOCABULARIES)('$name exposes the same ids through its Zod enum', ({ values, schema }) => {
    expect(schema.options).toEqual([...values])
  })

  it.each(VOCABULARIES)('$name accepts its own ids and refuses anything else', ({ values, schema }) => {
    for (const value of values) expect(schema.safeParse(value).success).toBe(true)
    expect(schema.safeParse('not-a-member').success).toBe(false)
    expect(schema.safeParse(1).success).toBe(false)
  })
})

describe('training roles', () => {
  it('treats the two lifts a session is built around as anchors, and nothing else', () => {
    expect(isAnchorRole('primary-strength')).toBe(true)
    expect(isAnchorRole('primary-hypertrophy')).toBe(true)

    for (const role of TRAINING_ROLES) {
      if (role === 'primary-strength' || role === 'primary-hypertrophy') continue
      expect(isAnchorRole(role), `${role} should not be an anchor`).toBe(false)
    }
  })
})

describe('location suitability', () => {
  /**
   * The source comment promises this correspondence and deliberately does NOT
   * import the profile schema to get it — `core/validation` sits above the
   * catalog. The test is where the two are held together.
   */
  it('mirrors the profile’s location kinds, minus the one nothing can reason about', () => {
    const kinds = locationKindSchema.options.filter((kind) => kind !== 'custom')
    expect([...LOCATION_SUITABILITIES].sort()).toEqual([...kinds].sort())
    expect(LOCATION_SUITABILITIES).not.toContain('custom')
  })
})

describe('limitation flags', () => {
  it('mirrors the limitations a person actually declares on their profile', () => {
    const declared = Object.keys(createDefaultProfile('2026-09-01T12:00:00.000Z').limitations).filter(
      (key) => key !== 'notes',
    )
    expect(declared).toEqual(['shoulder', 'knee', 'lowerBack', 'avoidBarbellSquat'])
    // Same four facts; camelCase on an object, kebab ids in a list.
    expect(LIMITATION_FLAGS).toEqual(['shoulder', 'knee', 'lower-back', 'barbell-squat'])
    expect(LIMITATION_FLAGS.length).toBe(declared.length)
  })
})

describe('the load model — what Plate Math reads', () => {
  function model(overrides: Partial<LoadModel> = {}): unknown {
    return { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true, ...overrides }
  }

  it('takes a complete, coherent model', () => {
    expect(loadModelSchema.safeParse(model()).success).toBe(true)
    expect(
      loadModelSchema.safeParse(model({ basis: 'dumbbell', measure: 'per-hand', usesBar: false })).success,
    ).toBe(true)
    expect(
      loadModelSchema.safeParse({
        basis: 'bodyweight',
        measure: 'none',
        usesBar: false,
        plateMath: false,
      }).success,
    ).toBe(true)
  })

  it('requires every field, with no default for the one that doubles a history', () => {
    // `measure` decides whether a logged 20 means 20 kg or 40. An omitted field
    // that defaulted would silently halve or double somebody's numbers.
    expect(loadModelSchema.safeParse({ basis: 'barbell', usesBar: true, plateMath: true }).success).toBe(
      false,
    )
    expect(loadModelSchema.safeParse({ measure: 'total', usesBar: true, plateMath: true }).success).toBe(
      false,
    )
    expect(loadModelSchema.safeParse(model({ usesBar: undefined })).success).toBe(false)
    expect(loadModelSchema.safeParse(model({ plateMath: undefined })).success).toBe(false)
  })

  it('refuses a value outside either vocabulary', () => {
    expect(loadModelSchema.safeParse(model({ basis: 'sandbag' as never })).success).toBe(false)
    expect(loadModelSchema.safeParse(model({ measure: 'per-side' as never })).success).toBe(false)
  })

  it('refuses a bar whose plates cannot be worked out', () => {
    // Plate Math starts from the bar and adds pairs; a bar with plate math off
    // would be a lift it cannot describe and would not know it cannot describe.
    const result = loadModelSchema.safeParse(model({ plateMath: false }))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0].path).toEqual(['plateMath'])
  })

  it('ties "no load recorded" to the unloaded bases, in both directions', () => {
    expect(
      loadModelSchema.safeParse({ basis: 'barbell', measure: 'none', usesBar: true, plateMath: true })
        .success,
    ).toBe(false)
    expect(
      loadModelSchema.safeParse({
        basis: 'bodyweight',
        measure: 'total',
        usesBar: false,
        plateMath: false,
      }).success,
    ).toBe(false)
    expect(
      loadModelSchema.safeParse({ basis: 'unloaded', measure: 'none', usesBar: false, plateMath: false })
        .success,
    ).toBe(true)
    // Bodyweight that can be loaded is NOT unloaded: a weighted pull-up records a number.
    expect(
      loadModelSchema.safeParse({
        basis: 'bodyweight-loadable',
        measure: 'total',
        usesBar: false,
        plateMath: false,
      }).success,
    ).toBe(true)
  })

  it('lets a stack or a band say plainly that plates mean nothing on it', () => {
    for (const basis of ['machine-stack', 'cable-stack', 'band'] as const) {
      expect(
        loadModelSchema.safeParse({ basis, measure: 'total', usesBar: false, plateMath: false }).success,
      ).toBe(true)
    }
  })

  it('carries the per-hand fact a pair of dumbbells needs', () => {
    const parsed = loadModelSchema.parse(model({ basis: 'dumbbell', measure: 'per-hand', usesBar: false }))
    expect(parsed.measure).toBe('per-hand')
    expect(parsed.usesBar).toBe(false)
  })
})

describe('progression families', () => {
  it('lists each known family once, in lowercase kebab-case', () => {
    expect(new Set(KNOWN_PROGRESSION_FAMILIES).size).toBe(KNOWN_PROGRESSION_FAMILIES.length)
    for (const family of KNOWN_PROGRESSION_FAMILIES) expect(family).toMatch(KEBAB)
  })

  it('accepts any kebab-case id, because the id space is open by design', () => {
    expect(progressionFamilySchema.safeParse('squat-barbell').success).toBe(true)
    expect(progressionFamilySchema.safeParse('some-movement-nobody-thought-of').success).toBe(true)
  })

  it('refuses an id that is not kebab-case, or is empty, or is too long', () => {
    expect(progressionFamilySchema.safeParse('Squat Barbell').success).toBe(false)
    expect(progressionFamilySchema.safeParse('squat_barbell').success).toBe(false)
    expect(progressionFamilySchema.safeParse('-squat').success).toBe(false)
    expect(progressionFamilySchema.safeParse('squat-').success).toBe(false)
    expect(progressionFamilySchema.safeParse('').success).toBe(false)
    expect(progressionFamilySchema.safeParse('a'.repeat(61)).success).toBe(false)
    expect(progressionFamilySchema.safeParse('a'.repeat(60)).success).toBe(true)
  })

  it('knows which families the product has planned for', () => {
    expect(isKnownProgressionFamily('horizontal-press-barbell')).toBe(true)
    expect(isKnownProgressionFamily('something-invented')).toBe(false)
    expect(isKnownProgressionFamily(42)).toBe(false)
  })

  it('separates the implements, because the same number means different lifts', () => {
    // 60 kg on a bar and 60 kg per dumbbell are not the same load, so history
    // must not travel between them.
    expect(progressionCarriesAcross('horizontal-press-barbell', 'horizontal-press-barbell')).toBe(true)
    expect(progressionCarriesAcross('horizontal-press-barbell', 'horizontal-press-dumbbell')).toBe(false)
    expect(progressionCarriesAcross('incline-press-dumbbell', 'chest-fly')).toBe(false)
  })
})
