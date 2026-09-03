/**
 * Today's session: generated once, then RECALIBRATED.
 *
 * Changing the length does not regenerate from nothing — it goes through the
 * recalibration engine, which is the single owner of "what may change and what
 * may not". That matters even here, where nothing is logged yet: Phase 5 adds
 * logged sets to this same session, and a screen that quietly regenerated would
 * be the one path around the locking rules.
 *
 * THE DURATION CHOICE IS NOT PERSISTED. The plan is explicit that it is
 * remembered for the CURRENT workout only, unless the person changes their
 * default duration in Settings — so it lives in component state and resets on
 * reload, which is intended rather than an oversight.
 *
 * The catalog is a lazy chunk, so a session cannot exist until it arrives. That
 * is why this returns a status rather than a workout-or-null: "still loading"
 * and "nothing could be built" are different things and the screen says
 * different things about them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
// From the module, not the barrel: the barrel re-exports the picker and its
// helpers, which pull the exercise Zod schema onto the boot chunk. Today is the
// landing route, so that is first-paint weight for code it does not use.
import { useExerciseCatalog } from '../exercisePreferences/useExerciseCatalog'
import { activeLocation, type Profile } from '../../core/validation/schemas'
import type { DurationChoice, Workout } from '../../core/validation/workoutSchema'
import type { GenerateWorkout } from '../../engine/workoutGenerator/types'
import type {
  ChangeSummary,
  RecalibrationRequest,
  RecalibrationResult,
} from '../../engine/recalibration/types'

export type WorkoutStatus = 'loading' | 'ready' | 'none' | 'error'

type Recalibrate = (request: RecalibrationRequest) => RecalibrationResult

interface SessionEngine {
  readonly generate: GenerateWorkout
  readonly recalibrate: Recalibrate
}

export interface GeneratedSession {
  readonly status: WorkoutStatus
  readonly workout: Workout | null
  /** Set when nothing could be built — the honest reason, ready to show. */
  readonly message: string | null
  readonly choice: DurationChoice
  readonly setChoice: (choice: DurationChoice) => void
  /** True while a new choice is being applied, so the overlay can show. */
  readonly rebuilding: boolean
  /** Exercise names, once the catalog is here. Falls back to the id. */
  readonly nameOf: (exerciseId: string) => string | null
  /** What the last recalibration changed. Null before any. */
  readonly lastChange: ChangeSummary | null
  /** Set when a recalibration failed. The session is unchanged. */
  readonly recalibrationError: string | null
  readonly dismissError: () => void
}

/**
 * The generator and the recalibration engine ride the same lazy boundary as the
 * catalog they both need. Today is the landing route, so anything imported
 * statically here would land on the boot chunk.
 */
let loadedEngine: SessionEngine | null = null
let engineInFlight: Promise<SessionEngine> | null = null

function loadEngine(): Promise<SessionEngine> {
  if (loadedEngine) return Promise.resolve(loadedEngine)
  if (!engineInFlight) {
    engineInFlight = Promise.all([
      import('../../engine/workoutGenerator/generateWorkout'),
      import('../../engine/recalibration/recalibrate'),
    ])
      .then(([generator, recalibration]) => {
        const engine: SessionEngine = {
          generate: generator.generateWorkout,
          recalibrate: recalibration.recalibrate,
        }
        loadedEngine = engine
        engineInFlight = null
        return engine
      })
      .catch((error: unknown) => {
        engineInFlight = null
        throw error
      })
  }
  return engineInFlight
}

/** Test seam: drop the cached engine so a spec can start from cold. */
export function resetSessionEngineCache(): void {
  loadedEngine = null
  engineInFlight = null
}

/**
 * The day, as `YYYY-MM-DD`, in the viewer's own timezone.
 *
 * The engines read no clock on purpose; the date is supplied here, at the edge,
 * where a real calendar day actually means something.
 */
function today(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function useGeneratedWorkout(profile: Profile | null, now: Date = new Date()): GeneratedSession {
  const [choice, setChoiceState] = useState<DurationChoice>('default')
  const [rebuilding, setRebuilding] = useState(false)
  const [lastChange, setLastChange] = useState<ChangeSummary | null>(null)
  const [recalibrationError, setRecalibrationError] = useState<string | null>(null)
  const [current, setCurrent] = useState<Workout | null>(null)
  // Wrapped in a thunk: the engine holds functions, and `useState(fn)` would
  // call one as a lazy initialiser rather than storing it.
  const [engine, setEngine] = useState<SessionEngine | null>(() => loadedEngine)

  const { catalog, status: catalogStatus } = useExerciseCatalog(profile !== null)
  const forDate = today(now)

  useEffect(() => {
    if (profile === null || engine) return
    let cancelled = false
    loadEngine().then(
      (loaded) => {
        if (!cancelled) setEngine(() => loaded)
      },
      () => {
        /* The catalog's own error state already tells the user; do not double-report. */
      },
    )
    return () => {
      cancelled = true
    }
  }, [profile, engine])

  /** The session as first built, at the profile's own default length. */
  const base = useMemo(() => {
    if (!profile || !catalog || !engine) return null
    const place = activeLocation(profile)
    return engine.generate({
      profile,
      location: {
        id: place.id,
        name: place.name,
        suitability: place.kind === 'custom' ? null : place.kind,
      },
      equipment: place.equipment,
      availableTime: 'default',
      forDate,
      // Pinned to the day rather than the instant, so two renders of the same
      // day's session are identical rather than flickering.
      generatedAt: `${forDate}T00:00:00.000Z`,
      seed: `${profile.id}:${forDate}`,
      exercises: catalog.EXERCISES,
    })
  }, [profile, catalog, engine, forDate])

  // A newly generated base replaces whatever was on screen: a different profile
  // or a different day genuinely is a different session.
  useEffect(() => {
    if (!base || base.outcome !== 'generated') {
      setCurrent(null)
      return
    }
    setCurrent(base.workout)
    setChoiceState('default')
    setLastChange(null)
    setRecalibrationError(null)
  }, [base])

  const nameOf = useCallback((exerciseId: string) => catalog?.exerciseNameOf(exerciseId) ?? null, [catalog])

  const setChoice = useCallback(
    (next: DurationChoice) => {
      if (!profile || !catalog || !engine || !current || next === choice) return
      const place = activeLocation(profile)

      setRebuilding(true)
      setRecalibrationError(null)

      const result = engine.recalibrate({
        trigger: 'duration-changed',
        current,
        profile,
        requestedDuration: next,
        location: {
          id: place.id,
          name: place.name,
          suitability: place.kind === 'custom' ? null : place.kind,
        },
        equipment: place.equipment,
        exercises: catalog.EXERCISES,
        timestamp: `${forDate}T00:00:00.000Z`,
      })

      if (result.outcome === 'recalibrated') {
        setCurrent(result.workout)
        setLastChange(result.summary)
        setChoiceState(next)
      } else {
        // A failed recalibration leaves the session exactly as it was, and says
        // so. The engine hands back the previous workout for precisely this.
        setCurrent(result.restored)
        setRecalibrationError(result.message)
      }

      // The work is milliseconds. This is the brief transition the plan asks for
      // so a change registers as a change — not an artificial delay.
      setRebuilding(false)
    },
    [profile, catalog, engine, current, choice, forDate],
  )

  const dismissError = useCallback(() => setRecalibrationError(null), [])

  const shared = { choice, setChoice, nameOf, lastChange, recalibrationError, dismissError }

  if (!profile || catalogStatus === 'loading' || catalogStatus === 'idle') {
    return { status: 'loading', workout: null, message: null, rebuilding: false, ...shared }
  }
  if (catalogStatus === 'error') {
    return {
      status: 'error',
      workout: null,
      message: 'The exercise library could not be loaded. Check your connection and try again.',
      rebuilding: false,
      ...shared,
    }
  }
  if (!base) {
    return { status: 'loading', workout: null, message: null, rebuilding: false, ...shared }
  }
  if (base.outcome === 'none') {
    return { status: 'none', workout: null, message: base.message, rebuilding: false, ...shared }
  }
  if (!current) {
    return { status: 'loading', workout: null, message: null, rebuilding: false, ...shared }
  }
  return { status: 'ready', workout: current, message: null, rebuilding, ...shared }
}
