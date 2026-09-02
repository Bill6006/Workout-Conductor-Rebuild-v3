import type { Page } from '@playwright/test'

/**
 * Persisted-state control for the end-to-end suite.
 *
 * The app is local-first, so "what the browser already remembers" is an input to
 * almost every journey: a first visit must reach setup, and a set-up device must
 * not. Playwright gives each test its own browser context, so nothing leaks
 * between tests on its own — but a spec that navigates twice would still inherit
 * whatever the first navigation wrote. Every spec therefore declares the state it
 * starts from, explicitly, in a `beforeEach`.
 *
 * HOW THE SEED IS RACE-FREE. The work happens in an init script, which Chromium
 * runs at document start — before the app bundle is even fetched. The very first
 * statement after the guard is a synchronous `indexedDB.open`, so our connection
 * request is queued ahead of the app's, and IndexedDB processes connection
 * requests, and overlapping transactions, in creation order. Our write therefore
 * completes before the app's first read, without a timeout anywhere.
 *
 * WHY IT ONLY RUNS ONCE PER TAB. An init script fires on every navigation, so a
 * naive version would re-seed on `page.reload()` — and reload is exactly how the
 * suite proves that IndexedDB really persisted something. A `sessionStorage`
 * marker survives reloads and same-tab navigations but not a new context, so the
 * seed applies to the first document of a test and to nothing after it.
 *
 * The shapes below deliberately restate the stored record rather than importing
 * `src/core/validation/schemas`. These specs drive the built bundle as a black
 * box; a fixture that drifts from the real schema is rejected by the app's own
 * validator on load, which sends every seeded test to setup and fails loudly.
 */

export const DB_NAME = 'workout-conductor'
export const DB_VERSION = 1
export const PROFILE_STORE = 'profile'
export const META_STORE = 'meta'
export const PROFILE_ID = 'primary'
/** Mirrors `SCHEMA_VERSION` in src/core/validation/schemas.ts. */
export const SCHEMA_VERSION = 2

/** Fixed, so anything asserted about a seeded value is reproducible. */
export const SEED_TIME = '2026-03-04T09:00:00.000Z'

/**
 * The canonical equipment ids, in catalogue order. Mirrors
 * `src/catalog/equipment/equipment.ts`, which owns the list; the mirror exists so
 * a seed written into IndexedDB from the browser needs no bundler.
 */
export const ALL_EQUIPMENT = [
  'barbell',
  'ez-bar',
  'trap-bar',
  'dumbbells',
  'adjustable-dumbbells',
  'kettlebell',
  'weight-plates',
  'flat-bench',
  'adjustable-bench',
  'preacher-bench',
  'back-extension-bench',
  'squat-rack',
  'smith-machine',
  'landmine',
  'cable-machine',
  'lat-pulldown',
  'leg-press',
  'selectorised-machines',
  'pull-up-bar',
  'dip-bars',
  'suspension-trainer',
  'resistance-bands',
  'ab-wheel',
  'plyo-box',
  'bodyweight-only',
] as const

/** What the app seeds a home location with. */
export const HOME_EQUIPMENT = [
  'dumbbells',
  'adjustable-dumbbells',
  'kettlebell',
  'weight-plates',
  'flat-bench',
  'adjustable-bench',
  'pull-up-bar',
  'dip-bars',
  'suspension-trainer',
  'resistance-bands',
  'ab-wheel',
  'plyo-box',
  'bodyweight-only',
] as const

export interface SeedLocation {
  id: string
  name: string
  kind: 'home' | 'gym' | 'travel' | 'custom'
  equipment: string[]
  notes: string
}

export interface SeedProfile {
  schemaVersion: number
  id: string
  createdAt: string
  updatedAt: string
  goals: { primary: string; secondary: string | null }
  experience: string
  trainingStyle: string
  schedule: { sessionsPerWeek: number; typicalDurationMin: number; availableDays: string[] }
  techniques: { supersets: boolean; dropSets: boolean; circuits: boolean }
  restStyle: string
  units: string
  bodyweight: { value: number; unit: 'kg' | 'lb' } | null
  limitations: {
    shoulder: boolean
    knee: boolean
    lowerBack: boolean
    avoidBarbellSquat: boolean
    notes: string
  }
  exercisePreferences: {
    preferred: { exerciseIds: string[]; freeText: string[] }
    disliked: { exerciseIds: string[]; freeText: string[] }
  }
  locations: SeedLocation[]
  activeLocationId: string
  onboardingCompletedAt: string | null
}

/** The name the seeded active location carries. Distinctive, so it cannot be a coincidence. */
export const SEED_LOCATION_NAME = 'Ironworks Gym'
export const SEED_SECOND_LOCATION_NAME = 'Home rack'
export const SEED_DURATION_MIN = 60

/**
 * A finished profile: the documented defaults, with named locations and setup
 * marked complete so the onboarding gate lets it past.
 */
export function seedProfile(overrides: Partial<SeedProfile> = {}): SeedProfile {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: PROFILE_ID,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    goals: { primary: 'build-muscle', secondary: null },
    experience: 'intermediate',
    trainingStyle: 'hybrid',
    schedule: {
      sessionsPerWeek: 4,
      typicalDurationMin: SEED_DURATION_MIN,
      availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    },
    techniques: { supersets: true, dropSets: true, circuits: false },
    restStyle: 'standard',
    units: 'imperial',
    bodyweight: null,
    limitations: { shoulder: false, knee: false, lowerBack: false, avoidBarbellSquat: false, notes: '' },
    exercisePreferences: {
      preferred: { exerciseIds: [], freeText: [] },
      disliked: { exerciseIds: [], freeText: [] },
    },
    locations: [
      {
        id: 'loc-gym',
        name: SEED_LOCATION_NAME,
        kind: 'gym',
        equipment: [...ALL_EQUIPMENT],
        notes: '',
      },
      {
        id: 'loc-home',
        name: SEED_SECOND_LOCATION_NAME,
        kind: 'home',
        equipment: [...HOME_EQUIPMENT],
        notes: '',
      },
    ],
    activeLocationId: 'loc-gym',
    onboardingCompletedAt: SEED_TIME,
    ...overrides,
  }
}

interface PreparedState {
  profile: SeedProfile | null
  /** Full localStorage keys, including the `wc:` prefix. Values are JSON-encoded. */
  settings: Record<string, unknown>
}

/** Where a failed seed leaves its message, so a test can report the real cause. */
export const PREPARE_ERROR_KEY = '__wcPrepareError'

/**
 * Runs at document start, once per tab. Everything it needs is inlined — an init
 * script is serialised into the page and cannot close over this module.
 */
function prepareOnce(state: PreparedState) {
  const marker = 'wc-e2e-prepared'
  // The literals are spelled out rather than referenced: an init script is
  // serialised into the page and cannot close over this module's constants.
  const failed = (error: unknown) => {
    ;(window as unknown as Record<string, unknown>).__wcPrepareError =
      error instanceof Error ? error.message : String(error)
  }

  try {
    if (sessionStorage.getItem(marker) === '1') return
    sessionStorage.setItem(marker, '1')
    localStorage.clear()
  } catch (error) {
    failed(error)
    return
  }

  // Issued synchronously, ahead of any application script, so this connection —
  // and the transaction below it — are ordered before the app's first read.
  const request = indexedDB.open('workout-conductor', 1)

  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains('profile')) {
      database.createObjectStore('profile', { keyPath: 'id' })
    }
    if (!database.objectStoreNames.contains('meta')) {
      database.createObjectStore('meta', { keyPath: 'key' })
    }
  }
  request.onerror = () => failed(request.error ?? new Error('the app database would not open'))
  request.onblocked = () => failed(new Error('the app database is blocked by another connection'))

  request.onsuccess = () => {
    const database = request.result
    try {
      const transaction = database.transaction(['profile', 'meta'], 'readwrite')
      transaction.objectStore('profile').clear()
      transaction.objectStore('meta').clear()
      if (state.profile) transaction.objectStore('profile').put(state.profile)
      transaction.onerror = () => failed(transaction.error ?? new Error('the seed transaction failed'))
      transaction.onabort = () => failed(transaction.error ?? new Error('the seed transaction aborted'))
      transaction.oncomplete = () => database.close()
    } catch (error) {
      failed(error)
      database.close()
    }
  }

  try {
    for (const [key, value] of Object.entries(state.settings)) {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (error) {
    failed(error)
  }
}

/**
 * Declares the persisted state the next navigation should find. Registers an init
 * script only — it costs no page load, so a spec pays for it once per test.
 */
export async function prepareApp(
  page: Page,
  state: { profile?: SeedProfile | null; settings?: Record<string, unknown> } = {},
): Promise<void> {
  await page.addInitScript(prepareOnce, {
    profile: state.profile ?? null,
    settings: state.settings ?? {},
  })
}

/** A genuine first visit: no profile, no settings, nothing remembered. */
export async function startFresh(page: Page): Promise<void> {
  await prepareApp(page, { profile: null })
}

/** A device that has already finished setup. */
export async function startWithProfile(page: Page, profile: SeedProfile = seedProfile()): Promise<void> {
  await prepareApp(page, { profile })
}

/** The seed's own failure message, if it had one. Null on success. */
export async function prepareError(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => ((window as unknown as Record<string, unknown>)[key] as string | null) ?? null,
    PREPARE_ERROR_KEY,
  )
}

/** The profile record exactly as it sits in IndexedDB right now. */
export async function readStoredProfile(page: Page): Promise<SeedProfile | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('workout-conductor', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })

    const record = await new Promise<unknown>((resolve, reject) => {
      const query = database.transaction('profile', 'readonly').objectStore('profile').get('primary')
      query.onsuccess = () => resolve(query.result)
      query.onerror = () => reject(query.error ?? new Error('read failed'))
    })

    database.close()
    return (record ?? null) as never
  })
}

/** Every `wc:`-prefixed localStorage key currently set, with its raw value. */
export async function readSettings(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const entries: Record<string, string> = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith('wc:')) entries[key] = localStorage.getItem(key) ?? ''
    }
    return entries
  })
}
