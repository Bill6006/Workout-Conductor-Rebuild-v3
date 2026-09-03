/**
 * What a recalibration may not touch.
 *
 * The product plan's priority rules, in code. Reading them here should be enough
 * to know what is safe:
 *
 *   NEVER changed — completed exercises, completed sets, logged weights, logged
 *   reps, logged RIR, earned personal records, user notes.
 *
 *   NORMALLY locked — the current exercise once its first working set is logged,
 *   user-pinned exercises, exercises the user explicitly chose, and an accepted
 *   alternative.
 *
 * Everything else is the "remaining workout", and only that is recalculated.
 */
import type { ExerciseEntry, Workout, WorkoutBlock } from '../../core/validation/workoutSchema'
import { blockEntries, isSupersetBlock, workingSets } from '../../core/validation/workoutSchema'

export type LockReason = 'has-completed-sets' | 'current-exercise' | 'user-pinned' | 'accepted-alternative'

export interface EntryLock {
  readonly entryId: string
  readonly reason: LockReason
}

/** True when anything at all has been logged against this entry. */
export function hasAnyRecord(entry: ExerciseEntry): boolean {
  return entry.records.length > 0
}

/**
 * True once a WORKING set has been logged.
 *
 * Warm-up sets deliberately do not lock an exercise: someone who has warmed up
 * and then realises the rack is taken should still be able to swap the movement.
 * The plan says the same thing from the other side — warm-ups are excluded from
 * progression, plateaus, and PR evidence, so they are not the thing that commits
 * you to a lift.
 */
export function hasLoggedWorkingSet(entry: ExerciseEntry): boolean {
  const workingIds = new Set(workingSets(entry.targets).map((target) => target.setId))
  return entry.records.some((record) => workingIds.has(record.setId))
}

/** Every entry the recalibration must leave exactly as it is, and why. */
export function lockedEntries(
  workout: Workout,
  options: {
    readonly currentEntryId?: string | null
    readonly pinnedEntryIds?: readonly string[]
  } = {},
): EntryLock[] {
  const pinned = new Set(options.pinnedEntryIds ?? [])
  const locks: EntryLock[] = []

  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) {
      if (hasAnyRecord(entry)) {
        locks.push({ entryId: entry.entryId, reason: 'has-completed-sets' })
        continue
      }
      if (pinned.has(entry.entryId)) {
        locks.push({ entryId: entry.entryId, reason: 'user-pinned' })
        continue
      }
      // An entry that carries a replacement is one the user already chose.
      // Re-choosing it for them is the thing that makes an app feel like it is
      // arguing with you.
      if (entry.replacements.length > 0) {
        locks.push({ entryId: entry.entryId, reason: 'accepted-alternative' })
        continue
      }
      if (options.currentEntryId === entry.entryId && hasLoggedWorkingSet(entry)) {
        locks.push({ entryId: entry.entryId, reason: 'current-exercise' })
      }
    }
  }

  return locks
}

export function lockedEntryIds(
  workout: Workout,
  options: Parameters<typeof lockedEntries>[1] = {},
): Set<string> {
  return new Set(lockedEntries(workout, options).map((lock) => lock.entryId))
}

/**
 * A block is locked when ANY of its entries is.
 *
 * A superset is one block with two moves, and half a locked superset is not a
 * thing a session can contain — rewriting one move while the other holds logged
 * sets would break the round structure the two share.
 */
export function lockedBlockIds(
  workout: Workout,
  options: Parameters<typeof lockedEntries>[1] = {},
): Set<string> {
  const entries = lockedEntryIds(workout, options)
  const blocks = new Set<string>()
  for (const block of workout.blocks) {
    if (blockEntries(block).some((entry) => entries.has(entry.entryId))) blocks.add(block.blockId)
  }
  return blocks
}

/** The blocks a recalibration is free to rebuild. */
export function mutableBlocks(
  workout: Workout,
  options: Parameters<typeof lockedEntries>[1] = {},
): WorkoutBlock[] {
  const locked = lockedBlockIds(workout, options)
  return workout.blocks.filter((block) => !locked.has(block.blockId))
}

/** The blocks a recalibration must carry through untouched, in their original order. */
export function preservedBlocks(
  workout: Workout,
  options: Parameters<typeof lockedEntries>[1] = {},
): WorkoutBlock[] {
  const locked = lockedBlockIds(workout, options)
  return workout.blocks.filter((block) => locked.has(block.blockId))
}

/**
 * The safety net: does the new session still contain every logged record the old
 * one had, byte for byte?
 *
 * This is asserted on the way out of every recalibration rather than trusted
 * from the way in. A rule that is only enforced by the code that means to obey
 * it is not enforced at all — and this is the one rule whose violation costs a
 * user work they actually did.
 */
export function completedWorkSurvives(before: Workout, after: Workout): boolean {
  const recordsOf = (workout: Workout) => {
    const map = new Map<string, string>()
    for (const block of workout.blocks) {
      for (const entry of blockEntries(block)) {
        for (const record of entry.records) {
          map.set(`${entry.entryId}:${record.setId}`, JSON.stringify(record))
        }
      }
    }
    return map
  }

  const was = recordsOf(before)
  const now = recordsOf(after)
  for (const [key, value] of was) {
    if (now.get(key) !== value) return false
  }
  return true
}

/** Every entry id in a workout, in performance order. */
export function entryIdsOf(workout: Workout): string[] {
  return workout.blocks.flatMap((block) => blockEntries(block).map((entry) => entry.entryId))
}

/** The block holding a given entry, or null. */
export function blockOf(workout: Workout, entryId: string): WorkoutBlock | null {
  return (
    workout.blocks.find((block) => blockEntries(block).some((entry) => entry.entryId === entryId)) ?? null
  )
}

/** True when replacing this entry would break a superset the user is part-way through. */
export function breaksActiveSuperset(workout: Workout, entryId: string): boolean {
  const block = blockOf(workout, entryId)
  if (!block || !isSupersetBlock(block)) return false
  return blockEntries(block).some((entry) => entry.entryId !== entryId && hasAnyRecord(entry))
}
