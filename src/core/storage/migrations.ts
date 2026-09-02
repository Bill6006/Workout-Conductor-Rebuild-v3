import { SCHEMA_VERSION } from '../validation/schemas'
import { migrateExercisePreferencesToV2, type ExerciseIdResolver } from './exercisePreferencesMigration'

/**
 * Version-to-version migration, with unknown-field preservation.
 *
 * ADDING A VERSION:
 *   1. Bump `SCHEMA_VERSION` in core/validation/schemas.ts and change the schema.
 *   2. Append one entry to `PROFILE_MIGRATIONS`, from the current top version to
 *      the new one, with a one-line `description` a log can print.
 *   3. Add a test that feeds a real record of the older version through
 *      `migrateProfileRecord` and validates the result.
 *
 * A migration only has to produce the fields it changes. The runner carries every
 * other key through untouched — including keys written by a FUTURE build that this
 * one has never heard of — unless the migration names them in `removes`.
 *
 * MIGRATIONS ARE PURE, AND THEY DO NOT GO LOOKING FOR THINGS. A step that needs to
 * know something the record does not contain — whether a typed exercise name is in
 * the catalog, say — takes it from the injected `MigrationContext` rather than
 * importing it. That is what keeps the boot path free of catalog data, and it is
 * what makes every step testable with a stub instead of a fixture.
 */

/**
 * What a migration may be given from outside. Everything on it is optional, and
 * every step must produce a correct, lossless result without it — a caller that
 * cannot supply a resolver still gets a valid profile, just one where fewer typed
 * entries were recognised.
 */
export interface MigrationContext {
  /**
   * Typed exercise text to a catalog id, or `null` when nothing matched exactly.
   * Build one with `createExerciseNameResolver` from `catalog/exercises` AFTER
   * dynamically importing the catalog data; never import that data to get here.
   */
  readonly resolveExerciseId?: ExerciseIdResolver
}

export interface Migration {
  readonly from: number
  readonly to: number
  readonly description: string
  /** Keys this step deliberately drops. Everything not listed is carried through. */
  readonly removes?: readonly string[]
  migrate(record: Record<string, unknown>, context: MigrationContext): Record<string, unknown>
}

/** The registry. Ordered by `from`; exactly one step per version boundary. */
export const PROFILE_MIGRATIONS: readonly Migration[] = [
  {
    from: 1,
    to: 2,
    description: 'exercise preferences become catalog-backed, keeping unmatched text verbatim',
    migrate: (record, context) => migrateExercisePreferencesToV2(record, context.resolveExerciseId),
  },
]

export const VERSION_KEY = 'schemaVersion'

export type MigrationFailureReason =
  'not-a-record' | 'missing-version' | 'future-version' | 'no-path' | 'migration-failed'

export type MigrationResult =
  | {
      readonly ok: true
      readonly value: Record<string, unknown>
      readonly fromVersion: number
      readonly toVersion: number
      /** Descriptions of the steps that ran, in order. Empty when already current. */
      readonly applied: string[]
    }
  | {
      readonly ok: false
      readonly reason: MigrationFailureReason
      readonly message: string
      readonly fromVersion: number | null
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The stored schema version, or null when the record does not declare one. */
export function readSchemaVersion(value: unknown): number | null {
  if (!isRecord(value)) return null
  const version = value[VERSION_KEY]
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null
}

/**
 * Copies keys that exist in `before` but not in `after` — the unknown-field
 * carry-through. `removes` is authoritative: a named key is gone from the result
 * whichever side it came from, which is how a rename drops the old name even when
 * the step spread the whole record.
 */
export function carryThrough(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  removes: readonly string[] = [],
): Record<string, unknown> {
  const dropped = new Set(removes)
  const result: Record<string, unknown> = { ...after }
  for (const key of dropped) delete result[key]
  for (const [key, value] of Object.entries(before)) {
    if (dropped.has(key)) continue
    if (!(key in result)) result[key] = value
  }
  return result
}

/** Generic runner. `migrateProfileRecord` is the profile-bound version of this. */
export function migrateRecord(
  raw: unknown,
  migrations: readonly Migration[],
  targetVersion: number,
  context: MigrationContext = {},
): MigrationResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'not-a-record', message: 'Expected a stored object.', fromVersion: null }
  }

  const fromVersion = readSchemaVersion(raw)
  if (fromVersion === null) {
    return {
      ok: false,
      reason: 'missing-version',
      message: `The record has no usable "${VERSION_KEY}", so its shape cannot be established.`,
      fromVersion: null,
    }
  }

  if (fromVersion > targetVersion) {
    return {
      ok: false,
      reason: 'future-version',
      message: `The record is schema version ${fromVersion}; this build understands up to ${targetVersion}. Update the app before opening it.`,
      fromVersion,
    }
  }

  let current: Record<string, unknown> = { ...raw }
  let version = fromVersion
  const applied: string[] = []

  while (version < targetVersion) {
    const step = migrations.find((migration) => migration.from === version)
    if (!step) {
      return {
        ok: false,
        reason: 'no-path',
        message: `No migration registered from schema version ${version} to ${version + 1}.`,
        fromVersion,
      }
    }

    let next: Record<string, unknown>
    try {
      next = step.migrate({ ...current }, context)
    } catch (error) {
      return {
        ok: false,
        reason: 'migration-failed',
        message: `Migration ${step.from} to ${step.to} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        fromVersion,
      }
    }

    if (!isRecord(next)) {
      return {
        ok: false,
        reason: 'migration-failed',
        message: `Migration ${step.from} to ${step.to} did not return an object.`,
        fromVersion,
      }
    }

    current = carryThrough(current, next, step.removes)
    current[VERSION_KEY] = step.to
    applied.push(`${step.from}->${step.to}: ${step.description}`)
    version = step.to
  }

  return { ok: true, value: current, fromVersion, toVersion: version, applied }
}

/**
 * Brings a stored profile record up to the current `SCHEMA_VERSION`.
 *
 * `context` is optional and omitting it is safe: the v1 -> v2 step then keeps
 * every typed exercise preference as free text rather than resolving any of it to
 * a catalog id, which loses nothing. Pass `resolveExerciseId` from a call site
 * that already holds the catalog.
 */
export function migrateProfileRecord(raw: unknown, context: MigrationContext = {}): MigrationResult {
  return migrateRecord(raw, PROFILE_MIGRATIONS, SCHEMA_VERSION, context)
}
