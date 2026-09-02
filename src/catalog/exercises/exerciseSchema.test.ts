import { describe, expect, it } from 'vitest'
import {
  EXERCISE_DEFAULTS,
  EXERCISE_LIST_DEFAULTS,
  buildExerciseNameIndex,
  createExerciseNameResolver,
  defineExercise,
  exerciseSchema,
  repRangeSchema,
  supersetCompatibilitySchema,
  type ExerciseInput,
} from './exerciseSchema'
import { normaliseExerciseName } from './exerciseId'

/**
 * A complete, legal entry. Every test starts from this and changes one thing, so
 * a failure names the field that broke rather than the fixture.
 */
function input(overrides: Partial<ExerciseInput> = {}): ExerciseInput {
  return {
    id: 'incline-dumbbell-press',
    name: 'Incline dumbbell press',
    aliases: ['Incline DB press'],
    primaryMuscles: ['upper-chest'],
    secondaryMuscles: ['front-delt', 'triceps-long-head'],
    movementPattern: 'horizontal-push',
    trainingRole: 'primary-hypertrophy',
    strengthSuitability: 'good',
    hypertrophySuitability: 'excellent',
    equipment: ['dumbbells', 'adjustable-bench'],
    optionalEquipment: [],
    locationSuitability: ['gym', 'home'],
    setupTimeSeconds: 60,
    transitionCost: 'moderate',
    typicalRepRange: { min: 6, max: 12 },
    repUnit: 'reps',
    safeForDropSet: true,
    supersetCompatibility: {
      eligible: true,
      stationId: 'bench-station',
      gripHeavy: false,
      competingDemands: ['core-bracing'],
    },
    unilateral: false,
    compoundOrIsolation: 'compound',
    stabilityDemand: 'moderate',
    gripDemand: 'moderate',
    jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }],
    contraindicatedFor: ['shoulder'],
    shoulderConsiderations: 'Keep the bench under 45 degrees if pressing overhead is sore.',
    kneeConsiderations: '',
    lowerBackConsiderations: '',
    commonSubstitutions: ['barbell-bench-press'],
    instructionSteps: ['Set the bench to 30 degrees.', 'Press the dumbbells over the upper chest.'],
    commonMistakes: ['Flaring the elbows straight out.'],
    difficulty: 'intermediate',
    mediaId: 'incline-dumbbell-press',
    productionEnabled: true,
    progressionFamily: 'incline-press-dumbbell',
    load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false, plateMath: false },
    warmUpSuitability: 'specific-ramp',
    ...overrides,
  }
}

function accepts(overrides: Partial<ExerciseInput>): void {
  const result = exerciseSchema.safeParse(input(overrides))
  expect(
    result.success,
    result.success ? '' : JSON.stringify(result.error.issues.map((issue) => issue.message)),
  ).toBe(true)
}

function rejects(overrides: Record<string, unknown>): void {
  expect(exerciseSchema.safeParse({ ...input(), ...overrides }).success).toBe(false)
}

describe('the exercise schema', () => {
  it('takes a complete entry', () => {
    accepts({})
  })

  it('is strict, so a mistyped field name fails loudly instead of being carried along', () => {
    rejects({ primaryMuscle: ['upper-chest'] })
    rejects({ typo: true })
  })
})

describe('identity fields', () => {
  it('takes a kebab-case id and refuses anything a history could not rely on', () => {
    accepts({ id: 'a' })
    rejects({ id: 'Incline-Press' })
    rejects({ id: 'incline press' })
    rejects({ id: '' })
    rejects({ id: 'a'.repeat(81) })
  })

  it('takes a name up to its bound and refuses an empty one', () => {
    accepts({ name: 'x'.repeat(80) })
    rejects({ name: '' })
    rejects({ name: 'x'.repeat(81) })
  })

  it('takes aliases up to the cap, and refuses an empty alias', () => {
    accepts({ aliases: [] })
    accepts({ aliases: Array.from({ length: 12 }, (_, index) => `alias ${index}`) })
    rejects({ aliases: Array.from({ length: 13 }, (_, index) => `alias ${index}`) })
    rejects({ aliases: [''] })
  })
})

describe('muscles and pattern', () => {
  it('needs at least one primary muscle and caps how many it can claim', () => {
    accepts({
      primaryMuscles: ['upper-chest', 'mid-chest', 'lats', 'lower-chest'],
      secondaryMuscles: [],
    })
    rejects({ primaryMuscles: [] })
    rejects({
      primaryMuscles: ['upper-chest', 'mid-chest', 'lower-chest', 'lats', 'upper-back'],
      secondaryMuscles: [],
    })
  })

  it('refuses a muscle or pattern that is not in the vocabulary', () => {
    rejects({ primaryMuscles: ['pectorals'] })
    rejects({ secondaryMuscles: ['pectorals'] })
    rejects({ movementPattern: 'pressing' })
  })

  it('refuses a muscle that is claimed as both primary and secondary', () => {
    // A muscle counted twice would be counted twice in weekly volume too.
    const result = exerciseSchema.safeParse(
      input({ primaryMuscles: ['upper-chest'], secondaryMuscles: ['upper-chest'] }),
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some((issue) => issue.path.includes('secondaryMuscles'))).toBe(true)
  })

  it('refuses an isolation movement as the main strength lift of a session', () => {
    rejects({ compoundOrIsolation: 'isolation', trainingRole: 'primary-strength' })
    accepts({ compoundOrIsolation: 'isolation', trainingRole: 'isolation' })
  })
})

describe('equipment and location', () => {
  it('takes only catalogue equipment, and caps how much an exercise can demand', () => {
    accepts({ equipment: [] })
    rejects({ equipment: ['sandbag'] })
    rejects({ optionalEquipment: ['sandbag'] })
    rejects({
      equipment: [
        'barbell',
        'dumbbells',
        'kettlebell',
        'flat-bench',
        'adjustable-bench',
        'squat-rack',
        'plyo-box',
      ],
    })
  })

  it('needs somewhere the exercise can be done', () => {
    accepts({ locationSuitability: ['gym', 'home', 'travel'] })
    rejects({ locationSuitability: [] })
    rejects({ locationSuitability: ['custom'] })
  })
})

describe('timing and rep range', () => {
  it('takes a setup time in whole seconds, within a session-sized bound', () => {
    accepts({ setupTimeSeconds: 0 })
    accepts({ setupTimeSeconds: 600 })
    rejects({ setupTimeSeconds: -1 })
    rejects({ setupTimeSeconds: 601 })
    rejects({ setupTimeSeconds: 45.5 })
  })

  it('refuses a rep range that runs backwards', () => {
    expect(repRangeSchema.safeParse({ min: 6, max: 12 }).success).toBe(true)
    expect(repRangeSchema.safeParse({ min: 6, max: 6 }).success).toBe(true)
    expect(repRangeSchema.safeParse({ min: 12, max: 6 }).success).toBe(false)
  })

  it('bounds a rep range at both ends, and takes whole numbers only', () => {
    expect(repRangeSchema.safeParse({ min: 1, max: 300 }).success).toBe(true)
    expect(repRangeSchema.safeParse({ min: 0, max: 10 }).success).toBe(false)
    expect(repRangeSchema.safeParse({ min: 1, max: 301 }).success).toBe(false)
    expect(repRangeSchema.safeParse({ min: 1.5, max: 10 }).success).toBe(false)
    expect(repRangeSchema.safeParse({ min: 6 }).success).toBe(false)
  })

  it('says what one unit of the range IS, so a hold is not logged as reps', () => {
    accepts({ repUnit: 'seconds', typicalRepRange: { min: 20, max: 120 } })
    rejects({ repUnit: 'minutes' })
    expect(exerciseSchema.parse(input({ repUnit: undefined })).repUnit).toBe('reps')
  })
})

describe('the superset facts the conflict engine reads', () => {
  it('takes the station, the grip fact, and the competing demands', () => {
    expect(
      supersetCompatibilitySchema.safeParse({
        eligible: true,
        stationId: 'squat-rack',
        gripHeavy: true,
        competingDemands: ['grip', 'lower-back'],
      }).success,
    ).toBe(true)
  })

  it('takes null for an exercise that occupies no station', () => {
    accepts({
      supersetCompatibility: {
        eligible: true,
        stationId: null,
        gripHeavy: false,
        competingDemands: [],
      },
    })
  })

  it('refuses a station or a demand that is not in the vocabulary', () => {
    rejects({
      supersetCompatibility: {
        eligible: true,
        stationId: 'the-corner',
        gripHeavy: false,
        competingDemands: [],
      },
    })
    rejects({
      supersetCompatibility: {
        eligible: true,
        stationId: null,
        gripHeavy: false,
        competingDemands: ['boredom'],
      },
    })
  })

  it('requires every fact — an omitted one would be read as a false', () => {
    rejects({ supersetCompatibility: { eligible: true, stationId: null, gripHeavy: false } })
    rejects({ supersetCompatibility: { stationId: null, gripHeavy: false, competingDemands: [] } })
  })

  it('caps the competing demands at the size of the vocabulary', () => {
    accepts({
      supersetCompatibility: {
        eligible: true,
        stationId: null,
        gripHeavy: false,
        competingDemands: ['grip', 'core-bracing', 'lower-back', 'balance', 'systemic'],
      },
    })
  })
})

describe('joint stress and limitations', () => {
  it('refuses two intensities for the same joint', () => {
    const result = exerciseSchema.safeParse(
      input({
        jointStressTags: [
          { joint: 'shoulder', intensity: 'moderate' },
          { joint: 'shoulder', intensity: 'high' },
        ],
      }),
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some((issue) => issue.path.includes('jointStressTags'))).toBe(true)
  })

  it('takes one tag per taggable joint and no more', () => {
    accepts({
      jointStressTags: [
        { joint: 'shoulder', intensity: 'low' },
        { joint: 'elbow', intensity: 'low' },
        { joint: 'wrist', intensity: 'low' },
        { joint: 'knee', intensity: 'low' },
        { joint: 'hip', intensity: 'low' },
        { joint: 'lower-back', intensity: 'low' },
        { joint: 'neck', intensity: 'low' },
      ],
    })
    rejects({ jointStressTags: [{ joint: 'ankle', intensity: 'low' }] })
  })

  it('takes only declared limitation flags in the machine-readable list', () => {
    accepts({ contraindicatedFor: [] })
    accepts({ contraindicatedFor: ['shoulder', 'knee', 'lower-back', 'barbell-squat'] })
    rejects({ contraindicatedFor: ['elbow'] })
  })

  it('bounds the plain-language considerations', () => {
    accepts({ shoulderConsiderations: 'x'.repeat(240) })
    rejects({ shoulderConsiderations: 'x'.repeat(241) })
    rejects({ kneeConsiderations: 'x'.repeat(241) })
    rejects({ lowerBackConsiderations: 'x'.repeat(241) })
  })
})

describe('instructions and substitutions', () => {
  it('needs at least two instruction steps and caps them', () => {
    rejects({ instructionSteps: ['Only one step.'] })
    accepts({ instructionSteps: Array.from({ length: 10 }, (_, index) => `Step ${index}.`) })
    rejects({ instructionSteps: Array.from({ length: 11 }, (_, index) => `Step ${index}.`) })
    rejects({ instructionSteps: ['A step.', ''] })
    rejects({ instructionSteps: ['A step.', 'x'.repeat(241)] })
  })

  it('caps the common mistakes and refuses an empty one', () => {
    accepts({ commonMistakes: [] })
    accepts({ commonMistakes: Array.from({ length: 6 }, (_, index) => `Mistake ${index}.`) })
    rejects({ commonMistakes: Array.from({ length: 7 }, (_, index) => `Mistake ${index}.`) })
    rejects({ commonMistakes: [''] })
  })

  it('refuses an exercise as its own substitution', () => {
    const result = exerciseSchema.safeParse(input({ commonSubstitutions: ['incline-dumbbell-press'] }))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some((issue) => issue.path.includes('commonSubstitutions'))).toBe(true)
  })

  it('takes substitutions as ids, never as names', () => {
    rejects({ commonSubstitutions: ['Barbell bench press'] })
    accepts({ commonSubstitutions: ['barbell-bench-press', 'machine-chest-press'] })
  })
})

describe('media and production readiness', () => {
  it('requires a media entry on anything that can reach a generated session', () => {
    const result = exerciseSchema.safeParse(input({ mediaId: null, productionEnabled: true }))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some((issue) => issue.path.includes('mediaId'))).toBe(true)
  })

  it('lets an unfinished entry declare itself unfinished rather than be skipped quietly', () => {
    accepts({ mediaId: null, productionEnabled: false })
  })

  it('takes a media key in the same kebab-case shape as an id', () => {
    rejects({ mediaId: 'Incline Press' })
    rejects({ mediaId: '' })
  })
})

describe('progression, load, and warm-up metadata', () => {
  it('requires a progression family, in the open kebab-case id space', () => {
    accepts({ progressionFamily: 'a-family-nobody-listed-yet' })
    rejects({ progressionFamily: 'Incline Press Dumbbell' })
    rejects({ progressionFamily: '' })
  })

  it('carries the load model Plate Math and the set logger read', () => {
    accepts({ load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true } })
    rejects({ load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: false } })
    rejects({ load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false } })
  })

  it('says whether the exercise can serve as a warm-up, and in which sense', () => {
    accepts({ warmUpSuitability: 'unsuitable' })
    accepts({ warmUpSuitability: 'general' })
    rejects({ warmUpSuitability: 'maybe' })
  })

  it('says plainly whether dropping the load mid-set is safe on this setup', () => {
    accepts({ safeForDropSet: false })
    rejects({ safeForDropSet: 'yes' })
  })
})

describe('defineExercise', () => {
  it('fills exactly the documented defaults', () => {
    const minimal: ExerciseInput = {
      id: 'plank',
      name: 'Plank',
      primaryMuscles: ['deep-core'],
      movementPattern: 'anti-extension',
      trainingRole: 'isolation',
      strengthSuitability: 'limited',
      hypertrophySuitability: 'limited',
      equipment: [],
      locationSuitability: ['gym', 'home', 'travel'],
      setupTimeSeconds: 10,
      transitionCost: 'low',
      typicalRepRange: { min: 20, max: 90 },
      repUnit: 'seconds',
      safeForDropSet: false,
      supersetCompatibility: {
        eligible: true,
        stationId: null,
        gripHeavy: false,
        competingDemands: ['core-bracing'],
      },
      unilateral: false,
      compoundOrIsolation: 'isolation',
      stabilityDemand: 'moderate',
      gripDemand: 'none',
      instructionSteps: ['Set the forearms under the shoulders.', 'Hold a straight line and breathe.'],
      difficulty: 'beginner',
      productionEnabled: false,
      progressionFamily: 'anti-extension',
      load: { basis: 'bodyweight', measure: 'none', usesBar: false, plateMath: false },
      warmUpSuitability: 'general',
    }

    const built = defineExercise(minimal)

    for (const field of EXERCISE_LIST_DEFAULTS) {
      expect(built[field], `${field} should default to an empty list`).toEqual([])
    }
    expect(built.shoulderConsiderations).toBe(EXERCISE_DEFAULTS.shoulderConsiderations)
    expect(built.kneeConsiderations).toBe(EXERCISE_DEFAULTS.kneeConsiderations)
    expect(built.lowerBackConsiderations).toBe(EXERCISE_DEFAULTS.lowerBackConsiderations)
    expect(built.mediaId).toBe(EXERCISE_DEFAULTS.mediaId)
    expect(built.repUnit).toBe('seconds')
  })

  it('agrees with the schema’s own defaults, so the two cannot drift', () => {
    // `defineExercise` applies the defaults without paying for a parse on every
    // catalog entry. That is only safe while it produces what a parse would.
    const minimal = input({
      aliases: undefined,
      secondaryMuscles: undefined,
      optionalEquipment: undefined,
      jointStressTags: undefined,
      contraindicatedFor: undefined,
      commonSubstitutions: undefined,
      commonMistakes: undefined,
      shoulderConsiderations: undefined,
      kneeConsiderations: undefined,
      lowerBackConsiderations: undefined,
      repUnit: undefined,
      productionEnabled: undefined,
    })

    expect(defineExercise(minimal)).toEqual(exerciseSchema.parse(minimal))
  })

  it('leaves a value that was given alone', () => {
    const built = defineExercise(input({ aliases: ['A name'], productionEnabled: false }))
    expect(built.aliases).toEqual(['A name'])
    expect(built.productionEnabled).toBe(false)
  })

  it('produces something the schema accepts', () => {
    expect(exerciseSchema.safeParse(defineExercise(input())).success).toBe(true)
  })
})

describe('the name index and the resolver built on it', () => {
  const catalog = [
    { id: 'incline-dumbbell-press', name: 'Incline dumbbell press', aliases: ['Incline DB press'] },
    { id: 'barbell-back-squat', name: 'Barbell back squat', aliases: ['Back squat', 'Squat'] },
  ]

  it('indexes the display name and every alias', () => {
    const index = buildExerciseNameIndex(catalog, normaliseExerciseName)

    expect(index.get('incline dumbbell press')).toBe('incline-dumbbell-press')
    expect(index.get('incline db press')).toBe('incline-dumbbell-press')
    expect(index.get('back squat')).toBe('barbell-back-squat')
    expect(index.get('squat')).toBe('barbell-back-squat')
  })

  it('lets the first claim on a key keep it, so catalog order cannot flip a match', () => {
    const withClash = [...catalog, { id: 'goblet-squat', name: 'Goblet squat', aliases: ['Squat'] }]
    expect(buildExerciseNameIndex(withClash, normaliseExerciseName).get('squat')).toBe('barbell-back-squat')
  })

  it('indexes nothing under an empty key', () => {
    const index = buildExerciseNameIndex(
      [{ id: 'a-thing', name: '!!!', aliases: ['   '] }],
      normaliseExerciseName,
    )
    expect(index.has('')).toBe(false)
  })

  it('resolves typed text through the same normaliser it indexed with', () => {
    const resolve = createExerciseNameResolver(catalog, normaliseExerciseName)

    expect(resolve('  INCLINE   db-press!  ')).toBe('incline-dumbbell-press')
    expect(resolve('Back Squat')).toBe('barbell-back-squat')
  })

  it('says null rather than reaching for the nearest thing', () => {
    const resolve = createExerciseNameResolver(catalog, normaliseExerciseName)

    expect(resolve('incline press')).toBeNull()
    expect(resolve('squats')).toBeNull()
    expect(resolve('')).toBeNull()
    expect(resolve('that machine by the window')).toBeNull()
  })
})
