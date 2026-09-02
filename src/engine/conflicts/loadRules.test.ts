import { describe, expect, it } from 'vitest'
import { createConflictContext } from './conflictContext'
import { buildSessionIndex, prepareEntry } from './sessionIndex'
import { candidateLoadConflicts, loadConflicts } from './loadRules'
import { conflictsOfKind } from './conflictTypes'
import { anEntry, anExercise } from './testFixtures'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { ConflictContextInput } from './conflictContext'
import type { Conflict } from './conflictTypes'

function conflictsFor(input: ConflictContextInput): Conflict[] {
  const context = createConflictContext(input)
  return loadConflicts(buildSessionIndex(context.session, context.policy), context)
}

function candidateConflictsFor(candidate: Exercise, input: ConflictContextInput): Conflict[] {
  const context = createConflictContext(input)
  const index = buildSessionIndex(context.session, context.policy)
  return candidateLoadConflicts(prepareEntry(anEntry(candidate), index.entries.length), index, context)
}

const heavyShoulder = (id: string) =>
  anExercise({ id, jointStressTags: [{ joint: 'shoulder', intensity: 'high' }] })
const moderateShoulder = (id: string) =>
  anExercise({ id, jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }] })

describe('joint stress', () => {
  it('accumulates rather than firing on the presence of a tag', () => {
    expect(conflictsFor({ session: [anEntry(heavyShoulder('dip'))] })).toEqual([])
  })

  it('is advisory once two heavy movements land on one joint', () => {
    const [conflict] = conflictsFor({
      session: [anEntry(heavyShoulder('dip')), anEntry(heavyShoulder('overhead-press'))],
    })
    expect(conflict.kind).toBe('joint-stress')
    expect(conflict.severity).toBe('advisory')
    expect(conflict).toMatchObject({ detail: { joint: 'shoulder', load: 8, limited: false } })
    expect(conflict.exerciseIds).toEqual(['dip', 'overhead-press'])
  })

  it('is strong once the session keeps piling onto the same joint', () => {
    const [conflict] = conflictsFor({
      session: [
        anEntry(heavyShoulder('dip')),
        anEntry(heavyShoulder('overhead-press')),
        anEntry(moderateShoulder('lateral-raise')),
      ],
    })
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({ detail: { load: 10 } })
  })

  it('uses the intensity, not the count: four light movements are not two heavy ones', () => {
    const light = (id: string) =>
      anExercise({ id, jointStressTags: [{ joint: 'shoulder', intensity: 'low' }] })
    const four = conflictsFor({
      session: [anEntry(light('a')), anEntry(light('b')), anEntry(light('c')), anEntry(light('d'))],
    })
    expect(four).toEqual([])
  })

  it('runs out of room sooner on a joint the user has flagged', () => {
    const session = [anEntry(heavyShoulder('dip')), anEntry(moderateShoulder('lateral-raise'))]
    expect(conflictsFor({ session })).toEqual([])

    const [conflict] = conflictsFor({ session, limitations: ['shoulder'] })
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({
      detail: { load: 6, advisoryLimit: 4, strongLimit: 5, limited: true },
    })
  })

  it('keeps different joints as separate conflicts', () => {
    const knees = anExercise({
      id: 'squat',
      jointStressTags: [
        { joint: 'knee', intensity: 'high' },
        { joint: 'lower-back', intensity: 'high' },
      ],
    })
    const more = anExercise({
      id: 'lunge',
      jointStressTags: [
        { joint: 'knee', intensity: 'high' },
        { joint: 'lower-back', intensity: 'high' },
      ],
    })
    const found = conflictsOfKind(conflictsFor({ session: [anEntry(knees), anEntry(more)] }), 'joint-stress')
    expect(found.map((conflict) => conflict.detail.joint)).toEqual(['knee', 'lower-back'])
  })
})

describe('grip', () => {
  const gripHeavy = (id: string) => anExercise({ id, gripDemand: 'high' })

  it('says nothing about a session that barely uses the hands', () => {
    expect(conflictsFor({ session: [anEntry(gripHeavy('row'))] })).toEqual([])
  })

  it('is advisory once grip is carrying a lot of the session', () => {
    const [conflict] = conflictsFor({
      session: [
        anEntry(gripHeavy('row')),
        anEntry(gripHeavy('deadlift')),
        anEntry(anExercise({ id: 'leg-press', gripDemand: 'low' })),
      ],
    })
    expect(conflict.kind).toBe('grip')
    expect(conflict.severity).toBe('advisory')
    expect(conflict).toMatchObject({ detail: { load: 9 } })
  })

  it('blames only the exercises that actually demand grip', () => {
    const [conflict] = conflictsFor({
      session: [
        anEntry(gripHeavy('row')),
        anEntry(gripHeavy('deadlift')),
        anEntry(anExercise({ id: 'leg-press', gripDemand: 'low' })),
      ],
    })
    expect(conflict.exerciseIds).toEqual(['row', 'deadlift'])
  })

  it('is strong when three grip-limited movements stack up', () => {
    const [conflict] = conflictsFor({
      session: [anEntry(gripHeavy('row')), anEntry(gripHeavy('deadlift')), anEntry(gripHeavy('carry'))],
    })
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({ detail: { load: 12 } })
  })
})

describe('station queueing', () => {
  const onStation = (id: string, station: 'squat-rack' | 'selectorised-machine') =>
    anExercise({
      id,
      supersetCompatibility: { eligible: true, stationId: station, gripHeavy: false, competingDemands: [] },
    })

  it('warns when a session keeps going back to a station the gym has one of', () => {
    const [conflict] = conflictsFor({
      session: [
        anEntry(onStation('squat', 'squat-rack')),
        anEntry(onStation('front-squat', 'squat-rack')),
        anEntry(onStation('good-morning', 'squat-rack')),
      ],
    })
    expect(conflict.kind).toBe('station')
    expect(conflict.severity).toBe('advisory')
    expect(conflict).toMatchObject({ detail: { station: 'squat-rack', basis: 'queue', occupancy: 3 } })
  })

  it('says nothing below the queueing limit', () => {
    expect(
      conflictsFor({
        session: [anEntry(onStation('squat', 'squat-rack')), anEntry(onStation('front-squat', 'squat-rack'))],
      }),
    ).toEqual([])
  })

  it('says nothing about a station a gym has several of', () => {
    expect(
      conflictsFor({
        session: [
          anEntry(onStation('a', 'selectorised-machine')),
          anEntry(onStation('b', 'selectorised-machine')),
          anEntry(onStation('c', 'selectorised-machine')),
        ],
      }),
    ).toEqual([])
  })
})

describe('time', () => {
  const costing = (id: string, seconds: number) => anEntry(anExercise({ id }), { estimatedSeconds: seconds })

  it('says nothing without a budget, and nothing when the session fits', () => {
    expect(conflictsFor({ session: [costing('a', 3000)] })).toEqual([])
    expect(conflictsFor({ session: [costing('a', 900)], timeBudgetSeconds: 1000 })).toEqual([])
  })

  it('is advisory for a small overrun and strong for a real one', () => {
    const small = conflictsFor({ session: [costing('a', 1050)], timeBudgetSeconds: 1000 })
    expect(small[0].severity).toBe('advisory')

    const real = conflictsFor({ session: [costing('a', 1200)], timeBudgetSeconds: 1000 })
    expect(real[0].severity).toBe('strong')
    expect(real[0]).toMatchObject({ detail: { estimatedSeconds: 1200, overrunSeconds: 200 } })
  })

  it('blocks a session that is nothing like the length that was asked for', () => {
    const [conflict] = conflictsFor({ session: [costing('a', 1800)], timeBudgetSeconds: 1000 })
    expect(conflict.severity).toBe('blocking')
    expect(conflict.reason).toBe('This session runs about 13 minutes longer than the time set aside.')
  })

  it('falls back to setup time for an entry with no estimate, never to a guessed set count', () => {
    const [conflict] = conflictsFor({
      session: [anEntry(anExercise({ id: 'a', setupTimeSeconds: 120 }))],
      timeBudgetSeconds: 60,
    })
    expect(conflict).toMatchObject({ detail: { estimatedSeconds: 120 } })
  })
})

describe('recovery', () => {
  const chest = anExercise({ id: 'bench-press', primaryMuscles: ['mid-chest'] })

  it('is strong for a group trained today', () => {
    const [conflict] = conflictsFor({
      session: [anEntry(chest)],
      recentTraining: [{ daysAgo: 0, muscleGroups: ['chest'] }],
    })
    expect(conflict.kind).toBe('recovery')
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({ detail: { group: 'chest', daysAgo: 0, minimumDays: 2 } })
    expect(conflict.reason).toBe('Trained today: Chest.')
  })

  it('is advisory a day later, and silent once the group has had its days', () => {
    const advisory = conflictsFor({
      session: [anEntry(chest)],
      recentTraining: [{ daysAgo: 1, muscleGroups: ['chest'] }],
    })
    expect(advisory[0].severity).toBe('advisory')

    expect(
      conflictsFor({ session: [anEntry(chest)], recentTraining: [{ daysAgo: 2, muscleGroups: ['chest'] }] }),
    ).toEqual([])
  })

  it('gives a small group its shorter turnaround', () => {
    const curl = anExercise({ id: 'curl', primaryMuscles: ['biceps-long-head'] })
    expect(
      conflictsFor({ session: [anEntry(curl)], recentTraining: [{ daysAgo: 1, muscleGroups: ['biceps'] }] }),
    ).toEqual([])
  })

  it('ignores secondary muscles, or every press would leave the triceps unrecovered', () => {
    const press = anExercise({
      id: 'press',
      primaryMuscles: ['mid-chest'],
      secondaryMuscles: ['triceps-long-head'],
    })
    expect(
      conflictsFor({
        session: [anEntry(press)],
        recentTraining: [{ daysAgo: 0, muscleGroups: ['triceps'] }],
      }),
    ).toEqual([])
  })
})

describe('what one more exercise would do', () => {
  const session = [anEntry(heavyShoulder('dip')), anEntry(heavyShoulder('overhead-press'))]

  it('reports a joint the candidate would add to', () => {
    const found = candidateConflictsFor(moderateShoulder('lateral-raise'), { session })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'joint-stress', severity: 'strong', detail: { load: 10 } })
    expect(found[0].exerciseIds).toEqual(['dip', 'overhead-press', 'lateral-raise'])
  })

  it('does not blame a candidate for a joint it never touches', () => {
    expect(candidateConflictsFor(anExercise({ id: 'calf-raise' }), { session })).toEqual([])
  })

  it('counts the candidate against the time budget', () => {
    const found = candidateConflictsFor(anExercise({ id: 'extra', setupTimeSeconds: 300 }), {
      session: [anEntry(anExercise({ id: 'a' }), { estimatedSeconds: 900 })],
      timeBudgetSeconds: 1000,
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'time', detail: { estimatedSeconds: 1200 } })
  })
})
