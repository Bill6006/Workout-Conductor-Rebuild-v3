import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../../catalog/exercises/catalog'
import { defaultEquipmentFor } from '../../catalog/equipment/equipment'
import { createDefaultProfile, type Profile } from '../../core/validation/schemas'
import {
  blockEntries,
  isSupersetBlock,
  workoutSchema,
  type ExerciseEntry,
  type SetRecord,
  type Workout,
} from '../../core/validation/workoutSchema'
import { generateWorkout } from '../workoutGenerator/generateWorkout'
import { recalibrate } from './recalibrate'
import { hasLoggedWorkingSet, completedWorkSurvives, lockedEntries } from './locks'
import { RECALIBRATION_TRIGGERS, scopeFor, type RecalibrationRequest } from './types'

const NOW = '2026-09-03T08:00:00.000Z'
const LATER = '2026-09-03T09:00:00.000Z'
const PROFILE: Profile = createDefaultProfile(NOW)
const GYM = { id: 'loc-gym', name: 'Gym', suitability: 'gym' } as const

function session(over: { profile?: Profile; availableTime?: RecalibrationRequest['requestedDuration'] } = {}) {
  const result = generateWorkout({
    profile: over.profile ?? PROFILE,
    location: GYM,
    equipment: defaultEquipmentFor('gym'),
    availableTime: over.availableTime ?? 'default',
    forDate: '2026-09-03',
    generatedAt: NOW,
    seed: 'seed-1',
    exercises: EXERCISES,
  })
  if (result.outcome !== 'generated') throw new Error('fixture could not be generated')
  return result.workout
}

function request(current: Workout, over: Partial<RecalibrationRequest>): RecalibrationRequest {
  return {
    trigger: 'duration-changed',
    current,
    profile: PROFILE,
    location: GYM,
    equipment: defaultEquipmentFor('gym'),
    timestamp: LATER,
    exercises: EXERCISES,
    ...over,
  }
}

/** A logged working set on the first entry, so locking has something to protect. */
function withLoggedFirstSet(workout: Workout): { workout: Workout; entryId: string; record: SetRecord } {
  const first = blockEntries(workout.blocks[0])[0]
  const record: SetRecord = {
    setId: first.targets[0].setId,
    outcome: 'completed',
    reps: 8,
    repUnit: 'reps',
    load: null,
    rir: 2,
    loggedAt: '2026-09-03T08:30:00.000Z',
    drops: [],
    note: 'felt good',
  }
  const logged: Workout = {
    ...workout,
    blocks: workout.blocks.map((block, index) => {
      if (index !== 0 || isSupersetBlock(block)) return block
      return { ...block, entry: { ...block.entry, records: [record] } }
    }),
  }
  return { workout: logged, entryId: first.entryId, record }
}

function exerciseIds(workout: Workout): string[] {
  return workout.blocks.flatMap((block) => blockEntries(block).map((entry) => entry.exerciseId))
}

describe('the trigger registry', () => {
  it('gives every trigger a scope', () => {
    for (const trigger of RECALIBRATION_TRIGGERS) expect(scopeFor(trigger)).toBeTruthy()
  })

  it('keeps a local change local', () => {
    // The plan is explicit: do not perform a full recalibration when a small
    // local adjustment is enough.
    expect(scopeFor('exercise-replaced')).toBe('single-exercise')
    expect(scopeFor('equipment-unavailable')).toBe('single-exercise')
    expect(scopeFor('station-unavailable')).toBe('single-exercise')
    expect(scopeFor('duration-changed')).toBe('full-session')
  })
})

describe('completed work is never lost', () => {
  it('carries a logged set through a full rebuild, byte for byte', () => {
    const { workout, record } = withLoggedFirstSet(session())
    const result = recalibrate(request(workout, { trigger: 'duration-changed', requestedDuration: 30 }))

    expect(result.outcome).toBe('recalibrated')
    if (result.outcome !== 'recalibrated') return
    expect(completedWorkSurvives(workout, result.workout)).toBe(true)

    const kept = blockEntries(result.workout.blocks[0])[0]
    expect(kept.records).toHaveLength(1)
    expect(kept.records[0]).toEqual(record)
  })

  it('keeps the exercise the logged set belongs to', () => {
    const { workout } = withLoggedFirstSet(session())
    const wasFirst = blockEntries(workout.blocks[0])[0].exerciseId

    const result = recalibrate(request(workout, { trigger: 'duration-changed', requestedDuration: 15 }))
    expect(result.outcome).toBe('recalibrated')
    if (result.outcome !== 'recalibrated') return
    expect(exerciseIds(result.workout)).toContain(wasFirst)
  })

  it('refuses to skip an exercise that has logged work, and says why', () => {
    const { workout, entryId } = withLoggedFirstSet(session())
    const result = recalibrate(
      request(workout, { trigger: 'exercise-skipped', targetEntryId: entryId }),
    )

    expect(result.outcome).toBe('failed')
    if (result.outcome !== 'failed') return
    expect(result.message).toMatch(/logged work/i)
    // A failure must hand back the previous session, not a partial one.
    expect(result.restored).toBe(workout)
  })

  it('does not let a warm-up set lock an exercise', () => {
    // Someone who has warmed up and then finds the rack taken should still be
    // able to swap the movement.
    const base = session()
    const entry = blockEntries(base.blocks[0])[0]
    const warmOnly: ExerciseEntry = {
      ...entry,
      targets: [{ ...entry.targets[0], kind: 'warm-up', setId: `${entry.entryId}-w1` }, ...entry.targets],
      records: [
        {
          setId: `${entry.entryId}-w1`,
          outcome: 'completed',
          reps: 5,
          repUnit: 'reps',
          load: null,
          rir: null,
          loggedAt: '2026-09-03T08:10:00.000Z',
          drops: [],
          note: '',
        },
      ],
    }
    expect(hasLoggedWorkingSet(warmOnly)).toBe(false)
  })
})

describe('locking', () => {
  it('locks an entry with any record, and reports why', () => {
    const { workout, entryId } = withLoggedFirstSet(session())
    const locks = lockedEntries(workout)

    expect(locks.map((lock) => lock.entryId)).toContain(entryId)
    expect(locks.find((lock) => lock.entryId === entryId)?.reason).toBe('has-completed-sets')
  })

  it('locks a pinned entry even with nothing logged', () => {
    const base = session()
    const pinned = blockEntries(base.blocks[1])[0].entryId
    const locks = lockedEntries(base, { pinnedEntryIds: [pinned] })

    expect(locks.find((lock) => lock.entryId === pinned)?.reason).toBe('user-pinned')
  })
})

describe('a local change stays local', () => {
  it('swaps one exercise and leaves every other row alone', () => {
    const base = session()
    const target = blockEntries(base.blocks[base.blocks.length - 1])[0]
    const before = exerciseIds(base)

    const result = recalibrate(
      request(base, {
        trigger: 'equipment-unavailable',
        targetEntryId: target.entryId,
        busyEquipment: target.exerciseId ? defaultEquipmentFor('gym').slice(0, 3) : [],
      }),
    )

    expect(result.outcome).toBe('recalibrated')
    if (result.outcome !== 'recalibrated') return
    expect(result.scope).toBe('single-exercise')

    const after = exerciseIds(result.workout)
    expect(after).toHaveLength(before.length)
    // Every position except the swapped one is untouched.
    const differing = before.filter((id, index) => after[index] !== id)
    expect(differing.length).toBeLessThanOrEqual(1)
  })

  it('records the replacement on the entry, with whether progression carried', () => {
    const base = session()
    const target = blockEntries(base.blocks[base.blocks.length - 1])[0]
    const result = recalibrate(
      request(base, { trigger: 'exercise-replaced', targetEntryId: target.entryId }),
    )

    if (result.outcome !== 'recalibrated') return
    const swapped = blockEntries(result.workout.blocks[result.workout.blocks.length - 1])[0]
    if (swapped.exerciseId === target.exerciseId) return
    expect(swapped.replacements).toHaveLength(1)
    expect(swapped.replacements[0].fromExerciseId).toBe(target.exerciseId)
    expect(typeof swapped.replacements[0].preservedProgression).toBe('boolean')
  })

  it('will not break a superset whose other move already has logged sets', () => {
    const base = session()
    const pair = base.blocks.find(isSupersetBlock)
    if (!pair) return

    const withPartnerLogged: Workout = {
      ...base,
      blocks: base.blocks.map((block) => {
        if (block.blockId !== pair.blockId || !isSupersetBlock(block)) return block
        return {
          ...block,
          moves: [
            {
              ...block.moves[0],
              records: [
                {
                  setId: block.moves[0].targets[0].setId,
                  outcome: 'completed',
                  reps: 10,
                  repUnit: 'reps',
                  load: null,
                  rir: 2,
                  loggedAt: '2026-09-03T08:40:00.000Z',
                  drops: [],
                  note: '',
                },
              ],
            },
            block.moves[1],
          ],
        }
      }),
    }

    const result = recalibrate(
      request(withPartnerLogged, {
        trigger: 'equipment-unavailable',
        targetEntryId: pair.moves[1].entryId,
      }),
    )
    expect(result.outcome).toBe('failed')
    if (result.outcome !== 'failed') return
    expect(result.message).toMatch(/superset/i)
  })
})

describe('duration recalibration', () => {
  it('rebuilds for the new length rather than trimming the old one', () => {
    const long = session()
    const result = recalibrate(request(long, { trigger: 'duration-changed', requestedDuration: 15 }))

    expect(result.outcome).toBe('recalibrated')
    if (result.outcome !== 'recalibrated') return

    const before = exerciseIds(long)
    const after = exerciseIds(result.workout)
    const isPrefix = after.every((id, index) => before[index] === id)
    expect(isPrefix, 'the short session is the long one with the end cut off').toBe(false)
  })

  it('subtracts time already spent from the remaining budget', () => {
    const { workout } = withLoggedFirstSet(session())
    const fresh = recalibrate(request(workout, { trigger: 'duration-changed', requestedDuration: 45 }))
    const partway = recalibrate(
      request(workout, { trigger: 'duration-changed', requestedDuration: 45, elapsedMinutes: 20 }),
    )

    if (fresh.outcome !== 'recalibrated' || partway.outcome !== 'recalibrated') return
    expect(partway.workout.estimatedMinutes).toBeLessThan(fresh.workout.estimatedMinutes)
  })

  it('keeps the session identity across a rebuild', () => {
    const base = session()
    const result = recalibrate(request(base, { trigger: 'duration-changed', requestedDuration: 30 }))
    if (result.outcome !== 'recalibrated') return

    // This is the same workout, adjusted — not a new one that happens to be today's.
    expect(result.workout.id).toBe(base.id)
    expect(result.workout.forDate).toBe(base.forDate)
  })
})

describe('what comes back is always valid', () => {
  it.each(['duration-changed', 'location-changed', 'readiness-changed', 'pain-reported'] as const)(
    'emits a schema-valid session for %s',
    (trigger) => {
      const { workout } = withLoggedFirstSet(session())
      const result = recalibrate(request(workout, { trigger, requestedDuration: 30 }))
      if (result.outcome !== 'recalibrated') return
      const parsed = workoutSchema.safeParse(result.workout)
      expect(parsed.success ? null : parsed.error.issues[0]?.message).toBeNull()
    },
  )

  it('never mints a duplicate id when preserving locked work', () => {
    // The generator numbers from one every time, so a preserved block and a
    // freshly built one can collide unless the fresh side is re-ided.
    const { workout } = withLoggedFirstSet(session())
    const result = recalibrate(request(workout, { trigger: 'duration-changed', requestedDuration: 45 }))
    if (result.outcome !== 'recalibrated') return

    const blockIds = result.workout.blocks.map((block) => block.blockId)
    const entryIds = result.workout.blocks.flatMap((block) =>
      blockEntries(block).map((entry) => entry.entryId),
    )
    expect(new Set(blockIds).size).toBe(blockIds.length)
    expect(new Set(entryIds).size).toBe(entryIds.length)
  })
})

describe('the change summary', () => {
  it('says what changed, compactly', () => {
    const base = session()
    const result = recalibrate(request(base, { trigger: 'duration-changed', requestedDuration: 15 }))
    if (result.outcome !== 'recalibrated') return

    expect(result.summary.headline).toMatch(/Rebuilt for 15 min/)
    expect(result.summary.changes.length).toBeGreaterThan(0)
    expect(result.summary.minutesBefore).toBe(base.estimatedMinutes)
    expect(result.summary.minutesAfter).toBe(result.workout.estimatedMinutes)
  })

  it('says so plainly when nothing needed changing', () => {
    const base = session()
    const result = recalibrate(
      request(base, { trigger: 'duration-changed', requestedDuration: base.durationChoice }),
    )
    if (result.outcome !== 'recalibrated') return
    if (result.summary.changes[0].kind === 'nothing-changed') {
      expect(result.summary.headline).toMatch(/nothing needed changing/i)
    }
  })
})

describe('cost', () => {
  it('recalibrates well inside the 700 ms full-rebuild budget', () => {
    const base = session()
    const started = performance.now()
    for (const duration of [15, 30, 45, 'default'] as const) {
      recalibrate(request(base, { trigger: 'duration-changed', requestedDuration: duration }))
    }
    expect(performance.now() - started).toBeLessThan(700)
  })
})
