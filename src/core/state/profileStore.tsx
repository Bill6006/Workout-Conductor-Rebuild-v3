/* eslint-disable react-refresh/only-export-components -- a store module exports its provider and its hook together; splitting them would give the app two profile entry points. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getClock, type Clock } from '../time/clock'
import {
  createDefaultProfile,
  type Bodyweight,
  type Experience,
  type LocationProfile,
  type Profile,
  type RestStyle,
  type TrainingStyle,
  type Units,
} from '../validation/schemas'
import {
  getProfileRepository,
  type LoadProfileResult,
  type ProfileRepository,
} from '../storage/profileRepository'
import { describeSaveFailure, type SaveResult } from '../storage/verifiedSave'

/**
 * The ONE store for profile state.
 *
 * React lives here and nowhere below it: core/storage and core/validation are
 * plain modules, and this provider is the only bridge between them and the UI.
 * Every screen reads the profile through `useProfile()`; nothing else may hold
 * its own copy or write to storage directly.
 */

export type ProfileStatus = 'loading' | 'ready' | 'empty' | 'error'

/**
 * A patch is one level deep: nested groups are merged with what is already
 * stored, so `updateProfile({ goals: { primary: 'get-stronger' } })` keeps
 * `goals.secondary`. Arrays are replaced wholesale, never merged.
 *
 * `schemaVersion`, `id`, `createdAt`, and `updatedAt` are not patchable — the
 * store owns them.
 */
export interface ProfilePatch {
  goals?: Partial<Profile['goals']>
  experience?: Experience
  trainingStyle?: TrainingStyle
  schedule?: Partial<Profile['schedule']>
  techniques?: Partial<Profile['techniques']>
  restStyle?: RestStyle
  units?: Units
  bodyweight?: Bodyweight | null
  limitations?: Partial<Profile['limitations']>
  exercisePreferences?: Partial<Profile['exercisePreferences']>
  locations?: LocationProfile[]
  activeLocationId?: string
  onboardingCompletedAt?: string | null
}

export interface ProfileContextValue {
  readonly status: ProfileStatus
  /** Null while loading, and when no profile has been created yet. */
  readonly profile: Profile | null
  /** Readable message when `status` is `'error'`, or after a failed save. */
  readonly error: string | null
  /** True while a save is in flight, so controls can disable themselves. */
  readonly saving: boolean
  readonly hasCompletedOnboarding: boolean
  updateProfile(patch: ProfilePatch): Promise<SaveResult<Profile>>
  replaceProfile(next: Profile): Promise<SaveResult<Profile>>
  /** Back to the documented defaults, with onboarding marked incomplete. */
  resetProfile(): Promise<SaveResult<Profile>>
  /** Creates the default profile if none exists; returns the existing one otherwise. */
  ensureProfile(): Promise<SaveResult<Profile>>
  /** Stamps `onboardingCompletedAt` with the current time. */
  completeOnboarding(): Promise<SaveResult<Profile>>
  /** Re-reads from storage. Call after an import. */
  reload(): Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function mergeGroup<T extends object>(current: T, patch: Partial<T> | undefined): T {
  return patch ? { ...current, ...patch } : current
}

/** Applies a patch to a profile. Exported so tests and Phase 2 can reuse the exact rule. */
export function applyProfilePatch(current: Profile, patch: ProfilePatch, updatedAt: string): Profile {
  return {
    ...current,
    goals: mergeGroup(current.goals, patch.goals),
    experience: patch.experience ?? current.experience,
    trainingStyle: patch.trainingStyle ?? current.trainingStyle,
    schedule: mergeGroup(current.schedule, patch.schedule),
    techniques: mergeGroup(current.techniques, patch.techniques),
    restStyle: patch.restStyle ?? current.restStyle,
    units: patch.units ?? current.units,
    bodyweight: patch.bodyweight === undefined ? current.bodyweight : patch.bodyweight,
    limitations: mergeGroup(current.limitations, patch.limitations),
    exercisePreferences: mergeGroup(current.exercisePreferences, patch.exercisePreferences),
    locations: patch.locations ?? current.locations,
    activeLocationId: patch.activeLocationId ?? current.activeLocationId,
    onboardingCompletedAt:
      patch.onboardingCompletedAt === undefined ? current.onboardingCompletedAt : patch.onboardingCompletedAt,
    updatedAt,
  }
}

export interface ProfileProviderProps {
  children: ReactNode
  /** Injected in tests. Defaults to the app-wide IndexedDB repository. */
  repository?: ProfileRepository
  /** Injected in tests. Defaults to the app clock. */
  clock?: Clock
}

export function ProfileProvider({ children, repository, clock }: ProfileProviderProps) {
  const repo = useMemo(() => repository ?? getProfileRepository(), [repository])
  const now = useCallback(() => (clock ?? getClock()).now(), [clock])

  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Callbacks read the current profile from here so they stay referentially
  // stable — a changing `updateProfile` identity would re-run every consumer effect.
  const profileRef = useRef<Profile | null>(null)
  const commit = useCallback((next: Profile | null) => {
    profileRef.current = next
    setProfile(next)
  }, [])

  const receive = useCallback(
    (result: LoadProfileResult) => {
      if (result.status === 'ok') {
        commit(result.profile)
        setStatus('ready')
        setError(null)
        return
      }
      commit(null)
      if (result.status === 'empty') {
        setStatus('empty')
        setError(null)
        return
      }
      setStatus('error')
      setError(result.message)
    },
    [commit],
  )

  const reload = useCallback(async () => {
    setStatus('loading')
    receive(await repo.load())
  }, [repo, receive])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await repo.load()
      if (!cancelled) receive(result)
    })()
    return () => {
      cancelled = true
    }
  }, [repo, receive])

  const persist = useCallback(
    async (next: Profile): Promise<SaveResult<Profile>> => {
      setSaving(true)
      try {
        const result = await repo.save(next)
        if (result.ok) {
          commit(result.value)
          setStatus('ready')
          setError(null)
        } else {
          setError(describeSaveFailure(result))
        }
        return result
      } finally {
        setSaving(false)
      }
    },
    [repo, commit],
  )

  const noProfileFailure = useCallback((): SaveResult<Profile> => {
    const message = 'There is no profile to update yet. Finish onboarding first.'
    setError(message)
    return { ok: false, reason: 'write-failed', message, differences: [], issues: [], rollback: 'not-needed' }
  }, [])

  /**
   * A saved profile exists but this build cannot read it — corrupt, or written by
   * a newer schema version. Writing a fresh default over it would destroy the data
   * of exactly the user who most needs it kept, so we refuse and say why.
   */
  const refuseUnreadable = useCallback((detail: string): SaveResult<Profile> => {
    const message = `${detail} A saved profile is already there, so it was not replaced.`
    setError(message)
    return {
      ok: false,
      reason: 'pre-read-failed',
      message,
      differences: [],
      issues: [],
      rollback: 'not-needed',
    }
  }, [])

  /**
   * Re-reads before creating anything. `profileRef` is null both when there is no
   * record at all and when a record exists that could not be read, and only the
   * repository can tell those two apart.
   */
  const loadBeforeCreating = useCallback(async (): Promise<LoadProfileResult> => {
    const latest = await repo.load()
    receive(latest)
    return latest
  }, [repo, receive])

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      const current = profileRef.current
      if (!current) return noProfileFailure()
      return persist(applyProfilePatch(current, patch, now()))
    },
    [persist, now, noProfileFailure],
  )

  const replaceProfile = useCallback(
    async (next: Profile) => persist({ ...next, updatedAt: now() }),
    [persist, now],
  )

  const resetProfile = useCallback(async () => {
    const stamp = now()
    if (!profileRef.current) {
      const latest = await loadBeforeCreating()
      if (latest.status !== 'ok' && latest.status !== 'empty') {
        return refuseUnreadable(latest.message)
      }
    }
    const fresh = createDefaultProfile(stamp)
    // Keep the original creation date so "member since" survives a reset.
    const createdAt = profileRef.current?.createdAt ?? stamp
    return persist({ ...fresh, createdAt })
  }, [persist, now, loadBeforeCreating, refuseUnreadable])

  const ensureProfile = useCallback(async () => {
    const current = profileRef.current
    if (current) return { ok: true, value: current } as SaveResult<Profile>
    const latest = await loadBeforeCreating()
    if (latest.status === 'ok') return { ok: true, value: latest.profile } as SaveResult<Profile>
    if (latest.status !== 'empty') return refuseUnreadable(latest.message)
    return persist(createDefaultProfile(now()))
  }, [persist, now, loadBeforeCreating, refuseUnreadable])

  const completeOnboarding = useCallback(async () => {
    const current = profileRef.current
    if (!current) return noProfileFailure()
    return persist(applyProfilePatch(current, { onboardingCompletedAt: now() }, now()))
  }, [persist, now, noProfileFailure])

  const value = useMemo<ProfileContextValue>(
    () => ({
      status,
      profile,
      error,
      saving,
      hasCompletedOnboarding: profile?.onboardingCompletedAt != null,
      updateProfile,
      replaceProfile,
      resetProfile,
      ensureProfile,
      completeOnboarding,
      reload,
    }),
    [
      status,
      profile,
      error,
      saving,
      updateProfile,
      replaceProfile,
      resetProfile,
      ensureProfile,
      completeOnboarding,
      reload,
    ],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext)
  if (!value) {
    throw new Error('useProfile() must be used inside a <ProfileProvider>. Wrap the app shell in one.')
  }
  return value
}
