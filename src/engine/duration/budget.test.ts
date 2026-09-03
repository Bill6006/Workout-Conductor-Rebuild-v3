import { describe, expect, it } from 'vitest'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import { DURATION_CHOICES, type DurationChoice } from '../../core/validation/workoutSchema'
import {
  BASE_REST_SECONDS,
  GENERAL_STEP_CAP_SECONDS,
  MAX_REST_SECONDS,
  MIN_WORKING_REST_SECONDS,
  MINIMUM_VIABLE_SECONDS,
  WARM_UP_ALLOWANCE_SECONDS,
  budgetFor,
  budgetForExactEnd,
  budgetPressure,
  durationKey,
  resolveDefaultMinutes,
  restPolicyFor,
  restSecondsFor,
  supersetRests,
} from './budget'

const ROLES = Object.keys(BASE_REST_SECONDS) as TrainingRole[]
const FIXED: readonly DurationChoice[] = [15, 30, 45]

describe('the budget for each duration', () => {
  it('covers exactly the four choices the product has', () => {
    expect([...DURATION_CHOICES]).toEqual([15, 30, 45, 'default'])
    for (const choice of DURATION_CHOICES) {
      expect(Object.keys(WARM_UP_ALLOWANCE_SECONDS)).toContain(durationKey(choice))
    }
  })

  it('turns a fixed choice into that many minutes of budget', () => {
    for (const choice of FIXED) {
      const plan = budgetFor(choice)
      expect(plan.plannedMinutes).toBe(choice)
      expect(plan.budgetSeconds).toBe((choice as number) * 60)
      expect(plan.capped).toBe(true)
    }
  })

  it('lands each duration in the right ballpark for real work', () => {
    // Not exercise counts — the engine decides those from real costs. What is
    // pinned here is that the room left over after the reserve and the warm-up is
    // a sane share of the time a person was promised.
    const expectations = [
      { choice: 15 as DurationChoice, minWork: 9 * 60, maxWork: 12 * 60 },
      { choice: 30 as DurationChoice, minWork: 21 * 60, maxWork: 27 * 60 },
      { choice: 45 as DurationChoice, minWork: 34 * 60, maxWork: 42 * 60 },
    ]
    for (const { choice, minWork, maxWork } of expectations) {
      const plan = budgetFor(choice)
      expect(plan.workAllowanceSeconds).toBeGreaterThanOrEqual(minWork)
      expect(plan.workAllowanceSeconds).toBeLessThanOrEqual(maxWork)
      expect(plan.usableSeconds).toBeLessThan(plan.budgetSeconds)
      expect(plan.usableSeconds + plan.reserveSeconds).toBe(plan.budgetSeconds)
      expect(plan.workAllowanceSeconds + plan.warmUpAllowanceSeconds).toBe(plan.usableSeconds)
    }
  })

  it('gives more room to every longer duration', () => {
    const plans = [budgetFor(15), budgetFor(30), budgetFor(45), budgetFor('default')]
    for (let index = 1; index < plans.length; index += 1) {
      expect(plans[index].budgetSeconds).toBeGreaterThan(plans[index - 1].budgetSeconds)
      expect(plans[index].workAllowanceSeconds).toBeGreaterThan(plans[index - 1].workAllowanceSeconds)
      expect(plans[index].warmUpAllowanceSeconds).toBeGreaterThanOrEqual(
        plans[index - 1].warmUpAllowanceSeconds,
      )
    }
  })

  it('keeps the optional warm-up block small at fifteen minutes', () => {
    // The plan is explicit: at 15 minutes, do not spend it on a long optional
    // warm-up block. Sixty seconds is one pulse-raiser and nothing else.
    expect(GENERAL_STEP_CAP_SECONDS['15']).toBeLessThanOrEqual(60)
    const plan = budgetFor(15)
    expect(plan.generalStepCapSeconds).toBeLessThanOrEqual(60)
    expect(plan.generalStepCapSeconds).toBeLessThan(plan.warmUpAllowanceSeconds)
  })
})

describe('"Default time" is an output, not a fourth number', () => {
  it('is never capped', () => {
    expect(budgetFor('default').capped).toBe(false)
  })

  it('takes its expectation from the plan, not from a constant in this module', () => {
    expect(budgetFor('default', { defaultMinutes: 52 }).plannedMinutes).toBe(52)
    expect(budgetFor('default', { defaultMinutes: 71 }).plannedMinutes).toBe(71)
  })

  it('resolves to whatever the finished session actually costs', () => {
    const plan = budgetFor('default', { defaultMinutes: 60 })
    expect(resolveDefaultMinutes(plan, 52 * 60)).toBe(52)
    expect(resolveDefaultMinutes(plan, 61 * 60 + 20)).toBe(61)
  })

  it('leaves a fixed choice alone, because the schema refuses a disagreement', () => {
    // `workoutSchema` rejects a 45-minute choice whose plannedMinutes is not 45.
    expect(resolveDefaultMinutes(budgetFor(45), 39 * 60)).toBe(45)
  })

  it('clamps a resolved length into the range the durable schema accepts', () => {
    const plan = budgetFor('default', { defaultMinutes: 60 })
    expect(resolveDefaultMinutes(plan, 10)).toBe(5)
    expect(resolveDefaultMinutes(plan, 100_000)).toBe(300)
  })
})

describe('the rest policy', () => {
  it('gives a heavy compound longer than an isolation set', () => {
    const policy = restPolicyFor('default', 'standard')
    expect(restSecondsFor(policy, 'primary-strength')).toBeGreaterThan(restSecondsFor(policy, 'isolation'))
  })

  it('shortens rest as the session shortens, and never below the floor', () => {
    for (const role of ROLES) {
      const rests = [15, 30, 45, 'default'].map(
        (choice) => restPolicyFor(choice as DurationChoice, 'standard').byRole[role],
      )
      for (let index = 1; index < rests.length; index += 1) {
        expect(rests[index]).toBeGreaterThanOrEqual(rests[index - 1])
      }
      for (const rest of rests) {
        expect(rest).toBeGreaterThanOrEqual(MIN_WORKING_REST_SECONDS)
        expect(rest).toBeLessThanOrEqual(MAX_REST_SECONDS)
      }
    }
  })

  it('honours the rest style the person chose', () => {
    const short = restPolicyFor('default', 'short')
    const standard = restPolicyFor('default', 'standard')
    const long = restPolicyFor('default', 'long')
    expect(short.byRole['primary-strength']).toBeLessThan(standard.byRole['primary-strength'])
    expect(long.byRole['primary-strength']).toBeGreaterThan(standard.byRole['primary-strength'])
  })

  it('stays inside the floor and the ceiling for every combination', () => {
    for (const choice of DURATION_CHOICES) {
      for (const style of ['short', 'standard', 'long'] as const) {
        for (const role of ROLES) {
          const rest = restPolicyFor(choice, style).byRole[role]
          expect(rest).toBeGreaterThanOrEqual(MIN_WORKING_REST_SECONDS)
          expect(rest).toBeLessThanOrEqual(MAX_REST_SECONDS)
          expect(Number.isInteger(rest)).toBe(true)
        }
      }
    }
  })
})

describe('the superset rest scheme', () => {
  it('replaces two straight rests with one round rest and a short gap', () => {
    const policy = restPolicyFor('default', 'standard')
    const rests = supersetRests(policy, 'primary-hypertrophy', 'secondary-hypertrophy')
    expect(rests.betweenMovesSeconds).toBeLessThan(rests.afterRoundSeconds)
    expect(rests.moveARestSeconds).toBe(rests.betweenMovesSeconds)
    expect(rests.moveBRestSeconds).toBe(rests.afterRoundSeconds)
  })

  it('never programs more rest per round than the two would have rested separately', () => {
    // This is the caps doing their job. Without them a long-rested lift paired
    // with a short-rested one could rest MORE alternated than in turn.
    for (const choice of DURATION_CHOICES) {
      for (const style of ['short', 'standard', 'long'] as const) {
        const policy = restPolicyFor(choice, style)
        for (const roleA of ROLES) {
          for (const roleB of ROLES) {
            const rests = supersetRests(policy, roleA, roleB)
            const paired = rests.betweenMovesSeconds + rests.afterRoundSeconds
            const separate = policy.byRole[roleA] + policy.byRole[roleB]
            expect(paired).toBeLessThanOrEqual(separate)
          }
        }
      }
    }
  })

  it('reads the harder of the two movements', () => {
    const policy = restPolicyFor('default', 'standard')
    expect(supersetRests(policy, 'primary-strength', 'isolation')).toEqual(
      supersetRests(policy, 'isolation', 'primary-strength'),
    )
    expect(supersetRests(policy, 'primary-strength', 'isolation').afterRoundSeconds).toBeGreaterThan(
      supersetRests(policy, 'isolation', 'isolation').afterRoundSeconds,
    )
  })
})

describe('the technique allowance', () => {
  it('wants supersets hardest when the time is shortest', () => {
    expect(budgetFor(15).techniques.supersetBias).toBeGreaterThan(budgetFor(30).techniques.supersetBias)
    expect(budgetFor(30).techniques.supersetBias).toBeGreaterThan(budgetFor(45).techniques.supersetBias)
    expect(budgetFor(45).techniques.supersetBias).toBeGreaterThan(
      budgetFor('default').techniques.supersetBias,
    )
  })

  it('never switches on a technique the person switched off', () => {
    const off = { supersets: false, dropSets: false, circuits: false }
    for (const choice of DURATION_CHOICES) {
      const plan = budgetFor(choice, { techniques: off })
      expect(plan.techniques.allowSupersets).toBe(false)
      expect(plan.techniques.allowDropSets).toBe(false)
      expect(plan.techniques.allowCircuits).toBe(false)
    }
  })
})

describe('a budget for an exact finish time', () => {
  it('is a caller asking to be done by a moment, not a fifth duration choice', () => {
    const plan = budgetForExactEnd(22 * 60)
    expect(plan.plannedMinutes).toBe(22)
    expect(plan.budgetSeconds).toBe(22 * 60)
    expect(plan.capped).toBe(true)
    // The vocabulary of session length stays 15, 30, 45 and Default.
    expect([...DURATION_CHOICES]).toContain(plan.durationChoice)
  })

  it('behaves like the nearest fixed length rather than like something unrecognised', () => {
    expect(budgetForExactEnd(18 * 60).durationChoice).toBe(15)
    expect(budgetForExactEnd(33 * 60).durationChoice).toBe(30)
    expect(budgetForExactEnd(50 * 60).durationChoice).toBe(45)
    expect(budgetForExactEnd(75 * 60).durationChoice).toBe('default')
  })

  it('keeps its own arithmetic consistent', () => {
    const plan = budgetForExactEnd(37 * 60)
    expect(plan.usableSeconds + plan.reserveSeconds).toBe(plan.budgetSeconds)
    expect(plan.workAllowanceSeconds + plan.warmUpAllowanceSeconds).toBe(plan.usableSeconds)
  })
})

describe('budget pressure', () => {
  it('runs from empty to full and stops there', () => {
    const plan = budgetFor(45)
    expect(budgetPressure(plan, 0)).toBe(0)
    expect(budgetPressure(plan, plan.usableSeconds)).toBe(1)
    expect(budgetPressure(plan, plan.usableSeconds * 3)).toBe(1)
  })

  it('rises as the session fills', () => {
    const plan = budgetFor(45)
    expect(budgetPressure(plan, 600)).toBeLessThan(budgetPressure(plan, 1200))
  })
})

describe('determinism', () => {
  it('produces byte-identical plans for identical inputs', () => {
    for (const choice of DURATION_CHOICES) {
      const options = { restStyle: 'standard' as const, defaultMinutes: 55 }
      expect(JSON.stringify(budgetFor(choice, options))).toBe(
        JSON.stringify(budgetFor(choice, { ...options })),
      )
    }
  })

  it('holds a minimum viable session that is smaller than every budget', () => {
    for (const choice of DURATION_CHOICES) {
      expect(budgetFor(choice).minimumViableSeconds).toBe(MINIMUM_VIABLE_SECONDS)
    }
    expect(MINIMUM_VIABLE_SECONDS).toBeLessThan(budgetFor(15).budgetSeconds)
  })
})
