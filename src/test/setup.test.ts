import { describe, expect, it } from 'vitest'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Guards the test harness itself. If any of these break, every other suite
 * starts lying: components would read the wall clock, jsdom would throw on
 * matchMedia, or UpdatePrompt would pull in the real (hook-based) registration
 * module and blow up outside a React tree.
 */
describe('test setup', () => {
  it('pins the four build globals', () => {
    const globalScope = globalThis as unknown as Record<string, unknown>

    expect(globalScope['__BUILD_MARKER__']).toBe('test-marker')
    expect(globalScope['__BUILD_PHASE__']).toBe('Phase 0 - Repository, Live Pages, and Scaffold')
    expect(globalScope['__BUILD_COMMIT__']).toBe('abcdef1234567890')
    expect(globalScope['__BUILD_TIME__']).toBe('2026-09-01T14:22:00.000Z')
  })

  it('stubs matchMedia', () => {
    expect(typeof window.matchMedia).toBe('function')
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')

    expect(query.matches).toBe(false)
    expect(query.media).toBe('(prefers-reduced-motion: reduce)')
    expect(() => query.addEventListener('change', () => {})).not.toThrow()
  })

  it('replaces virtual:pwa-register/react with a hook-free stub', () => {
    // The real module calls useState, so this call would throw "Invalid hook
    // call" outside a component. Reaching an object proves the mock is live.
    const registration = useRegisterSW()

    expect(registration.needRefresh[0]).toBe(false)
    expect(registration.offlineReady[0]).toBe(false)
    expect(typeof registration.needRefresh[1]).toBe('function')
    expect(typeof registration.offlineReady[1]).toBe('function')
    expect(registration.updateServiceWorker()).toBeInstanceOf(Promise)
  })
})
