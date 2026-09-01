import { afterEach, describe, expect, it } from 'vitest'
import { fixedClock, getClock, isIsoTimestamp, nowIso, setClock, steppingClock, systemClock } from './clock'

afterEach(() => {
  setClock(null)
})

describe('systemClock', () => {
  it('produces a parseable ISO string', () => {
    expect(isIsoTimestamp(systemClock.now())).toBe(true)
  })
})

describe('setClock', () => {
  it('replaces the clock the app reads and restores on null', () => {
    setClock(fixedClock('2026-09-01T10:00:00.000Z'))
    expect(nowIso()).toBe('2026-09-01T10:00:00.000Z')
    expect(getClock().now()).toBe('2026-09-01T10:00:00.000Z')

    setClock(null)
    expect(getClock()).toBe(systemClock)
  })
})

describe('fixedClock', () => {
  it('never moves', () => {
    const clock = fixedClock('2026-01-02T03:04:05.000Z')
    expect(clock.now()).toBe('2026-01-02T03:04:05.000Z')
    expect(clock.now()).toBe('2026-01-02T03:04:05.000Z')
  })
})

describe('steppingClock', () => {
  it('advances by the step on every read', () => {
    const clock = steppingClock('2026-09-01T00:00:00.000Z', 1000)
    expect(clock.now()).toBe('2026-09-01T00:00:00.000Z')
    expect(clock.now()).toBe('2026-09-01T00:00:01.000Z')
    expect(clock.now()).toBe('2026-09-01T00:00:02.000Z')
  })

  it('refuses a start it cannot parse', () => {
    expect(() => steppingClock('not-a-date')).toThrow(/valid ISO/)
  })
})

describe('isIsoTimestamp', () => {
  it('accepts UTC and offset forms', () => {
    expect(isIsoTimestamp('2026-09-01T14:22:00.000Z')).toBe(true)
    expect(isIsoTimestamp('2026-09-01T14:22:00+02:00')).toBe(true)
    expect(isIsoTimestamp('2026-09-01')).toBe(true)
  })

  it('rejects rubbish', () => {
    expect(isIsoTimestamp('')).toBe(false)
    expect(isIsoTimestamp('yesterday')).toBe(false)
    expect(isIsoTimestamp(1756742520000)).toBe(false)
    expect(isIsoTimestamp(null)).toBe(false)
  })
})

/**
 * A8 — the check has to mean what its failure message says.
 *
 * `Date.parse` alone accepts plenty that is not ISO 8601, so a value could be
 * rejected — or worse, accepted — under a message claiming ISO 8601 that the
 * check never enforced.
 */
describe('isIsoTimestamp — actually ISO 8601', () => {
  it('accepts every form this app writes', () => {
    expect(isIsoTimestamp(new Date().toISOString())).toBe(true)
    expect(isIsoTimestamp('2026-09-01T14:22:00.000Z')).toBe(true)
    expect(isIsoTimestamp('2026-09-01T14:22:00Z')).toBe(true)
    expect(isIsoTimestamp('2026-09-01T14:22Z')).toBe(true)
    expect(isIsoTimestamp('2026-09-01T14:22:00')).toBe(true)
    expect(isIsoTimestamp('2026-09-01T14:22:00-05:00')).toBe(true)
    expect(isIsoTimestamp('2026-09-01')).toBe(true)
  })

  it('rejects the non-ISO forms Date.parse is happy to take', () => {
    // Every one of these parses. None of them is ISO 8601, and the last is
    // ambiguous between locales, which is exactly why it must not be stored.
    for (const value of [
      'March 5, 2026',
      '2026/09/01',
      '12/25/2026',
      'Tue Sep 01 2026',
      'Sep 1 2026 14:22',
    ]) {
      expect(Number.isNaN(Date.parse(value))).toBe(false)
      expect(isIsoTimestamp(value)).toBe(false)
    }
  })

  it('rejects a well-formed shape that is not a real date', () => {
    expect(isIsoTimestamp('2026-02-30')).toBe(false)
    expect(isIsoTimestamp('2026-13-01')).toBe(false)
    expect(isIsoTimestamp('2026-09-31')).toBe(false)
    expect(isIsoTimestamp('2026-09-32T00:00:00.000Z')).toBe(false)
    expect(isIsoTimestamp('2025-02-29')).toBe(false)
    expect(isIsoTimestamp('2024-02-29')).toBe(true)
  })

  it('rejects near-misses of the ISO shape', () => {
    expect(isIsoTimestamp('2026-9-1')).toBe(false)
    expect(isIsoTimestamp('2026-09-01 14:22:00')).toBe(false)
    expect(isIsoTimestamp('2026-09-01T14:22:00.000Z ')).toBe(false)
    expect(isIsoTimestamp('  2026-09-01')).toBe(false)
  })
})
