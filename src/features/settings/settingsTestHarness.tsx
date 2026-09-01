import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileProvider } from '../../core/state'
import { createMemoryStore, type MemoryStore } from '../../core/storage/memoryStore'
import { createProfileRepository } from '../../core/storage/profileRepository'
import { fixedClock } from '../../core/time/clock'
import { profileValidator } from '../../core/validation/validate'
import { PROFILE_ID, createDefaultProfile, type Profile } from '../../core/validation/schemas'
import { SettingsScreen } from './SettingsScreen'

/**
 * Shared arrangement for the settings tests.
 *
 * jsdom has no IndexedDB, so the screen runs against `createMemoryStore` behind
 * the same `VerifiedStore` interface the real repository uses. That keeps the
 * whole save path — write, read back, revalidate, compare, roll back — under
 * test, and lets a test arm a silent write failure the way storage really fails.
 */

export const CREATED_AT = '2026-08-01T09:00:00.000Z'
export const SAVE_AT = '2026-09-01T12:00:00.000Z'

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return { ...createDefaultProfile(CREATED_AT), onboardingCompletedAt: CREATED_AT, ...overrides }
}

export function makeStore(profile: Profile | null): MemoryStore<Profile> {
  return createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed: profile ? { [PROFILE_ID]: profile } : {},
  })
}

export interface SettingsHarness extends RenderResult {
  store: MemoryStore<Profile>
  /** The profile as it currently sits in storage — the only honest assertion target. */
  stored(): Profile | null
}

export function renderSettings(
  profile: Profile | null = makeProfile(),
  /** Armed before the first load, for the states only a broken store produces. */
  faults: MemoryStore<Profile>['faults'] = {},
): SettingsHarness {
  const store = makeStore(profile)
  store.faults = faults
  const repository = createProfileRepository(store)

  const result = render(
    <MemoryRouter initialEntries={['/settings']}>
      <ProfileProvider repository={repository} clock={fixedClock(SAVE_AT)}>
        <SettingsScreen />
      </ProfileProvider>
    </MemoryRouter>,
  )

  return {
    ...result,
    store,
    stored: () => (store.records.get(PROFILE_ID) as Profile | undefined) ?? null,
  }
}
