import { getMovementPattern } from '../../catalog/movementPatterns/movementPatterns'
import { rollUpMuscles, sortMuscleIds } from '../../catalog/muscles/muscles'
import { isAnchorRole, progressionCarriesAcross } from '../../catalog/taxonomy/taxonomy'
import {
  duplicateExerciseReason,
  duplicateMovementPatternReason,
  muscleOverlapReason,
  progressionRoleReason,
} from './conflictReasons'
import { idsOf } from './sessionIndex'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { MuscleId } from '../../catalog/muscles/muscles'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { Conflict } from './conflictTypes'
import type { ConflictContext } from './conflictContext'
import type { PreparedEntry, SessionIndex } from './sessionIndex'

/**
 * RULES THAT COMPARE ONE EXERCISE AGAINST THE ONES ALREADY THERE.
 *
 * Every one of them reads the precomputed index rather than scanning the session,
 * so the cost per candidate is set by the CANDIDATE's own fields — its pattern,
 * its handful of muscles, its family — and not by the session's length or by how
 * many candidates are being ranked.
 *
 * Each rule emits AT MOST ONE conflict, listing every partner it found. A session
 * of nine exercises would otherwise produce thirty-six pairwise advisories nobody
 * can read; one conflict naming the exercises involved is the same information in
 * a form a screen can show.
 */

/** Both exercises name the muscle as primary; primary for one and secondary for the other; secondary for both. */
interface OverlapTally {
  score: number
  readonly primary: MuscleId[]
  readonly mixed: MuscleId[]
  readonly secondary: MuscleId[]
}

/**
 * DUPLICATE EXERCISE. The same id twice.
 *
 * Blocking, and matched on `id` alone. Two catalog entries that are genuinely the
 * same movement are one entry with two aliases, not two ids — which is exactly
 * why this can be an id comparison and must never become a name comparison.
 */
export function duplicateExerciseConflicts(candidate: PreparedEntry, index: SessionIndex): Conflict[] {
  const existing = index.byExerciseId.get(candidate.exercise.id)
  if (!existing) return []
  return [
    {
      kind: 'duplicate-exercise',
      severity: 'blocking',
      exerciseIds: [candidate.exercise.id],
      reason: duplicateExerciseReason(),
      detail: { exerciseId: candidate.exercise.id },
    },
  ]
}

/**
 * DUPLICATE MOVEMENT PATTERN. Too much of the session is the same movement.
 *
 * ONE NUMBER, NOT A YES/NO. A second horizontal push in a chest session is
 * normal; a fourth is a session that forgot to do anything else. So the rule
 * accumulates a LOAD — an identical pattern counts 1, a pattern the catalog
 * declares as overlapping counts a half — and the thresholds decide. That is what
 * lets "bench, incline, fly" register as drift without calling a bench-and-incline
 * session a mistake.
 *
 * The overlap half comes from `MOVEMENT_PATTERNS[].overlaps`, which the catalog
 * asserts is symmetric, so the answer does not depend on which exercise was added
 * first.
 */
export function duplicateMovementPatternConflicts(
  candidate: PreparedEntry,
  index: SessionIndex,
  context: ConflictContext,
): Conflict[] {
  const policy = context.policy
  const pattern = candidate.exercise.movementPattern
  const identical = index.byPattern.get(pattern) ?? []

  const overlappingPatterns: MovementPatternId[] = []
  const overlappingEntries: PreparedEntry[] = []
  for (const other of getMovementPattern(pattern).overlaps) {
    const entries = index.byPattern.get(other)
    if (!entries || entries.length === 0) continue
    overlappingPatterns.push(other)
    overlappingEntries.push(...entries)
  }

  const load =
    identical.length * policy.identicalPatternWeight +
    overlappingEntries.length * policy.overlappingPatternWeight
  if (load < policy.patternAdvisoryLoad) return []

  const partners = [...identical, ...overlappingEntries]
  return [
    {
      kind: 'duplicate-movement-pattern',
      severity: load >= policy.patternStrongLoad ? 'strong' : 'advisory',
      exerciseIds: [candidate.exercise.id, ...idsOf(partners)],
      reason: duplicateMovementPatternReason(pattern, identical.length, overlappingPatterns),
      detail: { pattern, identicalCount: identical.length, overlappingPatterns, load },
    },
  ]
}

/**
 * MUSCLE OVERLAP. Two exercises training the same thing.
 *
 * WEIGHTED BY ROLE, BECAUSE THE ROLES ARE NOT COMPARABLE. Two exercises that both
 * name the chest as PRIMARY are close to being the same exercise; two that merely
 * both use the triceps as a secondary are a normal push session. The policy gives
 * primary-primary four times the weight of secondary-secondary, so the first case
 * reaches `strong` on a single shared muscle pair and the second stays `advisory`
 * however many it shares — which is precisely the distinction the brief asks for.
 *
 * `score` is the worst SINGLE pairing rather than a session total: overlap is a
 * property of a pair, and summing it would make a long session look like a
 * repetitive one.
 */
export function muscleOverlapConflicts(
  candidate: PreparedEntry,
  index: SessionIndex,
  context: ConflictContext,
): Conflict[] {
  const policy = context.policy
  const tallies = new Map<PreparedEntry, OverlapTally>()

  const tally = (entry: PreparedEntry): OverlapTally => {
    const existing = tallies.get(entry)
    if (existing) return existing
    const created: OverlapTally = { score: 0, primary: [], mixed: [], secondary: [] }
    tallies.set(entry, created)
    return created
  }

  for (const muscle of candidate.exercise.primaryMuscles) {
    for (const entry of index.primaryByMuscle.get(muscle) ?? []) {
      const found = tally(entry)
      found.score += policy.primaryPrimaryWeight
      found.primary.push(muscle)
    }
    for (const entry of index.secondaryByMuscle.get(muscle) ?? []) {
      const found = tally(entry)
      found.score += policy.primarySecondaryWeight
      found.mixed.push(muscle)
    }
  }

  for (const muscle of candidate.exercise.secondaryMuscles) {
    for (const entry of index.primaryByMuscle.get(muscle) ?? []) {
      const found = tally(entry)
      found.score += policy.primarySecondaryWeight
      found.mixed.push(muscle)
    }
    for (const entry of index.secondaryByMuscle.get(muscle) ?? []) {
      const found = tally(entry)
      found.score += policy.secondarySecondaryWeight
      found.secondary.push(muscle)
    }
  }

  const partners: PreparedEntry[] = []
  const primary = new Set<MuscleId>()
  const mixed = new Set<MuscleId>()
  const secondary = new Set<MuscleId>()
  let score = 0

  for (const [entry, found] of tallies) {
    if (found.score < policy.muscleOverlapAdvisory) continue
    partners.push(entry)
    score = Math.max(score, found.score)
    for (const muscle of found.primary) primary.add(muscle)
    for (const muscle of found.mixed) mixed.add(muscle)
    for (const muscle of found.secondary) secondary.add(muscle)
  }

  if (partners.length === 0) return []

  const sharedPrimary = sortMuscleIds([...primary])
  const sharedMixed = sortMuscleIds([...mixed])
  const sharedSecondary = sortMuscleIds([...secondary])
  const groups = rollUpMuscles([...sharedPrimary, ...sharedMixed, ...sharedSecondary])
  const strong = score >= policy.muscleOverlapStrong

  return [
    {
      kind: 'muscle-overlap',
      severity: strong ? 'strong' : 'advisory',
      exerciseIds: [candidate.exercise.id, ...idsOf(partners)],
      reason: muscleOverlapReason(groups, strong),
      detail: { score, sharedPrimary, sharedMixed, sharedSecondary, groups },
    },
  ]
}

/**
 * PROGRESSION-ROLE. Two exercises competing for the same programming slot.
 *
 * TWO BASES.
 *
 * `slot` is explicit: Phase 3 assigns an entry a slot, and a slot holds one
 * exercise. Blocking, because it is a contradiction rather than a judgement.
 *
 * `family` is structural: two entries sharing a progression family are the same
 * movement on the same implement at loads that mean the same thing, so their
 * history would be split between them and neither would progress cleanly. It is
 * `strong` when the two are both anchors of the session or fill the same training
 * role, and `advisory` otherwise.
 *
 * A WARM-UP IN THE SAME FAMILY IS NOT A CONFLICT — it is a specific ramp, which is
 * the entire reason `warmUpSuitability` has a `specific-ramp` rung. Excluding it
 * here is what stops the engine reporting correct programming as a defect.
 */
export function progressionRoleConflicts(candidate: PreparedEntry, index: SessionIndex): Conflict[] {
  const conflicts: Conflict[] = []
  const exercise = candidate.exercise
  const family = exercise.progressionFamily
  const role: TrainingRole = exercise.trainingRole

  const occupants = candidate.slot === null ? [] : (index.bySlot.get(candidate.slot) ?? [])
  if (occupants.length > 0) {
    conflicts.push({
      kind: 'progression-role',
      severity: 'blocking',
      exerciseIds: [exercise.id, ...idsOf(occupants)],
      reason: progressionRoleReason('slot', role),
      detail: {
        basis: 'slot',
        family,
        slot: candidate.slot,
        role,
        otherRoles: occupants.map((entry) => entry.exercise.trainingRole),
      },
    })
  }

  if (role === 'warm-up') return conflicts

  const alreadyReported = new Set(occupants)
  const relatives = (index.byProgressionFamily.get(family) ?? []).filter(
    (entry) =>
      !alreadyReported.has(entry) &&
      entry.exercise.trainingRole !== 'warm-up' &&
      progressionCarriesAcross(family, entry.exercise.progressionFamily),
  )
  if (relatives.length === 0) return conflicts

  const otherRoles = relatives.map((entry) => entry.exercise.trainingRole)
  const competing =
    otherRoles.includes(role) || (isAnchorRole(role) && otherRoles.some((other) => isAnchorRole(other)))

  conflicts.push({
    kind: 'progression-role',
    severity: competing ? 'strong' : 'advisory',
    exerciseIds: [exercise.id, ...idsOf(relatives)],
    reason: progressionRoleReason('family', role),
    detail: { basis: 'family', family, slot: candidate.slot, role, otherRoles },
  })

  return conflicts
}

/** Every rule that compares the candidate with what is already in the session. */
export function pairConflicts(
  candidate: PreparedEntry,
  index: SessionIndex,
  context: ConflictContext,
): Conflict[] {
  return [
    ...duplicateExerciseConflicts(candidate, index),
    ...duplicateMovementPatternConflicts(candidate, index, context),
    ...muscleOverlapConflicts(candidate, index, context),
    ...progressionRoleConflicts(candidate, index),
  ]
}
