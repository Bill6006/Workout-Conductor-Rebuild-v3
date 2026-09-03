/**
 * What changed between two versions of a session.
 *
 * The plan asks for a compact summary — "Recalibrated to 30 min: 2 exercises
 * removed, 1 superset added." — and for the UI to be able to mark what changed
 * while leaving everything else visually stable. Both come from here, so the
 * sentence a person reads and the rows a screen highlights can never disagree.
 */
import { blockEntries, isSupersetBlock, workingSets } from '../../core/validation/workoutSchema'
import type { ExerciseEntry, Workout } from '../../core/validation/workoutSchema'
import type { ChangeSummary, WorkoutChange } from './types'

interface EntryView {
  readonly entryId: string
  readonly exerciseId: string
  readonly sets: number
  readonly repsLow: number
  readonly repsHigh: number
  readonly rest: number
  readonly hasDropSet: boolean
  readonly position: number
}

function viewOf(workout: Workout): Map<string, EntryView> {
  const views = new Map<string, EntryView>()
  let position = 0
  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) {
      const working = workingSets(entry.targets)
      const first = working[0] ?? entry.targets[0]
      views.set(entry.exerciseId, {
        entryId: entry.entryId,
        exerciseId: entry.exerciseId,
        sets: working.length,
        repsLow: first?.reps.min ?? 0,
        repsHigh: first?.reps.max ?? 0,
        rest: first?.restSeconds ?? 0,
        hasDropSet: entry.targets.some((target) => target.dropSet !== null),
        position: position++,
      })
    }
  }
  return views
}

function supersetIds(workout: Workout): Set<string> {
  return new Set(workout.blocks.filter(isSupersetBlock).map((block) => block.blockId))
}

/**
 * Keyed by EXERCISE, not by entry id.
 *
 * A rebuild mints new entry ids, so comparing those would report every exercise
 * as removed and re-added even when the session barely moved. What a person
 * means by "did my session change" is which exercises they are doing.
 */
export function summarise(
  before: Workout,
  after: Workout,
  options: { readonly headlinePrefix?: string; readonly nameOf?: (id: string) => string | null } = {},
): ChangeSummary {
  const was = viewOf(before)
  const now = viewOf(after)
  const name = (id: string) => options.nameOf?.(id) ?? id

  const changes: WorkoutChange[] = []
  const unchangedEntryIds: string[] = []

  for (const [exerciseId, previous] of was) {
    const current = now.get(exerciseId)
    if (!current) {
      changes.push({
        kind: 'exercise-removed',
        text: `${name(exerciseId)} removed`,
        entryIds: [previous.entryId],
        blockIds: [],
      })
      continue
    }

    let touched = false
    if (current.sets !== previous.sets) {
      touched = true
      changes.push({
        kind: current.sets > previous.sets ? 'sets-increased' : 'sets-reduced',
        text: `${name(exerciseId)} ${previous.sets} → ${current.sets} sets`,
        entryIds: [current.entryId],
        blockIds: [],
      })
    }
    if (current.repsLow !== previous.repsLow || current.repsHigh !== previous.repsHigh) {
      touched = true
      changes.push({
        kind: 'reps-changed',
        text: `${name(exerciseId)} now ${current.repsLow}-${current.repsHigh} reps`,
        entryIds: [current.entryId],
        blockIds: [],
      })
    }
    if (current.rest !== previous.rest) {
      touched = true
      changes.push({
        kind: 'rest-changed',
        text: `${name(exerciseId)} rest ${previous.rest}s → ${current.rest}s`,
        entryIds: [current.entryId],
        blockIds: [],
      })
    }
    if (current.hasDropSet !== previous.hasDropSet) {
      touched = true
      changes.push({
        kind: current.hasDropSet ? 'drop-set-added' : 'drop-set-removed',
        text: `${name(exerciseId)} ${current.hasDropSet ? 'gains' : 'loses'} a drop set`,
        entryIds: [current.entryId],
        blockIds: [],
      })
    }
    if (!touched) unchangedEntryIds.push(current.entryId)
  }

  for (const [exerciseId, current] of now) {
    if (was.has(exerciseId)) continue
    changes.push({
      kind: 'exercise-added',
      text: `${name(exerciseId)} added`,
      entryIds: [current.entryId],
      blockIds: [],
    })
  }

  const supersetsBefore = supersetIds(before).size
  const supersetsAfter = supersetIds(after).size
  if (supersetsAfter !== supersetsBefore) {
    const added = supersetsAfter > supersetsBefore
    changes.push({
      kind: added ? 'superset-added' : 'superset-removed',
      text: `${Math.abs(supersetsAfter - supersetsBefore)} ${added ? 'pairing added' : 'pairing removed'}`,
      entryIds: [],
      blockIds: after.blocks.filter(isSupersetBlock).map((block) => block.blockId),
    })
  }

  if (after.warmUp.estimatedSeconds !== before.warmUp.estimatedSeconds) {
    const shorter = after.warmUp.estimatedSeconds < before.warmUp.estimatedSeconds
    changes.push({
      kind: shorter ? 'warm-up-shortened' : 'warm-up-lengthened',
      text: `Warm-up ${shorter ? 'shortened' : 'lengthened'}`,
      entryIds: [],
      blockIds: [],
    })
  }

  if (changes.length === 0) {
    changes.push({ kind: 'nothing-changed', text: 'Nothing changed', entryIds: [], blockIds: [] })
  }

  return {
    headline: headlineFor(changes, after, options.headlinePrefix),
    changes,
    minutesBefore: before.estimatedMinutes,
    minutesAfter: after.estimatedMinutes,
    unchangedEntryIds,
  }
}

/**
 * The one line the plan asks for. It counts rather than lists, because a
 * sentence naming six exercises is one nobody reads on a phone mid-session.
 */
function headlineFor(changes: readonly WorkoutChange[], after: Workout, prefix: string | undefined): string {
  const head = prefix ?? `Recalibrated to ${after.estimatedMinutes} min`

  if (changes.length === 1 && changes[0].kind === 'nothing-changed') {
    return `${head}: nothing needed changing.`
  }

  const count = (kind: WorkoutChange['kind']) => changes.filter((change) => change.kind === kind).length
  const parts: string[] = []
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  const removed = count('exercise-removed')
  const added = count('exercise-added')
  const setsDown = count('sets-reduced')
  const setsUp = count('sets-increased')
  const pairAdded = count('superset-added')
  const pairRemoved = count('superset-removed')

  if (removed) parts.push(`${plural(removed, 'exercise', 'exercises')} removed`)
  if (added) parts.push(`${plural(added, 'exercise', 'exercises')} added`)
  if (setsDown) parts.push(`${plural(setsDown, 'exercise', 'exercises')} with fewer sets`)
  if (setsUp) parts.push(`${plural(setsUp, 'exercise', 'exercises')} with more sets`)
  if (pairAdded) parts.push('a superset added')
  if (pairRemoved) parts.push('a superset removed')

  if (parts.length === 0) parts.push('targets adjusted')
  return `${head}: ${parts.join(', ')}.`
}

/** True when the two sessions are the same session, for "nothing to do" checks. */
export function isSameSession(before: Workout, after: Workout): boolean {
  const shape = (workout: Workout) =>
    JSON.stringify(
      workout.blocks.map((block) =>
        blockEntries(block).map((entry: ExerciseEntry) => [
          entry.exerciseId,
          entry.targets.map((target) => [target.reps.min, target.reps.max, target.restSeconds]),
        ]),
      ),
    )
  return shape(before) === shape(after)
}
