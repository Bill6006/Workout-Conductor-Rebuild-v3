import { describe, expect, it } from 'vitest'
import { createConflictContext } from './conflictContext'
import { equipmentConflicts, limitationConflicts, locationConflicts } from './entryRules'
import { anExercise } from './testFixtures'
import type { ConflictContextInput } from './conflictContext'

const gym = { id: 'loc-gym', name: 'Gym', suitability: 'gym' as const }

function context(input: ConflictContextInput = {}) {
  return createConflictContext({ location: gym, ...input })
}

describe('limitation conflicts', () => {
  const contraindicated = anExercise({
    id: 'overhead-press',
    contraindicatedFor: ['shoulder'],
    shoulderConsiderations: 'Overhead work with a sore shoulder is rarely worth it.',
    jointStressTags: [{ joint: 'shoulder', intensity: 'high' }],
  })

  it('blocks an exercise the catalog contraindicates for a flag the user set', () => {
    const [conflict] = limitationConflicts(contraindicated, context({ limitations: ['shoulder'] }))
    expect(conflict.kind).toBe('limitation')
    expect(conflict.severity).toBe('blocking')
    expect(conflict.exerciseIds).toEqual(['overhead-press'])
    expect(conflict.detail).toEqual({
      flag: 'shoulder',
      basis: 'contraindicated',
      note: 'Overhead work with a sore shoulder is rarely worth it.',
    })
  })

  it('says nothing about the same exercise when the flag is not set', () => {
    expect(limitationConflicts(contraindicated, context({ limitations: ['knee'] }))).toEqual([])
    expect(limitationConflicts(contraindicated, context())).toEqual([])
  })

  it('warns about heavy stress on a flagged joint even with nothing contraindicated', () => {
    const heavy = anExercise({
      id: 'dip',
      jointStressTags: [{ joint: 'shoulder', intensity: 'high' }],
    })
    const [conflict] = limitationConflicts(heavy, context({ limitations: ['shoulder'] }))
    expect(conflict.severity).toBe('strong')
    expect(conflict.detail).toEqual({ flag: 'shoulder', basis: 'joint-stress', note: '' })
  })

  it('stays quiet when the flagged joint is only lightly loaded', () => {
    const light = anExercise({
      id: 'cable-fly',
      jointStressTags: [{ joint: 'shoulder', intensity: 'low' }],
    })
    expect(limitationConflicts(light, context({ limitations: ['shoulder'] }))).toEqual([])
  })

  it('does not turn "avoiding barbell squats" into a knee complaint', () => {
    const kneeHeavy = anExercise({
      id: 'leg-press',
      jointStressTags: [{ joint: 'knee', intensity: 'high' }],
    })
    expect(limitationConflicts(kneeHeavy, context({ limitations: ['barbell-squat'] }))).toEqual([])
  })

  it('blocks a barbell squat for somebody avoiding barbell squats', () => {
    const squat = anExercise({ id: 'barbell-squat', contraindicatedFor: ['barbell-squat'] })
    const [conflict] = limitationConflicts(squat, context({ limitations: ['barbell-squat'] }))
    expect(conflict.severity).toBe('blocking')
    expect(conflict).toMatchObject({ detail: { flag: 'barbell-squat' } })
  })
})

describe('equipment conflicts', () => {
  const barbellLift = anExercise({ id: 'barbell-row', equipment: ['barbell', 'weight-plates'] })

  it('blocks when the location is missing something required', () => {
    const [conflict] = equipmentConflicts(
      barbellLift,
      context({ availableEquipment: ['dumbbells', 'weight-plates'] }),
    )
    expect(conflict.kind).toBe('equipment')
    expect(conflict.severity).toBe('blocking')
    expect(conflict.detail).toEqual({ missing: ['barbell'], locationId: 'loc-gym', locationName: 'Gym' })
    expect(conflict.reason).toBe('Not available at Gym: Barbell.')
  })

  it('says nothing when everything required is there', () => {
    expect(
      equipmentConflicts(barbellLift, context({ availableEquipment: ['barbell', 'weight-plates'] })),
    ).toEqual([])
  })

  it('ignores optional equipment entirely', () => {
    const withOptional = anExercise({
      id: 'dumbbell-press',
      equipment: ['dumbbells'],
      optionalEquipment: ['adjustable-bench'],
    })
    expect(equipmentConflicts(withOptional, context({ availableEquipment: ['dumbbells'] }))).toEqual([])
  })

  it('treats bodyweight-only as available everywhere, because it names the absence of kit', () => {
    const pushUp = anExercise({ id: 'push-up', equipment: ['bodyweight-only'] })
    expect(equipmentConflicts(pushUp, context({ availableEquipment: [] }))).toEqual([])
    expect(equipmentConflicts(pushUp, context({ availableEquipment: ['barbell'] }))).toEqual([])
  })
})

describe('location conflicts', () => {
  const gymOnly = anExercise({ id: 'leg-press', locationSuitability: ['gym'] })

  it('flags an exercise that is a poor fit for where the session is happening', () => {
    const [conflict] = locationConflicts(
      gymOnly,
      context({ location: { id: 'loc-home', name: 'Home', suitability: 'home' } }),
    )
    expect(conflict.kind).toBe('location')
    expect(conflict.severity).toBe('strong')
    expect(conflict.detail).toEqual({
      locationId: 'loc-home',
      locationName: 'Home',
      trainingAt: 'home',
      suitableAt: ['gym'],
    })
  })

  it('says nothing when the exercise suits the location', () => {
    expect(locationConflicts(gymOnly, context())).toEqual([])
  })

  it('says nothing at a location of no fixed kind, rather than guessing', () => {
    expect(
      locationConflicts(gymOnly, context({ location: { id: 'loc-x', name: 'Garage', suitability: null } })),
    ).toEqual([])
  })
})
