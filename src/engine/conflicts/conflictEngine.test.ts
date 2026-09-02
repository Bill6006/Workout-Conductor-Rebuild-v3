import { describe, expect, it } from 'vitest'
import { exerciseSchema } from '../../catalog/exercises/exerciseSchema'
import { CONFLICT_KINDS, CONFLICT_SEVERITY_SCALE } from './conflictTypes'
import { createConflictDetector, detectConflicts, validateSession } from './conflictEngine'
import { BASE_EXERCISE, anEntry, anExercise } from './testFixtures'
import type { ConflictKind } from './conflictTypes'
import type { ConflictContextInput, SessionEntry } from './conflictContext'

const GYM = { id: 'loc-gym', name: 'Gym', suitability: 'gym' as const }
const KIT = ['dumbbells', 'barbell', 'weight-plates', 'cable-machine'] as const

function gym(input: ConflictContextInput = {}): ConflictContextInput {
  return { location: GYM, availableEquipment: [...KIT], ...input }
}

/** A session with nothing wrong with it: different movements, different muscles, one location. */
const CLEAN_SESSION: SessionEntry[] = [
  anEntry(
    anExercise({
      id: 'goblet-squat',
      movementPattern: 'squat',
      primaryMuscles: ['quads'],
      progressionFamily: 'squat-dumbbell',
    }),
  ),
  anEntry(
    anExercise({
      id: 'one-arm-row',
      movementPattern: 'horizontal-pull',
      primaryMuscles: ['lats'],
      progressionFamily: 'horizontal-row-dumbbell',
    }),
  ),
  anEntry(
    anExercise({
      id: 'calf-raise',
      movementPattern: 'calf-raise',
      primaryMuscles: ['gastrocnemius'],
      progressionFamily: 'calf-raise-standing',
    }),
  ),
]

describe('the fixtures themselves', () => {
  it('are records the real catalog could contain', () => {
    expect(() => exerciseSchema.parse(BASE_EXERCISE)).not.toThrow()
    for (const entry of CLEAN_SESSION) expect(() => exerciseSchema.parse(entry.exercise)).not.toThrow()
  })
})

describe('a session with nothing wrong with it', () => {
  it('comes back clean', () => {
    const report = validateSession(gym({ session: CLEAN_SESSION }))
    expect(report.conflicts).toEqual([])
    expect(report.worst).toBeNull()
    expect(report.blocked).toBe(false)
  })

  it('accepts a candidate that fits it', () => {
    const candidate = anExercise({
      id: 'face-pull',
      movementPattern: 'isolation-raise',
      primaryMuscles: ['rear-delt'],
      equipment: ['cable-machine'],
      progressionFamily: 'rear-delt',
    })
    const report = detectConflicts(candidate, gym({ session: CLEAN_SESSION }))
    expect(report.conflicts).toEqual([])
  })
})

describe('detecting one addition', () => {
  it('blocks equipment the location does not have', () => {
    const candidate = anExercise({ id: 'leg-press', equipment: ['leg-press'] })
    const report = detectConflicts(candidate, gym({ session: CLEAN_SESSION }))
    expect(report.blocked).toBe(true)
    expect(report.conflicts[0].kind).toBe('equipment')
  })

  it('puts the worst conflict first', () => {
    const candidate = anExercise({
      id: 'goblet-squat',
      movementPattern: 'squat',
      primaryMuscles: ['quads'],
      equipment: ['leg-press'],
    })
    const report = detectConflicts(candidate, gym({ session: CLEAN_SESSION }))
    expect(report.worst).toBe('blocking')
    expect(report.conflicts.length).toBeGreaterThan(1)
    const ranks = report.conflicts.map((conflict) => CONFLICT_SEVERITY_SCALE.rank(conflict.severity))
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
  })

  it('does not report an exercise as a duplicate of the one it would replace', () => {
    const detector = createConflictDetector(gym({ session: CLEAN_SESSION }))
    const sameLift = anExercise({
      id: 'goblet-squat',
      movementPattern: 'squat',
      primaryMuscles: ['quads'],
      progressionFamily: 'squat-dumbbell',
    })

    expect(detector.detect(sameLift).blocked).toBe(true)
    expect(detector.detect(sameLift, { replaces: 'goblet-squat' }).conflicts).toEqual([])
  })
})

describe('determinism', () => {
  it('gives the same answer every time, and leaves its input alone', () => {
    const session = [...CLEAN_SESSION]
    const before = JSON.stringify(session)
    const context = gym({ session })
    const detector = createConflictDetector(context)
    const candidate = anExercise({ id: 'front-squat', movementPattern: 'squat', primaryMuscles: ['quads'] })

    const first = detector.detect(candidate)
    const second = detector.detect(candidate)
    expect(second).toEqual(first)
    expect(detector.validate()).toEqual(detector.validate())
    expect(JSON.stringify(session)).toBe(before)
  })

  it('reports a pair once, not once from each end', () => {
    const a = anExercise({ id: 'bench-press', movementPattern: 'horizontal-push' })
    const b = anExercise({ id: 'incline-press', movementPattern: 'horizontal-push' })
    const report = validateSession(gym({ session: [anEntry(a), anEntry(b)] }))
    const patterns = report.conflicts.filter((conflict) => conflict.kind === 'duplicate-movement-pattern')
    expect(patterns).toHaveLength(1)
    expect(patterns[0].exerciseIds).toEqual(['incline-press', 'bench-press'])
  })
})

describe('ranking a large candidate set', () => {
  it('stays inside a recalibration budget with the index built once', () => {
    const session = Array.from({ length: 12 }, (_unused, position) =>
      anEntry(
        anExercise({ id: `session-${position}`, jointStressTags: [{ joint: 'knee', intensity: 'low' }] }),
      ),
    )
    const candidates = Array.from({ length: 500 }, (_unused, index) =>
      anExercise({ id: `candidate-${index}`, primaryMuscles: index % 2 === 0 ? ['quads'] : ['lats'] }),
    )

    const detector = createConflictDetector(gym({ session }))
    const started = performance.now()
    for (const candidate of candidates) detector.detect(candidate)
    const elapsed = performance.now() - started

    // The real budget is the whole recalibration, well under 250ms; conflict
    // detection is one step inside it. The ceiling here is deliberately loose —
    // it is a guard against an accidentally quadratic rewrite, not a benchmark.
    expect(elapsed).toBeLessThan(250)
  })
})

/**
 * A kind declared in the vocabulary but never emitted is a rule somebody meant to
 * write. One scenario per kind, driven off `CONFLICT_KINDS`, so adding a kind
 * without a rule fails here.
 */
describe('every conflict kind is reachable through the public API', () => {
  const heavyShoulder = (id: string) =>
    anExercise({ id, jointStressTags: [{ joint: 'shoulder', intensity: 'high' }] })
  const gripHeavy = (id: string) =>
    anExercise({
      id,
      gripDemand: 'high',
      supersetCompatibility: { eligible: true, stationId: null, gripHeavy: true, competingDemands: [] },
    })
  const onRack = (id: string) =>
    anExercise({
      id,
      supersetCompatibility: {
        eligible: true,
        stationId: 'squat-rack',
        gripHeavy: false,
        competingDemands: [],
      },
    })

  const scenarios: Record<ConflictKind, () => readonly { kind: ConflictKind }[]> = {
    limitation: () =>
      detectConflicts(anExercise({ id: 'x', contraindicatedFor: ['knee'] }), gym({ limitations: ['knee'] }))
        .conflicts,
    equipment: () => detectConflicts(anExercise({ id: 'x', equipment: ['leg-press'] }), gym()).conflicts,
    location: () =>
      detectConflicts(
        anExercise({ id: 'x', locationSuitability: ['gym'] }),
        gym({ location: { id: 'h', name: 'Home', suitability: 'home' } }),
      ).conflicts,
    'duplicate-exercise': () =>
      detectConflicts(anExercise({ id: 'x' }), gym({ session: [anEntry(anExercise({ id: 'x' }))] }))
        .conflicts,
    station: () =>
      validateSession(
        gym({
          session: [
            anEntry(onRack('a'), { supersetGroup: 'g' }),
            anEntry(onRack('b'), { supersetGroup: 'g' }),
          ],
        }),
      ).conflicts,
    superset: () =>
      validateSession(
        gym({
          session: [
            anEntry(gripHeavy('a'), { supersetGroup: 'g' }),
            anEntry(gripHeavy('b'), { supersetGroup: 'g' }),
          ],
        }),
      ).conflicts,
    'progression-role': () =>
      validateSession(
        gym({
          session: [
            anEntry(anExercise({ id: 'a' }), { slot: 'main' }),
            anEntry(anExercise({ id: 'b' }), { slot: 'main' }),
          ],
        }),
      ).conflicts,
    'joint-stress': () =>
      validateSession(gym({ session: [anEntry(heavyShoulder('a')), anEntry(heavyShoulder('b'))] })).conflicts,
    'muscle-overlap': () =>
      validateSession(
        gym({
          session: [
            anEntry(anExercise({ id: 'a', primaryMuscles: ['mid-chest'] })),
            anEntry(anExercise({ id: 'b', primaryMuscles: ['mid-chest'] })),
          ],
        }),
      ).conflicts,
    'duplicate-movement-pattern': () =>
      validateSession(gym({ session: [anEntry(anExercise({ id: 'a' })), anEntry(anExercise({ id: 'b' }))] }))
        .conflicts,
    grip: () =>
      validateSession(
        gym({ session: [anEntry(gripHeavy('a')), anEntry(gripHeavy('b')), anEntry(gripHeavy('c'))] }),
      ).conflicts,
    recovery: () =>
      validateSession(
        gym({
          session: [anEntry(anExercise({ id: 'a', primaryMuscles: ['mid-chest'] }))],
          recentTraining: [{ daysAgo: 0, muscleGroups: ['chest'] }],
        }),
      ).conflicts,
    time: () =>
      validateSession(
        gym({
          session: [anEntry(anExercise({ id: 'a' }), { estimatedSeconds: 4000 })],
          timeBudgetSeconds: 600,
        }),
      ).conflicts,
  }

  for (const kind of CONFLICT_KINDS) {
    it(`emits ${kind}`, () => {
      expect(scenarios[kind]().map((conflict) => conflict.kind)).toContain(kind)
    })
  }
})
