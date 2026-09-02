import { JOINT_STRESS_TAG_IDS, STRESS_WEIGHTS } from '../../catalog/taxonomy/joints'
import { GRIP_DEMAND_SCALE } from '../../catalog/taxonomy/scales'
import { rollUpMuscles } from '../../catalog/muscles/muscles'
import { recoveryDaysFor } from './conflictPolicy'
import { limitedJoints } from './conflictContext'
import { gripReason, jointStressReason, recoveryReason, stationReason, timeReason } from './conflictReasons'
import { idsOf } from './sessionIndex'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { JointStressTagId } from '../../catalog/taxonomy/joints'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import type { Conflict } from './conflictTypes'
import type { ConflictContext } from './conflictContext'
import type { PreparedEntry, SessionIndex } from './sessionIndex'

/**
 * RULES THAT MEASURE THE WHOLE SESSION.
 *
 * These do not compare exercises with each other. They add something up — stress
 * on a joint, demand on the grip, visits to one station, minutes, days since the
 * muscle was last worked — and compare the total against a limit in
 * `conflictPolicy`.
 *
 * ACCUMULATION IS THE WHOLE POINT OF THE JOINT RULE. Almost every lower-body
 * exercise puts something through a knee, so a rule that fired on the PRESENCE of
 * a knee tag would fire on every leg session and mean nothing. The catalog gives
 * each tag an intensity and weights them geometrically (low 1, moderate 2, high
 * 4), so "three heavy lower-back movements" is detectable and "a session
 * containing any lower-back work at all" is not.
 *
 * EACH RULE IS SPLIT IN TWO: a `judge…` function that turns a total into a
 * conflict, and the callers that work out the total. There are two callers —
 * validating a whole session, and asking what one more exercise would do — and
 * they must never disagree about where the line is. Splitting them this way is
 * what lets the second caller answer in time proportional to the CANDIDATE rather
 * than rebuilding the session for every exercise it is ranking.
 */

/* ------------------------------------------------------------------ *
 * Judges — the one place each threshold is read
 * ------------------------------------------------------------------ */

/**
 * A FLAGGED JOINT GETS A TIGHTER LIMIT, NOT A DIFFERENT RULE. `limitedJointFactor`
 * scales both thresholds down, so somebody who told us their shoulder hurts runs
 * out of shoulder room in about half the work — the same measurement, read
 * against a limit that respects what they said.
 */
export function judgeJointStress(
  joint: JointStressTagId,
  load: number,
  contributorIds: readonly string[],
  context: ConflictContext,
  limited: ReadonlySet<JointStressTagId>,
): Conflict | null {
  if (load <= 0) return null
  const policy = context.policy
  const isLimited = limited.has(joint)
  const factor = isLimited ? policy.limitedJointFactor : 1
  const advisoryLimit = policy.jointStressAdvisory * factor
  const strongLimit = policy.jointStressStrong * factor
  if (load < advisoryLimit) return null

  const strong = load >= strongLimit
  return {
    kind: 'joint-stress',
    severity: strong ? 'strong' : 'advisory',
    exerciseIds: contributorIds,
    reason: jointStressReason(joint, isLimited, strong),
    detail: { joint, load, advisoryLimit, strongLimit, limited: isLimited },
  }
}

export function judgeGrip(
  load: number,
  contributorIds: readonly string[],
  context: ConflictContext,
): Conflict | null {
  const policy = context.policy
  if (load < policy.gripAdvisory) return null
  const strong = load >= policy.gripStrong
  return {
    kind: 'grip',
    severity: strong ? 'strong' : 'advisory',
    exerciseIds: contributorIds,
    reason: gripReason(strong),
    detail: { load, advisoryLimit: policy.gripAdvisory, strongLimit: policy.gripStrong },
  }
}

/**
 * STATION QUEUEING. Only for stations a gym has ONE of —
 * `policy.scarceStations` deliberately omits machines, cable towers, and the
 * dumbbell rack, because a gym has several and three exercises "on a machine" is
 * not a queue. Advisory and never worse: everything here is possible, it is just a
 * worse hour on a busy evening.
 *
 * The IMPOSSIBLE case — two exercises alternating on one station inside a superset
 * — is the same kind raised at `blocking` in `supersetRules`.
 */
export function judgeStationQueue(
  station: StationId,
  occupancy: number,
  entryIds: readonly string[],
  context: ConflictContext,
): Conflict | null {
  const policy = context.policy
  if (!policy.scarceStations.includes(station)) return null
  if (occupancy < policy.stationQueueLimit) return null
  return {
    kind: 'station',
    severity: 'advisory',
    exerciseIds: entryIds,
    reason: stationReason(station, 'queue', occupancy),
    detail: { station, basis: 'queue', occupancy, limit: policy.stationQueueLimit },
  }
}

/**
 * TIME. THIS IS NOT DURATION FITTING. It adds up the seconds the CALLER supplied
 * on each entry and compares the total with the budget. Phase 3 owns estimating
 * what an entry costs — sets, reps, rest, the warm-up ramp — and this engine will
 * not invent any of it; an entry with no estimate contributes only its setup time,
 * which is honest about being a floor rather than a guess.
 *
 * `blocking` at a large overrun is deliberate: past a point the session is not the
 * session that was asked for, and a generator needs a signal that it must cut
 * something rather than merely prefer to.
 */
export function judgeTime(
  estimatedSeconds: number,
  entryIds: readonly string[],
  context: ConflictContext,
): Conflict | null {
  const budgetSeconds = context.timeBudgetSeconds
  if (budgetSeconds === null || budgetSeconds <= 0) return null
  if (estimatedSeconds <= budgetSeconds) return null

  const ratio = estimatedSeconds / budgetSeconds
  const policy = context.policy
  const severity =
    ratio > policy.timeBlockingRatio ? 'blocking' : ratio > policy.timeStrongRatio ? 'strong' : 'advisory'

  return {
    kind: 'time',
    severity,
    exerciseIds: entryIds,
    reason: timeReason(estimatedSeconds - budgetSeconds),
    detail: { estimatedSeconds, budgetSeconds, overrunSeconds: estimatedSeconds - budgetSeconds },
  }
}

/**
 * RECOVERY, for one exercise.
 *
 * THE ENGINE NEVER READS A CLOCK. `daysAgo` arrives on the context, worked out by
 * whoever knows what "now" is. That is what keeps the same session reporting the
 * same thing whichever side of midnight it is validated on.
 *
 * Only PRIMARY muscles count. Triceps get worked by every press ever programmed;
 * treating that as "triceps trained" would make every push session unrecoverable
 * by Wednesday.
 *
 * One conflict per exercise, naming the group with the least recovery, so an entry
 * hitting three tired groups reads as one problem rather than three.
 */
export function judgeRecovery(
  exercise: Exercise,
  mostRecent: ReadonlyMap<MuscleGroupId, number>,
  context: ConflictContext,
): Conflict | null {
  let worst: { group: MuscleGroupId; daysAgo: number; minimumDays: number } | null = null

  for (const group of rollUpMuscles(exercise.primaryMuscles)) {
    const daysAgo = mostRecent.get(group)
    if (daysAgo === undefined) continue
    const minimumDays = recoveryDaysFor(group, context.policy)
    if (daysAgo >= minimumDays) continue
    if (worst === null || daysAgo < worst.daysAgo) worst = { group, daysAgo, minimumDays }
  }

  if (worst === null) return null
  return {
    kind: 'recovery',
    severity: worst.daysAgo <= 0 ? 'strong' : 'advisory',
    exerciseIds: [exercise.id],
    reason: recoveryReason(worst.group, worst.daysAgo),
    detail: worst,
  }
}

/** Days since each muscle group was last trained hard, whichever session did it. */
export function mostRecentTrainingByGroup(context: ConflictContext): Map<MuscleGroupId, number> {
  const mostRecent = new Map<MuscleGroupId, number>()
  for (const session of context.recentTraining) {
    for (const group of session.muscleGroups) {
      const seen = mostRecent.get(group)
      if (seen === undefined || session.daysAgo < seen) mostRecent.set(group, session.daysAgo)
    }
  }
  return mostRecent
}

/* ------------------------------------------------------------------ *
 * Whole-session totals
 * ------------------------------------------------------------------ */

/** Every accumulation rule, over a session that is already indexed. */
export function loadConflicts(index: SessionIndex, context: ConflictContext): Conflict[] {
  const conflicts: Conflict[] = []
  const limited = limitedJoints(context.limitations)

  for (const joint of JOINT_STRESS_TAG_IDS) {
    const contributors = index.jointContributors.get(joint) ?? []
    const conflict = judgeJointStress(
      joint,
      index.jointLoad.get(joint) ?? 0,
      idsOf(contributors),
      context,
      limited,
    )
    if (conflict) conflicts.push(conflict)
  }

  const grip = judgeGrip(index.gripLoad, idsOf(index.gripContributors), context)
  if (grip) conflicts.push(grip)

  for (const [station, entries] of index.byStation) {
    const conflict = judgeStationQueue(station, entries.length, idsOf(entries), context)
    if (conflict) conflicts.push(conflict)
  }

  const time = judgeTime(index.estimatedSeconds, idsOf(index.entries), context)
  if (time) conflicts.push(time)

  if (context.recentTraining.length > 0) {
    const mostRecent = mostRecentTrainingByGroup(context)
    for (const entry of index.entries) {
      const conflict = judgeRecovery(entry.exercise, mostRecent, context)
      if (conflict) conflicts.push(conflict)
    }
  }

  return conflicts
}

/* ------------------------------------------------------------------ *
 * The same rules, asked about one more exercise
 * ------------------------------------------------------------------ */

/**
 * What the accumulation rules would say if the candidate were added.
 *
 * IT REPORTS ONLY WHAT THE CANDIDATE IS PART OF. A session already over its
 * shoulder limit is not this candidate's fault, and reporting it against every
 * exercise being ranked would make them all look equally bad and rank none of
 * them. A candidate that adds to a joint already over the line IS reported: it
 * makes a real problem worse.
 *
 * It reads the base index's totals and adds the candidate's own contribution, so
 * the cost is set by the candidate's handful of fields — no second index is built
 * per candidate.
 */
export function candidateLoadConflicts(
  candidate: PreparedEntry,
  index: SessionIndex,
  context: ConflictContext,
): Conflict[] {
  const conflicts: Conflict[] = []
  const exercise = candidate.exercise
  const limited = limitedJoints(context.limitations)

  for (const tag of exercise.jointStressTags) {
    const load = (index.jointLoad.get(tag.joint) ?? 0) + STRESS_WEIGHTS[tag.intensity]
    const contributors = [...(index.jointContributors.get(tag.joint) ?? []), candidate]
    const conflict = judgeJointStress(tag.joint, load, idsOf(contributors), context, limited)
    if (conflict) conflicts.push(conflict)
  }

  if (GRIP_DEMAND_SCALE.atLeast(exercise.gripDemand, context.policy.gripContributorDemand)) {
    const load = index.gripLoad + (context.policy.gripWeights[exercise.gripDemand] ?? 0)
    const grip = judgeGrip(load, idsOf([...index.gripContributors, candidate]), context)
    if (grip) conflicts.push(grip)
  }

  const station = exercise.supersetCompatibility.stationId
  if (station !== null) {
    const entries = [...(index.byStation.get(station) ?? []), candidate]
    const conflict = judgeStationQueue(station, entries.length, idsOf(entries), context)
    if (conflict) conflicts.push(conflict)
  }

  const time = judgeTime(
    index.estimatedSeconds + candidate.estimatedSeconds,
    idsOf([...index.entries, candidate]),
    context,
  )
  if (time) conflicts.push(time)

  if (context.recentTraining.length > 0) {
    const recovery = judgeRecovery(exercise, mostRecentTrainingByGroup(context), context)
    if (recovery) conflicts.push(recovery)
  }

  return conflicts
}
