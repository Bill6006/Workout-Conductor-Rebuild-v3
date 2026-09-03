import { describe, expect, it } from 'vitest'
import { DROP_WRITE, createMemoryStore, type MemoryStore } from './memoryStore'
import {
  DEFAULT_RECENT_WORKOUT_LIMIT,
  createMemoryWorkoutBrowser,
  createWorkoutRepository,
  type WorkoutRepository,
} from './workoutRepository'
import {
  toWorkoutRecord,
  workoutRecordValidator,
  type GeneratedWorkoutRecord,
} from '../validation/workoutSchema'
import { FIXTURE_TIME, makeWorkout } from '../validation/testFixtures'

/**
 * The generated-session repository, against the in-memory `VerifiedStore`.
 *
 * jsdom has no IndexedDB and `fake-indexeddb` is not a dependency, so the store
 * double is how the real failure paths — a dropped write, a corrupted read, a
 * refusing storage layer — are exercised. The point of these tests is that a
 * session is never reported as saved unless it actually round-tripped, and that a
 * row which no longer validates is REPORTED rather than quietly skipped.
 */

const LATER = '2026-09-02T18:30:00.000Z'

function setUp(seed: Record<string, unknown> = {}): {
  store: MemoryStore<GeneratedWorkoutRecord>
  repository: WorkoutRepository
} {
  const store = createMemoryStore<GeneratedWorkoutRecord>({
    name: 'workouts',
    keyOf: (record) => record.id,
    validator: workoutRecordValidator,
    seed,
  })
  return { store, repository: createWorkoutRepository(store, createMemoryWorkoutBrowser(store.records)) }
}

function recordFor(id: string, forDate: string, savedAt = FIXTURE_TIME): GeneratedWorkoutRecord {
  return toWorkoutRecord(makeWorkout({ id, forDate }), savedAt)
}

describe('saving a session', () => {
  it('writes it, reads it back, and only then reports success', async () => {
    const { store, repository } = setUp()
    const result = await repository.saveWorkout(makeWorkout(), FIXTURE_TIME)

    expect(result.ok).toBe(true)
    expect(store.records.has('workout-1')).toBe(true)

    const loaded = await repository.load('workout-1')
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.record.workout.blocks).toHaveLength(2)
    expect(loaded.record.savedAt).toBe(FIXTURE_TIME)
    expect(loaded.record.recalibration).toBeNull()
  })

  it('refuses an invalid session before anything is written', async () => {
    const { store, repository } = setUp()
    const broken = toWorkoutRecord(makeWorkout({ durationChoice: 30, plannedMinutes: 45 }), FIXTURE_TIME)

    const result = await repository.save(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('pre-write-invalid')
    expect(result.rollback).toBe('not-needed')
    expect(store.records.size).toBe(0)
  })

  it('reports a silently dropped write instead of claiming a save', async () => {
    const { store, repository } = setUp()
    store.faults.onWrite = () => DROP_WRITE

    const result = await repository.saveWorkout(makeWorkout(), FIXTURE_TIME)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-missing')
  })

  it('restores the previous session when a rewrite comes back corrupted', async () => {
    const { store, repository } = setUp()
    await repository.saveWorkout(makeWorkout({ title: 'Upper body' }), FIXTURE_TIME)

    // One corrupted write, then storage behaves again — so the ROLLBACK write is
    // clean and can be confirmed. A fault left armed would corrupt the restore
    // too, and `saveVerified` would rightly report `unconfirmed` instead.
    let corruptNext = true
    store.faults.onWrite = (_key, value) => {
      if (!corruptNext) return value
      corruptNext = false
      return { ...(value as Record<string, unknown>), forDate: '2026-09-09' }
    }

    const result = await repository.saveWorkout(makeWorkout({ title: 'Rebuilt for 30 minutes' }), LATER)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('restored')

    const loaded = await repository.load('workout-1')
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.record.workout.title).toBe('Upper body')
  })

  it('keeps the recalibration metadata beside the session', async () => {
    const { repository } = setUp()
    const result = await repository.saveWorkout(makeWorkout(), FIXTURE_TIME, {
      generatorVersion: '3.0.0',
      seed: 'primary:2026-09-02',
      durationChoice: 45,
      inputsPresent: ['preferences'],
      decisions: [
        {
          step: 'time-fit',
          text: 'Dropped one accessory to fit 45 minutes.',
          muscleGroups: ['triceps'],
          entryIds: [],
          blockIds: [],
          varietyIndex: null,
        },
      ],
      timeBudget: {
        budgetSeconds: 2700,
        warmUpSeconds: 255,
        workSeconds: 900,
        restSeconds: 1200,
        transitionSeconds: 225,
        estimatedSeconds: 2580,
        headroomSeconds: 120,
      },
      volumePlan: [
        {
          group: 'chest',
          plannedSets: 6,
          weeklyTargetSets: 14,
          weeklySetsSoFar: 8,
          lastTrainedDaysAgo: 3,
        },
      ],
      patternBalance: [{ pattern: 'horizontal-push', count: 1 }],
      rejected: [{ exerciseId: 'barbell-squat', stage: 'no-time', text: 'Would not fit the budget.' }],
    })

    expect(result.ok).toBe(true)
    const loaded = await repository.load('workout-1')
    if (loaded.status !== 'ok') throw new Error('expected the session to load')
    expect(loaded.record.recalibration?.decisions[0].step).toBe('time-fit')
    expect(loaded.record.recalibration?.timeBudget.headroomSeconds).toBe(120)
  })
})

describe('loading a session', () => {
  it('says "empty" when there is nothing under the key', async () => {
    const { repository } = setUp()
    expect((await repository.load('nothing-here')).status).toBe('empty')
  })

  it('reports a corrupt row rather than returning half of it', async () => {
    const { repository } = setUp({ 'workout-1': { id: 'workout-1', forDate: '2026-09-02' } })
    const loaded = await repository.load('workout-1')
    expect(loaded.status).toBe('invalid')
    if (loaded.status !== 'invalid') return
    expect(loaded.issues.length).toBeGreaterThan(0)
    expect(loaded.raw).toEqual({ id: 'workout-1', forDate: '2026-09-02' })
  })

  it('surfaces a storage failure as unavailable, with its code', async () => {
    const { store, repository } = setUp()
    store.faults.failRead = new Error('storage is gone')
    const loaded = await repository.load('workout-1')
    expect(loaded.status).toBe('unavailable')
    if (loaded.status !== 'unavailable') return
    expect(loaded.code).toBe('failed')
    expect(loaded.message).toBe('storage is gone')
  })
})

describe('listing sessions', () => {
  it('returns every session generated for one day, newest save first', async () => {
    const { repository } = setUp()
    await repository.save(recordFor('w-morning', '2026-09-02', FIXTURE_TIME))
    await repository.save(recordFor('w-rebuilt', '2026-09-02', LATER))
    await repository.save(recordFor('w-other-day', '2026-09-03', FIXTURE_TIME))

    const listed = await repository.loadForDate('2026-09-02')
    expect(listed.status).toBe('ok')
    if (listed.status !== 'ok') return
    expect(listed.records.map((record) => record.id)).toEqual(['w-rebuilt', 'w-morning'])
    expect(listed.unreadable).toBe(0)
  })

  it('orders recent sessions by the day they are for, then by when they were saved', async () => {
    const { repository } = setUp()
    await repository.save(recordFor('w-old', '2026-08-30'))
    await repository.save(recordFor('w-mid', '2026-09-02', FIXTURE_TIME))
    await repository.save(recordFor('w-mid-rebuilt', '2026-09-02', LATER))
    await repository.save(recordFor('w-new', '2026-09-05'))

    const listed = await repository.listRecent()
    if (listed.status !== 'ok') throw new Error('expected a listing')
    expect(listed.records.map((record) => record.id)).toEqual(['w-new', 'w-mid-rebuilt', 'w-mid', 'w-old'])
  })

  it('honours a limit, and has a documented default', async () => {
    const { repository } = setUp()
    for (const day of ['01', '02', '03']) {
      await repository.save(recordFor(`w-${day}`, `2026-09-${day}`))
    }
    const listed = await repository.listRecent(2)
    if (listed.status !== 'ok') throw new Error('expected a listing')
    expect(listed.records.map((record) => record.id)).toEqual(['w-03', 'w-02'])
    expect(DEFAULT_RECENT_WORKOUT_LIMIT).toBe(10)
  })

  it('counts an unreadable row rather than pretending it is not there', async () => {
    const { repository } = setUp({ junk: { id: 'junk', forDate: '2026-09-02' } })
    await repository.save(recordFor('w-good', '2026-09-02'))

    const listed = await repository.loadForDate('2026-09-02')
    if (listed.status !== 'ok') throw new Error('expected a listing')
    expect(listed.records.map((record) => record.id)).toEqual(['w-good'])
    expect(listed.unreadable).toBe(1)
  })
})

describe('removing a session', () => {
  it('deletes it', async () => {
    const { store, repository } = setUp()
    await repository.saveWorkout(makeWorkout(), FIXTURE_TIME)
    await repository.remove('workout-1')
    expect(store.records.has('workout-1')).toBe(false)
    expect((await repository.load('workout-1')).status).toBe('empty')
  })
})
