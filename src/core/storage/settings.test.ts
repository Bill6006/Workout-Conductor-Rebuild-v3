import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SETTINGS_PREFIX,
  SETTING_NAMES,
  clearSettings,
  isSettingsStorageAvailable,
  listSettingNames,
  readSetting,
  removeSetting,
  writeSetting,
} from './settings'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('namespacing', () => {
  it('writes every key under the wc: prefix', () => {
    writeSetting(SETTING_NAMES.lastTab, 'today')
    expect(window.localStorage.getItem(`${SETTINGS_PREFIX}last-tab`)).toBe('"today"')
  })

  it('does not double-prefix a name that already carries it', () => {
    writeSetting('wc:already', 1)
    expect(window.localStorage.getItem('wc:already')).toBe('1')
  })

  it('lists and clears only its own keys', () => {
    window.localStorage.setItem('someone-elses-key', 'keep me')
    writeSetting(SETTING_NAMES.lastTab, 'plan')
    writeSetting(SETTING_NAMES.onboardingStep, 3)

    expect(listSettingNames().sort()).toEqual(['last-tab', 'onboarding-step'])

    clearSettings()
    expect(listSettingNames()).toEqual([])
    expect(window.localStorage.getItem('someone-elses-key')).toBe('keep me')
  })
})

describe('round trip', () => {
  it('stores and restores JSON-safe values', () => {
    writeSetting('n', 42)
    writeSetting('s', 'hello')
    writeSetting('b', false)
    writeSetting('o', { step: 2, done: ['goals'] })

    expect(readSetting('n', 0)).toBe(42)
    expect(readSetting('s', '')).toBe('hello')
    expect(readSetting('b', true)).toBe(false)
    expect(readSetting('o', {})).toEqual({ step: 2, done: ['goals'] })
  })

  it('returns the fallback for a key that was never written', () => {
    expect(readSetting('missing', 'fallback')).toBe('fallback')
  })

  it('returns the fallback rather than throwing on corrupt JSON', () => {
    window.localStorage.setItem(`${SETTINGS_PREFIX}broken`, '{not json')
    expect(readSetting('broken', 'fallback')).toBe('fallback')
  })

  it('removes a key', () => {
    writeSetting('temp', 1)
    expect(removeSetting('temp')).toBe(true)
    expect(readSetting('temp', null)).toBeNull()
  })
})

describe('a browser with storage disabled', () => {
  it('reports storage as unavailable when the probe write throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(isSettingsStorageAvailable()).toBe(false)
  })

  it('degrades to the fallback instead of crashing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    expect(writeSetting('anything', 1)).toBe(false)
    expect(readSetting('anything', 'fallback')).toBe('fallback')
    expect(removeSetting('anything')).toBe(false)
    expect(listSettingNames()).toEqual([])
    expect(clearSettings()).toBe(false)
  })

  it('survives a getItem that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(readSetting('anything', 'fallback')).toBe('fallback')
  })

  it('survives localStorage being absent entirely', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true })
    try {
      expect(isSettingsStorageAvailable()).toBe(false)
      expect(readSetting('anything', 'fallback')).toBe('fallback')
      expect(writeSetting('anything', 1)).toBe(false)
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
    }
  })
})

describe('SETTING_NAMES', () => {
  it('names only small settings and session metadata', () => {
    expect(Object.values(SETTING_NAMES).sort()).toEqual([
      'active-session-id',
      'demo-notice-dismissed',
      'last-tab',
      'onboarding-step',
    ])
  })
})

/**
 * A7 — a full or write-revoked localStorage still hands back what is already in
 * it. Proving writability on the READ path threw those settings away: every read
 * fell to its fallback while the values sat there, readable.
 */
describe('a browser that can still read but can no longer write', () => {
  function revokeWrites() {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
  }

  it('still returns a setting that is sitting in storage', () => {
    writeSetting(SETTING_NAMES.lastTab, 'plan')
    writeSetting(SETTING_NAMES.onboardingStep, 3)
    revokeWrites()

    expect(readSetting(SETTING_NAMES.lastTab, 'today')).toBe('plan')
    expect(readSetting(SETTING_NAMES.onboardingStep, 0)).toBe(3)
  })

  it('still lists the keys in the wc: namespace', () => {
    writeSetting(SETTING_NAMES.lastTab, 'plan')
    revokeWrites()

    expect(listSettingNames()).toEqual(['last-tab'])
  })

  it('still reports that settings will not persist', () => {
    revokeWrites()
    expect(isSettingsStorageAvailable()).toBe(false)
  })

  it('never runs a write probe on the read path', () => {
    writeSetting(SETTING_NAMES.lastTab, 'plan')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    readSetting(SETTING_NAMES.lastTab, 'today')
    listSettingNames()

    expect(setItem).not.toHaveBeenCalled()
  })
})
