import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ProfileProvider, applyProfilePatch, useProfile } from './profileStore'
import { fixedClock, steppingClock } from '../time/clock'
import { createMemoryStore, type MemoryStore } from '../storage/memoryStore'
import { createProfileRepository, setProfileRepository } from '../storage/profileRepository'
import { storageError } from '../storage/db'
import { PROFILE_ID, createDefaultProfile, type Profile } from '../validation/schemas'
import { profileValidator } from '../validation/validate'
import type { SaveResult } from '../storage/verifiedSave'

/**
 * Backed by the in-memory `VerifiedStore` — jsdom has no IndexedDB and
 * `fake-indexeddb` is not a dependency of this project.
 */

const NOW = '2026-09-01T12:00:00.000Z'

function setup(seed?: Profile) {
  const store: MemoryStore<Profile> = createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed: seed ? { [PROFILE_ID]: seed } : {},
  })
  const repository = createProfileRepository(store)
  const clock = steppingClock('2026-09-02T08:00:00.000Z', 60_000)

  const wrapper = ({ children }: { children: ReactNode }) => (
    <ProfileProvider repository={repository} clock={clock}>
      {children}
    </ProfileProvider>
  )

  return { store, repository, wrapper }
}

async function mount(seed?: Profile) {
  const context = setup(seed)
  const { result } = renderHook(() => useProfile(), { wrapper: context.wrapper })
  await waitFor(() => expect(result.current.status).not.toBe('loading'))
  return { ...context, result }
}

afterEach(() => {
  setProfileRepository(null)
  vi.restoreAllMocks()
})

describe('useProfile outside a provider', () => {
  it('throws a message that says what to do', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useProfile())).toThrow(/must be used inside a <ProfileProvider>/)
  })
})

describe('hydration', () => {
  it('starts as loading', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useProfile(), { wrapper })
    expect(result.current.status).toBe('loading')
    expect(result.current.profile).toBeNull()
    await waitFor(() => expect(result.current.status).toBe('empty'))
  })

  it('settles on empty when no profile has been created', async () => {
    const { result } = await mount()
    expect(result.current.status).toBe('empty')
    expect(result.current.profile).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.hasCompletedOnboarding).toBe(false)
  })

  it('settles on ready with the stored profile', async () => {
    const seed = createDefaultProfile(NOW)
    const { result } = await mount(seed)
    expect(result.current.status).toBe('ready')
    expect(result.current.profile).toEqual(seed)
  })

  it('reports an error when storage is unavailable', async () => {
    const context = setup()
    context.store.faults.failRead = storageError('denied')
    const { result } = renderHook(() => useProfile(), { wrapper: context.wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/blocking offline storage/i)
    expect(result.current.profile).toBeNull()
  })
})

describe('hasCompletedOnboarding', () => {
  it('is false until onboardingCompletedAt is stamped', async () => {
    const { result } = await mount(createDefaultProfile(NOW))
    expect(result.current.hasCompletedOnboarding).toBe(false)

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(result.current.hasCompletedOnboarding).toBe(true)
    expect(result.current.profile?.onboardingCompletedAt).toBe('2026-09-02T08:00:00.000Z')
  })
})

describe('updateProfile', () => {
  it('merges one level deep and leaves the rest of the group alone', async () => {
    const seed = {
      ...createDefaultProfile(NOW),
      goals: { primary: 'build-muscle', secondary: 'bigger-arms' },
    }
    const { result } = await mount(seed as Profile)

    await act(async () => {
      await result.current.updateProfile({ goals: { primary: 'get-stronger' } })
    })

    expect(result.current.profile?.goals).toEqual({ primary: 'get-stronger', secondary: 'bigger-arms' })
  })

  it('stamps updatedAt from the clock and never touches createdAt or id', async () => {
    const seed = createDefaultProfile(NOW)
    const { result } = await mount(seed)

    await act(async () => {
      await result.current.updateProfile({ units: 'metric' })
    })

    expect(result.current.profile?.updatedAt).toBe('2026-09-02T08:00:00.000Z')
    expect(result.current.profile?.createdAt).toBe(NOW)
    expect(result.current.profile?.id).toBe(PROFILE_ID)
    expect(result.current.profile?.schemaVersion).toBe(seed.schemaVersion)
  })

  it('persists through the verified save path', async () => {
    const { store, result } = await mount(createDefaultProfile(NOW))

    await act(async () => {
      await result.current.updateProfile({ restStyle: 'long' })
    })

    expect((store.snapshot()[PROFILE_ID] as Profile).restStyle).toBe('long')
  })

  it('replaces an array wholesale rather than merging it', async () => {
    const { result } = await mount(createDefaultProfile(NOW))

    await act(async () => {
      await result.current.updateProfile({
        schedule: { availableDays: ['wed'] },
      })
    })

    expect(result.current.profile?.schedule.availableDays).toEqual(['wed'])
    expect(result.current.profile?.schedule.sessionsPerWeek).toBe(4)
  })

  it('keeps unknown fields written by a future version', async () => {
    const seed = { ...createDefaultProfile(NOW), coachPersona: 'blunt' } as unknown as Profile
    const { result } = await mount(seed)

    await act(async () => {
      await result.current.updateProfile({ units: 'metric' })
    })

    expect((result.current.profile as unknown as Record<string, unknown>).coachPersona).toBe('blunt')
  })

  it('fails clearly when there is no profile yet', async () => {
    const { result } = await mount()

    let outcome: Awaited<ReturnType<typeof result.current.updateProfile>> | undefined
    await act(async () => {
      outcome = await result.current.updateProfile({ units: 'metric' })
    })

    expect(outcome?.ok).toBe(false)
    expect(result.current.error).toMatch(/no profile to update/i)
  })

  it('keeps the old profile in state and explains itself when the save cannot be verified', async () => {
    const seed = createDefaultProfile(NOW)
    const { store, result } = await mount(seed)
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      return writes === 1 ? { ...(value as Profile), experience: 'beginner' } : value
    }

    let outcome: Awaited<ReturnType<typeof result.current.updateProfile>> | undefined
    await act(async () => {
      outcome = await result.current.updateProfile({ experience: 'advanced' })
    })

    expect(outcome?.ok).toBe(false)
    expect(result.current.profile).toEqual(seed)
    expect(result.current.error).toContain('restored')
    expect(store.snapshot()[PROFILE_ID]).toEqual(seed)
  })
})

describe('replaceProfile', () => {
  it('swaps the whole record and restamps updatedAt', async () => {
    const { result } = await mount(createDefaultProfile(NOW))
    const next = { ...createDefaultProfile('2020-01-01T00:00:00.000Z'), experience: 'beginner' } as Profile

    await act(async () => {
      await result.current.replaceProfile(next)
    })

    expect(result.current.profile?.experience).toBe('beginner')
    expect(result.current.profile?.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(result.current.profile?.updatedAt).toBe('2026-09-02T08:00:00.000Z')
  })
})

describe('resetProfile', () => {
  it('returns to the documented defaults but keeps the original creation date', async () => {
    const seed = {
      ...createDefaultProfile(NOW),
      experience: 'advanced',
      units: 'metric',
      onboardingCompletedAt: NOW,
    } as Profile
    const { result } = await mount(seed)

    await act(async () => {
      await result.current.resetProfile()
    })

    expect(result.current.profile?.experience).toBe('intermediate')
    expect(result.current.profile?.units).toBe('imperial')
    expect(result.current.profile?.onboardingCompletedAt).toBeNull()
    expect(result.current.profile?.createdAt).toBe(NOW)
    expect(result.current.hasCompletedOnboarding).toBe(false)
  })
})

describe('ensureProfile', () => {
  it('creates the default profile when there is none', async () => {
    const { store, result } = await mount()

    await act(async () => {
      await result.current.ensureProfile()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.profile?.goals.primary).toBe('build-muscle')
    expect(store.records.has(PROFILE_ID)).toBe(true)
  })

  it('leaves an existing profile alone', async () => {
    const seed = { ...createDefaultProfile(NOW), experience: 'advanced' } as Profile
    const { result } = await mount(seed)

    await act(async () => {
      await result.current.ensureProfile()
    })

    expect(result.current.profile).toEqual(seed)
  })
})

describe('reload', () => {
  it('picks up a profile written behind the store, as an import does', async () => {
    const { store, result } = await mount()
    store.records.set(PROFILE_ID, createDefaultProfile(NOW))

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.profile?.id).toBe(PROFILE_ID)
  })
})

describe('applyProfilePatch', () => {
  const current = createDefaultProfile(NOW)
  const stamp = fixedClock('2026-09-03T00:00:00.000Z').now()

  it('is a no-op for an empty patch except for updatedAt', () => {
    expect(applyProfilePatch(current, {}, stamp)).toEqual({ ...current, updatedAt: stamp })
  })

  it('distinguishes an omitted field from an explicit null', () => {
    const withWeight = { ...current, bodyweight: { value: 80, unit: 'kg' } } as Profile
    expect(applyProfilePatch(withWeight, {}, stamp).bodyweight).toEqual({ value: 80, unit: 'kg' })
    expect(applyProfilePatch(withWeight, { bodyweight: null }, stamp).bodyweight).toBeNull()
  })

  it('treats an explicit null onboardingCompletedAt as a reset, not an omission', () => {
    const done = { ...current, onboardingCompletedAt: NOW } as Profile
    expect(applyProfilePatch(done, {}, stamp).onboardingCompletedAt).toBe(NOW)
    expect(applyProfilePatch(done, { onboardingCompletedAt: null }, stamp).onboardingCompletedAt).toBeNull()
  })
})

/**
 * A4 — "no profile" and "profile unreadable" are not the same thing.
 *
 * `profileRef` is null for both, so deciding from the ref alone made
 * `ensureProfile` write a fresh default over a record it merely could not read —
 * a corrupt one, or one written by a newer build. That is silent data loss for
 * exactly the user whose data most needs protecting, so both `ensureProfile` and
 * `resetProfile` now ask the repository and create only on a genuine `empty`.
 */
async function mountRaw(record: unknown) {
  const store: MemoryStore<Profile> = createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed: { [PROFILE_ID]: record },
  })
  const repository = createProfileRepository(store)
  const clock = steppingClock('2026-09-02T08:00:00.000Z', 60_000)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ProfileProvider repository={repository} clock={clock}>
      {children}
    </ProfileProvider>
  )
  const { result } = renderHook(() => useProfile(), { wrapper })
  await waitFor(() => expect(result.current.status).not.toBe('loading'))
  return { store, result }
}

/** A record from a build newer than this one: readable bytes, unreadable meaning. */
const FROM_A_FUTURE_BUILD = { id: PROFILE_ID, schemaVersion: 999, unknownField: 'keep me' }

/** A record this build should understand but cannot parse. */
const CORRUPT = { id: PROFILE_ID, schemaVersion: 1, goals: 'not an object' }

describe('ensureProfile — a record that exists but cannot be read', () => {
  it('refuses to write a default over a profile from a newer build', async () => {
    const { store, result } = await mountRaw(FROM_A_FUTURE_BUILD)
    expect(result.current.status).toBe('error')

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.ensureProfile()
    })

    expect(outcome?.ok).toBe(false)
    if (outcome && !outcome.ok) expect(outcome.reason).toBe('pre-read-failed')
    // The user's record is still byte-for-byte what it was.
    expect(store.records.get(PROFILE_ID)).toEqual(FROM_A_FUTURE_BUILD)
    expect(result.current.error).toMatch(/not replaced/i)
  })

  it('refuses to write a default over a corrupt profile', async () => {
    const { store, result } = await mountRaw(CORRUPT)

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.ensureProfile()
    })

    expect(outcome?.ok).toBe(false)
    expect(store.records.get(PROFILE_ID)).toEqual(CORRUPT)
  })

  it('refuses when storage itself cannot be read, rather than starting over', async () => {
    const { store, result } = await mountRaw(createDefaultProfile(NOW))
    store.faults.failRead = storageError('failed', null, 'Reading failed.')

    // Re-hydrate so the ref is null again — the exact state where the old code
    // could not tell "no profile" from "profile unreadable".
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.status).toBe('error')

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.ensureProfile()
    })

    expect(outcome?.ok).toBe(false)
    // Nothing was written on top of a record we could not even read.
    expect(store.records.get(PROFILE_ID)).toEqual(createDefaultProfile(NOW))
  })

  it('creates the default only when the repository genuinely reports empty', async () => {
    const { store, result } = await mount()
    expect(result.current.status).toBe('empty')

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.ensureProfile()
    })

    expect(outcome?.ok).toBe(true)
    expect(store.records.has(PROFILE_ID)).toBe(true)
    expect(result.current.status).toBe('ready')
  })

  it('returns a profile that appeared behind the store instead of overwriting it', async () => {
    const { store, result } = await mount()
    const appeared = { ...createDefaultProfile(NOW), experience: 'advanced' } as Profile
    store.records.set(PROFILE_ID, appeared)

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.ensureProfile()
    })

    expect(outcome?.ok).toBe(true)
    expect(result.current.profile?.experience).toBe('advanced')
    expect(store.records.get(PROFILE_ID)).toEqual(appeared)
  })
})

describe('resetProfile — a record that exists but cannot be read', () => {
  it('refuses rather than replacing an unreadable profile with defaults', async () => {
    const { store, result } = await mountRaw(FROM_A_FUTURE_BUILD)

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.resetProfile()
    })

    expect(outcome?.ok).toBe(false)
    if (outcome && !outcome.ok) expect(outcome.reason).toBe('pre-read-failed')
    expect(store.records.get(PROFILE_ID)).toEqual(FROM_A_FUTURE_BUILD)
    expect(result.current.error).toMatch(/not replaced/i)
  })

  it('still writes the defaults when there is genuinely nothing stored', async () => {
    const { store, result } = await mount()

    let outcome: SaveResult<Profile> | undefined
    await act(async () => {
      outcome = await result.current.resetProfile()
    })

    expect(outcome?.ok).toBe(true)
    expect(result.current.profile?.experience).toBe('intermediate')
    expect(store.records.has(PROFILE_ID)).toBe(true)
  })
})
