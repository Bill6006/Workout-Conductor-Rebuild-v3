/**
 * Today's session: generate it from the profile and the chosen length.
 *
 * THE DURATION CHOICE IS NOT PERSISTED. The plan is explicit that it is
 * remembered for the CURRENT workout only, unless the person changes their
 * default duration in Settings — so it lives in component state and resets on
 * reload, which is exactly the intended behaviour rather than an oversight.
 *
 * The catalog is a lazy chunk, so a session cannot exist until it arrives. That
 * is why this returns a status rather than a workout-or-null: "still loading the
 * catalog" and "nothing could be built" are different things and the screen says
 * different things about them.
 */
import { useEffect, useMemo, useState } from 'react'
// From the module, not the barrel: the barrel re-exports the picker and its
// helpers, which pull the exercise Zod schema onto the boot chunk. Today is the
// landing route, so that is first-paint weight for code it does not use.
import { useExerciseCatalog } from '../exercisePreferences/useExerciseCatalog'
import { activeLocation, type Profile } from '../../core/validation/schemas'
import type { DurationChoice, Workout } from '../../core/validation/workoutSchema'
import type { GenerateWorkout, GenerateWorkoutResult } from '../../engine/workoutGenerator/types'

/**
 * The generator rides the same lazy boundary as the catalog it needs.
 *
 * Today is the landing route, so anything it imports statically lands on the
 * boot chunk — and the engine cannot do anything until the catalog arrives
 * anyway. Loading them together costs nothing and keeps first paint at the size
 * it was before the engine existed.
 */
let loadedEngine: GenerateWorkout | null = null
let engineInFlight: Promise<GenerateWorkout> | null = null

function loadEngine(): Promise<GenerateWorkout> {
  if (loadedEngine) return Promise.resolve(loadedEngine)
  if (!engineInFlight) {
    engineInFlight = import('../../engine/workoutGenerator/generateWorkout')
      .then((module) => {
        loadedEngine = module.generateWorkout
        engineInFlight = null
        return module.generateWorkout
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

export type WorkoutStatus = 'loading' | 'ready' | 'none' | 'error'

export interface GeneratedSession {
  readonly status: WorkoutStatus
  readonly workout: Workout | null
  /** Set when nothing could be built — the honest reason, ready to show. */
  readonly message: string | null
  readonly choice: DurationChoice
  readonly setChoice: (choice: DurationChoice) => void
  /** True while a new choice is being built, so the card can say so. */
  readonly rebuilding: boolean
  /** Exercise names, once the catalog is here. Falls back to the id. */
  readonly nameOf: (exerciseId: string) => string | null
}

/**
 * The day, as `YYYY-MM-DD`, in the viewer's own timezone.
 *
 * The generator reads no clock on purpose; the date is supplied here, at the
 * edge, where a real calendar day actually means something.
 */
function today(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function useGeneratedWorkout(profile: Profile | null, now: Date = new Date()): GeneratedSession {
  const [choice, setChoice] = useState<DurationChoice>('default')
  const [rebuilding, setRebuilding] = useState(false)

  // Today needs the catalog, so unlike the preference picker it asks for it as
  // soon as there is a profile to build a session for.
  const { catalog, status: catalogStatus } = useExerciseCatalog(profile !== null)
  // Wrapped in a thunk: the engine IS a function, and `useState(fn)` would call
  // it as a lazy initialiser rather than storing it.
  const [engine, setEngine] = useState<GenerateWorkout | null>(() => loadedEngine)

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

  const forDate = today(now)

  const result = useMemo<GenerateWorkoutResult | null>(() => {
    if (!profile || !catalog || !engine) return null
    const place = activeLocation(profile)
    return engine({
      profile,
      location: {
        id: place.id,
        name: place.name,
        suitability: place.kind === 'custom' ? null : place.kind,
      },
      equipment: place.equipment,
      availableTime: choice,
      forDate,
      // Regenerating on every render would be wasteful and would also make the
      // session flicker, so the timestamp is pinned to the day rather than the
      // instant. Two generations of the same day's session are identical.
      generatedAt: `${forDate}T00:00:00.000Z`,
      seed: `${profile.id}:${forDate}`,
      exercises: catalog.EXERCISES,
    })
  }, [profile, catalog, engine, choice, forDate])

  // A rebuild is near-instant, but the change should still register as a change
  // rather than the card silently becoming different. Phase 4 replaces this with
  // the real calibration overlay.
  useEffect(() => {
    if (!result) return
    setRebuilding(true)
    const timer = setTimeout(() => setRebuilding(false), 180)
    return () => clearTimeout(timer)
  }, [result])

  const nameOf = (exerciseId: string) => catalog?.exerciseNameOf(exerciseId) ?? null

  if (!profile || catalogStatus === 'loading' || catalogStatus === 'idle') {
    return { status: 'loading', workout: null, message: null, choice, setChoice, rebuilding: false, nameOf }
  }
  if (catalogStatus === 'error') {
    return {
      status: 'error',
      workout: null,
      message: 'The exercise library could not be loaded. Check your connection and try again.',
      choice,
      setChoice,
      rebuilding: false,
      nameOf,
    }
  }
  if (!result) {
    return { status: 'loading', workout: null, message: null, choice, setChoice, rebuilding: false, nameOf }
  }
  if (result.outcome === 'none') {
    return {
      status: 'none',
      workout: null,
      message: result.message,
      choice,
      setChoice,
      rebuilding: false,
      nameOf,
    }
  }
  return { status: 'ready', workout: result.workout, message: null, choice, setChoice, rebuilding, nameOf }
}
