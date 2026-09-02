import { describe, expect, it } from 'vitest'
import { exerciseSchema } from '../exerciseSchema'
import { normaliseExerciseName } from '../exerciseId'
import { KNOWN_PROGRESSION_FAMILIES } from '../../taxonomy/taxonomy'
import { getMovementPattern } from '../../movementPatterns/movementPatterns'
import { lowerCoreExercises } from './lowerAndCore'

/**
 * The legs-and-core region's own tests. Everything asserted here is a property of
 * THIS data; the whole-catalog rules (no id claimed twice across regions, every
 * `commonSubstitutions` id resolving, media completeness) belong to the barrel's
 * tests, where the other regions are in scope.
 */
describe('lowerCoreExercises', () => {
  it('every entry satisfies the exercise schema', () => {
    const failures = lowerCoreExercises
      .map((exercise) => ({ id: exercise.id, result: exerciseSchema.safeParse(exercise) }))
      .filter((entry) => !entry.result.success)
      .map((entry) => `${entry.id}: ${entry.result.error?.issues.map((issue) => issue.message).join('; ')}`)

    expect(failures).toEqual([])
  })

  it('claims each id, name and alias exactly once', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const exercise of lowerCoreExercises) {
      for (const candidate of [exercise.name, ...exercise.aliases]) {
        const key = normaliseExerciseName(candidate)
        const held = owner.get(key)
        if (held) clashes.push(`"${key}" is claimed by both ${held} and ${exercise.id}`)
        else owner.set(key, exercise.id)
      }
    }

    expect(clashes).toEqual([])
    expect(new Set(lowerCoreExercises.map((exercise) => exercise.id)).size).toBe(lowerCoreExercises.length)
  })

  it('uses only progression families the registry knows about', () => {
    const known = new Set<string>(KNOWN_PROGRESSION_FAMILIES)
    const unknown = lowerCoreExercises
      .filter((exercise) => !known.has(exercise.progressionFamily))
      .map((exercise) => `${exercise.id} -> ${exercise.progressionFamily}`)

    expect(unknown).toEqual([])
  })

  it('only names lower-body and trunk movement patterns', () => {
    const wrongChain = lowerCoreExercises
      .filter((exercise) => {
        const chain = getMovementPattern(exercise.movementPattern).chain
        return chain !== 'lower' && chain !== 'trunk'
      })
      .map((exercise) => `${exercise.id} -> ${exercise.movementPattern}`)

    expect(wrongChain).toEqual([])
  })

  /**
   * The `avoidBarbellSquat` limitation must leave a generator something to build a
   * leg session from. This is the assertion that keeps that true as the region
   * grows: the flag belongs on the barbell squats and nowhere else, and what
   * remains has to include real quad-dominant work at several equipment levels.
   */
  it('leaves a full set of quad options to someone avoiding the barbell squat', () => {
    const flagged = lowerCoreExercises
      .filter((exercise) => exercise.contraindicatedFor.includes('barbell-squat'))
      .map((exercise) => exercise.id)

    expect(flagged.sort()).toEqual(['barbell-back-squat', 'barbell-front-squat'])

    const remaining = lowerCoreExercises.filter(
      (exercise) =>
        !exercise.contraindicatedFor.includes('barbell-squat') && exercise.primaryMuscles.includes('quads'),
    )

    expect(remaining.length).toBeGreaterThanOrEqual(8)
    // A gym machine option, a free-weight option, and something with no kit at all.
    expect(remaining.some((exercise) => exercise.equipment.includes('selectorised-machines'))).toBe(true)
    expect(remaining.some((exercise) => exercise.equipment.includes('dumbbells'))).toBe(true)
    expect(remaining.some((exercise) => exercise.equipment.length === 0)).toBe(true)
  })

  it('counts a hold in seconds and everything else in reps', () => {
    const timed = lowerCoreExercises
      .filter((exercise) => exercise.repUnit === 'seconds')
      .map((exercise) => exercise.id)

    expect(timed.sort()).toEqual(['plank', 'side-plank'])
  })

  it('never proposes a drop set on a loaded barbell lift', () => {
    const risky = lowerCoreExercises
      .filter((exercise) => exercise.load.usesBar && exercise.safeForDropSet)
      .map((exercise) => exercise.id)

    expect(risky).toEqual([])
  })

  it('states a bodyweight exercise as unmeasured and a loaded one as measured', () => {
    const wrong = lowerCoreExercises
      .filter((exercise) => {
        const unloaded = exercise.load.basis === 'bodyweight' || exercise.load.basis === 'unloaded'
        return unloaded !== (exercise.load.measure === 'none')
      })
      .map((exercise) => exercise.id)

    expect(wrong).toEqual([])
  })

  it('backs every declared limitation with a joint-stress tag and a note', () => {
    const jointFor = { shoulder: 'shoulder', knee: 'knee', 'lower-back': 'lower-back' } as const
    const noteFor = {
      shoulder: 'shoulderConsiderations',
      knee: 'kneeConsiderations',
      'lower-back': 'lowerBackConsiderations',
    } as const

    const unexplained: string[] = []
    for (const exercise of lowerCoreExercises) {
      for (const flag of exercise.contraindicatedFor) {
        if (flag === 'barbell-squat') continue
        const tagged = exercise.jointStressTags.some((tag) => tag.joint === jointFor[flag])
        if (!tagged)
          unexplained.push(`${exercise.id} is contraindicated for ${flag} but does not tag the joint`)
        if (exercise[noteFor[flag]] === '') unexplained.push(`${exercise.id} explains nothing about ${flag}`)
      }
    }

    expect(unexplained).toEqual([])
  })

  it('never lists itself as its own substitution', () => {
    const selfReferencing = lowerCoreExercises
      .filter((exercise) => exercise.commonSubstitutions.includes(exercise.id))
      .map((exercise) => exercise.id)

    expect(selfReferencing).toEqual([])
  })

  it('gives every production-enabled entry a media key', () => {
    const missing = lowerCoreExercises
      .filter((exercise) => exercise.productionEnabled && exercise.mediaId === null)
      .map((exercise) => exercise.id)

    expect(missing).toEqual([])
  })

  it('writes real coaching copy rather than placeholders', () => {
    const thin = lowerCoreExercises
      .filter(
        (exercise) =>
          exercise.instructionSteps.length < 3 ||
          exercise.commonMistakes.length < 2 ||
          exercise.instructionSteps.some((step) => step.length < 20),
      )
      .map((exercise) => exercise.id)

    expect(thin).toEqual([])
  })
})
