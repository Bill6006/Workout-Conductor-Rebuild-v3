import type { ValidationIssue, Validator } from '../validation/validate'

/**
 * The critical-save contract.
 *
 * A write is only ever reported as successful once the value has been read back
 * out of storage, revalidated, and deep-compared to what was written. Anything
 * short of that restores the previous record — and that restore is verified the
 * same way — and returns a typed failure. There is no thrown-exception path for
 * the normal failure modes: callers branch on `ok`.
 *
 * Why this exists: IndexedDB writes can be silently dropped (quota, a closing tab,
 * a browser evicting storage under pressure). "The promise resolved" is not proof
 * the bytes landed, and a user's profile is the one record we cannot lose. The
 * same reasoning applies to the rollback write: an unchecked write proves nothing,
 * so a rollback that cannot be confirmed is reported as unconfirmed, never as
 * restored.
 */

/** The narrow storage slice `saveVerified` needs. Deliberately free of Zod and of idb. */
export interface VerifiedStore<T> {
  /** Human-readable name used in failure messages, e.g. `'profile'`. */
  readonly name: string
  keyOf(value: T): string
  readonly validator: Validator<T>
  read(key: string): Promise<unknown>
  /** Takes `unknown` so rollback can put the previous raw record back unchanged. */
  write(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export type SaveFailureReason =
  /** The value did not validate, so nothing was read and nothing was written. */
  | 'pre-write-invalid'
  | 'pre-read-failed'
  | 'write-failed'
  | 'read-back-failed'
  | 'read-back-missing'
  | 'read-back-invalid'
  | 'read-back-mismatch'

export interface ValueDifference {
  readonly path: string
  readonly expected: unknown
  readonly actual: unknown
}

/**
 * What happened to the previous record after a failed save.
 *
 * `restored` and `removed` are only ever reported after reading the key back and
 * checking it, exactly as the forward write is checked. When the rollback write
 * resolved but could not be confirmed — the read-back threw, came back wrong, or
 * no longer validates — the outcome is `unconfirmed`, and the user is told that
 * rather than being reassured about data that may not be there.
 */
export type RollbackOutcome = 'not-needed' | 'restored' | 'removed' | 'unconfirmed' | 'failed'

export interface SaveSuccess<T> {
  readonly ok: true
  /** The value as it now exists in storage, read back and revalidated. */
  readonly value: T
}

export interface SaveFailure {
  readonly ok: false
  readonly reason: SaveFailureReason
  readonly message: string
  readonly differences: ValueDifference[]
  readonly issues: ValidationIssue[]
  readonly rollback: RollbackOutcome
}

export type SaveResult<T> = SaveSuccess<T> | SaveFailure

const MAX_REPORTED_DIFFERENCES = 10

const PLAIN_OBJECT_TAG = '[object Object]'

function typeTag(value: unknown): string {
  return Object.prototype.toString.call(value)
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isObjectLike(value) && typeTag(value) === PLAIN_OBJECT_TAG
}

/**
 * An object `Object.keys` cannot describe: Date, Map, Set, RegExp, ArrayBuffer, a
 * typed array, and anything else carrying internal state. Walking one of these as
 * a plain object yields no keys, which would make two different Dates compare
 * equal and hide a real mismatch.
 */
function isExotic(value: unknown): boolean {
  return isObjectLike(value) && typeTag(value) !== PLAIN_OBJECT_TAG
}

function joinPath(path: string, segment: string | number): string {
  if (typeof segment === 'number') return `${path}[${segment}]`
  return path ? `${path}.${segment}` : segment
}

function byteView(value: object): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

/** Compares the built-in object types that carry state `Object.keys` cannot see. */
function exoticDifferences(expected: object, actual: object, path: string, tag: string): ValueDifference[] {
  const mismatch = [{ path, expected, actual }]

  if (tag === '[object Date]') {
    return Object.is((expected as Date).getTime(), (actual as Date).getTime()) ? [] : mismatch
  }

  if (tag === '[object RegExp]') {
    return String(expected) === String(actual) ? [] : mismatch
  }

  if (tag === '[object Map]') {
    const a = expected as Map<unknown, unknown>
    const b = actual as Map<unknown, unknown>
    if (a.size !== b.size) return [{ path: joinPath(path, 'size'), expected: a.size, actual: b.size }]
    const found: ValueDifference[] = []
    for (const [key, value] of a) {
      const at = joinPath(path, String(key))
      if (b.has(key)) found.push(...deepDifferences(value, b.get(key), at))
      else found.push({ path: at, expected: value, actual: undefined })
      if (found.length >= MAX_REPORTED_DIFFERENCES) break
    }
    return found.slice(0, MAX_REPORTED_DIFFERENCES)
  }

  if (tag === '[object Set]') {
    const a = expected as Set<unknown>
    const b = actual as Set<unknown>
    if (a.size !== b.size) return [{ path: joinPath(path, 'size'), expected: a.size, actual: b.size }]
    const found: ValueDifference[] = []
    for (const value of a) {
      if (!b.has(value))
        found.push({ path: joinPath(path, String(value)), expected: value, actual: undefined })
      if (found.length >= MAX_REPORTED_DIFFERENCES) break
    }
    return found.slice(0, MAX_REPORTED_DIFFERENCES)
  }

  const expectedBytes = byteView(expected)
  const actualBytes = byteView(actual)
  if (expectedBytes && actualBytes) {
    if (expectedBytes.byteLength !== actualBytes.byteLength) {
      const path_ = joinPath(path, 'byteLength')
      return [{ path: path_, expected: expectedBytes.byteLength, actual: actualBytes.byteLength }]
    }
    for (let index = 0; index < expectedBytes.length; index += 1) {
      if (expectedBytes[index] !== actualBytes[index]) {
        return [{ path: joinPath(path, index), expected: expectedBytes[index], actual: actualBytes[index] }]
      }
    }
    return []
  }

  // Something else with internal state. `Object.is` already said these are not the
  // same reference, and there is no way to prove they hold the same thing, so this
  // reports a difference rather than quietly claiming equality.
  return mismatch
}

/**
 * Structural difference between what we wrote and what came back.
 *
 * Compares in both directions, so a dropped key and an injected key are both
 * caught. Durable records are JSON-shaped by construction (ISO strings, numbers,
 * booleans, arrays, and plain objects), but structured clone round-trips Dates,
 * Maps, Sets and buffers too, so those are compared by value rather than walked
 * as objects — walking them finds no keys and reports equality for two values
 * that differ.
 */
export function deepDifferences(expected: unknown, actual: unknown, path = ''): ValueDifference[] {
  if (Object.is(expected, actual)) return []

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [{ path, expected, actual }]
    }
    if (expected.length !== actual.length) {
      return [{ path: joinPath(path, 'length'), expected: expected.length, actual: actual.length }]
    }
    const found: ValueDifference[] = []
    for (let index = 0; index < expected.length; index += 1) {
      found.push(...deepDifferences(expected[index], actual[index], joinPath(path, index)))
      if (found.length >= MAX_REPORTED_DIFFERENCES) break
    }
    return found.slice(0, MAX_REPORTED_DIFFERENCES)
  }

  if (isExotic(expected) || isExotic(actual)) {
    const expectedTag = typeTag(expected)
    if (!isObjectLike(expected) || !isObjectLike(actual) || expectedTag !== typeTag(actual)) {
      return [{ path, expected, actual }]
    }
    return exoticDifferences(expected, actual, path, expectedTag)
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
    const found: ValueDifference[] = []
    for (const key of keys) {
      found.push(...deepDifferences(expected[key], actual[key], joinPath(path, key)))
      if (found.length >= MAX_REPORTED_DIFFERENCES) break
    }
    return found.slice(0, MAX_REPORTED_DIFFERENCES)
  }

  return [{ path, expected, actual }]
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return deepDifferences(a, b).length === 0
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Puts the previous record back — and then proves it.
 *
 * The whole point of this module is that a resolved write is not evidence, so the
 * rollback is held to the same standard as the forward write: read the key back,
 * revalidate it, and deep-compare it to what we meant to restore. Anything short
 * of that is `unconfirmed`, so `describeSaveFailure` can tell the user the truth.
 */
async function rollback<T>(
  store: VerifiedStore<T>,
  key: string,
  previous: unknown,
  hadPrevious: boolean,
): Promise<RollbackOutcome> {
  try {
    if (hadPrevious) await store.write(key, previous)
    else await store.remove(key)
  } catch {
    return 'failed'
  }

  let after: unknown
  try {
    after = await store.read(key)
  } catch {
    return 'unconfirmed'
  }

  if (!hadPrevious) return after === undefined ? 'removed' : 'unconfirmed'
  if (after === undefined) return 'unconfirmed'

  // Only hold the read-back to the validator when the record being restored would
  // itself have passed it. A legacy record that needs migrating on load is still
  // the user's data, and the deep-compare below is what actually proves it is back.
  if (store.validator.validate(previous).ok && !store.validator.validate(after).ok) return 'unconfirmed'

  return deepEqual(previous, after) ? 'restored' : 'unconfirmed'
}

/**
 * In-flight saves, keyed `${store.name}:${key}`.
 *
 * Two overlapping `saveVerified` calls on one key would interleave their
 * read → write → read-back → rollback steps, so one call's rollback could revert
 * or delete what the other had just written while that other call reported
 * success. Each call therefore waits for the pending one on the same key. Entries
 * are deleted as the queue drains, so this never grows without bound.
 */
const pendingSaves = new Map<string, Promise<void>>()

/**
 * How many keys currently have a save queued. Exists so a test can prove the queue
 * actually drains; the app has no reason to read it.
 */
export function pendingSaveCount(): number {
  return pendingSaves.size
}

async function performSave<T>(store: VerifiedStore<T>, key: string, value: T): Promise<SaveResult<T>> {
  // The previous record is captured first: without it there is nothing to roll
  // back to, so a failing pre-read stops the save rather than risking the record.
  let previous: unknown
  let hadPrevious = false
  try {
    previous = await store.read(key)
    hadPrevious = previous !== undefined
  } catch (error) {
    return {
      ok: false,
      reason: 'pre-read-failed',
      message: `Could not read the existing ${store.name} record before saving: ${describe(error)}`,
      differences: [],
      issues: [],
      rollback: 'not-needed',
    }
  }

  try {
    await store.write(key, value)
  } catch (error) {
    return {
      ok: false,
      reason: 'write-failed',
      message: `Writing ${store.name} failed: ${describe(error)}`,
      differences: [],
      issues: [],
      rollback: await rollback(store, key, previous, hadPrevious),
    }
  }

  let readBack: unknown
  try {
    readBack = await store.read(key)
  } catch (error) {
    return {
      ok: false,
      reason: 'read-back-failed',
      message: `Saved ${store.name}, but reading it back failed: ${describe(error)}`,
      differences: [],
      issues: [],
      rollback: await rollback(store, key, previous, hadPrevious),
    }
  }

  if (readBack === undefined) {
    return {
      ok: false,
      reason: 'read-back-missing',
      message: `Saved ${store.name}, but the record was not there on read-back.`,
      differences: [],
      issues: [],
      rollback: await rollback(store, key, previous, hadPrevious),
    }
  }

  const validated = store.validator.validate(readBack)
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'read-back-invalid',
      message: `The saved ${store.name} record did not pass validation on read-back.`,
      differences: [],
      issues: validated.issues,
      rollback: await rollback(store, key, previous, hadPrevious),
    }
  }

  const differences = deepDifferences(value, readBack)
  if (differences.length > 0) {
    return {
      ok: false,
      reason: 'read-back-mismatch',
      message: `The saved ${store.name} record differs from what was written (${differences.length} difference${
        differences.length === 1 ? '' : 's'
      }).`,
      differences,
      issues: [],
      rollback: await rollback(store, key, previous, hadPrevious),
    }
  }

  return { ok: true, value: validated.value }
}

/**
 * Validate `value`, write it, read it back, revalidate it, deep-compare it, and
 * only then report success. On any mismatch the previous record is restored (or
 * removed, if there was none), that restore is itself verified, and a typed
 * failure describes exactly what differed.
 *
 * Calls are serialized per `${store.name}:${key}`, so two saves of one record can
 * never interleave.
 */
export async function saveVerified<T>(store: VerifiedStore<T>, value: T): Promise<SaveResult<T>> {
  // Validating first means an invalid value never physically reaches storage —
  // there is nothing to roll back, because nothing was written.
  const preCheck = store.validator.validate(value)
  if (!preCheck.ok) {
    return {
      ok: false,
      reason: 'pre-write-invalid',
      message: `The ${store.name} record was not valid, so nothing was written.`,
      differences: [],
      issues: preCheck.issues,
      rollback: 'not-needed',
    }
  }

  const key = store.keyOf(value)
  const queueKey = `${store.name}:${key}`
  const tail = pendingSaves.get(queueKey) ?? Promise.resolve()

  const run = tail.then(() => performSave(store, key, value))
  // The queued tail must never reject, or one failure would poison every later
  // save on the key. `run` itself is awaited below, so its rejection is handled.
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  pendingSaves.set(queueKey, settled)

  try {
    return await run
  } finally {
    // Only the last call in the queue clears the entry, so the map drains rather
    // than keeping one entry per key saved for the life of the session.
    if (pendingSaves.get(queueKey) === settled) pendingSaves.delete(queueKey)
  }
}

/**
 * What the user is told about their previous data. `unconfirmed` deliberately
 * promises nothing: the restore may have landed, and it may not have.
 */
const ROLLBACK_SENTENCE: Record<RollbackOutcome, string> = {
  'not-needed': '',
  restored: ' Your previous version was restored.',
  removed: ' The incomplete record was removed.',
  unconfirmed: ' Your previous version could not be confirmed — reopen the app and check your data.',
  failed: ' The previous version could not be restored.',
}

/** One-line, user-facing summary of a failure. Safe to render; never a stack trace. */
export function describeSaveFailure(failure: SaveFailure): string {
  return `${failure.message}${ROLLBACK_SENTENCE[failure.rollback]}`
}
