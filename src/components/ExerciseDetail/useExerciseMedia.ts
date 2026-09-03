import { useEffect, useMemo, useState } from 'react'
import type { MediaManifestEntry } from '../../catalog/media'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'

/**
 * THE ONLY WAY THIS COMPONENT REACHES THE MEDIA MANIFEST.
 *
 * `catalog/media/mediaManifest` is catalog-sized data, and its own test walks
 * `src/` to prove nothing names it in a `from` specifier — `import type` very
 * much included, because that check reads specifiers rather than bindings. So
 * the module is reached by a dynamic `import()` and nothing else.
 *
 * THE SHAPE IS DECLARED HERE AND CHECKED AGAINST THE REAL MODULE. `MediaRecord`
 * restates the two fields this component reads on top of the media schema's own
 * `MediaManifestEntry`, which is a type-only import and therefore erased. It is
 * not a copy that can drift: `loaded = module` below assigns the real module to
 * `MediaManifestApi`, so a changed signature or a dropped field fails to compile
 * here rather than rendering an empty frame at somebody.
 *
 * THE PROMISE IS SHARED AND THE RESULT IS KEPT, for the same reason
 * `useExerciseCatalog` does it: a person opening three exercises in one session
 * must not wait three times, and reopening the same sheet must not flash an
 * empty frame at somebody who has already waited once.
 */

/** What the manifest needs to know about an exercise. */
export interface MediaExerciseRef {
  readonly id: string
  readonly movementPattern: MovementPatternId
  readonly productionEnabled: boolean
}

/**
 * A manifest entry plus the fact the schema cannot carry: whether this is a
 * finished asset or a stand-in. Holding one means holding the answer.
 */
export interface MediaRecord {
  readonly entry: MediaManifestEntry
  readonly isPlaceholder: boolean
  /** The pattern whose shared poster is standing in; `null` for a real asset. */
  readonly placeholderPattern: MovementPatternId | null
}

/** The one function this component calls on the manifest module. */
interface MediaManifestApi {
  readonly mediaRecordFor: (ref: MediaExerciseRef) => MediaRecord
}

let loaded: MediaManifestApi | null = null
let inFlight: Promise<MediaManifestApi> | null = null

function loadMediaManifest(): Promise<MediaManifestApi> {
  if (loaded) return Promise.resolve(loaded)
  if (!inFlight) {
    inFlight = import('../../catalog/media/mediaManifest')
      .then((module) => {
        // The assignment is the contract check. Do not widen it.
        loaded = module
        inFlight = null
        return loaded
      })
      .catch((error: unknown) => {
        // Drop the rejected promise, or every later open replays this failure.
        inFlight = null
        throw error
      })
  }
  return inFlight
}

export type ExerciseMediaStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface ExerciseMediaState {
  readonly status: ExerciseMediaStatus
  /** Non-null exactly when `status` is `'ready'`. */
  readonly record: MediaRecord | null
}

/**
 * The media record for an exercise, or a status saying why there isn't one yet.
 * Pass `null` while the sheet is shut, so a closed sheet costs no chunk.
 */
export function useExerciseMedia(ref: MediaExerciseRef | null): ExerciseMediaState {
  const [manifest, setManifest] = useState<MediaManifestApi | null>(loaded)
  const [failed, setFailed] = useState(false)

  const active = ref !== null
  const id = ref?.id
  const movementPattern = ref?.movementPattern
  const productionEnabled = ref?.productionEnabled

  useEffect(() => {
    if (!active || manifest) return

    let cancelled = false
    loadMediaManifest().then(
      (next) => {
        if (!cancelled) setManifest(next)
      },
      () => {
        // The error itself is never shown: a failed chunk says "Loading chunk 12
        // failed", which tells a person nothing they can act on mid-set.
        if (!cancelled) setFailed(true)
      },
    )

    return () => {
      cancelled = true
    }
  }, [active, manifest])

  const record = useMemo(() => {
    if (!manifest || id === undefined || movementPattern === undefined || productionEnabled === undefined) {
      return null
    }
    return manifest.mediaRecordFor({ id, movementPattern, productionEnabled })
  }, [manifest, id, movementPattern, productionEnabled])

  const status: ExerciseMediaStatus = record ? 'ready' : !active ? 'idle' : failed ? 'unavailable' : 'loading'

  return { status, record }
}

/**
 * A manifest path (`media/posters/hinge.png`) as a URL this build can load.
 *
 * Manifest paths are repository-relative under the public root and the app is
 * served from a Pages subpath, so the base has to be prefixed. The result is
 * always same-origin — nothing here may ever reach a third party.
 */
export function mediaAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`
}

/** Test seam: forgets the cached module so a suite can exercise a fresh load. */
export function resetExerciseMediaCache(): void {
  loaded = null
  inFlight = null
}
