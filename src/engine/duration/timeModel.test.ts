import { describe, expect, it } from 'vitest'
import { SECONDS_PER_REP as ALTERNATIVES_SECONDS_PER_REP } from '../alternatives/estimate'
import { anExercise } from '../conflicts/testFixtures'
import {
  ESTIMATE_VARIANCE,
  FALLBACK_SETUP_SECONDS,
  SECONDS_PER_REP,
  SIDE_SWITCH_SECONDS,
  TRANSITION_REST_OVERLAP,
  TRANSITION_SECONDS,
  addCosts,
  estimateBand,
  repMidpoint,
  secondsToMinutes,
  setWorkSeconds,
  setupSecondsFor,
  sumCosts,
  tempoSecondsPerRep,
  timeCost,
  transitionChargeSeconds,
  walkSecondsFor,
} from './timeModel'

describe('the one seconds-per-rep constant', () => {
  it('agrees with the crude copy in the alternatives ranker', () => {
    // `engine/alternatives/estimate.ts` keeps a local estimate for candidate-versus-
    // candidate comparison and defers to this model in its own header. Two time
    // constants that disagree would make a swap and a generation predict different
    // lengths for the same session; if one is changed deliberately, change both.
    expect(SECONDS_PER_REP).toBe(ALTERNATIVES_SECONDS_PER_REP)
  })
})

describe('tempo', () => {
  it('falls back to the default speed when nothing is prescribed', () => {
    expect(tempoSecondsPerRep(null)).toBe(SECONDS_PER_REP)
  })

  it('uses a prescribed tempo, because a stated tempo is a fact', () => {
    expect(
      tempoSecondsPerRep({
        eccentricSeconds: 4,
        bottomPauseSeconds: 1,
        concentricSeconds: 1,
        topPauseSeconds: 0,
        reason: 'control-eccentric',
      }),
    ).toBe(6)
  })

  it('treats an all-zero tempo as no claim about speed', () => {
    expect(
      tempoSecondsPerRep({
        eccentricSeconds: 0,
        bottomPauseSeconds: 0,
        concentricSeconds: 0,
        topPauseSeconds: 0,
        reason: 'technique-focus',
      }),
    ).toBe(SECONDS_PER_REP)
  })

  it('lets a fast tempo be genuinely faster than the default', () => {
    const fast = tempoSecondsPerRep({
      eccentricSeconds: 1,
      bottomPauseSeconds: 0,
      concentricSeconds: 1,
      topPauseSeconds: 0,
      reason: 'intensity-without-load',
    })
    expect(fast).toBeLessThan(SECONDS_PER_REP)
  })
})

describe('the work in one set', () => {
  it('counts reps at the rep speed', () => {
    expect(setWorkSeconds({ reps: 10, repUnit: 'reps', unilateral: false, secondsPerRep: 3 })).toBe(30)
  })

  it('counts a hold in seconds, not in reps', () => {
    // The bug this guards: a 45-second plank estimated as 45 reps is 135 seconds.
    expect(setWorkSeconds({ reps: 45, repUnit: 'seconds', unilateral: false, secondsPerRep: 3 })).toBe(45)
  })

  it('performs a unilateral set twice, with a switch between the sides', () => {
    const bilateral = setWorkSeconds({ reps: 10, repUnit: 'reps', unilateral: false, secondsPerRep: 3 })
    const unilateral = setWorkSeconds({ reps: 10, repUnit: 'reps', unilateral: true, secondsPerRep: 3 })
    expect(unilateral).toBe(bilateral * 2 + SIDE_SWITCH_SECONDS)
  })

  it('is monotonic in reps', () => {
    let previous = -1
    for (let reps = 1; reps <= 30; reps += 1) {
      const seconds = setWorkSeconds({ reps, repUnit: 'reps', unilateral: false, secondsPerRep: 3 })
      expect(seconds).toBeGreaterThan(previous)
      previous = seconds
    }
  })

  it('never returns a negative number of seconds', () => {
    expect(setWorkSeconds({ reps: -5, repUnit: 'reps', unilateral: false, secondsPerRep: 3 })).toBe(0)
  })
})

describe('setup and the walk', () => {
  it('reads setup off the exercise, and falls back for one the catalog lacks', () => {
    expect(setupSecondsFor(anExercise({ id: 'x', setupTimeSeconds: 90 }))).toBe(90)
    expect(setupSecondsFor(null)).toBe(FALLBACK_SETUP_SECONDS)
  })

  it('reads the walk off the transition rung', () => {
    expect(walkSecondsFor(anExercise({ id: 'x', transitionCost: 'high' }))).toBe(TRANSITION_SECONDS.high)
    expect(walkSecondsFor(anExercise({ id: 'y', transitionCost: 'low' }))).toBe(TRANSITION_SECONDS.low)
  })

  it('charges the whole walk when there is no previous rest to spend it during', () => {
    const rack = anExercise({ id: 'rack', transitionCost: 'high' })
    expect(transitionChargeSeconds(rack, null)).toBe(TRANSITION_SECONDS.high)
  })

  it('credits only part of the previous rest, never all of it', () => {
    const rack = anExercise({ id: 'rack', transitionCost: 'high' })
    // 60 seconds of walk, 60 seconds of rest: half the rest is spendable, so 30
    // seconds are still charged. A model that credited the whole rest would call
    // this free and quietly under-estimate every session with long rests.
    expect(transitionChargeSeconds(rack, 60)).toBe(TRANSITION_SECONDS.high - 60 * TRANSITION_REST_OVERLAP)
  })

  it('never charges a negative walk', () => {
    const nearby = anExercise({ id: 'nearby', transitionCost: 'low' })
    expect(transitionChargeSeconds(nearby, 600)).toBe(0)
  })

  it('never charges more for a longer rest', () => {
    const rack = anExercise({ id: 'rack', transitionCost: 'high' })
    let previous = Number.POSITIVE_INFINITY
    for (let rest = 0; rest <= 300; rest += 15) {
      const charge = transitionChargeSeconds(rack, rest)
      expect(charge).toBeLessThanOrEqual(previous)
      previous = charge
    }
  })
})

describe('the cost currency', () => {
  it('keeps the total equal to its three buckets', () => {
    const cost = timeCost(100, 200, 50)
    expect(cost.totalSeconds).toBe(350)
  })

  it('adds bucket by bucket', () => {
    const sum = addCosts(timeCost(10, 20, 30), timeCost(1, 2, 3))
    expect(sum).toEqual({
      workSeconds: 11,
      restSeconds: 22,
      transitionSeconds: 33,
      totalSeconds: 66,
    })
  })

  it('sums a list the same way a spread would', () => {
    const list = [timeCost(5, 5, 5), timeCost(6, 6, 6), timeCost(7, 7, 7)]
    expect(sumCosts(list)).toEqual(addCosts(...list))
  })

  it('floors every bucket at zero', () => {
    expect(timeCost(-10, -10, -10)).toEqual({
      workSeconds: 0,
      restSeconds: 0,
      transitionSeconds: 0,
      totalSeconds: 0,
    })
  })
})

describe('the honest band', () => {
  it('puts the point estimate between a low and a high', () => {
    const band = estimateBand(1800)
    expect(band.seconds).toBe(1800)
    expect(band.lowSeconds).toBe(Math.round(1800 * (1 - ESTIMATE_VARIANCE)))
    expect(band.highSeconds).toBe(Math.round(1800 * (1 + ESTIMATE_VARIANCE)))
    expect(band.lowSeconds).toBeLessThan(band.seconds)
    expect(band.highSeconds).toBeGreaterThan(band.seconds)
  })

  it('does not inflate the point estimate itself', () => {
    // The band reports the spread; it must not become a hidden fudge factor on
    // the number two estimates are compared by.
    expect(estimateBand(1234).seconds).toBe(1234)
  })
})

describe('minutes', () => {
  it('rounds to nearest, so a point estimate does not drift upward', () => {
    expect(secondsToMinutes(1770)).toBe(30)
    expect(secondsToMinutes(1830)).toBe(31)
  })
})

describe('rep midpoint', () => {
  it('takes the middle of the range', () => {
    expect(repMidpoint({ min: 8, max: 12 })).toBe(10)
    expect(repMidpoint({ min: 5, max: 5 })).toBe(5)
  })
})
