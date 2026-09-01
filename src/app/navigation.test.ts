import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from './navigation'

describe('NAV_ITEMS', () => {
  it('is the five Phase 0 tabs in order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Today', 'Workout', 'Progress', 'Plan', 'Settings'])
  })

  it('starts at the index route', () => {
    expect(NAV_ITEMS[0].path).toBe('/')
    expect(NAV_ITEMS[0].id).toBe('today')
  })

  it('has a unique path per tab', () => {
    const paths = NAV_ITEMS.map((item) => item.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('has a unique id per tab', () => {
    const ids = NAV_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every tab a non-empty label, an absolute path, and an icon', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(item.path.startsWith('/')).toBe(true)
      expect(typeof item.icon).toBe('function')
    }
  })
})
