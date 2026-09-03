import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUP_IDS } from '../../catalog/muscles/muscles'
import { anExercise } from '../conflicts/testFixtures'
import {
  SECONDARY_MUSCLE_CREDIT,
  SET_KIND_CREDIT,
  creditSets,
  groupCreditFor,
  groupReach,
  reachOf,
  roundSets,
} from './credit'

const PRESS = anExercise({
  id: 'press',
  primaryMuscles: ['upper-chest', 'mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
})

describe('set credit', () => {
  it('gives a warm-up set nothing and a working set everything', () => {
    expect(SET_KIND_CREDIT['warm-up']).toBe(0)
    expect(SET_KIND_CREDIT.working).toBe(1)
  })

  it('gives reduced-load work a partial credit, strictly between nothing and full', () => {
    for (const kind of ['back-off', 'drop'] as const) {
      expect(SET_KIND_CREDIT[kind]).toBeGreaterThan(0)
      expect(SET_KIND_CREDIT[kind]).toBeLessThan(1)
    }
  })

  it('counts a list of set kinds, warm-ups excluded', () => {
    expect(creditSets(['warm-up', 'warm-up', 'working', 'working', 'working'])).toBe(3)
    expect(creditSets(['working', 'drop'])).toBe(1.5)
    expect(creditSets([])).toBe(0)
  })
})

describe('the secondary-muscle discount', () => {
  it('is strictly between nothing and a full set', () => {
    expect(SECONDARY_MUSCLE_CREDIT).toBeGreaterThan(0)
    expect(SECONDARY_MUSCLE_CREDIT).toBeLessThan(1)
  })

  it('gives an assisting group less credit than the group being trained', () => {
    const direct = groupCreditFor(PRESS, 'chest', 4)
    const indirect = groupCreditFor(PRESS, 'triceps', 4)
    expect(direct).toBe(4)
    expect(indirect).toBe(2)
    expect(indirect).toBeLessThan(direct)
    expect(indirect).toBeGreaterThan(0)
  })

  it('gives an untouched group nothing', () => {
    expect(groupCreditFor(PRESS, 'quads', 4)).toBe(0)
    expect(reachOf(PRESS, 'quads')).toBe('none')
  })
})

describe('reach', () => {
  it('reads the group off the catalog rollup, not off the id string', () => {
    expect(reachOf(PRESS, 'chest')).toBe('primary')
    expect(reachOf(PRESS, 'shoulders')).toBe('secondary')
  })

  it('lists a group once, primary winning when an exercise reaches it both ways', () => {
    // `lower-chest` primary and `front-delt` secondary put chest and shoulders in
    // different buckets; adding a chest secondary must not add chest twice.
    const mixed = anExercise({
      id: 'mixed',
      primaryMuscles: ['mid-chest'],
      secondaryMuscles: ['upper-chest', 'front-delt'],
    })
    const reach = groupReach(mixed)
    expect(reach.filter((entry) => entry.group === 'chest')).toHaveLength(1)
    expect(reach.find((entry) => entry.group === 'chest')?.reach).toBe('primary')
    expect(reach.find((entry) => entry.group === 'shoulders')?.reach).toBe('secondary')
  })

  it('returns groups in canonical order', () => {
    const order = MUSCLE_GROUP_IDS.indexOf.bind(MUSCLE_GROUP_IDS)
    const wide = anExercise({
      id: 'wide',
      primaryMuscles: ['quads', 'mid-chest'],
      secondaryMuscles: ['triceps-long-head'],
    })
    const groups = groupReach(wide)
      .filter((entry) => entry.reach === 'primary')
      .map((entry) => entry.group)
    expect(groups).toEqual([...groups].sort((a, b) => order(a) - order(b)))
  })
})

describe('rounding', () => {
  it('is stable, so the same input builds a byte-identical ledger', () => {
    expect(roundSets(0.1 + 0.2)).toBe(0.3)
    expect(roundSets(3.14159)).toBe(3.14)
  })
})
