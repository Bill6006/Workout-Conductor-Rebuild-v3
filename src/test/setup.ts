import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Vitest shares vite.config.ts, so the four `define` constants arrive as
 * properties on `globalThis` rather than as inlined literals. Pinning them
 * here makes every render deterministic — otherwise `__BUILD_TIME__` would
 * stamp the wall clock into assertions and the suite would only pass once.
 */
const BUILD_GLOBALS: Record<string, string> = {
  __BUILD_MARKER__: 'test-marker',
  __BUILD_PHASE__: 'Phase 0 - Repository, Live Pages, and Scaffold',
  __BUILD_COMMIT__: 'abcdef1234567890',
  __BUILD_TIME__: '2026-09-01T14:22:00.000Z',
}

for (const [key, value] of Object.entries(BUILD_GLOBALS)) {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
}

/** jsdom has no matchMedia; anything reading a media query would throw. */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

/**
 * `virtual:pwa-register/react` only exists inside a Vite build with the PWA
 * plugin active. Mocking it here — in a setup file, so it applies to every
 * test file — lets UpdatePrompt (and therefore AppShell) render under jsdom.
 * The stub reports a settled worker: no update pending, no offline toast.
 */
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}))

afterEach(() => {
  cleanup()
})
