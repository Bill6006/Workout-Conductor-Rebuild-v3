/**
 * The workout you are in the middle of.
 *
 * Pause and resume are not features here so much as the absence of a bug: the
 * session is written to IndexedDB after every logged set, through the same
 * verified save path as everything else, so closing the app mid-session and
 * coming back is simply loading what is there. There is no separate "paused"
 * state to get out of sync.
 *
 * All the rules about what may be written live in `core/state/activeSession`.
 * This hook is the bridge between those pure functions and the screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  entryProgress,
  findEntry,
  isComplete,
  loggedVolume,
  logSet as applyLog,
  editRecord as applyEdit,
  nextPosition,
  skipSet as applySkip,
  undoLastSet,
  workingSetCount,
  type LoggedSet,
  type SessionPosition,
} from '../../core/state/activeSession'
import { readSetting, removeSetting, writeSetting } from '../../core/storage/settings'
import { getWorkoutRepository } from '../../core/storage/workoutRepository'
import { nowIso } from '../../core/time/clock'
import type { Workout } from '../../core/validation/workoutSchema'

/**
 * The id of the session in progress lives in localStorage, which the plan
 * reserves for exactly this: small settings and ACTIVE-SESSION METADATA. The
 * session itself is durable data and lives in IndexedDB.
 */
const ACTIVE_ID_SETTING = 'activeSessionId'

export type ActiveSessionStatus = 'idle' | 'loading' | 'active' | 'finished' | 'error'

export interface ActiveSession {
  readonly status: ActiveSessionStatus
  readonly workout: Workout | null
  readonly position: SessionPosition | null
  readonly error: string | null
  readonly saving: boolean
  /** Working sets logged versus programmed. Warm-ups excluded, as everywhere else. */
  readonly progress: { readonly logged: number; readonly total: number }
  readonly volume: number
  readonly start: (workout: Workout) => Promise<void>
  readonly log: (entryId: string, setId: string, values: LoggedSet) => Promise<void>
  readonly edit: (entryId: string, setId: string, patch: Partial<LoggedSet>) => Promise<void>
  readonly skip: (entryId: string, setId: string) => Promise<void>
  readonly undo: () => Promise<void>
  readonly replaceWorkout: (workout: Workout) => Promise<void>
  readonly end: () => Promise<void>
  readonly progressOf: (entryId: string) => ReturnType<typeof entryProgress> | null
}

export function useActiveSession(): ActiveSession {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [status, setStatus] = useState<ActiveSessionStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Resume on mount: an id in settings means a session was under way.
  useEffect(() => {
    let cancelled = false
    const id = readSetting<string | null>(ACTIVE_ID_SETTING, null)
    if (!id) {
      setStatus('idle')
      return
    }

    getWorkoutRepository()
      .load(id)
      .then((result) => {
        if (cancelled) return
        if (result.status === 'ok') {
          setWorkout(result.record.workout)
          setStatus(isComplete(result.record.workout) ? 'finished' : 'active')
        } else {
          // The id points at nothing usable. Clear it rather than leaving the
          // app permanently trying to resume a session that is not there.
          removeSetting(ACTIVE_ID_SETTING)
          setStatus('idle')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
          setError('The session in progress could not be read on this device.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  /** Every write goes through here, so nothing can change the session without persisting it. */
  const persist = useCallback(async (next: Workout) => {
    setWorkout(next)
    setSaving(true)
    try {
      const result = await getWorkoutRepository().saveWorkout(next, nowIso())
      if (!result.ok) {
        // The save path already restored what it could; say so rather than
        // letting the screen imply the set is safely recorded.
        setError('That set could not be saved on this device. It is still on screen — try again.')
      } else {
        setError(null)
      }
    } catch {
      setError('That set could not be saved on this device. It is still on screen — try again.')
    } finally {
      setSaving(false)
    }
  }, [])

  const start = useCallback(
    async (next: Workout) => {
      writeSetting(ACTIVE_ID_SETTING, next.id)
      setStatus('active')
      await persist(next)
    },
    [persist],
  )

  const mutate = useCallback(
    async (change: (current: Workout) => Workout) => {
      if (!workout) return
      const next = change(workout)
      await persist(next)
      if (isComplete(next)) setStatus('finished')
    },
    [workout, persist],
  )

  const log = useCallback(
    (entryId: string, setId: string, values: LoggedSet) =>
      mutate((current) => applyLog(current, entryId, setId, values, nowIso())),
    [mutate],
  )

  const edit = useCallback(
    (entryId: string, setId: string, patch: Partial<LoggedSet>) =>
      mutate((current) => applyEdit(current, entryId, setId, patch, nowIso())),
    [mutate],
  )

  const skip = useCallback(
    (entryId: string, setId: string) => mutate((current) => applySkip(current, entryId, setId, nowIso())),
    [mutate],
  )

  const undo = useCallback(async () => {
    if (!workout) return
    const result = undoLastSet(workout)
    if (!result.undone) return
    await persist(result.workout)
    setStatus('active')
  }, [workout, persist])

  /** Used after a recalibration: the engine returns a whole new session. */
  const replaceWorkout = useCallback(
    async (next: Workout) => {
      await persist(next)
      setStatus(isComplete(next) ? 'finished' : 'active')
    },
    [persist],
  )

  const end = useCallback(async () => {
    removeSetting(ACTIVE_ID_SETTING)
    setWorkout(null)
    setStatus('idle')
  }, [])

  const position = useMemo(() => (workout ? nextPosition(workout) : null), [workout])
  const progress = useMemo(() => (workout ? workingSetCount(workout) : { logged: 0, total: 0 }), [workout])
  const volume = useMemo(() => (workout ? loggedVolume(workout) : 0), [workout])

  const progressOf = useCallback(
    (entryId: string) => {
      if (!workout) return null
      const entry = findEntry(workout, entryId)
      return entry ? entryProgress(entry) : null
    },
    [workout],
  )

  return {
    status,
    workout,
    position,
    error,
    saving,
    progress,
    volume,
    start,
    log,
    edit,
    skip,
    undo,
    replaceWorkout,
    end,
    progressOf,
  }
}
