import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { rollUpMuscles, type MuscleGroupId } from '../../catalog/muscles/muscles'
import { buildAlternativesIndex, type AlternativesIndex } from '../alternatives/catalogIndex'
import type { SlotRequest } from './selectionTypes'

/**
 * THE PRE-INDEX. Built once from a catalog, reused for every slot in a session.
 *
 * WHY IT EXISTS. A full generation is allowed well under 700 ms on a mid-range
 * Android and fills a dozen slots. Walking all 127 entries per slot to discover
 * that the leg curls are not chest exercises is work done to reach a foregone
 * conclusion, so the index is built in one pass and every slot touches only the
 * entries that reach its target group.
 *
 * THE POOL IS A SUPERSET OF THE ANSWER, NEVER A FILTER. Everything the pool
 * leaves out would have been excluded by `wrong-primary-muscle` anyway: an
 * exercise that reaches the slot's group through neither its primary nor its
 * secondary muscles is not a fill for that slot under any definition in this
 * module. Narrowing further would start hiding candidates that the score, not
 * the seed, should be deciding about.
 *
 * PRIMARY REACH FIRST, SECONDARY REACH AS A TAIL. The pool is ordered so that
 * the exercises that actually train the group come before the ones that only
 * assist it, and `SlotRequest.requirePrimaryTarget` drops the tail entirely.
 * The tail exists because a person with two dumbbells at home must still be
 * given a session; the score makes sure it is only reached for.
 *
 * ONE CATALOG INDEX FOR THE APP, NOT TWO. `alternatives` holds the
 * `AlternativesIndex` and every consumer of it — `buildPreferenceLookup` among
 * them — so this builds one and keeps it rather than growing a second copy of
 * the same maps. Callers that need both hand this one index around.
 *
 * NON-PRODUCTION ENTRIES never enter a pool: an unfinished catalog entry cannot
 * be programmed. They stay reachable by id so that a filter can say WHY.
 *
 * PURE AND IMMUTABLE. The same catalog builds the same index; the same index and
 * the same context rank the same way, every time.
 */

export interface SelectionIndex {
  /** Every exercise the index was built from, in the order it was given them. */
  readonly exercises: readonly Exercise[]
  /** How many entries can actually be programmed. */
  readonly productionSize: number
  byId(id: string): Exercise | null
  /** Production entries whose PRIMARY muscles reach the group, catalog order. */
  primaryFor(group: MuscleGroupId): readonly Exercise[]
  /** Production entries that reach the group only as a SECONDARY muscle. */
  secondaryFor(group: MuscleGroupId): readonly Exercise[]
  /** The pool for a slot: primary reach first, secondary reach after it. */
  candidatesFor(slot: SlotRequest): readonly Exercise[]
  /** Catalog position, for the documented final tie-break. */
  positionOf(id: string): number
  /** The alternatives ranker's index over the same catalog. One index, not two. */
  readonly alternatives: AlternativesIndex
}

function push(map: Map<MuscleGroupId, Exercise[]>, key: MuscleGroupId, exercise: Exercise): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(exercise)
  else map.set(key, [exercise])
}

export function buildSelectionIndex(exercises: readonly Exercise[]): SelectionIndex {
  const byId = new Map<string, Exercise>()
  const order = new Map<string, number>()
  const primary = new Map<MuscleGroupId, Exercise[]>()
  const secondary = new Map<MuscleGroupId, Exercise[]>()
  let productionSize = 0

  exercises.forEach((exercise, position) => {
    // First entry wins on a duplicate id, matching the catalog's own name index
    // and the alternatives index, so a malformed catalog cannot make selection
    // flip between two entries depending on iteration order.
    if (byId.has(exercise.id)) return
    byId.set(exercise.id, exercise)
    order.set(exercise.id, position)
    if (!exercise.productionEnabled) return
    productionSize += 1

    const primaryGroups = rollUpMuscles(exercise.primaryMuscles)
    for (const group of primaryGroups) push(primary, group, exercise)
    const claimed = new Set(primaryGroups)
    for (const group of rollUpMuscles(exercise.secondaryMuscles)) {
      if (!claimed.has(group)) push(secondary, group, exercise)
    }
  })

  function candidatesFor(slot: SlotRequest): readonly Exercise[] {
    const direct = primary.get(slot.targetGroup) ?? []
    if (slot.requirePrimaryTarget) return direct
    return [...direct, ...(secondary.get(slot.targetGroup) ?? [])]
  }

  return {
    exercises,
    productionSize,
    byId: (id) => byId.get(id) ?? null,
    primaryFor: (group) => primary.get(group) ?? [],
    secondaryFor: (group) => secondary.get(group) ?? [],
    candidatesFor,
    positionOf: (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER,
    alternatives: buildAlternativesIndex(exercises),
  }
}
