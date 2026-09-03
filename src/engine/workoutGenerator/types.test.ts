import { describe, expect, it } from 'vitest'
import {
  GENERATOR_VERSION,
  NO_WORKOUT_REASONS,
  deriveSeed,
  hashSeed,
  isGenerated,
  type GenerateWorkoutInput,
  type GenerateWorkoutResult,
} from './index'
import { createDefaultProfile } from '../../core/validation/schemas'
import { makeWorkout } from '../../core/validation/testFixtures'

/**
 * The generator's contract, not the generator.
 *
 * What is worth proving here is that the seed really is the only source of
 * variety and that it hashes identically every time, that "no session could be
 * produced" is an outcome rather than an empty workout, and that an input with
 * only the fields available TODAY type-checks — the absence of history and
 * progression state is the normal case until Phases 6 and 7 ship.
 */

const NOW = '2026-09-02T09:00:00.000Z'

describe('hashSeed', () => {
  it('is deterministic — the same seed, the same number, every time', () => {
    for (const seed of ['primary:2026-09-02', 'a', '', 'x'.repeat(120), '\u{1F3CB} session']) {
      expect(hashSeed(seed)).toBe(hashSeed(seed))
    }
  })

  it('always returns a non-negative 32-bit integer', () => {
    for (const seed of ['', 'a', 'primary:2026-09-02', 'zzzzzzzzzzzzzzzzzzzz', '\uFFFF']) {
      const hash = hashSeed(seed)
      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('separates seeds that differ by one character', () => {
    const hashes = new Set(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((day) => hashSeed(`primary:${day}`)),
    )
    expect(hashes.size).toBe(4)
  })
})

describe('deriveSeed', () => {
  it('gives one decision a number independent of another', () => {
    const seed = 'primary:2026-09-02'
    const order = deriveSeed(seed, 'exercise-order')
    const supersets = deriveSeed(seed, 'superset-pairing')
    expect(order).not.toBe(supersets)
    expect(order).not.toBe(hashSeed(seed))
    expect(deriveSeed(seed, 'exercise-order')).toBe(order)
  })

  it('changes with the seed, so consecutive sessions differ', () => {
    expect(deriveSeed('primary:2026-09-02', 'exercise-order')).not.toBe(
      deriveSeed('primary:2026-09-03', 'exercise-order'),
    )
  })
})

describe('the result is an outcome, never an empty workout', () => {
  it('narrows a generated result to its workout', () => {
    const result: GenerateWorkoutResult = {
      outcome: 'generated',
      workout: makeWorkout(),
      recalibration: {
        generatorVersion: GENERATOR_VERSION,
        seed: 'primary:2026-09-02',
        durationChoice: 45,
        inputsPresent: [],
        decisions: [],
        timeBudget: {
          budgetSeconds: 2700,
          warmUpSeconds: 255,
          workSeconds: 900,
          restSeconds: 1200,
          transitionSeconds: 225,
          estimatedSeconds: 2580,
          headroomSeconds: 120,
        },
        volumePlan: [],
        patternBalance: [],
        rejected: [],
      },
    }
    expect(isGenerated(result)).toBe(true)
    if (!isGenerated(result)) return
    expect(result.workout.blocks).toHaveLength(2)
  })

  it('says why nothing could be produced, with a line a screen can show', () => {
    const result: GenerateWorkoutResult = {
      outcome: 'none',
      reason: 'equipment-unavailable',
      message: 'Nothing at this location can be trained safely today.',
      considered: 127,
    }
    expect(isGenerated(result)).toBe(false)
    expect(NO_WORKOUT_REASONS).toContain(result.outcome === 'none' ? result.reason : 'no-usable-exercises')
  })
})

describe('the input', () => {
  it('is satisfiable with what exists today — no history, no progression state', () => {
    const input: GenerateWorkoutInput = {
      profile: createDefaultProfile(NOW),
      location: { id: 'loc-gym', name: 'Gym', suitability: 'gym' },
      equipment: ['barbell', 'dumbbells', 'flat-bench'],
      availableTime: 'default',
      forDate: '2026-09-02',
      generatedAt: NOW,
      seed: 'primary:2026-09-02',
      exercises: [],
    }

    // Every Phase 6 / Phase 7 field is absent, and that is a legal input.
    expect(input.recentWorkouts).toBeUndefined()
    expect(input.progression).toBeUndefined()
    expect(input.weeklyPlan).toBeUndefined()
    expect(input.recovery).toBeUndefined()
    expect(input.availableTime).toBe('default')
  })

  it('takes the duration choice and nothing else as the length control', () => {
    const base = {
      profile: createDefaultProfile(NOW),
      location: { id: 'loc-gym', name: 'Gym', suitability: 'gym' as const },
      equipment: [],
      forDate: '2026-09-02',
      generatedAt: NOW,
      seed: 's',
      exercises: [],
    }
    const choices = [15, 30, 45, 'default'] as const
    for (const choice of choices) {
      const input: GenerateWorkoutInput = { ...base, availableTime: choice }
      expect(input.availableTime).toBe(choice)
    }
  })
})

describe('GENERATOR_VERSION', () => {
  it('is a stamp a stored workout can carry', () => {
    expect(GENERATOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(GENERATOR_VERSION.length).toBeLessThanOrEqual(40)
  })
})
