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
import { formatIssues, parseProfile } from '../validation/validate'
import { createExerciseNameResolver } from '../../catalog/exercises/exerciseSchema'
import { normaliseExerciseName } from '../../catalog/exercises/exerciseId'

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

/**
 * A real version-1 profile, written out rather than derived from
 * `createDefaultProfile`, because that function now produces version 2. This is
 * the shape a Phase 1 build actually saved, and it is the shape the migration has
 * to be able to read for as long as anyone still has one.
 */
function versionOneProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const current = createDefaultProfile(NOW)
  return {
    ...(JSON.parse(JSON.stringify(current)) as Record<string, unknown>),
    schemaVersion: 1,
    exercisePreferences: { preferred: [], disliked: [] },
    ...overrides,
  }
}

const CATALOG = [
  { id: 'romanian-deadlift', name: 'Romanian deadlift', aliases: ['RDL'] },
  { id: 'barbell-back-squat', name: 'Barbell back squat', aliases: ['Back squat'] },
]

const resolveExerciseId = createExerciseNameResolver(CATALOG, normaliseExerciseName)

describe('PROFILE_MIGRATIONS', () => {
  it('registers one unbroken chain of steps up to the current version', () => {
    expect(PROFILE_MIGRATIONS.map((step) => [step.from, step.to])).toEqual([[1, 2]])

    let version = 1
    for (const step of PROFILE_MIGRATIONS) {
      expect(step.from).toBe(version)
      expect(step.to).toBe(version + 1)
      expect(step.description).not.toBe('')
      version = step.to
    }
    expect(version).toBe(SCHEMA_VERSION)
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

describe('the version 1 to 2 step: catalog-backed exercise preferences', () => {
  it('brings a real version 1 profile up to date, and the result validates', () => {
    const result = migrateProfileRecord(versionOneProfile(), { resolveExerciseId })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fromVersion).toBe(1)
    expect(result.toVersion).toBe(SCHEMA_VERSION)
    expect(result.applied).toHaveLength(1)
    expect(result.value.schemaVersion).toBe(SCHEMA_VERSION)
    expect(result.value.exercisePreferences).toEqual({
      preferred: { exerciseIds: [], freeText: [] },
      disliked: { exerciseIds: [], freeText: [] },
    })

    const validated = parseProfile(result.value)
    expect(validated.ok, validated.ok ? '' : formatIssues(validated.issues)).toBe(true)
  })

  it('resolves what the injected lookup recognises and keeps the rest verbatim', () => {
    const record = versionOneProfile({
      exercisePreferences: {
        preferred: ['RDL', 'that machine by the window'],
        disliked: ['BACK  squat!', 'Burpees'],
      },
    })

    const result = migrateProfileRecord(record, { resolveExerciseId })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.exercisePreferences).toEqual({
      preferred: { exerciseIds: ['romanian-deadlift'], freeText: ['that machine by the window'] },
      disliked: { exerciseIds: ['barbell-back-squat'], freeText: ['Burpees'] },
    })
    expect(parseProfile(result.value).ok).toBe(true)
  })

  it('loses nothing when no lookup is injected — every entry stays as typed', () => {
    const record = versionOneProfile({
      exercisePreferences: { preferred: ['RDL', 'Back squat'], disliked: [] },
    })

    const result = migrateProfileRecord(record)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.exercisePreferences).toEqual({
      preferred: { exerciseIds: [], freeText: ['RDL', 'Back squat'] },
      disliked: { exerciseIds: [], freeText: [] },
    })
    expect(parseProfile(result.value).ok).toBe(true)
  })

  it('carries an unknown field written by a future build across the migration', () => {
    const record = versionOneProfile({
      exercisePreferences: { preferred: ['RDL'], disliked: [] },
      coachingTone: 'blunt',
      locations: [
        {
          id: 'loc-gym',
          name: 'Gym',
          kind: 'gym',
          equipment: ['barbell'],
          notes: '',
          floorNumber: 2,
        },
      ],
      activeLocationId: 'loc-gym',
    })

    const result = migrateProfileRecord(record, { resolveExerciseId })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.coachingTone).toBe('blunt')
    expect((result.value.locations as { floorNumber: number }[])[0].floorNumber).toBe(2)
    expect(parseProfile(result.value).ok).toBe(true)
  })

  it('is a no-op when it runs again on its own output', () => {
    const record = versionOneProfile({
      exercisePreferences: { preferred: ['RDL', 'Weird machine'], disliked: ['Burpees'] },
    })

    const once = migrateProfileRecord(record, { resolveExerciseId })
    expect(once.ok).toBe(true)
    if (!once.ok) return

    const twice = migrateProfileRecord(once.value, { resolveExerciseId })
    expect(twice.ok).toBe(true)
    if (!twice.ok) return

    expect(twice.applied).toEqual([])
    expect(twice.value).toEqual(once.value)
  })

  it('collapses duplicates and keeps every distinct thing the user typed', () => {
    const record = versionOneProfile({
      exercisePreferences: {
        preferred: ['RDL', 'Romanian deadlift', 'Weird machine', 'Weird machine'],
        disliked: [],
      },
    })

    const result = migrateProfileRecord(record, { resolveExerciseId })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.exercisePreferences).toEqual({
      preferred: { exerciseIds: ['romanian-deadlift'], freeText: ['Weird machine'] },
      disliked: { exerciseIds: [], freeText: [] },
    })
  })
})
