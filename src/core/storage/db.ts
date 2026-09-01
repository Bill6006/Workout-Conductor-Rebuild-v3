import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Validator } from '../validation/validate'
import type { VerifiedStore } from './verifiedSave'

/**
 * IndexedDB — the durable store for anything that is the user's own data.
 *
 * Small settings live in localStorage (see settings.ts). Everything durable —
 * the profile now, workouts and set history from Phase 3 — lives here.
 */

export const DB_NAME = 'workout-conductor'
export const DB_VERSION = 1

export const PROFILE_STORE = 'profile'
export const META_STORE = 'meta'

export interface ProfileRecord {
  id: string
  [key: string]: unknown
}

export interface MetaRecord {
  key: string
  value: unknown
}

export interface WorkoutConductorDB extends DBSchema {
  /** Exactly one row, keyed `'primary'`. */
  profile: { key: string; value: ProfileRecord }
  /** Small durable bookkeeping: last backup time, last migration run, and so on. */
  meta: { key: string; value: MetaRecord }
}

export type StorageErrorCode =
  /** The browser has no IndexedDB at all (very old browser, or a stripped-down webview). */
  | 'unsupported'
  /** Present but refused: private mode, blocked site data, or a denied storage permission. */
  | 'denied'
  /** Another tab is holding an older version open and will not let the upgrade run. */
  | 'blocked'
  /** Opened but a read or write failed — quota, corruption, or an aborted transaction. */
  | 'failed'

/** A typed storage error, so callers can render a real explanation instead of a stack trace. */
export class StorageError extends Error {
  readonly code: StorageErrorCode

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StorageError'
    this.code = code
  }

  static is(value: unknown): value is StorageError {
    return value instanceof StorageError
  }
}

const MESSAGES: Record<StorageErrorCode, string> = {
  unsupported: 'This browser does not support offline storage, so your data cannot be saved on this device.',
  denied: 'This browser is blocking offline storage. Private browsing and blocked site data both do this.',
  blocked: 'Another open tab is using an older version of the app. Close it and reload.',
  failed: 'Offline storage is available but the operation failed.',
}

export function storageError(code: StorageErrorCode, cause?: unknown, detail?: string): StorageError {
  const message = detail ? `${MESSAGES[code]} ${detail}` : MESSAGES[code]
  return new StorageError(code, message, { cause })
}

/** Cheap, synchronous availability probe. A `true` here still does not guarantee a successful open. */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null
  } catch {
    // Some hardened browsers throw on merely touching the property.
    return false
  }
}

let dbPromise: Promise<IDBPDatabase<WorkoutConductorDB>> | null = null

/**
 * Opens (and caches) the app database.
 *
 * Rejects with a `StorageError` — never a raw DOMException — so every caller has
 * one error type to branch on.
 */
export function openAppDatabase(): Promise<IDBPDatabase<WorkoutConductorDB>> {
  if (dbPromise) return dbPromise

  if (!isIndexedDbAvailable()) {
    return Promise.reject(storageError('unsupported'))
  }

  // `blocked` fires when another tab holds an older version open. Without this the
  // open promise stays pending forever and the app hangs on hydrate with no
  // explanation, so the blocked event gets its own rejection to race the open.
  let rejectAsBlocked: (error: unknown) => void = () => {}
  let wasBlocked = false
  const blockedSignal = new Promise<never>((_, reject) => {
    rejectAsBlocked = reject
  })

  const opening = openDB<WorkoutConductorDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Version 1 — the Phase 1 baseline.
      if (oldVersion < 1) {
        db.createObjectStore(PROFILE_STORE, { keyPath: 'id' })
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }

      // Phase 3+ extends here. Bump DB_VERSION, then add a new guarded block — the
      // blocks are cumulative, so a user on version 1 runs every later block in turn:
      //
      // if (oldVersion < 2) {
      //   const workouts = db.createObjectStore('workouts', { keyPath: 'id' })
      //   workouts.createIndex('by-date', 'date')
      //   const sets = db.createObjectStore('sets', { keyPath: 'id' })
      //   sets.createIndex('by-workout', 'workoutId')
      // }
      //
      // Never delete or re-key an existing store in an upgrade: that is a user's
      // training history. Add a store, or migrate its records in place.
    },
    blocked() {
      // Another tab holds an older version open. Give the caller a typed error it
      // can render instead of an open promise that never settles.
      wasBlocked = true
      rejectAsBlocked(storageError('blocked'))
    },
    terminated() {
      // The browser closed the connection unexpectedly; drop the cache so the next
      // call reopens instead of reusing a dead handle.
      dbPromise = null
    },
  })

  // If the other tab closes later, the open still succeeds — but nobody is waiting
  // for it any more, and an unclosed connection would block the next upgrade in
  // turn. Close it, and swallow a late rejection that the race has already reported.
  void opening.then(
    (db) => {
      if (wasBlocked) db.close()
    },
    () => {},
  )

  dbPromise = Promise.race([opening, blockedSignal]).catch((error: unknown) => {
    // Cleared on every failure, blocked included, so a retry after the other tab
    // closes opens fresh rather than replaying the cached rejection forever.
    dbPromise = null
    if (StorageError.is(error)) throw error
    const name = error instanceof Error ? error.name : ''
    if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'UnknownError') {
      throw storageError('denied', error)
    }
    throw storageError('failed', error, 'The database could not be opened.')
  })

  return dbPromise
}

/** Closes and forgets the cached connection. Used by tests and by a full data reset. */
export async function closeAppDatabase(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (!pending) return
  try {
    const db = await pending
    db.close()
  } catch {
    // Already closed or never opened; nothing to release.
  }
}

type AppStoreName = typeof PROFILE_STORE | typeof META_STORE

/**
 * An IndexedDB-backed `VerifiedStore`. This is the only place the app talks to a
 * raw object store, so every durable write goes through `saveVerified`.
 */
export function createIdbStore<T>(options: {
  name: AppStoreName
  keyOf: (value: T) => string
  validator: Validator<T>
}): VerifiedStore<T> {
  const { name, keyOf, validator } = options

  return {
    name,
    keyOf,
    validator,
    async read(key) {
      const db = await openAppDatabase()
      try {
        return await db.get(name, key)
      } catch (error) {
        throw storageError('failed', error, `Reading "${key}" from ${name} failed.`)
      }
    },
    async write(key, value) {
      const db = await openAppDatabase()
      try {
        // Both stores use an in-record key path, so `put` needs no explicit key;
        // `key` is still taken so the interface reads the same for keyless stores.
        void key
        await db.put(name, value as never)
      } catch (error) {
        throw storageError('failed', error, `Writing "${key}" to ${name} failed.`)
      }
    },
    async remove(key) {
      const db = await openAppDatabase()
      try {
        await db.delete(name, key)
      } catch (error) {
        throw storageError('failed', error, `Deleting "${key}" from ${name} failed.`)
      }
    },
  }
}
