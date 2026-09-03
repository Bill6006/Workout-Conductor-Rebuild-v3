import {
  StorageError,
  WORKOUT_STORE,
  createIdbStore,
  createIdbWorkoutBrowser,
  type StorageErrorCode,
  type WorkoutBrowser,
} from './db'
import { saveVerified, type SaveResult, type VerifiedStore } from './verifiedSave'
import type { ValidationIssue } from '../validation/validate'
import {
  toWorkoutRecord,
  workoutRecordValidator,
  type GeneratedWorkoutRecord,
  type RecalibrationMetadata,
  type Workout,
} from '../validation/workoutSchema'

/**
 * THE generated-session persistence path.
 *
 * A generated workout is the user's own durable data — the session they are about
 * to perform, and after Phase 5 the session they logged. It lives in IndexedDB,
 * never in localStorage, and every write goes through `saveVerified`, exactly as
 * the profile does. Do not add a second way to write one.
 *
 * READS ARE VALIDATED, NEVER TRUSTED. A row comes back as `unknown`, is validated
 * against `generatedWorkoutRecordSchema`, and only then becomes a `Workout`. A
 * row that no longer validates is reported as `invalid` with the raw value kept,
 * so a repair screen has something to show; it is never silently discarded and
 * never silently half-read.
 *
 * NO MIGRATION RUNNER YET, ON PURPOSE. `WORKOUT_SCHEMA_VERSION` is 1 and there is
 * exactly one shape in the wild. When a second arrives, register the step the way
 * `migrations.ts` does for the profile and run it here between the read and the
 * validate — not by loosening the schema.
 */

export type LoadWorkoutResult =
  | { readonly status: 'ok'; readonly record: GeneratedWorkoutRecord }
  /** Storage works; there is simply no session under that key. */
  | { readonly status: 'empty' }
  | {
      readonly status: 'invalid'
      readonly message: string
      readonly issues: ValidationIssue[]
      readonly raw: unknown
    }
  | { readonly status: 'unavailable'; readonly message: string; readonly code: StorageErrorCode }

/**
 * A listing. Rows that no longer validate are counted rather than thrown away, so
 * a caller can say "3 sessions, 1 unreadable" instead of quietly showing 3.
 */
export type ListWorkoutsResult =
  | {
      readonly status: 'ok'
      readonly records: GeneratedWorkoutRecord[]
      readonly unreadable: number
    }
  | { readonly status: 'unavailable'; readonly message: string; readonly code: StorageErrorCode }

export interface WorkoutRepository {
  /** One session by id. */
  load(id: string): Promise<LoadWorkoutResult>
  /** Every session generated for one calendar day, newest save first. */
  loadForDate(forDate: string): Promise<ListWorkoutsResult>
  /** The most recent sessions by the day they are for, newest first. */
  listRecent(limit?: number): Promise<ListWorkoutsResult>
  /** Writes a whole record. Verified: validate, write, read back, compare. */
  save(record: GeneratedWorkoutRecord): Promise<SaveResult<GeneratedWorkoutRecord>>
  /**
   * Wraps a generated workout as a record and saves it. `savedAt` is supplied by
   * the caller — this module reads no clock.
   */
  saveWorkout(
    workout: Workout,
    savedAt: string,
    recalibration?: RecalibrationMetadata | null,
  ): Promise<SaveResult<GeneratedWorkoutRecord>>
  remove(id: string): Promise<void>
}

/** How many sessions `listRecent` returns when the caller does not say. */
export const DEFAULT_RECENT_WORKOUT_LIMIT = 10

function unavailable(error: unknown): { message: string; code: StorageErrorCode } {
  if (StorageError.is(error)) return { message: error.message, code: error.code }
  return { message: error instanceof Error ? error.message : String(error), code: 'failed' }
}

/** Newest save first. `savedAt` is an ISO string, so a string compare is a time compare. */
function bySavedAtDescending(a: GeneratedWorkoutRecord, b: GeneratedWorkoutRecord): number {
  if (a.savedAt === b.savedAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  return a.savedAt < b.savedAt ? 1 : -1
}

function validateRows(rows: readonly unknown[]): { records: GeneratedWorkoutRecord[]; unreadable: number } {
  const records: GeneratedWorkoutRecord[] = []
  let unreadable = 0
  for (const row of rows) {
    const result = workoutRecordValidator.validate(row)
    if (result.ok) records.push(result.value)
    else unreadable += 1
  }
  return { records, unreadable }
}

export function createWorkoutRepository(
  store: VerifiedStore<GeneratedWorkoutRecord>,
  browser: WorkoutBrowser,
): WorkoutRepository {
  return {
    async load(id) {
      let raw: unknown
      try {
        raw = await store.read(id)
      } catch (error) {
        return { status: 'unavailable', ...unavailable(error) }
      }

      if (raw === undefined || raw === null) return { status: 'empty' }

      const validated = workoutRecordValidator.validate(raw)
      if (!validated.ok) {
        return {
          status: 'invalid',
          message: 'The saved session does not match the shape this build expects.',
          issues: validated.issues,
          raw,
        }
      }

      return { status: 'ok', record: validated.value }
    },

    async loadForDate(forDate) {
      let rows: readonly unknown[]
      try {
        rows = await browser.byDate(forDate)
      } catch (error) {
        return { status: 'unavailable', ...unavailable(error) }
      }
      const { records, unreadable } = validateRows(rows)
      return { status: 'ok', records: records.sort(bySavedAtDescending), unreadable }
    },

    async listRecent(limit = DEFAULT_RECENT_WORKOUT_LIMIT) {
      let rows: readonly unknown[]
      try {
        rows = await browser.recent(limit)
      } catch (error) {
        return { status: 'unavailable', ...unavailable(error) }
      }
      const { records, unreadable } = validateRows(rows)
      // The browser orders by the day a session is FOR; two sessions generated for
      // the same day are then ordered by when they were saved, so a regeneration
      // comes back ahead of the session it replaced.
      const sorted = records.sort((a, b) =>
        a.forDate === b.forDate ? bySavedAtDescending(a, b) : a.forDate < b.forDate ? 1 : -1,
      )
      return { status: 'ok', records: sorted.slice(0, limit), unreadable }
    },

    async save(record) {
      return saveVerified(store, record)
    },

    async saveWorkout(workout, savedAt, recalibration = null) {
      return saveVerified(store, toWorkoutRecord(workout, savedAt, recalibration))
    },

    async remove(id) {
      await store.remove(id)
    },
  }
}

/** The IndexedDB-backed store for generated sessions. */
export function createWorkoutStore(): VerifiedStore<GeneratedWorkoutRecord> {
  return createIdbStore<GeneratedWorkoutRecord>({
    name: WORKOUT_STORE,
    keyOf: (record) => record.id,
    validator: workoutRecordValidator,
  })
}

let repository: WorkoutRepository | null = null

/** The app-wide repository, created lazily so nothing opens IndexedDB at import time. */
export function getWorkoutRepository(): WorkoutRepository {
  repository ??= createWorkoutRepository(createWorkoutStore(), createIdbWorkoutBrowser())
  return repository
}

/** Test seam. Passing `null` restores the IndexedDB-backed repository. */
export function setWorkoutRepository(next: WorkoutRepository | null): void {
  repository = next
}

/**
 * A `WorkoutBrowser` over any `Map` of rows — the in-memory `VerifiedStore`'s
 * `records`, in practice.
 *
 * It exists so the repository's listing paths are tested for real rather than
 * stubbed: jsdom has no IndexedDB, and a stub that returns a hand-made array
 * would never notice the repository asking for the wrong thing.
 */
export function createMemoryWorkoutBrowser(records: ReadonlyMap<string, unknown>): WorkoutBrowser {
  const dateOf = (row: unknown): string =>
    typeof row === 'object' && row !== null && typeof (row as { forDate?: unknown }).forDate === 'string'
      ? (row as { forDate: string }).forDate
      : ''

  return {
    async byDate(forDate) {
      return [...records.values()].filter((row) => dateOf(row) === forDate)
    },
    async recent(limit) {
      return [...records.values()]
        .sort((a, b) => (dateOf(a) === dateOf(b) ? 0 : dateOf(a) < dateOf(b) ? 1 : -1))
        .slice(0, limit)
    },
  }
}
