import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryStore } from './memoryStore'
import {
  createProfileRepository,
  getProfileRepository,
  setProfileRepository,
  type ProfileRepository,
} from './profileRepository'
import { storageError } from './db'
import { PROFILE_ID, createDefaultProfile, type Profile } from '../validation/schemas'
import { profileValidator } from '../validation/validate'

/**
 * Backed by the in-memory `VerifiedStore` — jsdom has no IndexedDB and
 * `fake-indexeddb` is not a dependency of this project.
 */

const NOW = '2026-09-01T12:00:00.000Z'

function makeStore(seed?: Record<string, unknown>) {
  return createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed,
  })
}

function makeRepository(seed?: Record<string, unknown>) {
  const store = makeStore(seed)
  return { store, repository: createProfileRepository(store) }
}

afterEach(() => {
  setProfileRepository(null)
})

describe('load', () => {
  it('reports empty when nothing has been saved', async () => {
    const { repository } = makeRepository()
    expect(await repository.load()).toEqual({ status: 'empty' })
  })

  it('returns a saved profile', async () => {
    const profile = createDefaultProfile(NOW)
    const { repository } = makeRepository({ [PROFILE_ID]: profile })

    const result = await repository.load()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.profile).toEqual(profile)
    expect(result.migrated).toEqual([])
  })

  it('keeps fields written by a future version of the app', async () => {
    const stored = { ...createDefaultProfile(NOW), coachPersona: 'blunt' }
    const { repository } = makeRepository({ [PROFILE_ID]: stored })

    const result = await repository.load()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect((result.profile as unknown as Record<string, unknown>).coachPersona).toBe('blunt')
  })

  it('reports a record it cannot make sense of, without throwing', async () => {
    const { repository } = makeRepository({ [PROFILE_ID]: { id: PROFILE_ID, schemaVersion: 1 } })

    const result = await repository.load()
    expect(result.status).toBe('invalid')
    if (result.status !== 'invalid') return
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.raw).toBeDefined()
  })

  it('reports a record from a newer build as invalid rather than parsing it', async () => {
    const stored = { ...createDefaultProfile(NOW), schemaVersion: 99 }
    const { repository } = makeRepository({ [PROFILE_ID]: stored })

    const result = await repository.load()
    expect(result.status).toBe('invalid')
    if (result.status !== 'invalid') return
    expect(result.message).toContain('99')
  })

  it('surfaces a storage failure as unavailable, with its code', async () => {
    const { store, repository } = makeRepository()
    store.faults.failRead = storageError('denied')

    const result = await repository.load()
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.code).toBe('denied')
    expect(result.message).toMatch(/blocking offline storage/i)
  })

  it('surfaces an untyped throw as unavailable too', async () => {
    const { store, repository } = makeRepository()
    store.faults.failRead = new Error('something odd')

    const result = await repository.load()
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.code).toBe('failed')
  })
})

describe('save', () => {
  it('writes through the verified path and reads back what it wrote', async () => {
    const { store, repository } = makeRepository()
    const profile = createDefaultProfile(NOW)

    const result = await repository.save(profile)
    expect(result.ok).toBe(true)
    expect(store.snapshot()[PROFILE_ID]).toEqual(profile)
  })

  it('refuses to report success when the store corrupts the record', async () => {
    const { store, repository } = makeRepository()
    store.faults.onWrite = (_key, value) => ({
      ...(value as Profile),
      experience: 'beginner',
    })

    const result = await repository.save(createDefaultProfile(NOW))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-mismatch')
    expect(result.differences[0].path).toBe('experience')
  })

  it('round-trips unknown fields untouched', async () => {
    const { repository } = makeRepository()
    const profile = { ...createDefaultProfile(NOW), coachPersona: 'blunt' } as unknown as Profile

    expect((await repository.save(profile)).ok).toBe(true)

    const loaded = await repository.load()
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect((loaded.profile as unknown as Record<string, unknown>).coachPersona).toBe('blunt')
  })
})

describe('clear', () => {
  it('removes the profile so onboarding starts clean', async () => {
    const { repository } = makeRepository({ [PROFILE_ID]: createDefaultProfile(NOW) })
    await repository.clear()
    expect(await repository.load()).toEqual({ status: 'empty' })
  })
})

describe('the app-wide repository', () => {
  it('can be swapped for a test double and put back', () => {
    const fake = {} as ProfileRepository
    setProfileRepository(fake)
    expect(getProfileRepository()).toBe(fake)

    setProfileRepository(null)
    expect(getProfileRepository()).not.toBe(fake)
  })

  it('returns the same instance on repeated calls', () => {
    setProfileRepository(null)
    expect(getProfileRepository()).toBe(getProfileRepository())
  })
})
