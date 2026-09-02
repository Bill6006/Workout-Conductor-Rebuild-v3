import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { getMovementPattern, type MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import { rollUpMuscles, type MuscleGroupId } from '../../catalog/muscles/muscles'

/**
 * THE PRE-INDEX. Built once from a catalog, reused for every ranking call.
 *
 * WHY THIS EXISTS. Ranking is allowed well under 200 ms, and the naive shape —
 * walk every exercise, score it, sort — would rescan the whole catalog on every
 * tap of "swap this". The cost that actually matters is not the scoring, it is
 * the scan: almost nothing in a several-hundred-entry catalog is a plausible
 * alternative to a bench press, and scoring the leg curls to find that out is
 * work done to reach a foregone conclusion.
 *
 * So the index is built in one O(n) pass and every ranking call touches only the
 * candidate POOL: entries that share a primary muscle group, a movement pattern
 * (or one that overlaps it), a progression family, or a hand-picked substitution
 * link. For a realistic catalog that is a few dozen entries rather than a few
 * hundred, and the pool is the same set the filters would have kept anyway.
 *
 * THE POOL IS A SUPERSET OF THE ANSWER, NEVER A FILTER. Everything the pool
 * excludes would have been excluded by `wrong-primary-muscle` regardless — an
 * exercise sharing no primary muscle group, no pattern, no family and no
 * substitution link with the current one is not an alternative to it by any
 * definition in this module. Narrowing the pool any further would start hiding
 * candidates that the score, not the seed, should be deciding about.
 *
 * NON-PRODUCTION ENTRIES are kept out of the seed maps, so an unfinished catalog
 * entry cannot be proposed. They stay reachable by id, because a hand-picked
 * substitution may still point at one and that IS worth reporting — as the
 * `not-production-enabled` exclusion, rather than as a silent gap.
 *
 * PURE AND IMMUTABLE. The index holds no clock, no cache that changes an answer,
 * and no reference to a context. The same catalog builds the same index, and the
 * same index plus the same context ranks the same way, every time.
 */

export interface AlternativesIndex {
  /** Every exercise the index was built from, in the order it was given them. */
  readonly exercises: readonly Exercise[]
  /** How many entries can actually be proposed. */
  readonly productionSize: number
  byId(id: string): Exercise | null
  /**
   * The candidate pool for one exercise, in catalog order, never including the
   * exercise itself.
   */
  candidatesFor(exercise: Exercise): readonly Exercise[]
}

function push<K>(map: Map<K, Exercise[]>, key: K, exercise: Exercise): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(exercise)
  else map.set(key, [exercise])
}

export function buildAlternativesIndex(exercises: readonly Exercise[]): AlternativesIndex {
  const byId = new Map<string, Exercise>()
  const order = new Map<string, number>()
  const byMuscleGroup = new Map<MuscleGroupId, Exercise[]>()
  const byPattern = new Map<MovementPatternId, Exercise[]>()
  const byFamily = new Map<string, Exercise[]>()
  let productionSize = 0

  exercises.forEach((exercise, position) => {
    // First entry wins on a duplicate id, matching how the catalog's own name
    // index resolves collisions, so a malformed catalog cannot make the ranker
    // flip between two entries depending on iteration order.
    if (byId.has(exercise.id)) return
    byId.set(exercise.id, exercise)
    order.set(exercise.id, position)
    if (!exercise.productionEnabled) return
    productionSize += 1
    for (const group of rollUpMuscles(exercise.primaryMuscles)) push(byMuscleGroup, group, exercise)
    push(byPattern, exercise.movementPattern, exercise)
    push(byFamily, exercise.progressionFamily, exercise)
  })

  function candidatesFor(exercise: Exercise): readonly Exercise[] {
    const wanted = new Map<string, Exercise>()
    const add = (candidate: Exercise): void => {
      if (candidate.id !== exercise.id) wanted.set(candidate.id, candidate)
    }

    for (const group of rollUpMuscles(exercise.primaryMuscles)) {
      for (const candidate of byMuscleGroup.get(group) ?? []) add(candidate)
    }

    const pattern = getMovementPattern(exercise.movementPattern)
    for (const id of [pattern.id, ...pattern.overlaps]) {
      for (const candidate of byPattern.get(id) ?? []) add(candidate)
    }

    for (const candidate of byFamily.get(exercise.progressionFamily) ?? []) add(candidate)

    // Hand-picked substitutions are seeded last and by id, so a curated swap is
    // in the pool even when it shares no group, pattern or family — that is what
    // a hand-picked link is FOR. It still has to survive every filter.
    for (const id of exercise.commonSubstitutions) {
      const candidate = byId.get(id)
      if (candidate) add(candidate)
    }

    return [...wanted.values()].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.id.localeCompare(b.id),
    )
  }

  return {
    exercises,
    productionSize,
    byId: (id) => byId.get(id) ?? null,
    candidatesFor,
  }
}
