import { afterEach, describe, expect, it } from 'vitest'
import {
  BACKUP_APP_ID,
  applyBackup,
  backupFilename,
  buildBackup,
  createBackupEnvelope,
  inspectBackup,
  rollbackBackup,
  serializeBackup,
  type BackupEnvelope,
} from './backup'
import { fixedClock, setClock } from '../time/clock'
import { createMemoryStore } from '../storage/memoryStore'
import { createProfileRepository } from '../storage/profileRepository'
import { PROFILE_ID, SCHEMA_VERSION, createDefaultProfile, type Profile } from '../validation/schemas'
import { profileValidator } from '../validation/validate'

const NOW = '2026-09-01T12:00:00.000Z'
const LATER = '2026-09-02T09:30:00.000Z'

function makeRepository(seed?: Profile) {
  const store = createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed: seed ? { [PROFILE_ID]: seed } : {},
  })
  return { store, repository: createProfileRepository(store) }
}

afterEach(() => {
  setClock(null)
})

describe('buildBackup', () => {
  it('wraps the stored profile in an envelope', async () => {
    const profile = createDefaultProfile(NOW)
    const { repository } = makeRepository(profile)

    const envelope = await buildBackup(repository, LATER)

    expect(envelope).toEqual({
      app: BACKUP_APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: LATER,
      data: { profile },
    })
  })

  it('exports a null profile when there is nothing saved yet', async () => {
    const { repository } = makeRepository()
    const envelope = await buildBackup(repository, LATER)
    expect(envelope.data.profile).toBeNull()
  })

  it('reads the time from the clock when none is given', async () => {
    setClock(fixedClock(LATER))
    const { repository } = makeRepository(createDefaultProfile(NOW))
    expect((await buildBackup(repository)).exportedAt).toBe(LATER)
  })
})

describe('serializeBackup', () => {
  const envelope = createBackupEnvelope(createDefaultProfile(NOW), LATER)

  it('produces indented, newline-terminated JSON', () => {
    const text = serializeBackup(envelope)
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "app": "workout-conductor"')
  })

  it('round-trips through JSON without loss', () => {
    expect(JSON.parse(serializeBackup(envelope))).toEqual(envelope)
  })
})

describe('backupFilename', () => {
  it('names the file by its export date', () => {
    expect(backupFilename(LATER)).toBe('workout-conductor-backup-2026-09-02.json')
  })

  it('falls back rather than emitting a broken name', () => {
    expect(backupFilename('nonsense')).toBe('workout-conductor-backup-export.json')
  })
})

describe('inspectBackup — accepting a good file', () => {
  it('previews what the file holds without writing anything', async () => {
    const profile = createDefaultProfile(NOW)
    const { store, repository } = makeRepository()
    const text = serializeBackup(createBackupEnvelope(profile, LATER))

    const preview = inspectBackup(text)

    expect(preview.importable).toBe(true)
    expect(preview.app).toBe(BACKUP_APP_ID)
    expect(preview.schemaVersion).toBe(SCHEMA_VERSION)
    expect(preview.exportedAt).toBe(LATER)
    expect(preview.contains.profile).toBe(true)
    expect(preview.problems).toEqual([])
    expect(preview.summary).toContain('1 profile')
    // Nothing has been applied yet.
    expect(store.records.size).toBe(0)
    expect(await repository.load()).toEqual({ status: 'empty' })
  })

  it('keeps fields written by a future version of the app', () => {
    const profile = { ...createDefaultProfile(NOW), coachPersona: 'blunt' } as unknown as Profile
    const preview = inspectBackup(serializeBackup(createBackupEnvelope(profile, LATER)))

    expect(preview.importable).toBe(true)
    const restored = preview.envelope?.data.profile as unknown as Record<string, unknown>
    expect(restored.coachPersona).toBe('blunt')
  })
})

describe('inspectBackup — rejecting a bad file', () => {
  function problemCodes(text: string) {
    return inspectBackup(text).problems.map((problem) => problem.code)
  }

  it('rejects malformed JSON with a readable message, not a stack trace', () => {
    const preview = inspectBackup('{ "app": "workout-conductor",')
    expect(preview.importable).toBe(false)
    expect(preview.problems).toEqual([
      { code: 'malformed-json', message: 'This file is not valid JSON, so it cannot be read as a backup.' },
    ])
    expect(preview.summary).not.toMatch(/SyntaxError|at Object/)
  })

  it('rejects JSON that is not an object', () => {
    expect(problemCodes('[]')).toEqual(['not-an-object'])
    expect(problemCodes('42')).toEqual(['not-an-object'])
    expect(problemCodes('null')).toEqual(['not-an-object'])
  })

  it('rejects an envelope from another app and names it', () => {
    const preview = inspectBackup(JSON.stringify({ app: 'other-tracker', schemaVersion: 1, data: {} }))
    expect(preview.problems[0].code).toBe('wrong-app')
    expect(preview.problems[0].message).toContain('other-tracker')
    expect(preview.app).toBe('other-tracker')
  })

  it('rejects an envelope with no usable schema version', () => {
    expect(problemCodes(JSON.stringify({ app: BACKUP_APP_ID, data: {} }))).toEqual(['missing-version'])
    expect(problemCodes(JSON.stringify({ app: BACKUP_APP_ID, schemaVersion: '1', data: {} }))).toEqual([
      'missing-version',
    ])
  })

  it('rejects a newer schema version and tells the user to update', () => {
    const text = JSON.stringify({
      app: BACKUP_APP_ID,
      schemaVersion: SCHEMA_VERSION + 1,
      exportedAt: LATER,
      data: { profile: createDefaultProfile(NOW) },
    })
    const preview = inspectBackup(text)

    expect(preview.importable).toBe(false)
    expect(preview.problems[0].code).toBe('future-version')
    expect(preview.problems[0].message).toContain('Update the app')
    expect(preview.schemaVersion).toBe(SCHEMA_VERSION + 1)
  })

  it('rejects an envelope with no profile in it', () => {
    const text = serializeBackup(createBackupEnvelope(null, LATER))
    expect(problemCodes(text)).toEqual(['nothing-to-import'])
  })

  it('rejects a profile that does not validate, and explains why', () => {
    const broken = { ...createDefaultProfile(NOW), experience: 'wizard' }
    const text = JSON.stringify({
      app: BACKUP_APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: LATER,
      data: { profile: broken },
    })
    const preview = inspectBackup(text)

    expect(preview.importable).toBe(false)
    expect(preview.problems[0].code).toBe('invalid-profile')
    expect(preview.problems[0].message).toContain('experience')
  })
})

describe('applyBackup', () => {
  it('writes the previewed profile and reports what it replaced', async () => {
    const previous = { ...createDefaultProfile(NOW), units: 'metric' } as Profile
    const incoming = { ...createDefaultProfile(NOW), units: 'imperial', experience: 'advanced' } as Profile
    const { repository } = makeRepository(previous)

    const preview = inspectBackup(serializeBackup(createBackupEnvelope(incoming, LATER)))
    const result = await applyBackup(preview, repository)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.experience).toBe('advanced')
    expect(result.previous).toEqual(previous)

    const loaded = await repository.load()
    expect(loaded.status === 'ok' && loaded.profile.experience).toBe('advanced')
  })

  it('refuses a preview that was not importable', async () => {
    const { store, repository } = makeRepository()
    const result = await applyBackup(inspectBackup('not json'), repository)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-importable')
    expect(result.message).toContain('not valid JSON')
    expect(store.records.size).toBe(0)
  })

  it('reports a save that could not be verified, and leaves the old profile in place', async () => {
    const previous = createDefaultProfile(NOW)
    const { store, repository } = makeRepository(previous)
    let writes = 0
    store.faults.onWrite = (_key, value) => {
      writes += 1
      return writes === 1 ? { ...(value as Profile), experience: 'beginner' } : value
    }

    const incoming = { ...createDefaultProfile(NOW), experience: 'advanced' } as Profile
    const preview = inspectBackup(serializeBackup(createBackupEnvelope(incoming, LATER)))
    const result = await applyBackup(preview, repository)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('save-failed')
    expect(result.message).toContain('restored')
    expect(store.snapshot()[PROFILE_ID]).toEqual(previous)
  })

  it('survives a full build → serialize → inspect → apply cycle', async () => {
    const source = makeRepository(createDefaultProfile(NOW))
    const target = makeRepository()

    const text = serializeBackup(await buildBackup(source.repository, LATER))
    const preview = inspectBackup(text)
    const result = await applyBackup(preview, target.repository)

    expect(result.ok).toBe(true)
    const loaded = await target.repository.load()
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.profile).toEqual(createDefaultProfile(NOW))
  })
})

describe('rollbackBackup', () => {
  it('puts the replaced profile back', async () => {
    const previous = { ...createDefaultProfile(NOW), units: 'metric' } as Profile
    const { repository } = makeRepository(previous)

    const incoming = { ...createDefaultProfile(NOW), units: 'imperial' } as Profile
    const applied = await applyBackup(
      inspectBackup(serializeBackup(createBackupEnvelope(incoming, LATER))),
      repository,
    )
    expect(applied.ok).toBe(true)

    expect(await rollbackBackup(applied.previous, repository)).toBe(true)
    const loaded = await repository.load()
    expect(loaded.status === 'ok' && loaded.profile.units).toBe('metric')
  })

  it('clears the profile when there was none before the import', async () => {
    const { repository } = makeRepository()
    const incoming = createDefaultProfile(NOW)
    const applied = await applyBackup(
      inspectBackup(serializeBackup(createBackupEnvelope(incoming, LATER))),
      repository,
    )
    expect(applied.ok).toBe(true)

    expect(await rollbackBackup(null, repository)).toBe(true)
    expect(await repository.load()).toEqual({ status: 'empty' })
  })
})

describe('the envelope shape', () => {
  it('nests data under a named member so Phase 8 can add stores beside the profile', () => {
    const envelope: BackupEnvelope = createBackupEnvelope(null, LATER)
    expect(Object.keys(envelope)).toEqual(['app', 'schemaVersion', 'exportedAt', 'data'])
    expect(Object.keys(envelope.data)).toEqual(['profile'])
  })
})
