import { describe, expect, it } from 'vitest'
import { DROP_WRITE, createMemoryStore, type MemoryStore } from './memoryStore'
import {
  deepDifferences,
  deepEqual,
  describeSaveFailure,
  pendingSaveCount,
  saveVerified,
} from './verifiedSave'
import type { Validator } from '../validation/validate'

/**
 * jsdom has no IndexedDB and `fake-indexeddb` is not a dependency of this project,
 * so the save contract is exercised against the in-memory store in memoryStore.ts —
 * the same `VerifiedStore` interface the IndexedDB store implements, with hooks that
 * can corrupt, drop, or fail a write on demand.
 */

interface Note {
  id: string
  title: string
  tags: string[]
  meta: { pinned: boolean }
}

const validator: Validator<Note> = {
  validate(value) {
    const note = value as Note
    if (
      typeof note !== 'object' ||
      note === null ||
      typeof note.id !== 'string' ||
      typeof note.title !== 'string' ||
      !Array.isArray(note.tags)
    ) {
      return { ok: false, issues: [{ path: '', message: 'Not a note' }] }
    }
    return { ok: true, value: note }
  },
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return { id: 'n1', title: 'First', tags: ['a'], meta: { pinned: false }, ...overrides }
}

function makeStore(seed?: Note) {
  return createMemoryStore<Note>({
    name: 'note',
    keyOf: (note) => note.id,
    validator,
    seed: seed ? { [seed.id]: seed } : {},
  })
}

describe('deepDifferences', () => {
  it('finds nothing for structurally equal values', () => {
    expect(deepDifferences({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([])
    expect(deepEqual(null, null)).toBe(true)
  })

  it('reports the dotted path of a changed leaf', () => {
    expect(deepDifferences({ a: { b: 1 } }, { a: { b: 2 } })).toEqual([
      { path: 'a.b', expected: 1, actual: 2 },
    ])
  })

  it('reports an indexed path inside an array', () => {
    expect(deepDifferences({ t: ['x', 'y'] }, { t: ['x', 'z'] })).toEqual([
      { path: 't[1]', expected: 'y', actual: 'z' },
    ])
  })

  it('catches a dropped key and an added key in both directions', () => {
    expect(deepDifferences({ a: 1, b: 2 }, { a: 1 })).toEqual([{ path: 'b', expected: 2, actual: undefined }])
    expect(deepDifferences({ a: 1 }, { a: 1, c: 3 })).toEqual([{ path: 'c', expected: undefined, actual: 3 }])
  })

  it('reports a length change rather than every element', () => {
    expect(deepDifferences([1, 2, 3], [1, 2])).toEqual([{ path: 'length', expected: 3, actual: 2 }])
  })

  it('does not treat an array and an object as equal', () => {
    expect(deepEqual([], {})).toBe(false)
  })
})

describe('saveVerified — success', () => {
  it('writes, reads back, revalidates, and reports the stored value', async () => {
    const store = makeStore()
    const note = makeNote()

    const result = await saveVerified(store, note)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual(note)
    expect(store.snapshot().n1).toEqual(note)
  })

  it('preserves fields the validator does not know about', async () => {
    const store = makeStore()
    const note = { ...makeNote(), fromAFutureVersion: { depth: 2 } } as unknown as Note

    const result = await saveVerified(store, note)

    expect(result.ok).toBe(true)
    expect(store.snapshot().n1).toEqual(note)
  })

  it('overwrites a previous record', async () => {
    const store = makeStore(makeNote())
    const result = await saveVerified(store, makeNote({ title: 'Second' }))
    expect(result.ok).toBe(true)
    expect((store.snapshot().n1 as Note).title).toBe('Second')
  })
})

describe('saveVerified — a store that corrupts the write', () => {
  it('fails with read-back-mismatch and describes what differed', async () => {
    const store = makeStore()
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-mismatch')
    expect(result.differences).toEqual([{ path: 'title', expected: 'First', actual: 'Mangled' }])
  })

  it('restores the previous record instead of leaving the corruption in place', async () => {
    const previous = makeNote({ title: 'Original' })
    const store = makeStore(previous)
    // Corrupt only the first write, so the restore itself lands cleanly — a
    // store that mangles every write can never be rolled back into.
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      return writes === 1 ? { ...(value as Note), title: 'Mangled' } : value
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('restored')
    expect(store.snapshot().n1).toEqual(previous)
  })

  it('removes the record when there was nothing to restore', async () => {
    const store = makeStore()
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('removed')
    expect(store.records.has('n1')).toBe(false)
  })

  it('catches a dropped nested field, not just a changed one', async () => {
    const store = makeStore()
    store.faults.onWrite = (_key, value) => {
      const note = value as Note
      return { ...note, meta: {} }
    }

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.differences).toEqual([{ path: 'meta.pinned', expected: false, actual: undefined }])
  })
})

describe('saveVerified — a store that silently drops the write', () => {
  it('fails with read-back-missing rather than reporting success', async () => {
    const store = makeStore()
    store.faults.onWrite = () => DROP_WRITE

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-missing')
  })

  it('leaves the previous record untouched instead of claiming the new one landed', async () => {
    const previous = makeNote({ title: 'Original' })
    const store = makeStore(previous)
    store.faults.onWrite = () => DROP_WRITE

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    // The write vanished, so the read-back returns the old record: a mismatch,
    // not a missing record. Either way the caller is never told this succeeded.
    expect(result.reason).toBe('read-back-mismatch')
    expect(store.snapshot().n1).toEqual(previous)
  })
})

describe('saveVerified — a read-back that no longer validates', () => {
  it('fails with read-back-invalid and reports the issues', async () => {
    const store = makeStore()
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), tags: 'not-an-array' })

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-invalid')
    expect(result.issues).toEqual([{ path: '', message: 'Not a note' }])
    expect(result.rollback).toBe('removed')
  })
})

describe('saveVerified — storage that throws', () => {
  it('reports pre-read-failed and never attempts the write', async () => {
    const store = makeStore(makeNote({ title: 'Untouched' }))
    store.faults.failRead = new Error('storage is gone')

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('pre-read-failed')
    expect(result.message).toContain('storage is gone')
    expect((store.snapshot().n1 as Note).title).toBe('Untouched')
  })

  it('reports write-failed', async () => {
    const store = makeStore()
    store.faults.failWrite = new Error('quota exceeded')

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('write-failed')
    expect(result.message).toContain('quota exceeded')
  })

  it('reports read-back-failed when the record cannot be read after writing', async () => {
    const store = makeStore()
    let reads = 0
    const realRead = store.read.bind(store)
    store.read = async (key) => {
      reads += 1
      if (reads > 1) throw new Error('connection closed')
      return realRead(key)
    }

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-failed')
  })

  it('says so when the rollback itself could not be completed', async () => {
    const store = makeStore(makeNote({ title: 'Original' }))
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })
    store.faults.failWrite = null
    const realWrite = store.write.bind(store)
    let writes = 0
    store.write = async (key, value) => {
      writes += 1
      if (writes > 1) throw new Error('storage went away')
      return realWrite(key, value)
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('failed')
    expect(describeSaveFailure(result)).toContain('could not be restored')
  })
})

describe('describeSaveFailure', () => {
  it('reassures the user only when the previous version was read back and matched', async () => {
    const previous = makeNote({ title: 'Original' })
    const store = makeStore(previous)
    // Corrupt only the forward write, so the restore itself genuinely lands. The
    // earlier version of this test mangled EVERY write — including the rollback —
    // and still expected this sentence, which was the bug in A1: the reassurance
    // was printed for a restore that had never happened.
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      return writes === 1 ? { ...(value as Note), title: 'Mangled' } : value
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('restored')
    expect(describeSaveFailure(result)).toContain('Your previous version was restored.')
    expect(store.snapshot().n1).toEqual(previous)
  })

  it('promises nothing when the restore could not be confirmed', async () => {
    const store = makeStore(makeNote({ title: 'Original' }))
    // Every write is mangled, the rollback write included, so nothing was restored.
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    const text = describeSaveFailure(result)
    expect(text).toContain('could not be confirmed')
    expect(text).not.toContain('was restored')
  })

  it('says the record was removed rather than claiming a restore that never applied', async () => {
    const store = makeStore()
    store.faults.onWrite = () => DROP_WRITE

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('removed')
    expect(describeSaveFailure(result)).toContain('The incomplete record was removed.')
    expect(describeSaveFailure(result)).not.toContain('previous version was restored')
  })

  it('adds nothing when no rollback was needed', async () => {
    const store = makeStore(makeNote({ title: 'Untouched' }))
    store.faults.failRead = new Error('storage is gone')

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(describeSaveFailure(result)).toBe(result.message)
  })
})

/**
 * A1 — the rollback write is held to the same standard as the forward write.
 *
 * Each store below is adversarial in a different way: one drops the rollback
 * write, one mutates it, one makes the rollback read-back fail, one ignores the
 * removal. In none of them is the previous record provably back, and the result
 * must say so rather than reassuring the user.
 */
describe('saveVerified — verifying the rollback itself', () => {
  it('reports unconfirmed when the store drops the rollback write', async () => {
    const store = makeStore(makeNote({ title: 'Original' }))
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      // The forward write is corrupted; the rollback write is swallowed whole.
      if (writes === 1) return { ...(value as Note), title: 'Mangled' }
      return DROP_WRITE
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('unconfirmed')
    // Proof the old 'restored' outcome was a lie: the corruption is still there.
    expect((store.snapshot().n1 as Note).title).toBe('Mangled')
  })

  it('reports unconfirmed when the store mutates the rollback write', async () => {
    const previous = makeNote({ title: 'Original' })
    const store = makeStore(previous)
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('unconfirmed')
    expect(store.snapshot().n1).not.toEqual(previous)
  })

  it('reports unconfirmed when the rollback read-back throws', async () => {
    const store = makeStore(makeNote({ title: 'Original' }))
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })
    let reads = 0
    const realRead = store.read.bind(store)
    store.read = async (key) => {
      reads += 1
      // 1: pre-read, 2: read-back, 3: the rollback's own read-back.
      if (reads >= 3) throw new Error('connection closed')
      return realRead(key)
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('unconfirmed')
  })

  it('reports unconfirmed when the restored record no longer validates', async () => {
    const store = makeStore(makeNote({ title: 'Original' }))
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      return writes === 1 ? { ...(value as Note), title: 'Mangled' } : value
    }
    let reads = 0
    store.faults.onRead = (_key, value) => {
      reads += 1
      // Only the rollback's read-back comes back unreadable.
      return reads >= 3 ? { ...(value as Note), tags: 'not-an-array' } : value
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('unconfirmed')
  })

  it('reports unconfirmed when a removal is silently ignored', async () => {
    const store = makeStore()
    store.faults.onWrite = (_key, value) => ({ ...(value as Note), title: 'Mangled' })
    store.remove = async () => {
      // Resolves without deleting anything — the exact shape of an unchecked write.
    }

    const result = await saveVerified(store, makeNote())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('unconfirmed')
    expect(store.records.has('n1')).toBe(true)
  })

  it('still confirms a restore of a record the validator would reject', async () => {
    // A legacy record that needs migrating on load is still the user's data. The
    // deep-compare, not the validator, is what proves it came back.
    const legacy = { id: 'n1', title: 'Legacy', tags: 'not-an-array' }
    const store = createMemoryStore<Note>({
      name: 'note',
      keyOf: (note) => note.id,
      validator,
      seed: { n1: legacy },
    })
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      return writes === 1 ? { ...(value as Note), title: 'Mangled' } : value
    }

    const result = await saveVerified(store, makeNote({ title: 'Attempted' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rollback).toBe('restored')
    expect(store.snapshot().n1).toEqual(legacy)
  })
})

/**
 * A2 — two saves of one record must not interleave.
 *
 * The memory store resolves immediately, so these tests slow it down: without a
 * per-key queue the two calls genuinely interleave and one call's rollback eats
 * the other call's write.
 */
function slowDown<T>(store: MemoryStore<T>, ms = 2): MemoryStore<T> {
  const pause = () => new Promise((resolve) => setTimeout(resolve, ms))
  const read = store.read.bind(store)
  const write = store.write.bind(store)
  const remove = store.remove.bind(store)
  store.read = async (key) => {
    await pause()
    return read(key)
  }
  store.write = async (key, value) => {
    await pause()
    return write(key, value)
  }
  store.remove = async (key) => {
    await pause()
    return remove(key)
  }
  return store
}

describe('saveVerified — concurrent saves of the same key', () => {
  it('serializes them so the last write wins and neither rollback eats the other', async () => {
    const store = slowDown(makeStore(makeNote({ title: 'Original' })))

    const [first, second] = await Promise.all([
      saveVerified(store, makeNote({ title: 'A' })),
      saveVerified(store, makeNote({ title: 'B' })),
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect((store.snapshot().n1 as Note).title).toBe('B')
  })

  it('does not let a failing save roll back over the save queued behind it', async () => {
    const store = slowDown(makeStore())
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      // The first save's write vanishes; its rollback then removes the key. Without
      // serialization that removal deletes the second save's record.
      return writes === 1 ? DROP_WRITE : value
    }

    const [failed, survived] = await Promise.all([
      saveVerified(store, makeNote({ title: 'Doomed' })),
      saveVerified(store, makeNote({ title: 'Keeper' })),
    ])

    expect(failed.ok).toBe(false)
    expect(survived.ok).toBe(true)
    expect((store.snapshot().n1 as Note).title).toBe('Keeper')
  })

  it('keeps a long queue in order', async () => {
    const store = slowDown(makeStore(), 1)
    const titles = ['one', 'two', 'three', 'four', 'five']

    const results = await Promise.all(titles.map((title) => saveVerified(store, makeNote({ title }))))

    expect(results.every((result) => result.ok)).toBe(true)
    expect((store.snapshot().n1 as Note).title).toBe('five')
  })

  it('does not make saves of different keys wait on each other', async () => {
    const store = slowDown(makeStore())

    const results = await Promise.all([
      saveVerified(store, makeNote({ id: 'a' })),
      saveVerified(store, makeNote({ id: 'b' })),
    ])

    expect(results.every((result) => result.ok)).toBe(true)
    expect(Object.keys(store.snapshot()).sort()).toEqual(['a', 'b'])
  })

  it('drains its queue so the pending map cannot grow without bound', async () => {
    const store = makeStore()
    expect(pendingSaveCount()).toBe(0)

    for (let index = 0; index < 25; index += 1) {
      await saveVerified(store, makeNote({ id: `k${index}` }))
    }
    await Promise.all([saveVerified(store, makeNote()), saveVerified(store, makeNote({ title: 'again' }))])

    expect(pendingSaveCount()).toBe(0)
  })
})

/**
 * A3 — an invalid value must never physically reach storage. Rolling it back
 * afterwards is not the same as never having written it.
 */
describe('saveVerified — a value that does not validate', () => {
  it('fails with pre-write-invalid before reading or writing anything', async () => {
    const store = makeStore()
    let reads = 0
    let writes = 0
    const realRead = store.read.bind(store)
    const realWrite = store.write.bind(store)
    store.read = async (key) => {
      reads += 1
      return realRead(key)
    }
    store.write = async (key, value) => {
      writes += 1
      return realWrite(key, value)
    }

    const result = await saveVerified(store, { id: 'n1', title: 'no tags' } as unknown as Note)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('pre-write-invalid')
    expect(result.rollback).toBe('not-needed')
    expect(result.issues).toEqual([{ path: '', message: 'Not a note' }])
    expect(reads).toBe(0)
    expect(writes).toBe(0)
    expect(store.snapshot()).toEqual({})
  })

  it('leaves an existing record exactly where it was', async () => {
    const previous = makeNote({ title: 'Original' })
    const store = makeStore(previous)

    const result = await saveVerified(store, { id: 'n1', title: 42 } as unknown as Note)

    expect(result.ok).toBe(false)
    expect(store.snapshot().n1).toEqual(previous)
  })

  it('says nothing was written, so no rollback sentence is added', async () => {
    const store = makeStore()
    const result = await saveVerified(store, { id: 'n1' } as unknown as Note)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(describeSaveFailure(result)).toBe(result.message)
    expect(describeSaveFailure(result)).toContain('nothing was written')
  })
})

/**
 * A6 — Date, Map, Set, RegExp and buffers carry state `Object.keys` cannot see, so
 * walking them as plain objects finds no keys and calls two different values equal.
 */
describe('deepDifferences — values Object.keys cannot describe', () => {
  it('does not call two different Dates equal', () => {
    const differences = deepDifferences(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-02T00:00:00.000Z'),
    )
    expect(differences).toHaveLength(1)
    expect(deepEqual(new Date(0), new Date(1000))).toBe(false)
  })

  it('treats two Dates at the same instant as equal', () => {
    expect(deepEqual(new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'))).toBe(true)
  })

  it('finds a Date that changed inside a record, with its path', () => {
    const differences = deepDifferences(
      { at: new Date('2026-09-01T00:00:00.000Z') },
      { at: new Date('2026-09-01T00:00:01.000Z') },
    )
    expect(differences).toHaveLength(1)
    expect(differences[0].path).toBe('at')
  })

  it('does not call two different Maps equal', () => {
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
    expect(deepDifferences(new Map([['a', 1]]), new Map([['a', 2]]))).toEqual([
      { path: 'a', expected: 1, actual: 2 },
    ])
    expect(deepEqual(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false)
    expect(deepEqual(new Map([['a', 1]]), new Map())).toBe(false)
  })

  it('treats two Maps with the same entries as equal', () => {
    const left = new Map<string, unknown>([
      ['a', 1],
      ['b', { c: 2 }],
    ])
    const right = new Map<string, unknown>([
      ['a', 1],
      ['b', { c: 2 }],
    ])
    expect(deepEqual(left, right)).toBe(true)
  })

  it('compares Sets, RegExps and buffers by value', () => {
    expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
    expect(deepEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true)
    expect(deepEqual(/a/g, /b/g)).toBe(false)
    expect(deepEqual(/a/g, /a/g)).toBe(true)
    expect(deepEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(deepEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
  })

  it('does not treat a Date and a plain object as equal', () => {
    expect(deepEqual(new Date(0), {})).toBe(false)
    expect(deepEqual({}, new Date(0))).toBe(false)
    expect(deepEqual(new Date(0), new Map())).toBe(false)
  })

  it('catches a Date the store mangled on the way in', async () => {
    interface Stamped {
      id: string
      at: Date
    }
    const stampedValidator: Validator<Stamped> = {
      validate: (value) => ({ ok: true, value: value as Stamped }),
    }
    const store = createMemoryStore<Stamped>({
      name: 'stamped',
      keyOf: (value) => value.id,
      validator: stampedValidator,
    })
    store.faults.onWrite = (_key, value) => ({ ...(value as Stamped), at: new Date(0) })

    const result = await saveVerified(store, { id: 's1', at: new Date('2026-09-01T00:00:00.000Z') })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('read-back-mismatch')
    expect(result.differences[0].path).toBe('at')
  })
})
