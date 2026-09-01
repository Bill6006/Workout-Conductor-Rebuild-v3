import type { VerifiedStore } from './verifiedSave'
import type { Validator } from '../validation/validate'

/**
 * An in-memory `VerifiedStore`, behind exactly the same interface as the
 * IndexedDB one.
 *
 * WHY THIS EXISTS: jsdom has no IndexedDB, and `fake-indexeddb` is not a
 * dependency of this project and may not be added. So the storage layer is tested
 * against this store instead — it clones on the way in and on the way out, the way
 * structured clone does, and it can be told to corrupt, drop, or fail a write so
 * the `saveVerified` failure and rollback paths are exercised for real.
 *
 * It is a test double and a reference implementation. It is never wired into the
 * running app: a silent in-memory fallback would look like a working save and lose
 * the user's data at the end of the session.
 */

/** Return this from `onWrite` to make the store swallow the write silently. */
export const DROP_WRITE = Symbol('drop-write')

export interface MemoryStoreFaults {
  /** Rewrite the value on its way into storage — use to simulate silent corruption. */
  onWrite?: (key: string, value: unknown) => unknown | typeof DROP_WRITE
  /** Rewrite the value on its way out — use to simulate a corrupted read. */
  onRead?: (key: string, value: unknown) => unknown
  failRead?: Error | null
  failWrite?: Error | null
  failRemove?: Error | null
}

export interface MemoryStore<T> extends VerifiedStore<T> {
  /** Direct access to the backing records, for arranging and asserting in tests. */
  readonly records: Map<string, unknown>
  /** Mutable, so a test can arm a fault part-way through a scenario. */
  faults: MemoryStoreFaults
  /** Plain-object copy of everything held. */
  snapshot(): Record<string, unknown>
}

function clone<V>(value: V): V {
  if (value === undefined) return value
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as V
}

export function createMemoryStore<T>(options: {
  name: string
  keyOf: (value: T) => string
  validator: Validator<T>
  seed?: Record<string, unknown>
  faults?: MemoryStoreFaults
}): MemoryStore<T> {
  const records = new Map<string, unknown>(Object.entries(options.seed ?? {}).map(([k, v]) => [k, clone(v)]))

  const store: MemoryStore<T> = {
    name: options.name,
    keyOf: options.keyOf,
    validator: options.validator,
    records,
    faults: options.faults ?? {},
    snapshot() {
      return Object.fromEntries([...records.entries()].map(([k, v]) => [k, clone(v)]))
    },
    async read(key) {
      if (store.faults.failRead) throw store.faults.failRead
      const raw = records.get(key)
      const value = raw === undefined ? undefined : clone(raw)
      return store.faults.onRead ? store.faults.onRead(key, value) : value
    },
    async write(key, value) {
      if (store.faults.failWrite) throw store.faults.failWrite
      const next = store.faults.onWrite ? store.faults.onWrite(key, clone(value)) : clone(value)
      if (next === DROP_WRITE) return
      records.set(key, next)
    },
    async remove(key) {
      if (store.faults.failRemove) throw store.faults.failRemove
      records.delete(key)
    },
  }

  return store
}
