import { JOINT_STRESS_TAG_IDS, stressRank, tagForJoint } from '../../catalog/taxonomy/joints'
import { TRANSITION_COST_SCALE } from '../../catalog/taxonomy/scales'
import { isAnchorRole } from '../../catalog/taxonomy/taxonomy'
import {
  stationReason,
  supersetCompetingDemandsReason,
  supersetReason,
  supersetSharedJointReason,
} from './conflictReasons'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { JointStressTagId } from '../../catalog/taxonomy/joints'
import type { CompetingDemand } from '../../catalog/taxonomy/taxonomy'
import type { Conflict } from './conflictTypes'
import type { ConflictContext } from './conflictContext'
import type { PreparedEntry, SessionIndex } from './sessionIndex'

/**
 * SUPERSET PAIRING RULES.
 *
 * A superset is two exercises alternated with no rest between them, so a pairing
 * can be wrong for reasons a sequential session never has. These are the rules the
 * product plan names, one function each and one `SupersetRule` id each, so a UI
 * can say WHICH rule a pairing broke rather than "these do not go together".
 *
 * THE PAIR IS THE UNIT. Everything here is symmetric: the answer must not depend
 * on which of the two the caller happened to pass first, and the tests assert
 * that by running each rule both ways round.
 *
 * TWO SEVERITIES ONLY. `blocking` for what cannot physically be done — one
 * station, an exercise the catalog says must be done alone, a technique the user
 * has switched off. `strong` for what can be done and ruins the second exercise.
 * Nothing here is advisory: a superset is a deliberate choice, and half-warning
 * about one is no use to the person deciding.
 */

/**
 * The joints both exercises load at or above `moderate`, in canonical order.
 *
 * `low` on either side does not count: a pair that both brush a joint lightly is
 * the normal case, and reporting it would make the rule fire on nearly every
 * pairing and so mean nothing.
 */
const HARD_ENOUGH = stressRank('moderate')

function sharedHardJoints(a: Exercise, b: Exercise): JointStressTagId[] {
  const shared: JointStressTagId[] = []
  for (const joint of JOINT_STRESS_TAG_IDS) {
    const first = tagForJoint(a.jointStressTags, joint)
    const second = tagForJoint(b.jointStressTags, joint)
    if (!first || !second) continue
    if (stressRank(first.intensity) < HARD_ENOUGH || stressRank(second.intensity) < HARD_ENOUGH) continue
    shared.push(joint)
  }
  return shared
}

/** Demands both exercises make, in the first exercise's declared order. */
function sharedDemands(a: Exercise, b: Exercise): CompetingDemand[] {
  const theirs = new Set(b.supersetCompatibility.competingDemands)
  return a.supersetCompatibility.competingDemands.filter((demand) => theirs.has(demand))
}

/**
 * Moving between two different set-ups every round. Judged from `transitionCost`,
 * which is the catalog's rung for exactly this: one end of the pair must be
 * expensive to get back to and the other at least awkward, or it is just walking.
 */
function stationHopping(a: Exercise, b: Exercise): boolean {
  const first = a.supersetCompatibility.stationId
  const second = b.supersetCompatibility.stationId
  if (first === null || second === null || first === second) return false
  const costly = TRANSITION_COST_SCALE.highest(a.transitionCost, b.transitionCost) === 'high'
  const both = TRANSITION_COST_SCALE.atLeast(
    TRANSITION_COST_SCALE.lowest(a.transitionCost, b.transitionCost),
    'moderate',
  )
  return costly && both
}

/**
 * Every reason ONE pairing is a bad pairing.
 *
 * The same-station case is reported as a `station` conflict rather than a
 * `superset` one: it is the same fact the queueing rule measures, at its extreme,
 * and a UI that highlights stations should light up for both.
 */
export function supersetPairConflicts(a: PreparedEntry, b: PreparedEntry, groupId: string): Conflict[] {
  const first = a.exercise
  const second = b.exercise
  const ids = [first.id, second.id]
  const conflicts: Conflict[] = []

  if (!first.supersetCompatibility.eligible || !second.supersetCompatibility.eligible) {
    conflicts.push({
      kind: 'superset',
      severity: 'blocking',
      exerciseIds: ids,
      reason: supersetReason('ineligible-exercise'),
      detail: { rule: 'ineligible-exercise', groupId, shared: [] },
    })
  }

  const station = first.supersetCompatibility.stationId
  if (station !== null && station === second.supersetCompatibility.stationId) {
    conflicts.push({
      kind: 'station',
      severity: 'blocking',
      exerciseIds: ids,
      reason: stationReason(station, 'superset', 2),
      detail: { station, basis: 'superset', occupancy: 2, limit: 1 },
    })
  }

  if (first.supersetCompatibility.gripHeavy && second.supersetCompatibility.gripHeavy) {
    conflicts.push({
      kind: 'superset',
      severity: 'strong',
      exerciseIds: ids,
      reason: supersetReason('both-grip-heavy'),
      detail: { rule: 'both-grip-heavy', groupId, shared: [] },
    })
  }

  const demands = sharedDemands(first, second)
  if (demands.length > 0) {
    conflicts.push({
      kind: 'superset',
      severity: 'strong',
      exerciseIds: ids,
      reason: supersetCompetingDemandsReason(demands),
      detail: { rule: 'competing-demands', groupId, shared: demands },
    })
  }

  if (
    first.compoundOrIsolation === 'compound' &&
    second.compoundOrIsolation === 'compound' &&
    isAnchorRole(first.trainingRole) &&
    isAnchorRole(second.trainingRole)
  ) {
    conflicts.push({
      kind: 'superset',
      severity: 'strong',
      exerciseIds: ids,
      reason: supersetReason('two-heavy-compounds'),
      detail: { rule: 'two-heavy-compounds', groupId, shared: [] },
    })
  }

  const joints = sharedHardJoints(first, second)
  if (joints.length > 0) {
    conflicts.push({
      kind: 'superset',
      severity: 'strong',
      exerciseIds: ids,
      reason: supersetSharedJointReason(joints),
      detail: { rule: 'shared-joint-stress', groupId, shared: joints },
    })
  }

  if (stationHopping(first, second)) {
    conflicts.push({
      kind: 'superset',
      severity: 'strong',
      exerciseIds: ids,
      reason: supersetReason('station-hopping'),
      detail: { rule: 'station-hopping', groupId, shared: [] },
    })
  }

  return conflicts
}

/** A superset in a profile that has supersets switched off. Once per group. */
function notPermitted(groupId: string, members: readonly PreparedEntry[]): Conflict {
  return {
    kind: 'superset',
    severity: 'blocking',
    exerciseIds: members.map((entry) => entry.exercise.id),
    reason: supersetReason('not-permitted'),
    detail: { rule: 'not-permitted', groupId, shared: [] },
  }
}

/**
 * Every superset group in a session, each pair within it.
 *
 * Groups hold two or three exercises, so the pairwise walk is a handful of
 * comparisons — the quadratic term is bounded by the group, never by the session
 * or the candidate set.
 */
export function supersetConflicts(index: SessionIndex, context: ConflictContext): Conflict[] {
  const conflicts: Conflict[] = []

  for (const [groupId, members] of index.bySupersetGroup) {
    if (members.length < 2) continue
    if (!context.techniques.supersets) {
      conflicts.push(notPermitted(groupId, members))
      continue
    }
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        conflicts.push(...supersetPairConflicts(members[i], members[j], groupId))
      }
    }
  }

  return conflicts
}

/**
 * The candidate joining an existing superset group.
 *
 * Only the group named on the placement is considered: adding an exercise to one
 * superset says nothing about the others.
 */
export function candidateSupersetConflicts(
  candidate: PreparedEntry,
  index: SessionIndex,
  context: ConflictContext,
): Conflict[] {
  const groupId = candidate.supersetGroup
  if (groupId === null) return []

  const members = index.bySupersetGroup.get(groupId) ?? []
  if (members.length === 0) return []

  if (!context.techniques.supersets) return [notPermitted(groupId, [candidate, ...members])]

  return members.flatMap((member) => supersetPairConflicts(candidate, member, groupId))
}
