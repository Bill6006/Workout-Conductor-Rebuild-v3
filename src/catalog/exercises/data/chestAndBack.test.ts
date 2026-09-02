import { describe, expect, it } from 'vitest'
import { pushPullExercises } from './chestAndBack'
import { exerciseSchema } from '../exerciseSchema'
import { normaliseExerciseName } from '../exerciseId'
import { KNOWN_PROGRESSION_FAMILIES } from '../../taxonomy/taxonomy'
import { rollUpMuscles } from '../../muscles/muscles'
import { getMovementPattern } from '../../movementPatterns/movementPatterns'

/**
 * Region tests for the chest and back entries.
 *
 * These check what is true of THIS file. Whole-catalog invariants — that every
 * `commonSubstitutions` id resolves, that no two regions claim an id or an alias,
 * that every `mediaId` has a manifest row — belong to the barrel's own tests,
 * because only the barrel can see every region at once.
 */

/**
 * `horizontal-row-bodyweight` is deliberately not in `KNOWN_PROGRESSION_FAMILIES`
 * yet. The registry has `horizontal-press-bodyweight`, `squat-bodyweight` and
 * `lunge-bodyweight` but no bodyweight row, which looks like an omission rather
 * than a decision: an inverted row and a suspension row carry rep progression to
 * each other and to nothing else in the registry. Filing it here rather than
 * silently mislabelling them as a barbell or cable row, which would let a loaded
 * row's working weight travel to a movement that has no external load at all.
 */
const FAMILIES_PENDING_REGISTRY = ['horizontal-row-bodyweight']

describe('chest and back exercises', () => {
  it('every entry satisfies the exercise schema', () => {
    const failures = pushPullExercises
      .map((exercise) => ({ exercise, result: exerciseSchema.safeParse(exercise) }))
      .filter(({ result }) => !result.success)
      .map(({ exercise, result }) => `${exercise.id}: ${result.error?.issues.map((i) => i.message)}`)

    expect(failures).toEqual([])
  })

  it('ids are unique within the region', () => {
    const ids = pushPullExercises.map((exercise) => exercise.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no name or alias is claimed twice, so a typed preference resolves to one exercise', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []

    for (const exercise of pushPullExercises) {
      for (const candidate of [exercise.name, ...exercise.aliases]) {
        const key = normaliseExerciseName(candidate)
        const existing = owner.get(key)
        if (existing !== undefined && existing !== exercise.id) {
          clashes.push(`"${candidate}" is claimed by both ${existing} and ${exercise.id}`)
        }
        owner.set(key, exercise.id)
      }
    }

    expect(clashes).toEqual([])
  })

  it('every entry trains chest or back as a primary target', () => {
    const offRegion = pushPullExercises
      .filter((exercise) => {
        const groups = rollUpMuscles(exercise.primaryMuscles)
        return !groups.includes('chest') && !groups.includes('back')
      })
      .map((exercise) => exercise.id)

    // The deadlift qualifies through `lower-back`, which is the one muscle whose
    // group and region disagree: it counts towards the `back` GROUP while its
    // work lands in the `core` REGION. Both facts are true, and this rollup is
    // the group one — so the deadlift belongs here, and a region-based check
    // would have reached the opposite conclusion.
    expect(offRegion).toEqual([])
  })

  it('uses only known progression families, or ones filed as a registry gap', () => {
    const known = new Set<string>([...KNOWN_PROGRESSION_FAMILIES, ...FAMILIES_PENDING_REGISTRY])
    const unknown = pushPullExercises
      .filter((exercise) => !known.has(exercise.progressionFamily))
      .map((exercise) => `${exercise.id} -> ${exercise.progressionFamily}`)

    expect(unknown).toEqual([])
  })

  it('a production-enabled entry names its media, and names it after itself', () => {
    for (const exercise of pushPullExercises) {
      expect(exercise.productionEnabled).toBe(true)
      expect(exercise.mediaId).toBe(exercise.id)
    }
  })

  it('never substitutes an exercise for itself, and never lists a substitution twice', () => {
    for (const exercise of pushPullExercises) {
      expect(exercise.commonSubstitutions).not.toContain(exercise.id)
      expect(new Set(exercise.commonSubstitutions).size).toBe(exercise.commonSubstitutions.length)
    }
  })

  it('every movement pattern used is an upper-body push or pull, or the hinge the deadlifts need', () => {
    const chains = new Set(
      pushPullExercises.map((exercise) => getMovementPattern(exercise.movementPattern).chain),
    )
    expect([...chains].sort()).toEqual(['lower', 'upper-pull', 'upper-push'])
  })

  it('flags the joints a limitation engine will be asked about', () => {
    const byId = new Map(pushPullExercises.map((exercise) => [exercise.id, exercise]))

    // A blocking contraindication is only used where the movement is genuinely
    // inadvisable, so the list is short enough to pin exactly.
    const shoulderBlocked = pushPullExercises
      .filter((exercise) => exercise.contraindicatedFor.includes('shoulder'))
      .map((exercise) => exercise.id)
    expect(shoulderBlocked).toEqual([
      'chest-dip',
      'dumbbell-chest-fly',
      'incline-dumbbell-fly',
      'dumbbell-pullover',
    ])

    const backBlocked = pushPullExercises
      .filter((exercise) => exercise.contraindicatedFor.includes('lower-back'))
      .map((exercise) => exercise.id)
    expect(backBlocked).toEqual(['conventional-deadlift', 'rack-pull', 'barbell-row', 't-bar-row'])

    // Every blocked entry explains itself in prose as well, so a user is told why
    // rather than watching an exercise silently disappear.
    for (const exercise of pushPullExercises) {
      if (exercise.contraindicatedFor.includes('shoulder')) {
        expect(exercise.shoulderConsiderations).not.toBe('')
      }
      if (exercise.contraindicatedFor.includes('lower-back')) {
        expect(exercise.lowerBackConsiderations).not.toBe('')
      }
    }

    // The unsupported barbell hinges and rows are the high lower-back load; the
    // supported rows must not be, or the accumulation rule means nothing.
    for (const id of ['conventional-deadlift', 'rack-pull', 'barbell-row', 't-bar-row']) {
      const tag = byId.get(id)?.jointStressTags.find((entry) => entry.joint === 'lower-back')
      expect(tag?.intensity).toBe('high')
    }
    for (const id of ['chest-supported-dumbbell-row', 'seated-machine-row', 'seated-cable-row']) {
      const tag = byId.get(id)?.jointStressTags.find((entry) => entry.joint === 'lower-back')
      expect(tag?.intensity ?? 'none').not.toBe('high')
    }
  })

  it('judges drop-set safety rather than defaulting it', () => {
    const byId = new Map(pushPullExercises.map((exercise) => [exercise.id, exercise]))

    // Free-weight compounds where fatigue is the safety problem: no drop sets.
    for (const id of [
      'barbell-bench-press',
      'incline-barbell-bench-press',
      'conventional-deadlift',
      'rack-pull',
      'barbell-row',
      'pull-up',
    ]) {
      expect(byId.get(id)?.safeForDropSet).toBe(false)
    }

    // A pin or a stack changes in a second, so these are the natural drop sets.
    for (const id of ['machine-chest-press', 'pec-deck', 'lat-pulldown', 'seated-cable-row']) {
      expect(byId.get(id)?.safeForDropSet).toBe(true)
    }

    // Gravity-loaded bodyweight work has no load to drop; angle-loaded work does.
    for (const id of ['push-up', 'chest-dip', 'chin-up', 'band-assisted-pull-up']) {
      expect(byId.get(id)?.safeForDropSet).toBe(false)
    }
    for (const id of ['inverted-row', 'suspension-trainer-row', 'suspension-trainer-chest-press']) {
      expect(byId.get(id)?.safeForDropSet).toBe(true)
    }
  })

  it('describes load in the units Plate Math and the set logger will read', () => {
    for (const exercise of pushPullExercises) {
      const { basis, measure, usesBar, plateMath } = exercise.load

      // Only a bar gets plate math in this region: a stack, a band and a fixed
      // dumbbell have no plates to propose.
      expect(plateMath).toBe(basis === 'barbell')
      expect(usesBar).toBe(basis === 'barbell')

      if (basis === 'dumbbell') expect(['per-hand', 'total']).toContain(measure)
      if (basis === 'bodyweight') expect(measure).toBe('none')
      // A weight belt is a real number, so a loadable bodyweight movement logs one.
      if (basis === 'bodyweight-loadable') expect(measure).toBe('total')
    }
  })

  it('covers every pressing angle at home, in a full gym, and with bands alone', () => {
    const chestPresses = pushPullExercises.filter(
      (exercise) =>
        exercise.movementPattern === 'horizontal-push' &&
        rollUpMuscles(exercise.primaryMuscles).includes('chest'),
    )

    const upper = chestPresses.filter((exercise) => exercise.primaryMuscles.includes('upper-chest'))
    const lower = chestPresses.filter((exercise) => exercise.primaryMuscles.includes('lower-chest'))
    expect(upper.length).toBeGreaterThanOrEqual(3)
    expect(lower.length).toBeGreaterThanOrEqual(3)

    // Nothing but bands and a floor: there must still be a press and a fly.
    const bandOnly = pushPullExercises.filter(
      (exercise) =>
        exercise.locationSuitability.includes('travel') &&
        exercise.equipment.every((id) => id === 'resistance-bands'),
    )
    expect(bandOnly.some((exercise) => exercise.movementPattern === 'horizontal-push')).toBe(true)
    expect(bandOnly.some((exercise) => exercise.movementPattern === 'isolation-fly')).toBe(true)
    expect(bandOnly.some((exercise) => exercise.movementPattern === 'horizontal-pull')).toBe(true)
  })

  it('writes real coaching copy, not placeholders', () => {
    for (const exercise of pushPullExercises) {
      expect(exercise.instructionSteps.length).toBeGreaterThanOrEqual(3)
      expect(exercise.commonMistakes.length).toBeGreaterThanOrEqual(2)
      for (const line of [...exercise.instructionSteps, ...exercise.commonMistakes]) {
        expect(line.trim()).toBe(line)
        expect(line.length).toBeGreaterThan(20)
        expect(line).toMatch(/[.!]$/)
      }
    }
  })
})
