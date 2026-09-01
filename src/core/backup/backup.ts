import { z } from 'zod'
import { nowIso } from '../time/clock'
import { SCHEMA_VERSION, isoTimestampSchema, profileSchema, type Profile } from '../validation/schemas'
import { formatIssues, profileValidator, type ValidationIssue } from '../validation/validate'
import { migrateProfileRecord } from '../storage/migrations'
import { getProfileRepository, type ProfileRepository } from '../storage/profileRepository'
import { describeSaveFailure } from '../storage/verifiedSave'

/**
 * Export / import foundation.
 *
 * Phase 1 ships the envelope, the serializer, and a previewable inspector. Full
 * restore across every store lands in Phase 8 — which is why `data` is an object
 * with one member rather than a bare profile: adding `workouts` and `history`
 * later must not change the envelope's shape.
 *
 * The envelope schema lives here, not in schemas.ts, because it is a transport
 * format rather than durable data. It composes `profileSchema`; it never restates it.
 */

export const BACKUP_APP_ID = 'workout-conductor'

export interface BackupEnvelope {
  app: typeof BACKUP_APP_ID
  schemaVersion: number
  exportedAt: string
  data: { profile: Profile | null }
}

export const backupEnvelopeSchema = z.looseObject({
  app: z.literal(BACKUP_APP_ID),
  schemaVersion: z.number().int().min(1),
  exportedAt: isoTimestampSchema,
  data: z.looseObject({ profile: profileSchema.nullable() }),
})

export type BackupProblemCode =
  | 'malformed-json'
  | 'not-an-object'
  | 'wrong-app'
  | 'missing-version'
  | 'future-version'
  | 'invalid-envelope'
  | 'invalid-profile'
  | 'nothing-to-import'

export interface BackupProblem {
  readonly code: BackupProblemCode
  /** Plain language, safe to render. Never a stack trace. */
  readonly message: string
}

export interface BackupPreview {
  /** True only when `applyBackup` would succeed. */
  readonly importable: boolean
  readonly app: string | null
  readonly schemaVersion: number | null
  readonly exportedAt: string | null
  readonly contains: { readonly profile: boolean }
  /** One line describing the file, for the confirmation step. */
  readonly summary: string
  readonly problems: BackupProblem[]
  /** Migrated and validated. Present only when `importable`. */
  readonly envelope: BackupEnvelope | null
}

/** Pure envelope construction — no storage, no clock unless you leave `exportedAt` off. */
export function createBackupEnvelope(profile: Profile | null, exportedAt: string = nowIso()): BackupEnvelope {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    data: { profile },
  }
}

/** Reads current data and wraps it in an envelope. */
export async function buildBackup(
  repository: ProfileRepository = getProfileRepository(),
  exportedAt: string = nowIso(),
): Promise<BackupEnvelope> {
  const loaded = await repository.load()
  const profile = loaded.status === 'ok' ? loaded.profile : null
  return createBackupEnvelope(profile, exportedAt)
}

/** Pretty JSON, so a curious user can read their own export in a text editor. */
export function serializeBackup(envelope: BackupEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`
}

/** e.g. `workout-conductor-backup-2026-09-01.json` */
export function backupFilename(exportedAt: string = nowIso()): string {
  const day = exportedAt.slice(0, 10)
  return `workout-conductor-backup-${/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'export'}.json`
}

function fail(problems: BackupProblem[], partial: Partial<BackupPreview> = {}): BackupPreview {
  return {
    importable: false,
    app: null,
    schemaVersion: null,
    exportedAt: null,
    contains: { profile: false },
    summary: problems[0]?.message ?? 'This file cannot be imported.',
    problems,
    envelope: null,
    ...partial,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses and validates WITHOUT applying anything.
 *
 * Import is always previewable: the user sees what the file holds and every
 * problem found before a single byte is written.
 */
export function inspectBackup(text: string): BackupPreview {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return fail([
      { code: 'malformed-json', message: 'This file is not valid JSON, so it cannot be read as a backup.' },
    ])
  }

  if (!isRecord(parsed)) {
    return fail([{ code: 'not-an-object', message: 'A backup file must contain a single JSON object.' }])
  }

  const app = typeof parsed.app === 'string' ? parsed.app : null
  if (app !== BACKUP_APP_ID) {
    return fail(
      [
        {
          code: 'wrong-app',
          message: `This backup was written by ${app ? `"${app}"` : 'another app'}, not Workout Conductor.`,
        },
      ],
      { app },
    )
  }

  const rawVersion = parsed.schemaVersion
  const schemaVersion =
    typeof rawVersion === 'number' && Number.isInteger(rawVersion) && rawVersion >= 1 ? rawVersion : null
  if (schemaVersion === null) {
    return fail(
      [
        {
          code: 'missing-version',
          message: 'This backup does not say which data version it was written in.',
        },
      ],
      { app },
    )
  }
  if (schemaVersion > SCHEMA_VERSION) {
    return fail(
      [
        {
          code: 'future-version',
          message: `This backup is version ${schemaVersion} and this build understands version ${SCHEMA_VERSION}. Update the app, then import it.`,
        },
      ],
      { app, schemaVersion },
    )
  }

  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null
  const data = isRecord(parsed.data) ? parsed.data : null
  const rawProfile = data?.profile

  if (rawProfile === undefined || rawProfile === null) {
    return fail(
      [
        {
          code: 'nothing-to-import',
          message: 'This backup does not contain a profile, so there is nothing to restore.',
        },
      ],
      { app, schemaVersion, exportedAt },
    )
  }

  const migrated = migrateProfileRecord(rawProfile)
  if (!migrated.ok) {
    return fail([{ code: 'invalid-profile', message: migrated.message }], { app, schemaVersion, exportedAt })
  }

  const validated = profileValidator.validate(migrated.value)
  if (!validated.ok) {
    return fail(
      [
        {
          code: 'invalid-profile',
          message: `The profile in this backup is not usable: ${formatIssues(validated.issues)}`,
        },
      ],
      { app, schemaVersion, exportedAt, contains: { profile: true } },
    )
  }

  const envelope: BackupEnvelope = {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: exportedAt ?? nowIso(),
    data: { profile: validated.value },
  }

  const envelopeCheck = backupEnvelopeSchema.safeParse(envelope)
  if (!envelopeCheck.success) {
    const issues: ValidationIssue[] = envelopeCheck.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }))
    return fail(
      [{ code: 'invalid-envelope', message: `This backup is malformed: ${formatIssues(issues)}` }],
      {
        app,
        schemaVersion,
        exportedAt,
      },
    )
  }

  const when = exportedAt ? ` exported ${exportedAt.slice(0, 10)}` : ''
  return {
    importable: true,
    app,
    schemaVersion,
    exportedAt,
    contains: { profile: true },
    summary: `Workout Conductor backup${when}: 1 profile. Importing replaces your current profile.`,
    problems: [],
    envelope,
  }
}

export type ApplyBackupResult =
  | {
      readonly ok: true
      readonly profile: Profile
      /** What was in storage beforehand — pass to `rollbackBackup` to undo. */
      readonly previous: Profile | null
    }
  | {
      readonly ok: false
      readonly reason: 'not-importable' | 'save-failed'
      readonly message: string
      readonly previous: Profile | null
    }

/**
 * Applies a preview that was already inspected. Writes through `saveVerified`, so
 * a partial or corrupted write is rolled back before this ever reports success.
 */
export async function applyBackup(
  preview: BackupPreview,
  repository: ProfileRepository = getProfileRepository(),
): Promise<ApplyBackupResult> {
  const incoming = preview.importable ? preview.envelope?.data.profile : null
  if (!incoming) {
    return {
      ok: false,
      reason: 'not-importable',
      message: preview.problems[0]?.message ?? 'This backup cannot be imported.',
      previous: null,
    }
  }

  const before = await repository.load()
  const previous = before.status === 'ok' ? before.profile : null

  const saved = await repository.save(incoming)
  if (!saved.ok) {
    return { ok: false, reason: 'save-failed', message: describeSaveFailure(saved), previous }
  }

  return { ok: true, profile: saved.value, previous }
}

/** Undoes an applied import using the `previous` value the apply result returned. */
export async function rollbackBackup(
  previous: Profile | null,
  repository: ProfileRepository = getProfileRepository(),
): Promise<boolean> {
  if (!previous) {
    await repository.clear()
    return true
  }
  const restored = await repository.save(previous)
  return restored.ok
}
