import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILD_INFO, formatBuildStamp, formatPhaseTag } from './buildInfo'

/**
 * The identifiers are built at runtime so Vite's `define` cannot rewrite them
 * inside this file — that is what makes the "globals are missing" case
 * reachable at all.
 */
const GLOBAL_KEYS = ['MARKER', 'PHASE', 'COMMIT', 'TIME'].map((name) => `__BUILD_${name}__`)

const globalScope = globalThis as unknown as Record<string, string | undefined>

function snapshotGlobals(): Record<string, string | undefined> {
  return Object.fromEntries(GLOBAL_KEYS.map((key) => [key, globalScope[key]]))
}

afterEach(() => {
  vi.resetModules()
})

describe('BUILD_INFO', () => {
  it('reads all four build globals', () => {
    expect(BUILD_INFO).toEqual({
      marker: 'test-marker',
      phase: 'Phase 0 - Repository, Live Pages, and Scaffold',
      commit: 'abcdef1234567890',
      time: '2026-09-01T14:22:00.000Z',
    })
  })

  it('falls back to a sane value when the globals are absent', async () => {
    const saved = snapshotGlobals()
    for (const key of GLOBAL_KEYS) delete globalScope[key]

    try {
      vi.resetModules()
      const fresh = await import('./buildInfo')

      expect(fresh.BUILD_INFO).toEqual({
        marker: 'unknown',
        phase: 'unknown',
        commit: 'unknown',
        time: 'unknown',
      })
      expect(() => fresh.formatBuildStamp(fresh.BUILD_INFO)).not.toThrow()
      expect(fresh.formatBuildStamp(fresh.BUILD_INFO)).toBe('build unknown')
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value !== undefined) globalScope[key] = value
      }
      vi.resetModules()
    }
  })
})

describe('formatBuildStamp', () => {
  it('shortens the commit and renders the build time to the UTC minute', () => {
    expect(formatBuildStamp(BUILD_INFO)).toBe('build abcdef1 · 2026-09-01 14:22 UTC')
  })

  it('is stable across calls', () => {
    expect(formatBuildStamp(BUILD_INFO)).toBe(formatBuildStamp(BUILD_INFO))
    expect(formatBuildStamp(BUILD_INFO).length).toBeGreaterThan(0)
  })

  it('keeps a non-hex commit label intact', () => {
    const stamp = formatBuildStamp({ ...BUILD_INFO, commit: 'local' })
    expect(stamp).toBe('build local · 2026-09-01 14:22 UTC')
  })

  it('drops the timestamp rather than printing Invalid Date', () => {
    const stamp = formatBuildStamp({ ...BUILD_INFO, time: 'not-a-date' })
    expect(stamp).toBe('build abcdef1')
    expect(stamp).not.toMatch(/invalid/i)
  })

  it('pads single-digit months, days, hours, and minutes', () => {
    const stamp = formatBuildStamp({ ...BUILD_INFO, time: '2026-01-02T03:04:05.000Z' })
    expect(stamp).toBe('build abcdef1 · 2026-01-02 03:04 UTC')
  })
})

describe('formatPhaseTag', () => {
  it('reduces a long phase description to a pill-sized tag', () => {
    expect(formatPhaseTag('Phase 0 - Repository, Live Pages, and Scaffold')).toBe('Phase 0')
    expect(formatPhaseTag('phase 12 — something later')).toBe('Phase 12')
  })

  it('passes through a phase string that has no number', () => {
    expect(formatPhaseTag('Preview')).toBe('Preview')
  })
})
