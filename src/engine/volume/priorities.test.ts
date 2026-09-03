import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUP_IDS } from '../../catalog/muscles/muscles'
import type { Goal } from '../../core/validation/schemas'
import { musclePrioritySchema } from '../../core/validation/workoutSchema'
import { anExercise } from '../conflicts/testFixtures'
import { buildExposure, emptyExposure } from './exposure'
import {
  MIN_PRIMARY_SETS,
  PRIORITY_WEIGHTS,
  groupsBehindTarget,
  musclePriorities,
  rankGroups,
  sessionSetsFor,
} from './priorities'
import { MAX_SETS_PER_GROUP_PER_SESSION, resolveVolumeTargets } from './targets'
import { buildVolumeLedger, emptyVolumeLedger } from './weeklyVolume'
import type { PriorityInput } from './priorities'
import type { SessionVolume } from './volumeTypes'

const PRESS = anExercise({
  id: 'press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['triceps-long-head'],
})
const ROW = anExercise({ id: 'row', primaryMuscles: ['lats'], secondaryMuscles: ['biceps-long-head'] })

function inputFor(
  overrides: Partial<PriorityInput> & { goals?: { primary: Goal; secondary: Goal | null } } = {},
): PriorityInput {
  const goals = overrides.goals ?? { primary: 'build-muscle' as Goal, secondary: null }
  return {
    targets: resolveVolumeTargets({
      goals,
      trainingStyle: 'hybrid',
      experience: 'intermediate',
      sessionsPerWeek: 4,
    }),
    volume: emptyVolumeLedger(),
    exposure: emptyExposure(),
    goals,
    sessionsPerWeek: 4,
    ...overrides,
  }
}

describe('the first-ever session, with no history at all', () => {
  it('leaves every history-dependent signal neutral rather than maximal', () => {
    for (const standing of rankGroups(inputFor())) {
      expect(standing.signals.deficit).toBe(0.5)
      expect(standing.signals.readiness).toBe(0.5)
      expect(standing.signals.preference).toBe(0.5)
    }
  })

  it('lets the goal decide, so bigger-arms puts the arms first', () => {
    const goals = { primary: 'bigger-arms' as Goal, secondary: null }
    const ranked = rankGroups(inputFor({ goals })).map((standing) => standing.group)
    expect(ranked.slice(0, 2).sort()).toEqual(['biceps', 'triceps'])
  })

  it('puts the chest first for bigger-chest', () => {
    const goals = { primary: 'bigger-chest' as Goal, secondary: null }
    expect(rankGroups(inputFor({ goals }))[0].group).toBe('chest')
  })

  it('falls back to the group with the most weekly work when a goal has no opinion', () => {
    const ranked = rankGroups(inputFor()).map((standing) => standing.group)
    // Nothing distinguishes the groups, so the documented tie-break decides:
    // the largest weekly target first, then canonical order.
    expect(ranked[0]).toBe('back')
    expect(ranked).toHaveLength(MUSCLE_GROUP_IDS.length)
  })

  it('does not call anything neglected, and does not lead with a deficit it cannot know about', () => {
    for (const standing of rankGroups(inputFor())) {
      expect(standing.exposure.neglected).toBe(false)
      expect(standing.leadingReason).not.toBe('weekly-volume-deficit')
      expect(standing.leadingReason).not.toBe('not-trained-recently')
    }
  })

  it('still allocates real sets, because a first session must be a good session', () => {
    const priorities = musclePriorities(inputFor())
    expect(priorities).not.toHaveLength(0)
    for (const priority of priorities) {
      expect(priority.targetSets).toBeGreaterThan(0)
    }
  })
})

describe('with a week of history', () => {
  const week: readonly SessionVolume[] = [
    { daysAgo: 1, items: [{ exercise: PRESS, sets: 8 }] },
    { daysAgo: 3, items: [{ exercise: PRESS, sets: 8 }] },
  ]
  const withHistory = inputFor({
    volume: buildVolumeLedger(week),
    exposure: buildExposure(week),
    sessionsThisWeek: 2,
  })

  it('ranks a group nobody has trained above one that is ahead of its target', () => {
    const ranked = rankGroups(withHistory).map((standing) => standing.group)
    expect(ranked.indexOf('back')).toBeLessThan(ranked.indexOf('chest'))
  })

  it('reports the deficit it found, and the reason it acted on', () => {
    const back = rankGroups(withHistory).find((standing) => standing.group === 'back')
    expect(back?.setsThisWeek).toBe(0)
    expect(back?.deficit).toBe(back?.target.targetSets)
    expect(back?.signals.deficit).toBe(1)
  })

  it('explains a well-trained group by something other than a deficit', () => {
    const chest = rankGroups(withHistory).find((standing) => standing.group === 'chest')
    expect(chest?.setsThisWeek).toBe(16)
    expect(chest?.deficit).toBe(0)
    expect(chest?.leadingReason).not.toBe('weekly-volume-deficit')
  })

  it('scores a group trained yesterday below the same group left to recover', () => {
    const scoreFor = (daysAgo: number) => {
      const sessions = [{ daysAgo, items: [{ exercise: ROW, sets: 8 }] }]
      const standings = rankGroups(
        inputFor({ volume: buildVolumeLedger(sessions), exposure: buildExposure(sessions) }),
      )
      return standings.find((standing) => standing.group === 'back')?.score ?? 0
    }
    expect(scoreFor(1)).toBeLessThan(scoreFor(6))
  })

  it('lists the groups behind their target, worst first', () => {
    const behind = groupsBehindTarget(rankGroups(withHistory)).map((standing) => standing.group)
    expect(behind).toContain('back')
    expect(behind).not.toContain('chest')
    expect(behind[0]).toBe('back')
  })
})

describe('the other signals', () => {
  it('lifts a group that the preferred exercises point at', () => {
    const plain = rankGroups(inputFor()).findIndex((standing) => standing.group === 'calves')
    const preferred = rankGroups(inputFor({ preferredGroups: ['calves'] })).findIndex(
      (standing) => standing.group === 'calves',
    )
    expect(preferred).toBeLessThan(plain)
  })

  it('puts a group a weekly plan named at the very top, whatever else is true', () => {
    const ranked = rankGroups(inputFor({ plannedEmphasis: ['calves'] }))
    expect(ranked[0].group).toBe('calves')
    expect(ranked[0].leadingReason).toBe('specialisation')
  })

  it('lets a reported recovery pull a group down even when nothing was programmed', () => {
    const week = [{ daysAgo: 5, items: [{ exercise: ROW, sets: 4 }] }]
    const fresh = inputFor({ volume: buildVolumeLedger(week), exposure: buildExposure(week) })
    const sore = inputFor({
      volume: buildVolumeLedger(week),
      exposure: buildExposure(week),
      recovery: { back: 0.1 },
    })
    const freshBack = rankGroups(fresh).find((standing) => standing.group === 'back')
    const soreBack = rankGroups(sore).find((standing) => standing.group === 'back')
    expect(soreBack?.score).toBeLessThan(freshBack?.score ?? 0)
  })

  it('weights the four signals to exactly one', () => {
    const total = Object.values(PRIORITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    expect(total).toBeCloseTo(1, 10)
  })
})

describe('muscle priorities', () => {
  it('produce records the workout schema accepts', () => {
    for (const priority of musclePriorities(
      inputFor({ goals: { primary: 'bigger-arms', secondary: null } }),
    )) {
      expect(() => musclePrioritySchema.parse(priority)).not.toThrow()
    }
  })

  it('name two primaries and three secondaries by default, and no maintenance groups', () => {
    const priorities = musclePriorities(inputFor())
    expect(priorities.filter((entry) => entry.level === 'primary')).toHaveLength(2)
    expect(priorities.filter((entry) => entry.level === 'secondary')).toHaveLength(3)
    expect(priorities.filter((entry) => entry.level === 'maintenance')).toHaveLength(0)
  })

  it('include every group when the caller asks for the maintenance tail', () => {
    const priorities = musclePriorities(inputFor(), { includeMaintenance: true })
    expect(priorities).toHaveLength(MUSCLE_GROUP_IDS.length)
    for (const entry of priorities.filter((row) => row.level === 'maintenance')) {
      expect(entry.targetSets).toBe(0)
    }
  })

  it('give a primary group more sets than a secondary one, and never more than a session holds', () => {
    const priorities = musclePriorities(inputFor())
    const primary = priorities.find((entry) => entry.level === 'primary')
    const secondary = priorities.find((entry) => entry.level === 'secondary')
    expect(primary?.targetSets).toBeGreaterThanOrEqual(MIN_PRIMARY_SETS)
    expect(primary?.targetSets).toBeGreaterThanOrEqual(secondary?.targetSets ?? 0)
    for (const entry of priorities) {
      expect(entry.targetSets).toBeLessThanOrEqual(MAX_SETS_PER_GROUP_PER_SESSION)
    }
  })

  it('spread what a group is owed over the sessions that are left', () => {
    const standing = rankGroups(inputFor()).find((row) => row.group === 'back')
    expect(standing).toBeDefined()
    if (!standing) return
    // The same debt over fewer remaining sessions is more sets in each of them.
    expect(sessionSetsFor(standing, 'primary', 1)).toBeGreaterThan(sessionSetsFor(standing, 'primary', 4))
    expect(sessionSetsFor(standing, 'maintenance', 1)).toBe(0)
  })

  it('are deterministic — the same inputs rank and allocate identically', () => {
    const input = inputFor({ goals: { primary: 'bigger-arms', secondary: 'get-stronger' } })
    expect(JSON.stringify(musclePriorities(input))).toBe(JSON.stringify(musclePriorities(input)))
    expect(JSON.stringify(rankGroups(input))).toBe(JSON.stringify(rankGroups(input)))
  })
})
