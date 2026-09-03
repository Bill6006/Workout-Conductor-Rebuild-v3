import { describe, expect, it } from 'vitest'
import { MINIMUM_VIABLE_SECONDS, budgetFor, budgetForExactEnd } from './budget'
import {
  DURATION_VERDICTS,
  type FitItem,
  UNDER_FILLED_THRESHOLD,
  assessDuration,
  fitToBudget,
  marginalValuePerSecond,
  removalCase,
  secondsToShed,
  setsThatFit,
  toTimeBudget,
} from './fit'

function item(overrides: Partial<FitItem> & { itemId: string }): FitItem {
  return {
    costSeconds: 300,
    value: 0.5,
    priority: 'normal',
    required: false,
    ...overrides,
  }
}

/* ------------------------------------------------------------------ *
 * Marginal value
 * ------------------------------------------------------------------ */

describe('marginal value', () => {
  it('prefers more value for the same seconds', () => {
    expect(marginalValuePerSecond({ value: 0.8, costSeconds: 300 })).toBeGreaterThan(
      marginalValuePerSecond({ value: 0.4, costSeconds: 300 }),
    )
  })

  it('prefers the same value for fewer seconds', () => {
    expect(marginalValuePerSecond({ value: 0.6, costSeconds: 150 })).toBeGreaterThan(
      marginalValuePerSecond({ value: 0.6, costSeconds: 600 }),
    )
  })

  it('does not divide by zero on a free item', () => {
    expect(Number.isFinite(marginalValuePerSecond({ value: 1, costSeconds: 0 }))).toBe(true)
  })

  it('states what removing something would buy and what it would cost', () => {
    const removal = removalCase({ value: 0.4, costSeconds: 420 })
    expect(removal.secondsFreed).toBe(420)
    expect(removal.valueLost).toBe(0.4)
    expect(removal.valuePerSecondLost).toBe(marginalValuePerSecond({ value: 0.4, costSeconds: 420 }))
  })
})

describe('how many more sets fit', () => {
  it('counts whole sets only', () => {
    expect(setsThatFit(500, 150)).toBe(3)
    expect(setsThatFit(140, 150)).toBe(0)
  })

  it('answers zero rather than infinity for a free set', () => {
    expect(setsThatFit(500, 0)).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * Selection: rebuilding, not truncating
 * ------------------------------------------------------------------ */

describe('fitting work to a budget', () => {
  it('takes required work first, in the order it was given', () => {
    const outcome = fitToBudget(
      [
        item({ itemId: 'anchor', costSeconds: 600, value: 0.5, required: true, priority: 'priority' }),
        item({ itemId: 'extra', costSeconds: 300, value: 0.9 }),
      ],
      1200,
    )
    expect(outcome.included).toEqual(['anchor', 'extra'])
  })

  it('chooses by value per second, NOT by the order it was handed', () => {
    // This is the difference between rebuilding and truncating. A cheap,
    // high-value item at the end of the list beats an expensive one at the front.
    const outcome = fitToBudget(
      [
        item({ itemId: 'expensive-front', costSeconds: 900, value: 0.5 }),
        item({ itemId: 'cheap-back', costSeconds: 200, value: 0.9 }),
      ],
      600,
    )
    expect(outcome.included).toEqual(['cheap-back'])
    expect(outcome.excluded.map((entry) => entry.itemId)).toEqual(['expensive-front'])
  })

  it('keeps looking after something did not fit', () => {
    // A greedy fill that stopped at the first miss would leave real time unused.
    const outcome = fitToBudget(
      [
        item({ itemId: 'big', costSeconds: 900, value: 0.9 }),
        item({ itemId: 'small', costSeconds: 90, value: 0.5 }),
      ],
      600,
    )
    expect(outcome.included).toEqual(['small'])
  })

  it('is not a prefix of the longer session — a shorter budget REBUILDS', () => {
    const candidates = [
      item({ itemId: 'heavy-anchor', costSeconds: 700, value: 0.95, required: true, priority: 'priority' }),
      item({ itemId: 'big-accessory', costSeconds: 800, value: 0.8 }),
      item({ itemId: 'small-accessory', costSeconds: 200, value: 0.5, priority: 'accessory' }),
      item({ itemId: 'medium', costSeconds: 400, value: 0.7 }),
    ]
    const long = fitToBudget(candidates, 2400)
    const short = fitToBudget(candidates, 1200)
    expect(long.included).toHaveLength(4)
    expect(short.included.length).toBeLessThan(long.included.length)
    // Truncation would have produced the first N of the long answer. It did not:
    // the shorter session kept the cheap accessory and dropped the big one.
    expect(short.included).not.toEqual(long.included.slice(0, short.included.length))
    expect(short.included).toContain('small-accessory')
    expect(short.included).not.toContain('big-accessory')
  })

  it('returns what it included in session order, not in density order', () => {
    const outcome = fitToBudget(
      [
        item({ itemId: 'first', costSeconds: 400, value: 0.4 }),
        item({ itemId: 'second', costSeconds: 100, value: 0.9 }),
      ],
      1200,
    )
    expect(outcome.included).toEqual(['first', 'second'])
  })

  it('breaks a tie by priority, then by the order given — never by chance', () => {
    const outcome = fitToBudget(
      [
        item({ itemId: 'accessory', costSeconds: 300, value: 0.5, priority: 'accessory' }),
        item({ itemId: 'priority', costSeconds: 300, value: 0.5, priority: 'priority' }),
      ],
      300,
    )
    expect(outcome.included).toEqual(['priority'])
  })

  it('reports required work that alone overruns rather than dropping it', () => {
    const outcome = fitToBudget(
      [item({ itemId: 'anchor', costSeconds: 1200, value: 1, required: true, priority: 'priority' })],
      600,
    )
    expect(outcome.included).toEqual(['anchor'])
    expect(outcome.requiredOverrunSeconds).toBe(600)
    expect(outcome.headroomSeconds).toBeLessThan(0)
  })

  it('keeps its arithmetic straight', () => {
    const outcome = fitToBudget(
      [
        item({ itemId: 'a', costSeconds: 300, value: 0.9 }),
        item({ itemId: 'b', costSeconds: 400, value: 0.8 }),
        item({ itemId: 'c', costSeconds: 5000, value: 0.7 }),
      ],
      1000,
    )
    expect(outcome.usedSeconds).toBe(700)
    expect(outcome.headroomSeconds).toBe(300)
    expect(outcome.excluded[0]).toMatchObject({ itemId: 'c', reason: 'no-time' })
  })

  it('is deterministic', () => {
    const candidates = [
      item({ itemId: 'a', costSeconds: 300, value: 0.5 }),
      item({ itemId: 'b', costSeconds: 300, value: 0.5 }),
      item({ itemId: 'c', costSeconds: 300, value: 0.5 }),
    ]
    const once = JSON.stringify(fitToBudget(candidates, 700))
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(JSON.stringify(fitToBudget(candidates, 700))).toBe(once)
    }
  })
})

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

describe('assessing whether a session fits', () => {
  it('says there is room left when the session is thin', () => {
    const plan = budgetFor(45)
    const fit = assessDuration({ plan, estimate: plan.usableSeconds * 0.5 })
    expect(fit.verdict).toBe('under')
    expect(fit.notice?.code).toBe('room-for-more')
    expect(fit.fits).toBe(true)
    expect(fit.headroomSeconds).toBeGreaterThan(0)
  })

  it('says on target when the session fills the usable budget', () => {
    const plan = budgetFor(45)
    const fit = assessDuration({ plan, estimate: plan.usableSeconds - 30 })
    expect(fit.verdict).toBe('on-target')
    expect(fit.notice).toBeNull()
  })

  it('says tight when the session eats into the reserve but still fits', () => {
    const plan = budgetFor(45)
    const fit = assessDuration({ plan, estimate: plan.usableSeconds + 30 })
    expect(fit.verdict).toBe('tight')
    expect(fit.fits).toBe(true)
    expect(fit.headroomSeconds).toBeLessThan(0)
    expect(fit.budgetHeadroomSeconds).toBeGreaterThan(0)
  })

  it('marks the under-filled boundary where the threshold says it is', () => {
    const plan = budgetFor(45)
    const boundary = plan.usableSeconds * UNDER_FILLED_THRESHOLD
    expect(assessDuration({ plan, estimate: boundary + 60 }).verdict).toBe('on-target')
    expect(assessDuration({ plan, estimate: boundary - 60 }).verdict).toBe('under')
  })
})

describe('the honest admission', () => {
  it('reports an overrun rather than hiding it', () => {
    const plan = budgetFor(30)
    const fit = assessDuration({ plan, estimate: plan.budgetSeconds + 200 })
    expect(fit.verdict).toBe('over')
    expect(fit.fits).toBe(false)
    expect(fit.overrunSeconds).toBe(200)
    expect(fit.notice?.code).toBe('runs-over')
    expect(fit.notice?.text).toContain('closest realistic plan')
    expect(fit.notice?.text).toContain('4 minutes')
  })

  it('rounds an overrun UP, because a minute over is not no minutes over', () => {
    const plan = budgetFor(30)
    const fit = assessDuration({ plan, estimate: plan.budgetSeconds + 10 })
    expect(fit.overrunSeconds).toBe(10)
    expect(fit.overrunMinutes).toBe(1)
    expect(fit.notice?.text).toContain('1 minute')
  })

  it('reports the impossible case as its own verdict, not as a session that fits', () => {
    // A budget too small to hold even a minimum viable session. The generator is
    // told plainly; it still shows the closest realistic plan alongside.
    const plan = budgetForExactEnd(5 * 60)
    const fit = assessDuration({ plan, estimate: MINIMUM_VIABLE_SECONDS })
    expect(fit.verdict).toBe('impossible')
    expect(fit.fits).toBe(false)
    expect(fit.notice?.code).toBe('no-viable-session')
    expect(fit.overrunSeconds).toBeGreaterThan(0)
    expect(fit.notice?.text).toContain('not enough time')
  })

  it('never claims a session that overruns is fine', () => {
    const plan = budgetFor(15)
    for (const seconds of [plan.budgetSeconds + 1, plan.budgetSeconds * 2, plan.budgetSeconds * 5]) {
      const fit = assessDuration({ plan, estimate: seconds })
      expect(fit.fits).toBe(false)
      expect(fit.notice).not.toBeNull()
      expect(fit.overrunMinutes).toBeGreaterThan(0)
    }
  })

  it('states the length three ways, and promises against the high end', () => {
    const plan = budgetFor(45)
    const fit = assessDuration({ plan, estimate: 2400 })
    expect(fit.honest.seconds).toBe(2400)
    expect(fit.honest.lowSeconds).toBeLessThan(2400)
    expect(fit.honest.highSeconds).toBeGreaterThan(2400)
    expect(fit.honest.minutes).toBe(40)
    // A promise to be finished by a moment is made against the pessimistic end.
    expect(fit.honest.promiseMinutes).toBeGreaterThanOrEqual(fit.honest.minutes)
  })

  it('has a verdict from the declared list, always', () => {
    const plan = budgetFor(30)
    for (const seconds of [0, 300, 900, 1500, 1800, 3600, 20_000]) {
      expect([...DURATION_VERDICTS]).toContain(assessDuration({ plan, estimate: seconds }).verdict)
    }
  })
})

describe('"Default time" cannot run over', () => {
  it('is on target at whatever the complete plan costs', () => {
    const plan = budgetFor('default', { defaultMinutes: 60 })
    for (const seconds of [40 * 60, 60 * 60, 78 * 60]) {
      const fit = assessDuration({ plan, estimate: seconds })
      expect(fit.verdict).toBe('on-target')
      expect(fit.overrunSeconds).toBe(0)
      expect(fit.fits).toBe(true)
      expect(fit.notice).toBeNull()
    }
  })

  it('can still be impossible when the plan itself asks for too little time', () => {
    const plan = budgetFor('default', { defaultMinutes: 5 })
    expect(assessDuration({ plan, estimate: MINIMUM_VIABLE_SECONDS }).verdict).toBe('impossible')
  })
})

describe('the material for finishing by an exact time', () => {
  it('says how many seconds would have to come off', () => {
    const plan = budgetForExactEnd(45 * 60)
    const fit = assessDuration({ plan, estimate: 45 * 60 })
    // Measured against the HIGH end: an average-case estimate does not keep a
    // promise to be finished by ten past.
    expect(secondsToShed(fit, 45 * 60)).toBe(fit.honest.highSeconds - 45 * 60)
    expect(secondsToShed(fit, 90 * 60)).toBe(0)
  })
})

describe('the audit trail row', () => {
  it('assembles a TimeBudget whose buckets sum to the estimate', () => {
    const plan = budgetFor(45)
    const fit = assessDuration({ plan, estimate: 2400 })
    const budget = toTimeBudget(fit, {
      warmUpSeconds: 300,
      workSeconds: 900,
      restSeconds: 1000,
      transitionSeconds: 200,
    })
    expect(budget.budgetSeconds).toBe(plan.budgetSeconds)
    expect(budget.estimatedSeconds).toBe(2400)
    expect(budget.headroomSeconds).toBe(plan.budgetSeconds - 2400)
    expect(budget.warmUpSeconds + budget.workSeconds + budget.restSeconds + budget.transitionSeconds).toBe(
      budget.estimatedSeconds,
    )
  })
})
