import { describe, expect, it } from 'vitest'
import { createConflictContext } from './conflictContext'
import { buildSessionIndex, prepareEntry } from './sessionIndex'
import {
  duplicateExerciseConflicts,
  duplicateMovementPatternConflicts,
  muscleOverlapConflicts,
  progressionRoleConflicts,
} from './pairRules'
import { anEntry, anExercise } from './testFixtures'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { ConflictContext, SessionEntry } from './conflictContext'

const context: ConflictContext = createConflictContext()

function indexOf(entries: readonly SessionEntry[]) {
  return buildSessionIndex(entries, context.policy)
}

function candidate(exercise: Exercise, extras: Omit<SessionEntry, 'exercise'> = {}, position = 9) {
  return prepareEntry(anEntry(exercise, extras), position)
}

describe('duplicate exercise', () => {
  const bench = anExercise({ id: 'bench-press' })

  it('blocks the same id twice', () => {
    const [conflict] = duplicateExerciseConflicts(candidate(bench), indexOf([anEntry(bench)]))
    expect(conflict.kind).toBe('duplicate-exercise')
    expect(conflict.severity).toBe('blocking')
    expect(conflict.exerciseIds).toEqual(['bench-press'])
  })

  it('says nothing about a different exercise', () => {
    const other = anExercise({ id: 'incline-press' })
    expect(duplicateExerciseConflicts(candidate(other), indexOf([anEntry(bench)]))).toEqual([])
  })
})

describe('duplicate movement pattern', () => {
  const press = anExercise({ id: 'bench-press', movementPattern: 'horizontal-push' })
  const incline = anExercise({ id: 'incline-press', movementPattern: 'horizontal-push' })
  const dip = anExercise({ id: 'dip', movementPattern: 'horizontal-push' })
  // The catalog declares horizontal-push and isolation-fly as overlapping.
  const fly = anExercise({ id: 'cable-fly', movementPattern: 'isolation-fly' })
  const row = anExercise({ id: 'row', movementPattern: 'horizontal-pull' })

  it('is advisory for a second exercise on the same pattern', () => {
    const [conflict] = duplicateMovementPatternConflicts(
      candidate(incline),
      indexOf([anEntry(press)]),
      context,
    )
    expect(conflict.severity).toBe('advisory')
    expect(conflict).toMatchObject({ detail: { pattern: 'horizontal-push', identicalCount: 1, load: 1 } })
    expect(conflict.exerciseIds).toEqual(['incline-press', 'bench-press'])
  })

  it('is strong once the session is mostly one movement', () => {
    const [conflict] = duplicateMovementPatternConflicts(
      candidate(dip),
      indexOf([anEntry(press), anEntry(incline)]),
      context,
    )
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({ detail: { identicalCount: 2, load: 2 } })
  })

  it('counts a declared overlap as half, so a fly after a press registers', () => {
    const [conflict] = duplicateMovementPatternConflicts(candidate(fly), indexOf([anEntry(press)]), context)
    expect(conflict.severity).toBe('advisory')
    expect(conflict).toMatchObject({
      detail: { pattern: 'isolation-fly', identicalCount: 0, overlappingPatterns: ['horizontal-push'] },
    })
  })

  it('says nothing about an unrelated pattern', () => {
    expect(duplicateMovementPatternConflicts(candidate(row), indexOf([anEntry(press)]), context)).toEqual([])
  })

  it('says nothing about the first exercise in an empty session', () => {
    expect(duplicateMovementPatternConflicts(candidate(press), indexOf([]), context)).toEqual([])
  })
})

describe('muscle overlap', () => {
  const press = anExercise({
    id: 'bench-press',
    primaryMuscles: ['mid-chest', 'upper-chest'],
    secondaryMuscles: ['triceps-long-head'],
  })

  it('is strong when two exercises share their main muscles', () => {
    const twin = anExercise({
      id: 'machine-press',
      primaryMuscles: ['mid-chest', 'upper-chest'],
      secondaryMuscles: [],
    })
    const [conflict] = muscleOverlapConflicts(candidate(twin), indexOf([anEntry(press)]), context)
    expect(conflict.kind).toBe('muscle-overlap')
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({
      detail: { score: 8, sharedPrimary: ['upper-chest', 'mid-chest'], groups: ['chest'] },
    })
  })

  it('is only advisory when the shared muscle is secondary on both sides', () => {
    const curl = anExercise({
      id: 'hammer-curl',
      primaryMuscles: ['brachialis'],
      secondaryMuscles: ['triceps-long-head'],
    })
    const [conflict] = muscleOverlapConflicts(candidate(curl), indexOf([anEntry(press)]), context)
    expect(conflict.severity).toBe('advisory')
    expect(conflict).toMatchObject({
      detail: { score: 1, sharedPrimary: [], sharedSecondary: ['triceps-long-head'] },
    })
  })

  it('says nothing when nothing is shared', () => {
    const calf = anExercise({
      id: 'calf-raise',
      primaryMuscles: ['gastrocnemius'],
      secondaryMuscles: ['soleus'],
    })
    expect(muscleOverlapConflicts(candidate(calf), indexOf([anEntry(press)]), context)).toEqual([])
  })

  it('scores the worst single pairing rather than a session total', () => {
    const twin = anExercise({ id: 'machine-press', primaryMuscles: ['mid-chest', 'upper-chest'] })
    const [conflict] = muscleOverlapConflicts(
      candidate(twin),
      indexOf([anEntry(press), anEntry(anExercise({ id: 'push-up', primaryMuscles: ['mid-chest'] }))]),
      context,
    )
    expect(conflict).toMatchObject({ detail: { score: 8 } })
    expect(conflict.exerciseIds).toEqual(['machine-press', 'bench-press', 'push-up'])
  })
})

describe('progression-role conflicts', () => {
  const mainLift = anExercise({
    id: 'barbell-bench',
    trainingRole: 'primary-strength',
    progressionFamily: 'horizontal-press-barbell',
  })

  it('blocks two exercises assigned the same slot', () => {
    const other = anExercise({ id: 'incline-barbell', progressionFamily: 'incline-press-barbell' })
    const [conflict] = progressionRoleConflicts(
      candidate(other, { slot: 'main-1' }),
      indexOf([anEntry(mainLift, { slot: 'main-1' })]),
    )
    expect(conflict.kind).toBe('progression-role')
    expect(conflict.severity).toBe('blocking')
    expect(conflict).toMatchObject({ detail: { basis: 'slot', slot: 'main-1' } })
  })

  it('is strong when two anchors share a progression family', () => {
    const twin = anExercise({
      id: 'close-grip-bench',
      trainingRole: 'primary-hypertrophy',
      progressionFamily: 'horizontal-press-barbell',
    })
    const [conflict] = progressionRoleConflicts(candidate(twin), indexOf([anEntry(mainLift)]))
    expect(conflict.severity).toBe('strong')
    expect(conflict).toMatchObject({
      detail: { basis: 'family', family: 'horizontal-press-barbell', otherRoles: ['primary-strength'] },
    })
  })

  it('is advisory when the family is shared but neither is an anchor', () => {
    const accessory = anExercise({
      id: 'spoto-press',
      trainingRole: 'isolation',
      progressionFamily: 'horizontal-press-barbell',
    })
    const partner = anExercise({
      id: 'floor-press',
      trainingRole: 'secondary-hypertrophy',
      progressionFamily: 'horizontal-press-barbell',
    })
    const [conflict] = progressionRoleConflicts(candidate(accessory), indexOf([anEntry(partner)]))
    expect(conflict.severity).toBe('advisory')
  })

  it('leaves a specific warm-up ramp alone, in either direction', () => {
    const rampUp = anExercise({
      id: 'bench-ramp',
      trainingRole: 'warm-up',
      progressionFamily: 'horizontal-press-barbell',
    })
    expect(progressionRoleConflicts(candidate(rampUp), indexOf([anEntry(mainLift)]))).toEqual([])
    expect(progressionRoleConflicts(candidate(mainLift), indexOf([anEntry(rampUp)]))).toEqual([])
  })

  it('says nothing about two different families', () => {
    const different = anExercise({ id: 'db-press', progressionFamily: 'horizontal-press-dumbbell' })
    expect(progressionRoleConflicts(candidate(different), indexOf([anEntry(mainLift)]))).toEqual([])
  })
})
