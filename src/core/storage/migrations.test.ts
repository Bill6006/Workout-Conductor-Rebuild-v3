import { describe, expect, it } from 'vitest'
import {
  PROFILE_MIGRATIONS,
  VERSION_KEY,
  carryThrough,
  migrateProfileRecord,
  migrateRecord,
  readSchemaVersion,
  type Migration,
} from './migrations'
import { SCHEMA_VERSION, createDefaultProfile } from '../validation/schemas'
import { parseProfile } from '../validation/validate'

const NOW = '2026-09-01T12:00:00.000Z'

/** A synthetic registry: version 1 is the real baseline, so the machinery needs its own. */
const oneToTwo: Migration = {
  from: 1,
  to: 2,
  description: 'add restDefaults',
  migrate: (record) => ({ ...record, restDefaults: { seconds: 90 } }),
}

const twoToThree: Migration = {
  from: 2,
  to: 3,
  description: 'rename restDefaults to rest',
  removes: ['restDefaults'],
  migrate: (record) => ({ ...record, rest: record.restDefaults }),
}

describe('PROFILE_MIGRATIONS', () => {
  it('is empty at the version 1 baseline', () => {
    expect(PROFILE_MIGRATIONS).toEqual([])
  })

  it('leaves a current record untouched', () => {
    const profile = createDefaultProfile(NOW)
    const result = migrateProfileRecord(profile)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.applied).toEqual([])
    expect(result.fromVersion).toBe(SCHEMA_VERSION)
    expect(result.toVersion).toBe(SCHEMA_VERSION)
    expect(result.value).toEqual(profile)
    expect(parseProfile(result.value).ok).toBe(true)
  })
})

describe('readSchemaVersion', () => {
  it('reads a whole positive version', () => {
    expect(readSchemaVersion({ schemaVersion: 3 })).toBe(3)
  })

  it('refuses anything else', () => {
    expect(readSchemaVersion({ schemaVersion: '3' })).toBeNull()
    expect(readSchemaVersion({ schemaVersion: 1.5 })).toBeNull()
    expect(readSchemaVersion({ schemaVersion: 0 })).toBeNull()
    expect(readSchemaVersion({})).toBeNull()
    expect(readSchemaVersion(null)).toBeNull()
    expect(readSchemaVersion([])).toBeNull()
  })
})

describe('carryThrough', () => {
  it('re-adds keys the step did not produce', () => {
    expect(carryThrough({ a: 1, b: 2 }, { a: 9 })).toEqual({ a: 9, b: 2 })
  })

  it('honours a deliberate removal from either side', () => {
    expect(carryThrough({ a: 1, old: 2 }, { a: 1, fresh: 2 }, ['old'])).toEqual({ a: 1, fresh: 2 })
    // Even when the step spread the whole record forward, `removes` still wins.
    expect(carryThrough({ a: 1, old: 2 }, { a: 1, old: 2, fresh: 2 }, ['old'])).toEqual({ a: 1, fresh: 2 })
  })

  it('never overwrites what the step produced', () => {
    expect(carryThrough({ a: 1 }, { a: undefined })).toEqual({ a: undefined })
  })
})

describe('migrateRecord', () => {
  it('runs each registered step in order and reports them', () => {
    const result = migrateRecord({ schemaVersion: 1, name: 'x' }, [oneToTwo, twoToThree], 3)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.applied).toEqual(['1->2: add restDefaults', '2->3: rename restDefaults to rest'])
    expect(result.value).toEqual({ schemaVersion: 3, name: 'x', rest: { seconds: 90 } })
  })

  it('stamps the record with the version it reached', () => {
    const result = migrateRecord({ schemaVersion: 1 }, [oneToTwo], 2)
    expect(result.ok && result.value[VERSION_KEY]).toBe(2)
  })

  it('preserves fields a future version added and this build does not know', () => {
    const result = migrateRecord(
      { schemaVersion: 1, coachPersona: 'blunt', nested: { deep: true } },
      [oneToTwo],
      2,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.coachPersona).toBe('blunt')
    expect(result.value.nested).toEqual({ deep: true })
  })

  it('preserves unknown fields even when a step forgets to spread them', () => {
    const forgetful: Migration = {
      from: 1,
      to: 2,
      description: 'careless step',
      migrate: () => ({ onlyThis: true }),
    }

    const result = migrateRecord({ schemaVersion: 1, keepMe: 'yes' }, [forgetful], 2)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ schemaVersion: 2, keepMe: 'yes', onlyThis: true })
  })

  it('stops at a version gap rather than guessing', () => {
    const result = migrateRecord({ schemaVersion: 1 }, [twoToThree], 3)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-path')
    expect(result.message).toContain('1 to 2')
  })

  it('refuses a record from a newer build', () => {
    const result = migrateRecord({ schemaVersion: 9 }, [], 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('future-version')
    expect(result.fromVersion).toBe(9)
    expect(result.message).toContain('Update the app')
  })

  it('refuses a record with no version', () => {
    const result = migrateRecord({ anything: true }, [], 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing-version')
  })

  it('refuses something that is not a record', () => {
    for (const value of [null, 'text', 7, [1, 2]]) {
      const result = migrateRecord(value, [], 1)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('not-a-record')
    }
  })

  it('reports a step that throws instead of letting it escape', () => {
    const broken: Migration = {
      from: 1,
      to: 2,
      description: 'explodes',
      migrate: () => {
        throw new Error('bad data')
      },
    }

    const result = migrateRecord({ schemaVersion: 1 }, [broken], 2)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('migration-failed')
    expect(result.message).toContain('bad data')
  })

  it('reports a step that returns a non-object', () => {
    const broken = {
      from: 1,
      to: 2,
      description: 'returns nonsense',
      migrate: () => null as unknown as Record<string, unknown>,
    }

    const result = migrateRecord({ schemaVersion: 1 }, [broken], 2)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('migration-failed')
  })

  it('does not mutate the record it was given', () => {
    const input = { schemaVersion: 1, name: 'x' }
    migrateRecord(input, [oneToTwo], 2)
    expect(input).toEqual({ schemaVersion: 1, name: 'x' })
  })
})
