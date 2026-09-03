import { describe, expect, it } from 'vitest'
import { anExercise } from '../conflicts/testFixtures'
import {
  DEFAULT_VOLUME_WINDOW_DAYS,
  buildVolumeLedger,
  combineGroupSets,
  emptyVolumeLedger,
  volumeOfSession,
} from './weeklyVolume'
import type { SessionVolume } from './volumeTypes'

const PRESS = anExercise({
  id: 'press',
  primaryMuscles: ['upper-chest', 'mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
})

const CURL = anExercise({
  id: 'curl',
  primaryMuscles: ['biceps-long-head', 'biceps-short-head'],
  secondaryMuscles: ['brachioradialis'],
})

const SQUAT = anExercise({ id: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glute-max'] })

describe('with no history at all', () => {
  it('is a real ledger rather than a null, and says it has no history', () => {
    const ledger = emptyVolumeLedger()
    expect(ledger.hasHistory).toBe(false)
    expect(ledger.sessions).toBe(0)
    expect(ledger.byGroup).toEqual([])
    expect(ledger.groupSets('chest')).toBe(0)
    expect(ledger.forGroup('chest')).toBeNull()
  })

  it('is what an empty session list builds', () => {
    const built = buildVolumeLedger([])
    const empty = emptyVolumeLedger()
    expect(built.byGroup).toEqual(empty.byGroup)
    expect(built.byMuscle).toEqual(empty.byMuscle)
    expect(built.hasHistory).toBe(empty.hasHistory)
    expect(built.totalSets).toBe(empty.totalSets)
  })

  it('keeps "trained zero sets" distinguishable from "we have no idea"', () => {
    const restDay = buildVolumeLedger([{ daysAgo: 1, items: [] }])
    expect(restDay.groupSets('chest')).toBe(0)
    expect(restDay.hasHistory).toBe(true)
    expect(emptyVolumeLedger().hasHistory).toBe(false)
  })
})

describe('counting with history', () => {
  const week: readonly SessionVolume[] = [
    { daysAgo: 1, items: [{ exercise: PRESS, sets: 4 }] },
    { daysAgo: 3, items: [{ exercise: CURL, sets: 3 }] },
  ]

  it('gives a primary muscle a full set and a secondary muscle a fraction of one', () => {
    const ledger = buildVolumeLedger(week)
    expect(ledger.groupSets('chest')).toBe(4)
    expect(ledger.groupSets('triceps')).toBe(2)
    expect(ledger.groupSets('shoulders')).toBe(2)
  })

  it('counts one set once per group however many of its heads the exercise names', () => {
    // The press names TWO chest heads. Four sets is four sets of chest work.
    const ledger = buildVolumeLedger([{ daysAgo: 0, items: [{ exercise: PRESS, sets: 4 }] }])
    expect(ledger.groupSets('chest')).toBe(4)
    expect(ledger.muscleSets('upper-chest')).toBe(4)
    expect(ledger.muscleSets('mid-chest')).toBe(4)
  })

  it('counts heads separately, because heads are separately trainable', () => {
    const flatOnly = anExercise({ id: 'flat', primaryMuscles: ['mid-chest'], secondaryMuscles: [] })
    const ledger = buildVolumeLedger([{ daysAgo: 0, items: [{ exercise: flatOnly, sets: 5 }] }])
    expect(ledger.muscleSets('mid-chest')).toBe(5)
    expect(ledger.muscleSets('upper-chest')).toBe(0)
    expect(ledger.groupSets('chest')).toBe(5)
  })

  it('adds sessions together and counts distinct exercises per group', () => {
    const ledger = buildVolumeLedger([
      { daysAgo: 0, items: [{ exercise: PRESS, sets: 3 }] },
      { daysAgo: 2, items: [{ exercise: PRESS, sets: 3 }] },
      { daysAgo: 4, items: [{ exercise: CURL, sets: 3 }] },
    ])
    expect(ledger.groupSets('chest')).toBe(6)
    expect(ledger.forGroup('chest')?.exercises).toBe(1)
    expect(ledger.sessions).toBe(3)
  })

  it('separates direct from indirect credit so the discount stays auditable', () => {
    const ledger = buildVolumeLedger([
      { daysAgo: 0, items: [{ exercise: SQUAT, sets: 4 }] },
      {
        daysAgo: 1,
        items: [{ exercise: anExercise({ id: 'thrust', primaryMuscles: ['glute-max'] }), sets: 3 }],
      },
    ])
    const glutes = ledger.forGroup('glutes')
    expect(glutes?.directSets).toBe(3)
    expect(glutes?.indirectSets).toBe(4)
    expect(glutes?.effectiveSets).toBe(5)
  })

  it('ignores warm-up-only entries, because the caller credits sets before it counts', () => {
    const ledger = buildVolumeLedger([{ daysAgo: 0, items: [{ exercise: PRESS, sets: 0 }] }])
    expect(ledger.groupSets('chest')).toBe(0)
    expect(ledger.byGroup).toEqual([])
  })
})

describe('the window', () => {
  it('counts today and the days before it, and drops anything older', () => {
    const sessions: SessionVolume[] = [
      { daysAgo: 0, items: [{ exercise: PRESS, sets: 2 }] },
      { daysAgo: DEFAULT_VOLUME_WINDOW_DAYS - 1, items: [{ exercise: PRESS, sets: 2 }] },
      { daysAgo: DEFAULT_VOLUME_WINDOW_DAYS, items: [{ exercise: PRESS, sets: 99 }] },
    ]
    expect(buildVolumeLedger(sessions).groupSets('chest')).toBe(4)
  })

  it('honours a window the caller asked for', () => {
    const sessions: SessionVolume[] = [
      { daysAgo: 0, items: [{ exercise: PRESS, sets: 2 }] },
      { daysAgo: 5, items: [{ exercise: PRESS, sets: 2 }] },
    ]
    expect(buildVolumeLedger(sessions, { windowDays: 3 }).groupSets('chest')).toBe(2)
  })

  it('ignores a session dated in the future rather than counting it', () => {
    expect(buildVolumeLedger([{ daysAgo: -1, items: [{ exercise: PRESS, sets: 5 }] }]).sessions).toBe(0)
  })
})

describe('summary-only sessions', () => {
  it('count as direct group work and contribute no head detail', () => {
    const ledger = buildVolumeLedger([{ daysAgo: 1, setsByGroup: { chest: 6, back: 4 } }])
    expect(ledger.groupSets('chest')).toBe(6)
    expect(ledger.groupSets('back')).toBe(4)
    expect(ledger.byMuscle).toEqual([])
  })

  it('add to a session that also carries exercises', () => {
    const ledger = buildVolumeLedger([
      { daysAgo: 1, items: [{ exercise: PRESS, sets: 2 }], setsByGroup: { chest: 3 } },
    ])
    expect(ledger.groupSets('chest')).toBe(5)
  })

  it('drop an unrecognised group rather than guessing at it', () => {
    const setsByGroup = { chest: 2, 'not-a-group': 9 } as SessionVolume['setsByGroup']
    const ledger = buildVolumeLedger([{ daysAgo: 1, setsByGroup }])
    expect(ledger.totalSets).toBe(2)
  })
})

describe('determinism', () => {
  it('builds an identical ledger from identical input, every time', () => {
    const sessions: SessionVolume[] = [
      {
        daysAgo: 1,
        items: [
          { exercise: PRESS, sets: 4 },
          { exercise: CURL, sets: 3 },
        ],
      },
      { daysAgo: 4, items: [{ exercise: SQUAT, sets: 5 }] },
    ]
    const first = buildVolumeLedger(sessions)
    const second = buildVolumeLedger(sessions)
    expect(JSON.stringify(second.byGroup)).toBe(JSON.stringify(first.byGroup))
    expect(JSON.stringify(second.byMuscle)).toBe(JSON.stringify(first.byMuscle))
  })

  it('does not depend on the order sessions arrive in', () => {
    const items = [{ exercise: PRESS, sets: 4 }]
    const forwards = buildVolumeLedger([
      { daysAgo: 1, items },
      { daysAgo: 3, items },
    ])
    const backwards = buildVolumeLedger([
      { daysAgo: 3, items },
      { daysAgo: 1, items },
    ])
    expect(JSON.stringify(backwards.byGroup)).toBe(JSON.stringify(forwards.byGroup))
  })
})

describe('a session being built right now', () => {
  it('counts as its own ledger, so the next slot sees what is already committed', () => {
    const planned = volumeOfSession([{ exercise: PRESS, sets: 3 }])
    expect(planned.groupSets('chest')).toBe(3)
    expect(planned.hasHistory).toBe(true)
  })

  it('adds to the week when combined', () => {
    const week = buildVolumeLedger([{ daysAgo: 2, items: [{ exercise: PRESS, sets: 4 }] }])
    const planned = volumeOfSession([{ exercise: PRESS, sets: 3 }])
    expect(combineGroupSets(week, planned).chest).toBe(7)
  })
})
