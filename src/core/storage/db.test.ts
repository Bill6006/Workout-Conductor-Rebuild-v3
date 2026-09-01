import { afterEach, describe, expect, it } from 'vitest'
import {
  DB_NAME,
  DB_VERSION,
  META_STORE,
  PROFILE_STORE,
  StorageError,
  closeAppDatabase,
  isIndexedDbAvailable,
  openAppDatabase,
  storageError,
} from './db'

/**
 * jsdom has no IndexedDB and `fake-indexeddb` is not a dependency of this project,
 * so this file covers what can be covered without a real implementation: the
 * constants other phases must not drift from, the availability probe, and the
 * typed-error surface. The behaviour of the store itself is proved against the
 * in-memory `VerifiedStore` in verifiedSave.test.ts and profileRepository.test.ts.
 */

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')

function setIndexedDb(value: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value, configurable: true, writable: true })
}

afterEach(async () => {
  await closeAppDatabase()
  if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb)
  else Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('database identity', () => {
  it('is the names and version the rest of the app expects', () => {
    expect(DB_NAME).toBe('workout-conductor')
    expect(DB_VERSION).toBe(1)
    expect(PROFILE_STORE).toBe('profile')
    expect(META_STORE).toBe('meta')
  })
})

describe('isIndexedDbAvailable', () => {
  it('is false when the browser has no IndexedDB', () => {
    setIndexedDb(undefined)
    expect(isIndexedDbAvailable()).toBe(false)
  })

  it('is false when the property itself throws on access', () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('SecurityError')
      },
    })
    expect(isIndexedDbAvailable()).toBe(false)
  })

  it('is true when something IndexedDB-shaped is present', () => {
    setIndexedDb({ open: () => undefined })
    expect(isIndexedDbAvailable()).toBe(true)
  })
})

describe('openAppDatabase', () => {
  it('rejects with a typed StorageError rather than a raw exception', async () => {
    setIndexedDb(undefined)

    await expect(openAppDatabase()).rejects.toBeInstanceOf(StorageError)
    await openAppDatabase().catch((error: unknown) => {
      expect(StorageError.is(error)).toBe(true)
      expect((error as StorageError).code).toBe('unsupported')
      expect((error as StorageError).message).toMatch(/does not support offline storage/i)
    })
  })
})

describe('storageError', () => {
  it('carries a readable message for every code', () => {
    for (const code of ['unsupported', 'denied', 'blocked', 'failed'] as const) {
      const error = storageError(code)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('StorageError')
      expect(error.code).toBe(code)
      expect(error.message.length).toBeGreaterThan(20)
      expect(error.message).not.toMatch(/undefined|\[object/)
    }
  })

  it('appends detail and keeps the cause', () => {
    const cause = new Error('root problem')
    const error = storageError('failed', cause, 'Reading "primary" from profile failed.')
    expect(error.message).toContain('Reading "primary" from profile failed.')
    expect(error.cause).toBe(cause)
  })

  it('is recognisable through StorageError.is and not by accident', () => {
    expect(StorageError.is(storageError('denied'))).toBe(true)
    expect(StorageError.is(new Error('denied'))).toBe(false)
    expect(StorageError.is(null)).toBe(false)
  })
})

describe('closeAppDatabase', () => {
  it('is safe to call when nothing was ever opened', async () => {
    await expect(closeAppDatabase()).resolves.toBeUndefined()
  })
})

/**
 * A5 — the `blocked` event must resolve the open, not leave it pending.
 *
 * jsdom has no IndexedDB, so this stands up the smallest thing `idb` will accept:
 * an `IDBRequest`-shaped EventTarget it can attach listeners to. That is enough to
 * fire the `blocked` event, which is the whole point — before this, `blocked` left
 * the open promise pending forever and the app hung on hydrate with no explanation.
 */
class FakeOpenRequest extends EventTarget {
  result: unknown = null
  error: unknown = null
  transaction: unknown = null
}

function installFakeIndexedDb(behaviour: (attempt: number, request: FakeOpenRequest) => void) {
  Object.defineProperty(globalThis, 'IDBRequest', {
    value: FakeOpenRequest,
    configurable: true,
    writable: true,
  })
  let attempts = 0
  setIndexedDb({
    open() {
      attempts += 1
      const attempt = attempts
      const request = new FakeOpenRequest()
      // Fired on a later turn, after `idb` has attached its listeners.
      setTimeout(() => behaviour(attempt, request), 0)
      return request
    },
  })
  return {
    get attempts() {
      return attempts
    },
    restore() {
      Reflect.deleteProperty(globalThis, 'IDBRequest')
    },
  }
}

describe('openAppDatabase — another tab holding an older version open', () => {
  it('rejects with a blocked StorageError instead of hanging forever', async () => {
    const fake = installFakeIndexedDb((_attempt, request) => {
      request.dispatchEvent(new Event('blocked'))
    })

    try {
      const error = await openAppDatabase().catch((caught: unknown) => caught)
      expect(StorageError.is(error)).toBe(true)
      expect((error as StorageError).code).toBe('blocked')
      expect((error as StorageError).message).toMatch(/another open tab/i)
    } finally {
      fake.restore()
    }
  })

  it('clears the cached open so a retry actually reopens', async () => {
    const fake = installFakeIndexedDb((attempt, request) => {
      if (attempt === 1) {
        request.dispatchEvent(new Event('blocked'))
        return
      }
      // A plain Error carrying the DOMException name: jsdom's DOMException does
      // not inherit from Error, so it would not reach the name-based mapping here.
      request.error = Object.assign(new Error('closed'), { name: 'UnknownError' })
      request.dispatchEvent(new Event('error'))
    })

    try {
      const first = await openAppDatabase().catch((caught: unknown) => caught)
      expect((first as StorageError).code).toBe('blocked')

      // A cached blocked rejection would come straight back without reopening.
      const second = await openAppDatabase().catch((caught: unknown) => caught)
      expect(StorageError.is(second)).toBe(true)
      expect((second as StorageError).code).toBe('denied')
      expect(fake.attempts).toBe(2)
    } finally {
      fake.restore()
    }
  })
})
