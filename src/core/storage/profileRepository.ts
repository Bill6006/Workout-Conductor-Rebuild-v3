import { createIdbStore, PROFILE_STORE, StorageError, type StorageErrorCode } from './db'
import { migrateProfileRecord } from './migrations'
import { saveVerified, type SaveResult, type VerifiedStore } from './verifiedSave'
import { profileValidator, type ValidationIssue } from '../validation/validate'
import { PROFILE_ID, type Profile } from '../validation/schemas'

/**
 * The one profile persistence path.
 *
 * Both the React store and the backup importer go through here, so there is
 * exactly one place that reads a profile (raw → migrate → validate) and exactly
 * one place that writes one (always via `saveVerified`). Do not add a second.
 */

export type LoadProfileResult =
  | { readonly status: 'ok'; readonly profile: Profile; readonly migrated: string[] }
  /** Storage works, there is simply no profile yet — onboarding has not run. */
  | { readonly status: 'empty' }
  | {
      readonly status: 'invalid'
      readonly message: string
      readonly issues: ValidationIssue[]
      /** Kept so a future repair screen can show the user what was found. */
      readonly raw: unknown
    }
  | { readonly status: 'unavailable'; readonly message: string; readonly code: StorageErrorCode }

export interface ProfileRepository {
  load(): Promise<LoadProfileResult>
  save(profile: Profile): Promise<SaveResult<Profile>>
  /** Removes the stored profile. Used by a full reset; onboarding then starts clean. */
  clear(): Promise<void>
}

export function createProfileRepository(store: VerifiedStore<Profile>): ProfileRepository {
  return {
    async load() {
      let raw: unknown
      try {
        raw = await store.read(PROFILE_ID)
      } catch (error) {
        if (StorageError.is(error)) {
          return { status: 'unavailable', message: error.message, code: error.code }
        }
        return {
          status: 'unavailable',
          message: error instanceof Error ? error.message : String(error),
          code: 'failed',
        }
      }

      if (raw === undefined || raw === null) return { status: 'empty' }

      const migrated = migrateProfileRecord(raw)
      if (!migrated.ok) {
        return { status: 'invalid', message: migrated.message, issues: [], raw }
      }

      const validated = profileValidator.validate(migrated.value)
      if (!validated.ok) {
        return {
          status: 'invalid',
          message: 'The saved profile does not match the shape this build expects.',
          issues: validated.issues,
          raw,
        }
      }

      return { status: 'ok', profile: validated.value, migrated: migrated.applied }
    },

    async save(profile) {
      return saveVerified(store, profile)
    },

    async clear() {
      await store.remove(PROFILE_ID)
    },
  }
}

/** The IndexedDB-backed store for the single profile record. */
export function createProfileStore(): VerifiedStore<Profile> {
  return createIdbStore<Profile>({
    name: PROFILE_STORE,
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
  })
}

let repository: ProfileRepository | null = null

/** The app-wide repository, created lazily so nothing opens IndexedDB at import time. */
export function getProfileRepository(): ProfileRepository {
  repository ??= createProfileRepository(createProfileStore())
  return repository
}

/** Test seam. Passing `null` restores the IndexedDB-backed repository. */
export function setProfileRepository(next: ProfileRepository | null): void {
  repository = next
}
