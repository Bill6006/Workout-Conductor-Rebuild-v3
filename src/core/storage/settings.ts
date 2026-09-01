/**
 * localStorage — small settings and active-session metadata ONLY.
 *
 * WHAT MAY LIVE HERE: a remembered tab, a collapsed section, the onboarding step
 * the user reached, the id of an in-progress session, a "don't show this again"
 * flag. Small, regenerable, and unimportant if it vanishes.
 *
 * WHAT MAY NEVER LIVE HERE: the profile, workout history, logged sets, custom
 * exercises, or anything else the user would grieve losing. localStorage is
 * synchronous, size-capped, and is the first thing a browser clears. Durable data
 * belongs in IndexedDB via db.ts and saveVerified.
 *
 * Every access is wrapped: a browser with storage disabled degrades to defaults
 * rather than crashing the app.
 */

export const SETTINGS_PREFIX = 'wc:'

/** The known setting names. Add here rather than passing string literals around. */
export const SETTING_NAMES = {
  /** The step the user last reached in onboarding, so a reload resumes in place. */
  onboardingStep: 'onboarding-step',
  /** Id of the session currently in progress. Session CONTENT is IndexedDB's job. */
  activeSessionId: 'active-session-id',
  /** Whether the user has dismissed the Phase 1 demo-data explainer. */
  demoNoticeDismissed: 'demo-notice-dismissed',
  /** Last tab visited, so the app reopens where it was left. */
  lastTab: 'last-tab',
} as const

export type SettingName = (typeof SETTING_NAMES)[keyof typeof SETTING_NAMES]

const PROBE_KEY = `${SETTINGS_PREFIX}__probe`

/**
 * Storage we can READ from.
 *
 * Deliberately does not probe writing. A full or write-revoked localStorage still
 * hands back everything already in it, and running a write probe on the read path
 * threw that away — every read fell to its fallback and the user's settings looked
 * lost when they were sitting right there. A read probe (getItem is side-effect
 * free) still catches the hardened browsers that throw on access.
 */
function readableStorage(): Storage | null {
  try {
    const candidate = globalThis.localStorage
    if (!candidate) return null
    candidate.getItem(PROBE_KEY)
    return candidate
  } catch {
    return null
  }
}

/**
 * Storage we can WRITE to. Safari in private mode has the object but throws on
 * write, so this proves it before a caller reports a setting as saved.
 */
function writableStorage(): Storage | null {
  const candidate = readableStorage()
  if (!candidate) return null
  try {
    candidate.setItem(PROBE_KEY, '1')
    candidate.removeItem(PROBE_KEY)
    return candidate
  } catch {
    return null
  }
}

/** True when settings will actually persist. UI can use this to explain itself. */
export function isSettingsStorageAvailable(): boolean {
  return writableStorage() !== null
}

function fullKey(name: string): string {
  return name.startsWith(SETTINGS_PREFIX) ? name : `${SETTINGS_PREFIX}${name}`
}

/** Reads a JSON-encoded setting. Anything missing, unreadable, or corrupt yields `fallback`. */
export function readSetting<T>(name: string, fallback: T): T {
  const store = readableStorage()
  if (!store) return fallback
  try {
    const raw = store.getItem(fullKey(name))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Writes a JSON-safe setting. Returns false when storage refused — never throws. */
export function writeSetting(name: string, value: unknown): boolean {
  const store = writableStorage()
  if (!store) return false
  try {
    store.setItem(fullKey(name), JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded, or storage revoked mid-session.
    return false
  }
}

export function removeSetting(name: string): boolean {
  const store = writableStorage()
  if (!store) return false
  try {
    store.removeItem(fullKey(name))
    return true
  } catch {
    return false
  }
}

/** Every `wc:` key currently present, without the prefix. */
export function listSettingNames(): string[] {
  const store = readableStorage()
  if (!store) return []
  try {
    const names: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (key && key.startsWith(SETTINGS_PREFIX)) names.push(key.slice(SETTINGS_PREFIX.length))
    }
    return names
  } catch {
    return []
  }
}

/** Clears only this app's keys. Never touches anything outside the `wc:` namespace. */
export function clearSettings(): boolean {
  const store = writableStorage()
  if (!store) return false
  try {
    for (const name of listSettingNames()) store.removeItem(fullKey(name))
    return true
  } catch {
    return false
  }
}
