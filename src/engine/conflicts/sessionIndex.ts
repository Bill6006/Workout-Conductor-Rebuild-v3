import { GRIP_DEMAND_SCALE } from '../../catalog/taxonomy/scales'
import { STRESS_WEIGHTS } from '../../catalog/taxonomy/joints'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { MuscleId } from '../../catalog/muscles/muscles'
import type { JointStressTagId } from '../../catalog/taxonomy/joints'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import type { ConflictPolicy } from './conflictPolicy'
import type { SessionEntry } from './conflictContext'

/**
 * THE PRECOMPUTED SESSION.
 *
 * WHY THIS EXISTS. Phase 5 ranks alternatives by asking "what would this session
 * look like with X in it?" once per candidate, over hundreds of candidates, inside
 * a recalibration budget well under 250 ms. Written naively that is a scan of the
 * session per candidate per rule — hundreds of thousands of comparisons for an
 * answer that never changes. Building the maps ONCE and reading them per candidate
 * turns every pairwise rule into a handful of lookups whose cost depends on the
 * candidate's own fields (at most a few muscles, one pattern, one station), not on
 * the size of the candidate set.
 *
 * IT IS BUILT ONCE AND READ MANY TIMES, AND IT IS NEVER MUTATED AFTER BUILDING.
 * `buildSessionIndex` is the only writer; everything else takes a `readonly`
 * reference. Session validation builds a fresh index per prefix rather than
 * mutating one in place, so no rule can ever see a half-updated index.
 */

/** One session entry with its optional fields resolved. */
export interface PreparedEntry {
  readonly exercise: Exercise
  /** 0-based position in the session, so reports come back in session order. */
  readonly position: number
  readonly supersetGroup: string | null
  readonly slot: string | null
  readonly estimatedSeconds: number
}

export interface SessionIndex {
  readonly entries: readonly PreparedEntry[]
  readonly byExerciseId: ReadonlyMap<string, PreparedEntry>
  readonly byPattern: ReadonlyMap<MovementPatternId, readonly PreparedEntry[]>
  readonly primaryByMuscle: ReadonlyMap<MuscleId, readonly PreparedEntry[]>
  readonly secondaryByMuscle: ReadonlyMap<MuscleId, readonly PreparedEntry[]>
  readonly byStation: ReadonlyMap<StationId, readonly PreparedEntry[]>
  readonly byProgressionFamily: ReadonlyMap<string, readonly PreparedEntry[]>
  readonly bySlot: ReadonlyMap<string, readonly PreparedEntry[]>
  readonly bySupersetGroup: ReadonlyMap<string, readonly PreparedEntry[]>
  /** Weighted stress per joint, in `STRESS_WEIGHTS` units. */
  readonly jointLoad: ReadonlyMap<JointStressTagId, number>
  readonly jointContributors: ReadonlyMap<JointStressTagId, readonly PreparedEntry[]>
  /** Weighted grip demand across the session, in `policy.gripWeights` units. */
  readonly gripLoad: number
  readonly gripContributors: readonly PreparedEntry[]
  readonly estimatedSeconds: number
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

/**
 * Resolves an entry's optional fields.
 *
 * `estimatedSeconds` falls back to `setupTimeSeconds`. That is deliberately an
 * UNDER-estimate rather than a guess at sets and rest: this engine does not do
 * duration fitting, and a made-up set count would be a second, quieter owner of a
 * calculation Phase 3 owns outright.
 */
export function prepareEntry(entry: SessionEntry, position: number): PreparedEntry {
  return {
    exercise: entry.exercise,
    position,
    supersetGroup: entry.supersetGroup ?? null,
    slot: entry.slot ?? null,
    estimatedSeconds: entry.estimatedSeconds ?? entry.exercise.setupTimeSeconds,
  }
}

/**
 * Builds every lookup the rules need in ONE pass over the session.
 *
 * Cost is linear in the number of entries times the small, bounded number of
 * muscles and tags each one carries.
 */
export function buildSessionIndex(session: readonly SessionEntry[], policy: ConflictPolicy): SessionIndex {
  const entries = session.map(prepareEntry)

  const byExerciseId = new Map<string, PreparedEntry>()
  const byPattern = new Map<MovementPatternId, PreparedEntry[]>()
  const primaryByMuscle = new Map<MuscleId, PreparedEntry[]>()
  const secondaryByMuscle = new Map<MuscleId, PreparedEntry[]>()
  const byStation = new Map<StationId, PreparedEntry[]>()
  const byProgressionFamily = new Map<string, PreparedEntry[]>()
  const bySlot = new Map<string, PreparedEntry[]>()
  const bySupersetGroup = new Map<string, PreparedEntry[]>()
  const jointLoad = new Map<JointStressTagId, number>()
  const jointContributors = new Map<JointStressTagId, PreparedEntry[]>()
  const gripContributors: PreparedEntry[] = []

  let gripLoad = 0
  let estimatedSeconds = 0

  for (const entry of entries) {
    const exercise = entry.exercise

    // The FIRST entry to claim an id keeps the slot in `byExerciseId`; a
    // duplicate is reported by the rule, not silently overwritten here.
    if (!byExerciseId.has(exercise.id)) byExerciseId.set(exercise.id, entry)

    push(byPattern, exercise.movementPattern, entry)
    for (const muscle of exercise.primaryMuscles) push(primaryByMuscle, muscle, entry)
    for (const muscle of exercise.secondaryMuscles) push(secondaryByMuscle, muscle, entry)

    const station = exercise.supersetCompatibility.stationId
    if (station !== null) push(byStation, station, entry)

    push(byProgressionFamily, exercise.progressionFamily, entry)
    if (entry.slot !== null) push(bySlot, entry.slot, entry)
    if (entry.supersetGroup !== null) push(bySupersetGroup, entry.supersetGroup, entry)

    for (const tag of exercise.jointStressTags) {
      jointLoad.set(tag.joint, (jointLoad.get(tag.joint) ?? 0) + STRESS_WEIGHTS[tag.intensity])
      push(jointContributors, tag.joint, entry)
    }

    const grip = policy.gripWeights[exercise.gripDemand] ?? 0
    gripLoad += grip
    if (GRIP_DEMAND_SCALE.atLeast(exercise.gripDemand, policy.gripContributorDemand)) {
      gripContributors.push(entry)
    }

    estimatedSeconds += entry.estimatedSeconds
  }

  return {
    entries,
    byExerciseId,
    byPattern,
    primaryByMuscle,
    secondaryByMuscle,
    byStation,
    byProgressionFamily,
    bySlot,
    bySupersetGroup,
    jointLoad,
    jointContributors,
    gripLoad,
    gripContributors,
    estimatedSeconds,
  }
}

/** Entries from an index list, in session order, as bare ids. */
export function idsOf(entries: readonly PreparedEntry[]): string[] {
  return [...entries].sort((a, b) => a.position - b.position).map((entry) => entry.exercise.id)
}
