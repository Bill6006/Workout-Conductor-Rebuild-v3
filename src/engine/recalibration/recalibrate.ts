/**
 * THE recalibration engine. One entry point, for every trigger.
 *
 * Phase 3 left the generator with a single entry point precisely so this could
 * wrap it rather than compete with it: a full rebuild here calls
 * `generateWorkout`, it does not re-implement generation.
 *
 * Three guarantees, in order of importance:
 *
 *   1. COMPLETED WORK IS NEVER LOST. Every result is checked on the way out —
 *      not merely intended on the way in — and a recalibration that would drop a
 *      logged set is refused, with the previous session handed back intact.
 *   2. A LOCAL CHANGE STAYS LOCAL. Swapping one exercise does not reshuffle the
 *      session around it. The trigger decides the scope; the scope decides how
 *      much is rebuilt.
 *   3. FAILURE RESTORES. There is no partial state: either a new valid session
 *      comes back, or the old one does with a readable reason.
 */
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { ExerciseEntry } from '../../core/validation/workoutSchema'
import { workoutSchema, type Workout, type WorkoutBlock } from '../../core/validation/workoutSchema'
import { blockEntries, isSupersetBlock } from '../../core/validation/workoutSchema'
import type { ReplacementReason } from '../../core/validation/workoutSchema'
import { generateWorkout } from '../workoutGenerator/generateWorkout'
import { isGenerated } from '../workoutGenerator/types'
import { isSameSession, summarise } from './diff'
import {
  blockOf,
  breaksActiveSuperset,
  completedWorkSurvives,
  lockedEntryIds,
  preservedBlocks,
} from './locks'
import {
  scopeFor,
  type RecalibrationRequest,
  type RecalibrationResult,
  type RecalibrationScope,
} from './types'

export function recalibrate(request: RecalibrationRequest): RecalibrationResult {
  const { current, trigger } = request
  const scope = scopeFor(trigger)
  const nameOf = (id: string) => request.exercises.find((exercise) => exercise.id === id)?.name ?? null

  const fail = (reason: RecalibrationResult extends { reason: infer R } ? R : never, message: string) =>
    ({ outcome: 'failed', reason, message, restored: current, trigger }) as RecalibrationResult

  let next: Workout
  let compromise: string | null = null

  try {
    if (scope === 'single-exercise') {
      const local = replaceOneExercise(request)
      if (typeof local === 'string') return fail('no-usable-exercises' as never, local)
      next = local
    } else {
      const rebuilt = rebuild(request, scope)
      if (typeof rebuilt === 'string') return fail('generation-failed' as never, rebuilt)
      next = rebuilt.workout
      compromise = rebuilt.compromise
    }
  } catch {
    // An engine that throws must still leave the session usable.
    return fail('generation-failed' as never, 'The session could not be rebuilt. Nothing was changed.')
  }

  // The two checks that make the guarantees real rather than intended.
  if (!completedWorkSurvives(current, next)) {
    return fail(
      'locked-work-would-be-lost' as never,
      'That change would have discarded work you already logged, so it was not applied.',
    )
  }
  const parsed = workoutSchema.safeParse(next)
  if (!parsed.success) {
    return fail('generation-failed' as never, 'The rebuilt session was not valid, so nothing changed.')
  }

  if (isSameSession(current, next)) {
    return {
      outcome: 'recalibrated',
      workout: current,
      summary: summarise(current, current, { nameOf, headlinePrefix: headlineFor(request) }),
      trigger,
      scope,
      compromise: null,
    }
  }

  return {
    outcome: 'recalibrated',
    workout: next,
    summary: summarise(current, next, { nameOf, headlinePrefix: headlineFor(request) }),
    trigger,
    scope,
    compromise,
  }
}

function headlineFor(request: RecalibrationRequest): string | undefined {
  switch (request.trigger) {
    case 'duration-changed':
      return request.requestedDuration === 'default'
        ? 'Rebuilt for your default length'
        : `Rebuilt for ${request.requestedDuration} min`
    case 'location-changed':
      return `Rebuilt for ${request.location?.name ?? 'your new location'}`
    case 'equipment-unavailable':
    case 'station-unavailable':
      return 'Swapped around the equipment in use'
    case 'pain-reported':
      return 'Adjusted around what hurts'
    case 'exercise-replaced':
      return 'Swapped one exercise'
    default:
      return undefined
  }
}

/* ------------------------------------------------------------------ *
 * Local: one exercise changes, nothing else moves
 * ------------------------------------------------------------------ */

/**
 * Replace a single entry in place, keeping its position, its set count, and the
 * rest of the session exactly as they were.
 *
 * Returns a message when it cannot be done — a caller should hear "no safe
 * alternative" rather than get a silently unchanged session.
 */
function replaceOneExercise(request: RecalibrationRequest): Workout | string {
  const { current, targetEntryId } = request
  if (!targetEntryId) return 'No exercise was named to change.'

  const locked = lockedEntryIds(current, {
    currentEntryId: request.currentEntryId,
    pinnedEntryIds: request.lockedEntryIds,
  })
  // A user-chosen replacement may of course replace an entry the user chose.
  if (locked.has(targetEntryId) && request.trigger !== 'exercise-replaced') {
    return 'That exercise has logged work, so it was left alone.'
  }

  const block = blockOf(current, targetEntryId)
  if (!block) return 'That exercise is not in this session.'
  if (breaksActiveSuperset(current, targetEntryId)) {
    return 'Its partner in the superset already has logged sets, so the pairing was left intact.'
  }

  const target = blockEntries(block).find((entry) => entry.entryId === targetEntryId)
  if (!target) return 'That exercise is not in this session.'

  const busy = new Set(request.busyEquipment ?? [])
  const available = new Set(request.equipment ?? [])
  const used = new Set(
    current.blocks.flatMap((candidate) => blockEntries(candidate).map((entry) => entry.exerciseId)),
  )

  const chosen = request.replacementExerciseId
    ? (request.exercises.find((exercise) => exercise.id === request.replacementExerciseId) ?? null)
    : pickSubstitute(request.exercises, target.exerciseId, {
        used,
        busy,
        available,
        skip: request.trigger === 'exercise-skipped',
      })

  // Skipping with nothing to put in its place is a legitimate outcome: the
  // exercise simply comes out.
  if (!chosen) {
    if (request.trigger === 'exercise-skipped') return removeEntry(current, targetEntryId)
    return 'Nothing else here trains that the same way.'
  }

  const swapped: WorkoutBlock[] = current.blocks.map((candidate) => {
    if (candidate.blockId !== block.blockId) return candidate
    if (!isSupersetBlock(candidate)) {
      return {
        ...candidate,
        entry: {
          ...candidate.entry,
          exerciseId: chosen.id,
          progressionFamily: chosen.progressionFamily,
          replacements: [
            ...candidate.entry.replacements,
            {
              fromExerciseId: target.exerciseId,
              toExerciseId: chosen.id,
              at: request.timestamp,
              reason: replacementReason(request.trigger),
              preservedProgression: chosen.progressionFamily === target.progressionFamily,
            },
          ],
        },
      }
    }
    // A superset holds exactly two moves at the type level, so rebuild the pair
    // explicitly. Mapping the array and casting back would compile but would
    // also quietly accept a one-move superset.
    const swapMove = (move: (typeof candidate.moves)[number]) =>
      move.entryId === targetEntryId
        ? {
            ...move,
            exerciseId: chosen.id,
            progressionFamily: chosen.progressionFamily,
            replacements: [
              ...move.replacements,
              {
                fromExerciseId: target.exerciseId,
                toExerciseId: chosen.id,
                at: request.timestamp,
                reason: replacementReason(request.trigger),
                preservedProgression: chosen.progressionFamily === target.progressionFamily,
              },
            ],
          }
        : move

    return {
      ...candidate,
      moves: [swapMove(candidate.moves[0]), swapMove(candidate.moves[1])],
    }
  })

  return { ...current, blocks: swapped }
}

function replacementReason(trigger: RecalibrationRequest['trigger']): ReplacementReason {
  switch (trigger) {
    case 'equipment-unavailable':
      return 'equipment-unavailable'
    case 'station-unavailable':
      return 'station-occupied'
    case 'exercise-uncomfortable':
    case 'pain-reported':
      return 'pain'
    case 'exercise-replaced':
      return 'user-choice'
    default:
      return 'recalibration'
  }
}

/** Drop an entry, and its whole block when the block would otherwise be half a superset. */
function removeEntry(current: Workout, entryId: string): Workout | string {
  const blocks = current.blocks.filter(
    (block) => !blockEntries(block).some((entry) => entry.entryId === entryId),
  )
  if (blocks.length === 0) return 'That is the only exercise left in the session.'
  return { ...current, blocks }
}

/**
 * The best stand-in for an exercise, without pulling in the ranking engine.
 *
 * The full alternatives ranker lands in the Phase 5 UI; what a recalibration
 * needs here is narrower — same primary muscle and pattern, actually available,
 * not already in the session. Anything more elaborate would be a second ranker.
 */
function pickSubstitute(
  exercises: readonly Exercise[],
  fromId: string,
  context: {
    used: ReadonlySet<string>
    busy: ReadonlySet<string>
    available: ReadonlySet<string>
    skip: boolean
  },
): Exercise | null {
  const from = exercises.find((exercise) => exercise.id === fromId)
  if (!from) return null

  const usable = (candidate: Exercise) => {
    if (candidate.id === fromId || context.used.has(candidate.id)) return false
    for (const needed of candidate.equipment) {
      if (context.busy.has(needed)) return false
      if (context.available.size > 0 && !context.available.has(needed)) return false
    }
    return true
  }

  // The catalog's own substitution list first — a human wrote those.
  for (const id of from.commonSubstitutions) {
    const candidate = exercises.find((exercise) => exercise.id === id)
    if (candidate && usable(candidate)) return candidate
  }

  const scored = exercises
    .filter(usable)
    .filter((candidate) => candidate.primaryMuscles.some((muscle) => from.primaryMuscles.includes(muscle)))
    .map((candidate) => ({
      candidate,
      score:
        (candidate.movementPattern === from.movementPattern ? 2 : 0) +
        (candidate.progressionFamily === from.progressionFamily ? 2 : 0) +
        (candidate.compoundOrIsolation === from.compoundOrIsolation ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))

  return scored[0]?.candidate ?? null
}

/**
 * Give regenerated blocks ids that cannot collide with the ones being kept.
 *
 * The generator numbers from one every time, so a preserved `block-1` and a
 * freshly built `block-1` are the same id for two different things — which the
 * workout schema rightly rejects. Re-iding the fresh side keeps the preserved
 * side, and the records hanging off it, byte-identical.
 *
 * Returns the remapping so the explanation and the compromises, which name
 * entries and blocks, can be pointed at the new ids rather than dangling.
 */
function withFreshIds(
  blocks: readonly WorkoutBlock[],
  taken: ReadonlySet<string>,
): { blocks: WorkoutBlock[]; remap: Map<string, string> } {
  const remap = new Map<string, string>()
  let counter = 0
  const mint = (prefix: string, old: string) => {
    let next = `${prefix}-r${(counter += 1)}`
    while (taken.has(next)) next = `${prefix}-r${(counter += 1)}`
    remap.set(old, next)
    return next
  }

  const reIdEntry = (entry: ExerciseEntry): ExerciseEntry => {
    const entryId = mint('entry', entry.entryId)
    return {
      ...entry,
      entryId,
      targets: entry.targets.map((target, index) => {
        const setId = `${entryId}-s${index + 1}`
        remap.set(target.setId, setId)
        return { ...target, setId }
      }),
      // Fresh blocks carry no records by definition; asserting it here means a
      // future change that breaks that assumption fails loudly.
      records: [],
    }
  }

  const next = blocks.map((block): WorkoutBlock => {
    const blockId = mint('block', block.blockId)
    if (!isSupersetBlock(block)) return { ...block, blockId, entry: reIdEntry(block.entry) }
    return {
      ...block,
      blockId,
      moves: [reIdEntry(block.moves[0]), reIdEntry(block.moves[1])],
    }
  })

  return { blocks: next, remap }
}

/** Point an explanation or compromise at the ids that actually exist now. */
function remapIds(ids: readonly string[], remap: ReadonlyMap<string, string>, live: ReadonlySet<string>) {
  return ids.map((id) => remap.get(id) ?? id).filter((id) => live.has(id))
}

/* ------------------------------------------------------------------ *
 * Full and remaining-session rebuilds
 * ------------------------------------------------------------------ */

interface Rebuilt {
  readonly workout: Workout
  readonly compromise: string | null
}

function rebuild(request: RecalibrationRequest, scope: RecalibrationScope): Rebuilt | string {
  const { current, profile } = request

  const kept =
    scope === 'remaining-session'
      ? preservedBlocks(current, {
          currentEntryId: request.currentEntryId,
          pinnedEntryIds: request.lockedEntryIds,
        })
      : preservedBlocks(current, {
          currentEntryId: request.currentEntryId,
          pinnedEntryIds: request.lockedEntryIds,
        })

  // Time already spent, and time already committed to work that cannot move,
  // both come off the budget before anything new is chosen.
  const keptSeconds = kept.reduce((sum, block) => sum + block.estimatedSeconds, 0)
  const elapsed = Math.max(0, request.elapsedMinutes ?? 0)

  const busy = new Set(request.busyEquipment ?? [])
  const equipment = (request.equipment ?? []).filter((id) => !busy.has(id))

  const generated = generateWorkout({
    profile,
    location: request.location ?? { id: 'current', name: 'Here', suitability: 'gym' },
    equipment,
    availableTime: request.requestedDuration ?? current.durationChoice,
    forDate: current.forDate,
    generatedAt: request.timestamp,
    // A different seed would reshuffle choices that had no reason to change, so
    // recalibration keeps the session's own seed unless the caller supplies one.
    seed: request.seed ?? current.seed,
    exercises: request.exercises,
    recovery: request.recovery,
    readiness: request.readiness,
    pain: request.pain,
    conflicts: request.conflicts,
  })

  if (!isGenerated(generated)) return generated.message

  // Locked blocks keep their place at the front; the rebuild fills what is left.
  const keptExercises = new Set(kept.flatMap((block) => blockEntries(block).map((entry) => entry.exerciseId)))
  const fresh = generated.workout.blocks.filter(
    (block) => !blockEntries(block).some((entry) => keptExercises.has(entry.exerciseId)),
  )

  const takenIds = new Set<string>()
  for (const block of kept) {
    takenIds.add(block.blockId)
    for (const entry of blockEntries(block)) {
      takenIds.add(entry.entryId)
      for (const target of entry.targets) takenIds.add(target.setId)
    }
  }
  const renumbered = withFreshIds(fresh, takenIds)

  const blocks = [...kept, ...renumbered.blocks]
  if (blocks.length === 0) return 'Nothing could be built for that.'

  const liveEntryIds = new Set(blocks.flatMap((block) => blockEntries(block).map((e) => e.entryId)))
  const liveBlockIds = new Set(blocks.map((block) => block.blockId))

  const estimatedMinutes = Math.max(
    1,
    Math.round(keptSeconds / 60) + generated.workout.estimatedMinutes - Math.round(elapsed),
  )

  const workout: Workout = {
    ...generated.workout,
    // The explanation and the compromises name entries and blocks. After
    // re-iding they must name the ones that exist, or the schema's own
    // reference check rejects the session.
    explanation: {
      ...generated.workout.explanation,
      points: generated.workout.explanation.points.map((point) => ({
        ...point,
        entryIds: remapIds(point.entryIds, renumbered.remap, liveEntryIds),
        blockIds: remapIds(point.blockIds, renumbered.remap, liveBlockIds),
      })),
    },
    knownCompromises: generated.workout.knownCompromises.map((compromise) => ({
      ...compromise,
      entryIds: remapIds(compromise.entryIds, renumbered.remap, liveEntryIds),
      blockIds: remapIds(compromise.blockIds, renumbered.remap, liveBlockIds),
    })),
    warmUp: {
      ...generated.workout.warmUp,
      rampedEntryIds: remapIds(generated.workout.warmUp.rampedEntryIds, renumbered.remap, liveEntryIds),
    },
    // The session keeps its identity across a recalibration — this is the same
    // workout, adjusted, not a new one that happens to be today's.
    id: current.id,
    generatedAt: current.generatedAt,
    blocks,
    estimatedMinutes: Math.max(1, estimatedMinutes),
    durationChoice: request.requestedDuration ?? current.durationChoice,
  }

  const budget = typeof workout.durationChoice === 'number' ? workout.durationChoice : workout.plannedMinutes
  const over = workout.estimatedMinutes - budget

  return {
    workout,
    compromise: over > 2 ? `This is the closest realistic plan and may run about ${over} min over.` : null,
  }
}
