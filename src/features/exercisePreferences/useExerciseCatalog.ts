import { useCallback, useEffect, useState } from 'react'
/**
 * A TYPE-ONLY import, and it must stay one. `import type` is erased outright
 * under `verbatimModuleSyntax`, so this names the catalog's shape without
 * putting a single byte of it on this chunk. Dropping the `type` keyword would
 * make the picker's chunk swallow the whole catalog and nothing would look wrong
 * until somebody measured first paint.
 */
import type * as ExerciseCatalogModule from '../../catalog/exercises/catalog'

/**
 * THE ONE WAY THE UI GETS THE EXERCISE CATALOG.
 *
 * The catalog is the largest data in the product and it is not needed to open the
 * app, so it is reached through a dynamic `import()` and lands in a chunk of its
 * own. This hook is the only place in `src/features` that names that module, and
 * it deliberately exposes no eager path: a screen cannot accidentally acquire the
 * catalog by importing something innocent-looking from here.
 *
 * IT LOADS WHEN THE PICKER OPENS, not when the screen mounts. `active` is the
 * gate. Settings and setup both render their preference rows on arrival; the
 * chunk arrives on the tap that actually needs it.
 *
 * THE PROMISE IS SHARED AND THE RESULT IS KEPT. Two pickers on one screen, or one
 * picker opened twice, must not fetch twice or flash a loading state at somebody
 * who has already waited for it. A failed load clears the cache so that "Try
 * again" is a real retry rather than a replay of the same rejected promise.
 */

/** The catalog module's shape, taken from the module itself so it cannot drift. */
export type ExerciseCatalog = typeof ExerciseCatalogModule

let loaded: ExerciseCatalog | null = null
let inFlight: Promise<ExerciseCatalog> | null = null

function loadCatalog(): Promise<ExerciseCatalog> {
  if (loaded) return Promise.resolve(loaded)
  if (!inFlight) {
    inFlight = import('../../catalog/exercises/catalog')
      .then((module) => {
        loaded = module
        inFlight = null
        return module
      })
      .catch((error: unknown) => {
        // Drop the rejected promise, or every retry replays this same failure.
        inFlight = null
        throw error
      })
  }
  return inFlight
}

export type ExerciseCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ExerciseCatalogState {
  readonly status: ExerciseCatalogStatus
  /** Non-null exactly when `status` is `'ready'`. */
  readonly catalog: ExerciseCatalog | null
  retry: () => void
}

export function useExerciseCatalog(active: boolean): ExerciseCatalogState {
  // Already loaded once this session: start ready, so reopening the picker shows
  // the list immediately instead of a loading line that lasts one frame.
  const [catalog, setCatalog] = useState<ExerciseCatalog | null>(loaded)
  const [status, setStatus] = useState<ExerciseCatalogStatus>(loaded ? 'ready' : 'idle')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active || loaded) {
      if (loaded && status !== 'ready') {
        setCatalog(loaded)
        setStatus('ready')
      }
      return
    }

    let cancelled = false
    setStatus('loading')

    loadCatalog().then(
      (module) => {
        if (cancelled) return
        setCatalog(module)
        setStatus('ready')
      },
      () => {
        if (cancelled) return
        // The error itself is not shown: a chunk that failed to load says
        // "Loading chunk 42 failed", which tells a person nothing they can act on.
        setStatus('error')
      },
    )

    return () => {
      cancelled = true
    }
    // `status` is read above only to avoid a redundant set; it must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  return { status, catalog: status === 'ready' ? catalog : null, retry }
}

/** Test seam: forgets the cached module so a suite can exercise a fresh load. */
export function resetExerciseCatalogCache(): void {
  loaded = null
  inFlight = null
}
