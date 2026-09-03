/**
 * The active session: a workout being performed, and the operations a gym floor
 * needs to perform on it.
 *
 * This is pure. It takes a workout and returns a new one — no React, no storage,
 * no clock. The store above it persists; the screen above that renders. Keeping
 * the rules here means the "what happens when I log a set" question has one
 * answer that can be tested without a browser.
 *
 * IT NEVER DELETES A RECORD SILENTLY. Editing a logged set rewrites that record;
 * undo removes the LAST one and says which; nothing else touches records at all.
 * The recalibration engine already refuses to lose logged work, and this module
 * is the other half of that promise: the only code that writes records.
 */
import {
  blockEntries,
  isSupersetBlock,
  workingSets,
  type ExerciseEntry,
  type SetRecord,
  type SetTarget,
  type Workout,
  type WorkoutBlock,
} from '../validation/workoutSchema'

/* ------------------------------------------------------------------ *
 * Where we are
 * ------------------------------------------------------------------ */

export interface SessionPosition {
  readonly blockId: string
  readonly entryId: string
  readonly setId: string
  /** 1-based, for "Set 2 of 4". */
  readonly setNumber: number
  readonly setCount: number
  /** For a superset, which round both moves are on. Null for a single. */
  readonly round: number | null
}

/** True when every programmed set in the session has a record. */
export function isComplete(workout: Workout): boolean {
  return workout.blocks.every((block) =>
    blockEntries(block).every((entry) =>
      entry.targets.every((target) => entry.records.some((record) => record.setId === target.setId)),
    ),
  )
}

/**
 * The next set to perform.
 *
 * A superset advances BOTH moves together: round one of move A, then round one
 * of move B, then round two. Walking the moves independently would let someone
 * finish all of move A before starting move B, which is not a superset.
 */
export function nextPosition(workout: Workout): SessionPosition | null {
  for (const block of workout.blocks) {
    if (!isSupersetBlock(block)) {
      const entry = block.entry
      const target = entry.targets.find(
        (candidate) => !entry.records.some((record) => record.setId === candidate.setId),
      )
      if (!target) continue
      return {
        blockId: block.blockId,
        entryId: entry.entryId,
        setId: target.setId,
        setNumber: entry.targets.indexOf(target) + 1,
        setCount: entry.targets.length,
        round: null,
      }
    }

    for (let round = 0; round < block.rounds; round += 1) {
      for (const move of block.moves) {
        const target = move.targets[round]
        if (!target) continue
        if (move.records.some((record) => record.setId === target.setId)) continue
        return {
          blockId: block.blockId,
          entryId: move.entryId,
          setId: target.setId,
          setNumber: round + 1,
          setCount: block.rounds,
          round: round + 1,
        }
      }
    }
  }
  return null
}

/** The entry a given id names, wherever it sits. */
export function findEntry(workout: Workout, entryId: string): ExerciseEntry | null {
  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) if (entry.entryId === entryId) return entry
  }
  return null
}

export function findTargetIn(entry: ExerciseEntry, setId: string): SetTarget | null {
  return entry.targets.find((target) => target.setId === setId) ?? null
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** What the logger collects. Everything else on a record is derived or supplied. */
export interface LoggedSet {
  readonly reps: number
  readonly load: SetRecord['load']
  readonly rir: number | null
  readonly outcome?: SetRecord['outcome']
  readonly note?: string
}

function mapEntry(
  workout: Workout,
  entryId: string,
  change: (entry: ExerciseEntry) => ExerciseEntry,
): Workout {
  const blocks = workout.blocks.map((block): WorkoutBlock => {
    if (!isSupersetBlock(block)) {
      return block.entry.entryId === entryId ? { ...block, entry: change(block.entry) } : block
    }
    if (!block.moves.some((move) => move.entryId === entryId)) return block
    // A superset holds exactly two moves; rebuild the pair rather than mapping
    // an array back into a tuple.
    return {
      ...block,
      moves: [
        block.moves[0].entryId === entryId ? change(block.moves[0]) : block.moves[0],
        block.moves[1].entryId === entryId ? change(block.moves[1]) : block.moves[1],
      ],
    }
  })
  return { ...workout, blocks }
}

/**
 * Log a set.
 *
 * Logging the same set twice REPLACES the record rather than appending a second
 * one — the plan requires that tapping a completed value and correcting it
 * returns you to the same place, and two records for one set would make "what
 * did I lift" ambiguous.
 */
export function logSet(
  workout: Workout,
  entryId: string,
  setId: string,
  logged: LoggedSet,
  at: string,
): Workout {
  return mapEntry(workout, entryId, (entry) => {
    const target = findTargetIn(entry, setId)
    if (!target) return entry

    const record: SetRecord = {
      setId,
      outcome: logged.outcome ?? 'completed',
      reps: logged.reps,
      repUnit: target.reps.unit,
      load: logged.load,
      rir: logged.rir,
      loggedAt: at,
      drops: [],
      note: logged.note ?? '',
    }

    const existing = entry.records.findIndex((candidate) => candidate.setId === setId)
    const records =
      existing === -1
        ? [...entry.records, record]
        : entry.records.map((candidate, index) => (index === existing ? record : candidate))

    return { ...entry, records }
  })
}

/** Correct a set that is already logged. Only the fields given change. */
export function editRecord(
  workout: Workout,
  entryId: string,
  setId: string,
  patch: Partial<LoggedSet>,
  at: string,
): Workout {
  return mapEntry(workout, entryId, (entry) => ({
    ...entry,
    records: entry.records.map((record) =>
      record.setId !== setId
        ? record
        : {
            ...record,
            reps: patch.reps ?? record.reps,
            load: patch.load === undefined ? record.load : patch.load,
            rir: patch.rir === undefined ? record.rir : patch.rir,
            outcome: patch.outcome ?? record.outcome,
            note: patch.note ?? record.note,
            loggedAt: at,
          },
    ),
  }))
}

export interface UndoResult {
  readonly workout: Workout
  /** What was undone, so the UI can say so rather than silently changing. */
  readonly undone: { readonly entryId: string; readonly setId: string } | null
}

/**
 * Undo the most recently logged set, wherever it is.
 *
 * "Most recent" is by logged timestamp, not by position: someone who goes back
 * and corrects set two, then undoes, means the correction.
 */
export function undoLastSet(workout: Workout): UndoResult {
  let newest: { entryId: string; record: SetRecord } | null = null

  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) {
      for (const record of entry.records) {
        if (!newest || record.loggedAt >= newest.record.loggedAt) {
          newest = { entryId: entry.entryId, record }
        }
      }
    }
  }

  if (!newest) return { workout, undone: null }

  const target = newest
  return {
    workout: mapEntry(workout, target.entryId, (entry) => ({
      ...entry,
      records: entry.records.filter((record) => record.setId !== target.record.setId),
    })),
    undone: { entryId: target.entryId, setId: target.record.setId },
  }
}

/** Mark a set skipped — a record, not an absence, so the session stays honest. */
export function skipSet(workout: Workout, entryId: string, setId: string, at: string): Workout {
  return logSet(workout, entryId, setId, { reps: 0, load: null, rir: null, outcome: 'skipped' }, at)
}

/* ------------------------------------------------------------------ *
 * Reading, for the screen
 * ------------------------------------------------------------------ */

export interface EntryProgress {
  readonly entryId: string
  readonly logged: number
  readonly total: number
  readonly complete: boolean
}

export function entryProgress(entry: ExerciseEntry): EntryProgress {
  const logged = entry.targets.filter((target) =>
    entry.records.some((record) => record.setId === target.setId),
  ).length
  return {
    entryId: entry.entryId,
    logged,
    total: entry.targets.length,
    complete: logged === entry.targets.length,
  }
}

/**
 * Whether a superset round is finished — BOTH moves logged for that round.
 *
 * This is what gives the final round its completion authority: the session is
 * done when the last round of the last block is complete on both moves, not
 * when one move runs out of sets.
 */
export function isRoundComplete(block: WorkoutBlock, round: number): boolean {
  if (!isSupersetBlock(block)) {
    const target = block.entry.targets[round - 1]
    return target !== undefined && block.entry.records.some((record) => record.setId === target.setId)
  }
  return block.moves.every((move) => {
    const target = move.targets[round - 1]
    return target !== undefined && move.records.some((record) => record.setId === target.setId)
  })
}

/** Working sets only — warm-ups are excluded from totals, as every later phase requires. */
export function workingSetCount(workout: Workout): { logged: number; total: number } {
  let logged = 0
  let total = 0
  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) {
      for (const target of workingSets(entry.targets)) {
        total += 1
        if (entry.records.some((record) => record.setId === target.setId)) logged += 1
      }
    }
  }
  return { logged, total }
}

/** Total volume lifted so far, for the session header. Warm-ups excluded. */
export function loggedVolume(workout: Workout): number {
  let volume = 0
  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) {
      const warmUpIds = new Set(
        entry.targets.filter((target) => target.kind === 'warm-up').map((target) => target.setId),
      )
      for (const record of entry.records) {
        if (warmUpIds.has(record.setId) || record.outcome === 'skipped') continue
        if (!record.load) continue
        // A per-hand load is lifted by two hands.
        const perSet = record.load.measure === 'per-hand' ? record.load.value * 2 : record.load.value
        volume += perSet * record.reps
      }
    }
  }
  return Math.round(volume)
}
