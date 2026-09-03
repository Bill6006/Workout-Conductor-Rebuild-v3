import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUP_IDS } from '../../catalog/muscles/muscles'
import { recoveryDaysFor } from '../conflicts/conflictPolicy'
import { DEFAULT_CONFLICT_POLICY } from '../conflicts/conflictPolicy'
import { anExercise } from '../conflicts/testFixtures'
import {
  DEFAULT_NEGLECT_DAYS,
  HARD_SESSION_SETS,
  buildExposure,
  emptyExposure,
  exposureFromEntries,
  neglectedGroups,
} from './exposure'
import type { SessionVolume } from './volumeTypes'

const PRESS = anExercise({
  id: 'press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['triceps-long-head'],
})
const ROW = anExercise({ id: 'row', primaryMuscles: ['lats'], secondaryMuscles: [] })

describe('with no history', () => {
  it('reports every group, fully ready and NOT neglected', () => {
    const exposure = emptyExposure()
    expect(exposure.hasHistory).toBe(false)
    expect(exposure.byGroup).toHaveLength(MUSCLE_GROUP_IDS.length)
    for (const row of exposure.byGroup) {
      expect(row.readiness).toBe(1)
      expect(row.residualLoad).toBe(0)
      expect(row.daysAgo).toBeNull()
      expect(row.neglected).toBe(false)
    }
  })

  it('names nothing as neglected, because an absence of data is not a gap', () => {
    expect(neglectedGroups(emptyExposure())).toEqual([])
  })
})

describe('how recently, and how hard', () => {
  it('leaves residual load on a group trained today and clears it by the recovery day', () => {
    const today = buildExposure([{ daysAgo: 0, items: [{ exercise: PRESS, sets: HARD_SESSION_SETS }] }])
    expect(today.for('chest').residualLoad).toBe(1)
    expect(today.for('chest').readiness).toBe(0)

    const recovered = buildExposure([
      { daysAgo: recoveryDaysFor('chest', DEFAULT_CONFLICT_POLICY), items: [{ exercise: PRESS, sets: 8 }] },
    ])
    expect(recovered.for('chest').residualLoad).toBe(0)
    expect(recovered.for('chest').readiness).toBe(1)
  })

  it('leaves less on a group that was trained lightly than on one hammered', () => {
    const light = buildExposure([{ daysAgo: 0, items: [{ exercise: PRESS, sets: 2 }] }])
    const heavy = buildExposure([{ daysAgo: 0, items: [{ exercise: PRESS, sets: 8 }] }])
    expect(light.for('chest').residualLoad).toBeLessThan(heavy.for('chest').residualLoad)
    expect(light.for('chest').residualLoad).toBeGreaterThan(0)
  })

  it('discounts assistance work, so a press leaves less on the triceps than on the chest', () => {
    const exposure = buildExposure([{ daysAgo: 0, items: [{ exercise: PRESS, sets: 4 }] }])
    expect(exposure.for('triceps').setsThen).toBe(2)
    expect(exposure.for('chest').setsThen).toBe(4)
    expect(exposure.for('triceps').residualLoad).toBeLessThan(exposure.for('chest').residualLoad)
  })

  it('reads its recovery windows off the conflict policy rather than holding a second opinion', () => {
    for (const group of MUSCLE_GROUP_IDS) {
      expect(emptyExposure().for(group).recoveryDays).toBe(recoveryDaysFor(group, DEFAULT_CONFLICT_POLICY))
    }
  })

  it('reports the most recent exposure, and the harder of two on the same day', () => {
    const sessions: SessionVolume[] = [
      { daysAgo: 4, items: [{ exercise: PRESS, sets: 6 }] },
      { daysAgo: 1, items: [{ exercise: PRESS, sets: 2 }] },
      { daysAgo: 1, items: [{ exercise: PRESS, sets: 5 }] },
    ]
    const chest = buildExposure(sessions).for('chest')
    expect(chest.daysAgo).toBe(1)
    expect(chest.setsThen).toBe(5)
    expect(chest.setsInWindow).toBe(13)
  })
})

describe('finding the neglected muscle', () => {
  const week: readonly SessionVolume[] = [
    { daysAgo: 1, items: [{ exercise: PRESS, sets: 5 }] },
    { daysAgo: 3, items: [{ exercise: PRESS, sets: 5 }] },
  ]

  it('names a group that history covers but never touches', () => {
    const neglected = neglectedGroups(buildExposure(week)).map((row) => row.group)
    expect(neglected).toContain('back')
    expect(neglected).toContain('quads')
    expect(neglected).not.toContain('chest')
  })

  it('does not name a group trained inside the neglect window', () => {
    const exposure = buildExposure([
      ...week,
      { daysAgo: DEFAULT_NEGLECT_DAYS - 1, items: [{ exercise: ROW, sets: 4 }] },
    ])
    expect(exposure.for('back').neglected).toBe(false)
    expect(neglectedGroups(exposure).map((row) => row.group)).not.toContain('back')
  })

  it('names a group whose last work is older than the neglect window', () => {
    const exposure = buildExposure([
      ...week,
      { daysAgo: DEFAULT_NEGLECT_DAYS, items: [{ exercise: ROW, sets: 4 }] },
    ])
    expect(exposure.for('back').neglected).toBe(true)
  })

  it('orders the worst first, breaking a tie on the lighter week then canonical order', () => {
    const exposure = buildExposure([
      { daysAgo: 0, items: [{ exercise: PRESS, sets: 5 }] },
      { daysAgo: 12, items: [{ exercise: ROW, sets: 1 }] },
    ])
    const ordered = neglectedGroups(exposure).map((row) => row.group)
    // `back` was trained twelve days ago; everything else never was, so `back`
    // is the LEAST neglected of the untrained ones and comes last.
    expect(ordered[ordered.length - 1]).toBe('back')
    expect(ordered).not.toContain('chest')
  })

  it('is deterministic', () => {
    const first = neglectedGroups(buildExposure(week)).map((row) => row.group)
    const second = neglectedGroups(buildExposure(week)).map((row) => row.group)
    expect(second).toEqual(first)
  })
})

describe('reading the group summaries Phase 6 will hand over', () => {
  it('builds the same picture from entries as from sessions', () => {
    const fromEntries = exposureFromEntries([
      { group: 'chest', daysAgo: 1, sets: 5 },
      { group: 'back', daysAgo: 3, sets: 6 },
    ])
    expect(fromEntries.for('chest').daysAgo).toBe(1)
    expect(fromEntries.for('chest').setsThen).toBe(5)
    expect(fromEntries.for('back').daysAgo).toBe(3)
    expect(fromEntries.hasHistory).toBe(true)
  })

  it('drops an unrecognised group rather than inventing one', () => {
    const exposure = exposureFromEntries([{ group: 'not-a-group', daysAgo: 1, sets: 5 }])
    expect(exposure.hasHistory).toBe(false)
  })
})
