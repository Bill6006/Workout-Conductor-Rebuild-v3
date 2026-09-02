import { describe, expect, it } from 'vitest'
import {
  FACTOR_BASELINES,
  FACTOR_KEYS,
  FACTOR_WEIGHTS,
  MATCH_QUALITY_THRESHOLDS,
  TOTAL_WEIGHT,
} from './weights'
import { matchQualityFor } from './explain'

describe('the ranking weights', () => {
  it('total exactly 100, so a match score is a percentage rather than a running total', () => {
    const total = FACTOR_KEYS.reduce((sum, key) => sum + FACTOR_WEIGHTS[key], 0)
    expect(total).toBe(TOTAL_WEIGHT)
  })

  it('give every factor a weight and a baseline, and name no factor twice', () => {
    expect(new Set(FACTOR_KEYS).size).toBe(FACTOR_KEYS.length)
    expect(Object.keys(FACTOR_WEIGHTS).sort()).toEqual([...FACTOR_KEYS].sort())
    expect(Object.keys(FACTOR_BASELINES).sort()).toEqual([...FACTOR_KEYS].sort())
  })

  it('give every factor a positive weight — a zero-weight factor is a factor to delete', () => {
    for (const key of FACTOR_KEYS) {
      expect(FACTOR_WEIGHTS[key]).toBeGreaterThan(0)
    }
  })

  it('keep every baseline on the 0..1 scale the factors score on', () => {
    for (const key of FACTOR_KEYS) {
      expect(FACTOR_BASELINES[key]).toBeGreaterThanOrEqual(0)
      expect(FACTOR_BASELINES[key]).toBeLessThanOrEqual(1)
    }
  })

  it('weight the primary muscle above every other single similarity factor', () => {
    for (const key of ['movement-pattern', 'training-role', 'stimulus', 'range-of-motion'] as const) {
      expect(FACTOR_WEIGHTS['primary-muscle']).toBeGreaterThan(FACTOR_WEIGHTS[key])
    }
  })

  it('let role and stimulus together outvote a total primary-muscle mismatch', () => {
    // This is the balance that stops a push-up displacing a heavy bench press:
    // the push-up wins the muscle factor outright and still loses overall.
    expect(FACTOR_WEIGHTS['training-role'] + FACTOR_WEIGHTS.stimulus).toBeGreaterThan(
      FACTOR_WEIGHTS['primary-muscle'] * 0.65,
    )
  })
})

describe('match quality rungs', () => {
  it('are ordered, so a higher score never reads as a worse match', () => {
    expect(MATCH_QUALITY_THRESHOLDS.excellent).toBeGreaterThan(MATCH_QUALITY_THRESHOLDS.strong)
    expect(MATCH_QUALITY_THRESHOLDS.strong).toBeGreaterThan(MATCH_QUALITY_THRESHOLDS.fair)
  })

  it('name each band at its boundary', () => {
    expect(matchQualityFor(100)).toBe('excellent')
    expect(matchQualityFor(MATCH_QUALITY_THRESHOLDS.excellent)).toBe('excellent')
    expect(matchQualityFor(MATCH_QUALITY_THRESHOLDS.excellent - 1)).toBe('strong')
    expect(matchQualityFor(MATCH_QUALITY_THRESHOLDS.strong)).toBe('strong')
    expect(matchQualityFor(MATCH_QUALITY_THRESHOLDS.strong - 1)).toBe('fair')
    expect(matchQualityFor(MATCH_QUALITY_THRESHOLDS.fair)).toBe('fair')
    expect(matchQualityFor(MATCH_QUALITY_THRESHOLDS.fair - 1)).toBe('weak')
    expect(matchQualityFor(0)).toBe('weak')
  })
})
