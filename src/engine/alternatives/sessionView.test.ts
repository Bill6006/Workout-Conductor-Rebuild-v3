import { describe, expect, it } from 'vitest'
import {
  UnknownSlotError,
  jaccard,
  overlapScore,
  peakOverlap,
  primaryGroups,
  readSession,
} from './sessionView'
import {
  BARBELL_BENCH,
  BARBELL_ROW,
  CABLE_FLY,
  DUMBBELL_BENCH,
  LAT_PULLDOWN,
  MACHINE_PRESS,
  context,
  slot,
} from './testFixtures'

describe('reading the session', () => {
  it('finds the slot being replaced, by slot id rather than by exercise', () => {
    const view = readSession(
      context({
        session: [
          slot({ slotId: 'a', exercise: BARBELL_BENCH }),
          slot({ slotId: 'b', exercise: BARBELL_BENCH }),
        ],
        targetSlotId: 'b',
      }),
    )
    expect(view.target.slotId).toBe('b')
    expect(view.others.map((entry) => entry.slotId)).toEqual(['a'])
  })

  it('refuses a target that is not in the session rather than ranking against the wrong slot', () => {
    expect(() => readSession(context({ targetSlotId: 'nowhere' }))).toThrow(UnknownSlotError)
  })

  it('keeps finished work in `others` and out of `remaining` — it happened, but it cannot be spoiled', () => {
    const view = readSession(
      context({
        session: [
          slot({ slotId: 'done', exercise: BARBELL_ROW, status: 'completed' }),
          slot({ slotId: 'a', exercise: BARBELL_BENCH }),
          slot({ slotId: 'later', exercise: CABLE_FLY }),
        ],
      }),
    )
    expect(view.others.map((entry) => entry.slotId)).toEqual(['done', 'later'])
    expect(view.remaining.map((entry) => entry.slotId)).toEqual(['later'])
    expect(view.upcoming.map((entry) => entry.slotId)).toEqual(['later'])
  })

  it('counts only what comes after the target as upcoming', () => {
    const view = readSession(
      context({
        session: [
          slot({ slotId: 'before', exercise: CABLE_FLY }),
          slot({ slotId: 'a', exercise: BARBELL_BENCH }),
          slot({ slotId: 'after', exercise: BARBELL_ROW }),
        ],
      }),
    )
    expect(view.others.map((entry) => entry.slotId)).toEqual(['before', 'after'])
    expect(view.upcoming.map((entry) => entry.slotId)).toEqual(['after'])
  })

  it('drops a finished superset partner — you cannot alternate with a set you already did', () => {
    const view = readSession(
      context({
        session: [
          slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
          slot({ slotId: 'b', exercise: BARBELL_ROW, supersetId: 's1', status: 'completed' }),
        ],
      }),
    )
    expect(view.supersetPartners).toEqual([])
  })

  it('finds the superset partners, and finds none when the slot is not supersetted', () => {
    const paired = readSession(
      context({
        session: [
          slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
          slot({ slotId: 'b', exercise: BARBELL_ROW, supersetId: 's1' }),
          slot({ slotId: 'c', exercise: CABLE_FLY, supersetId: 's2' }),
        ],
      }),
    )
    expect(paired.supersetPartners.map((entry) => entry.slotId)).toEqual(['b'])
    expect(readSession(context()).supersetPartners).toEqual([])
  })

  it('totals joint load across the whole session, finished work included', () => {
    const view = readSession(
      context({
        session: [
          slot({ slotId: 'a', exercise: CABLE_FLY }),
          // Barbell bench is a high shoulder tag (4); incline is moderate (2).
          slot({ slotId: 'b', exercise: BARBELL_BENCH, status: 'completed' }),
          slot({ slotId: 'c', exercise: DUMBBELL_BENCH }),
        ],
      }),
    )
    expect(view.jointLoad.shoulder).toBe(6)
    expect(view.jointLoad.knee).toBeUndefined()
  })

  it('reads grip pressure as the mean grip demand of the work still to come', () => {
    const light = readSession(context({ session: [slot({ slotId: 'a', exercise: BARBELL_BENCH })] }))
    expect(light.gripPressure).toBe(0)

    const heavy = readSession(
      context({
        session: [
          slot({ slotId: 'a', exercise: BARBELL_BENCH }),
          // Barbell row is `high` grip: the top of a four-rung scale.
          slot({ slotId: 'b', exercise: BARBELL_ROW }),
        ],
      }),
    )
    expect(heavy.gripPressure).toBe(1)
  })
})

describe('similarity helpers', () => {
  it('treats two empty sets as identical and two disjoint ones as unrelated', () => {
    expect(jaccard([], [])).toBe(1)
    expect(jaccard(['a'], ['b'])).toBe(0)
    expect(jaccard(['a', 'b'], ['a'])).toBeCloseTo(0.5)
  })

  it('rolls primary muscles up to their groups', () => {
    expect(primaryGroups(BARBELL_BENCH)).toEqual(['chest'])
    expect(primaryGroups(LAT_PULLDOWN)).toEqual(['back'])
  })

  it('calls two exercises the same work only when both the groups and the pattern agree', () => {
    expect(overlapScore(BARBELL_BENCH, DUMBBELL_BENCH)).toBe(1)
    // Same group, a pattern the catalog declares as overlapping.
    expect(overlapScore(BARBELL_BENCH, CABLE_FLY)).toBe(1)
    // Same group, unrelated pattern would be 0.5; different group entirely is 0.
    expect(overlapScore(BARBELL_BENCH, LAT_PULLDOWN)).toBe(0)
  })

  it('reports the worst overlap across a set of slots, not the average', () => {
    const slots = [
      slot({ slotId: 'x', exercise: LAT_PULLDOWN }),
      slot({ slotId: 'y', exercise: MACHINE_PRESS }),
    ]
    expect(peakOverlap(BARBELL_BENCH, slots)).toBe(1)
    expect(peakOverlap(BARBELL_BENCH, [])).toBe(0)
  })
})
