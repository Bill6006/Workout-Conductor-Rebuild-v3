import { describe, expect, it } from 'vitest'
import { createConflictContext } from './conflictContext'
import { buildSessionIndex, prepareEntry } from './sessionIndex'
import { candidateSupersetConflicts, supersetConflicts, supersetPairConflicts } from './supersetRules'
import { anEntry, anExercise } from './testFixtures'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { SupersetCompatibility } from '../../catalog/exercises/exerciseSchema'
import type { Conflict } from './conflictTypes'

const PAIRABLE: SupersetCompatibility = {
  eligible: true,
  stationId: null,
  gripHeavy: false,
  competingDemands: [],
}

function pairable(overrides: Partial<SupersetCompatibility> = {}): SupersetCompatibility {
  return { ...PAIRABLE, ...overrides }
}

/** Runs the pair rules both ways round; a pairing rule that is not symmetric is a bug. */
function pairRules(a: Exercise, b: Exercise): Conflict[] {
  const first = prepareEntry(anEntry(a), 0)
  const second = prepareEntry(anEntry(b), 1)
  const forwards = supersetPairConflicts(first, second, 'group-1')
  const backwards = supersetPairConflicts(second, first, 'group-1')
  expect(backwards.map((conflict) => conflict.kind)).toEqual(forwards.map((conflict) => conflict.kind))
  expect(backwards.map((conflict) => conflict.severity)).toEqual(
    forwards.map((conflict) => conflict.severity),
  )
  return forwards
}

function rulesIn(conflicts: readonly Conflict[]): string[] {
  return conflicts.map((conflict) => (conflict.kind === 'superset' ? conflict.detail.rule : conflict.kind))
}

describe('a pairing with nothing wrong with it', () => {
  it('produces no conflicts at all', () => {
    expect(pairRules(anExercise({ id: 'curl' }), anExercise({ id: 'pushdown' }))).toEqual([])
  })
})

describe('superset pairing rules', () => {
  it('blocks a pairing when either exercise is meant to be done alone', () => {
    const solo = anExercise({ id: 'deadlift', supersetCompatibility: pairable({ eligible: false }) })
    const conflicts = pairRules(solo, anExercise({ id: 'curl' }))
    expect(rulesIn(conflicts)).toEqual(['ineligible-exercise'])
    expect(conflicts[0].severity).toBe('blocking')
  })

  it('blocks two exercises that would need the same station', () => {
    const a = anExercise({ id: 'squat', supersetCompatibility: pairable({ stationId: 'squat-rack' }) })
    const b = anExercise({ id: 'front-squat', supersetCompatibility: pairable({ stationId: 'squat-rack' }) })
    const conflicts = pairRules(a, b)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].kind).toBe('station')
    expect(conflicts[0].severity).toBe('blocking')
    expect(conflicts[0]).toMatchObject({ detail: { basis: 'superset', station: 'squat-rack' } })
  })

  it('allows two exercises on different stations when neither is a trek', () => {
    const a = anExercise({ id: 'squat', supersetCompatibility: pairable({ stationId: 'squat-rack' }) })
    const b = anExercise({ id: 'pulldown', supersetCompatibility: pairable({ stationId: 'cable-tower' }) })
    expect(pairRules(a, b)).toEqual([])
  })

  it('flags two grip-limited exercises', () => {
    const a = anExercise({ id: 'row', supersetCompatibility: pairable({ gripHeavy: true }) })
    const b = anExercise({ id: 'carry', supersetCompatibility: pairable({ gripHeavy: true }) })
    const conflicts = pairRules(a, b)
    expect(rulesIn(conflicts)).toEqual(['both-grip-heavy'])
    expect(conflicts[0].severity).toBe('strong')
  })

  it('says nothing when only one of the pair is grip-limited', () => {
    const a = anExercise({ id: 'row', supersetCompatibility: pairable({ gripHeavy: true }) })
    expect(pairRules(a, anExercise({ id: 'leg-extension' }))).toEqual([])
  })

  it('flags a pair that asks for the same thing at once', () => {
    const a = anExercise({
      id: 'front-squat',
      supersetCompatibility: pairable({ competingDemands: ['core-bracing', 'systemic'] }),
    })
    const b = anExercise({
      id: 'overhead-press',
      supersetCompatibility: pairable({ competingDemands: ['core-bracing'] }),
    })
    const conflicts = pairRules(a, b)
    expect(rulesIn(conflicts)).toEqual(['competing-demands'])
    expect(conflicts[0]).toMatchObject({ detail: { shared: ['core-bracing'] } })
    expect(conflicts[0].reason).toBe('These two ask for the same thing at once: Core bracing.')
  })

  it('says nothing when the demands do not overlap', () => {
    const a = anExercise({ id: 'a', supersetCompatibility: pairable({ competingDemands: ['balance'] }) })
    const b = anExercise({ id: 'b', supersetCompatibility: pairable({ competingDemands: ['grip'] }) })
    expect(pairRules(a, b)).toEqual([])
  })

  it('flags two heavy compounds that are both anchors of the session', () => {
    const a = anExercise({ id: 'squat', trainingRole: 'primary-strength', compoundOrIsolation: 'compound' })
    const b = anExercise({
      id: 'bench',
      trainingRole: 'primary-hypertrophy',
      compoundOrIsolation: 'compound',
    })
    expect(rulesIn(pairRules(a, b))).toEqual(['two-heavy-compounds'])
  })

  it('allows an anchor paired with an isolation, which is the point of a superset', () => {
    const a = anExercise({ id: 'squat', trainingRole: 'primary-strength', compoundOrIsolation: 'compound' })
    const b = anExercise({ id: 'curl', trainingRole: 'isolation', compoundOrIsolation: 'isolation' })
    expect(pairRules(a, b)).toEqual([])
  })

  it('flags a pair that loads the same joint hard from both sides', () => {
    const a = anExercise({ id: 'dip', jointStressTags: [{ joint: 'shoulder', intensity: 'high' }] })
    const b = anExercise({
      id: 'overhead-press',
      jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }],
    })
    const conflicts = pairRules(a, b)
    expect(rulesIn(conflicts)).toEqual(['shared-joint-stress'])
    expect(conflicts[0]).toMatchObject({ detail: { shared: ['shoulder'] } })
  })

  it('ignores a joint only one of them loads, or that both merely brush', () => {
    const heavy = anExercise({ id: 'dip', jointStressTags: [{ joint: 'shoulder', intensity: 'high' }] })
    expect(pairRules(heavy, anExercise({ id: 'leg-curl' }))).toEqual([])

    const lightA = anExercise({ id: 'a', jointStressTags: [{ joint: 'wrist', intensity: 'low' }] })
    const lightB = anExercise({ id: 'b', jointStressTags: [{ joint: 'wrist', intensity: 'low' }] })
    expect(pairRules(lightA, lightB)).toEqual([])
  })

  it('flags a pairing that means walking between two set-ups every round', () => {
    const a = anExercise({
      id: 'squat',
      transitionCost: 'high',
      supersetCompatibility: pairable({ stationId: 'squat-rack' }),
    })
    const b = anExercise({
      id: 'leg-press',
      transitionCost: 'moderate',
      supersetCompatibility: pairable({ stationId: 'leg-press-station' }),
    })
    expect(rulesIn(pairRules(a, b))).toEqual(['station-hopping'])
  })

  it('does not call two easy set-ups a trek', () => {
    const a = anExercise({
      id: 'a',
      transitionCost: 'low',
      supersetCompatibility: pairable({ stationId: 'dumbbell-rack' }),
    })
    const b = anExercise({
      id: 'b',
      transitionCost: 'low',
      supersetCompatibility: pairable({ stationId: 'cable-tower' }),
    })
    expect(pairRules(a, b)).toEqual([])
  })
})

describe('supersets across a session', () => {
  const a = anExercise({ id: 'row', supersetCompatibility: pairable({ gripHeavy: true }) })
  const b = anExercise({ id: 'carry', supersetCompatibility: pairable({ gripHeavy: true }) })
  const context = createConflictContext({
    session: [anEntry(a, { supersetGroup: 'g1' }), anEntry(b, { supersetGroup: 'g1' })],
  })
  const index = buildSessionIndex(context.session, context.policy)

  it('runs the pair rules over every group', () => {
    expect(rulesIn(supersetConflicts(index, context))).toEqual(['both-grip-heavy'])
  })

  it('ignores an exercise sitting alone in a group', () => {
    const solo = createConflictContext({ session: [anEntry(a, { supersetGroup: 'g1' })] })
    expect(supersetConflicts(buildSessionIndex(solo.session, solo.policy), solo)).toEqual([])
  })

  it('ignores exercises that are simply next to each other with no group', () => {
    const plain = createConflictContext({ session: [anEntry(a), anEntry(b)] })
    expect(supersetConflicts(buildSessionIndex(plain.session, plain.policy), plain)).toEqual([])
  })

  it('blocks the whole group when the user has supersets switched off', () => {
    const off = createConflictContext({ session: context.session, techniques: { supersets: false } })
    const conflicts = supersetConflicts(buildSessionIndex(off.session, off.policy), off)
    expect(rulesIn(conflicts)).toEqual(['not-permitted'])
    expect(conflicts[0].severity).toBe('blocking')
    expect(conflicts[0].exerciseIds).toEqual(['row', 'carry'])
  })

  it('pairs a candidate against the group it would join, and only that group', () => {
    const candidate = prepareEntry(
      anEntry(anExercise({ id: 'chin-up', supersetCompatibility: pairable({ gripHeavy: true }) }), {
        supersetGroup: 'g1',
      }),
      2,
    )
    expect(rulesIn(candidateSupersetConflicts(candidate, index, context))).toEqual([
      'both-grip-heavy',
      'both-grip-heavy',
    ])

    const elsewhere = prepareEntry(anEntry(anExercise({ id: 'chin-up' }), { supersetGroup: 'g2' }), 2)
    expect(candidateSupersetConflicts(elsewhere, index, context)).toEqual([])
  })

  it('says nothing about a candidate that is not being supersetted at all', () => {
    const loose = prepareEntry(anEntry(anExercise({ id: 'chin-up' })), 2)
    expect(candidateSupersetConflicts(loose, index, context)).toEqual([])
  })
})
