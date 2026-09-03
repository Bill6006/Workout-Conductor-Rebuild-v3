/**
 * Weekly muscle volume, recent exposure, and the muscle priorities a session is
 * built around.
 *
 * This module answers "what should today train, and how much of it", and nothing
 * else. It does not pick exercises (src/engine/scoring) and it does not decide
 * what fits (src/engine/duration).
 *
 * HISTORY IS USUALLY ABSENT. Phase 7 supplies workout history; today there is
 * none, and a first-ever session still has to be a good session. So every
 * function here treats missing history as a normal input rather than an edge
 * case, and falls back to the profile's goals — which is the only real signal a
 * new user has given us.
 */
import { MUSCLE_GROUP_IDS, type MuscleGroupId } from '../../catalog/muscles/muscles'
import type { Goal, Profile } from '../../core/validation/schemas'
import type {
  MusclePriority,
  MusclePriorityLevel,
  MusclePriorityReason,
  VolumePlanEntry,
} from '../../core/validation/workoutSchema'
import type { MuscleExposureEntry, MuscleVolumeEntry } from '../workoutGenerator/types'

/**
 * A secondary muscle does real work but not the work that drives the session, so
 * it earns partial credit when a session's contribution is counted. Half is the
 * convention most volume literature settles on and it keeps the arithmetic
 * legible: two sets of rows credit the lats two sets and the biceps one.
 *
 * Exported for the selection layer, which judges how much an exercise gives a
 * group. The weekly totals arriving in `MuscleVolumeEntry` are already grouped
 * and already credited by whoever counted them.
 */
export const SECONDARY_MUSCLE_CREDIT = 0.5

/** Weekly working sets per muscle group that a group is aiming for, before goals bias it. */
export const BASE_WEEKLY_SETS: Readonly<Record<MuscleGroupId, number>> = {
  chest: 12,
  back: 14,
  shoulders: 10,
  biceps: 8,
  triceps: 8,
  forearms: 3,
  quads: 12,
  hamstrings: 10,
  glutes: 10,
  adductors: 4,
  'hip-flexors': 3,
  calves: 8,
  core: 8,
}

/**
 * Which groups each goal pushes up. The product's stated priorities are muscle
 * growth, bigger arms, a bigger chest, overall size, then strength — so these
 * are deliberately not symmetric: `bigger-arms` should visibly change a session,
 * not nudge it.
 */
const GOAL_EMPHASIS: Readonly<Record<Goal, Partial<Record<MuscleGroupId, number>>>> = {
  'build-muscle': { chest: 1.1, back: 1.1, quads: 1.05, shoulders: 1.05 },
  'bigger-arms': { biceps: 1.75, triceps: 1.75, forearms: 1.4, shoulders: 1.1 },
  'bigger-chest': { chest: 1.75, triceps: 1.25, shoulders: 1.15 },
  'overall-size': { chest: 1.15, back: 1.15, quads: 1.15, hamstrings: 1.1, shoulders: 1.1 },
  'get-stronger': { back: 1.15, quads: 1.15, chest: 1.1, hamstrings: 1.1, core: 1.15 },
  'balanced-development': {},
  'stay-consistent': {},
}

/** Weekly set targets for this profile, goals applied. */
export function weeklyTargets(profile: Profile): Record<MuscleGroupId, number> {
  const primary = GOAL_EMPHASIS[profile.goals.primary] ?? {}
  const secondary = profile.goals.secondary ? (GOAL_EMPHASIS[profile.goals.secondary] ?? {}) : {}

  const targets = {} as Record<MuscleGroupId, number>
  for (const group of MUSCLE_GROUP_IDS) {
    // The secondary goal is a goal, not a tie-break, but it should not stack to
    // the point where two overlapping goals double a group's week.
    const bias = (primary[group] ?? 1) * (1 + ((secondary[group] ?? 1) - 1) * 0.5)
    targets[group] = Math.round(BASE_WEEKLY_SETS[group] * bias)
  }
  return targets
}

/**
 * Weekly sets already done per group. Absent volume means zero — which is the
 * truth for a new user, not a gap to paper over.
 */
export function weeklySetsSoFar(
  volume: readonly MuscleVolumeEntry[] | undefined,
): Record<MuscleGroupId, number> {
  const done = {} as Record<MuscleGroupId, number>
  for (const group of MUSCLE_GROUP_IDS) done[group] = 0
  for (const entry of volume ?? []) done[entry.group] += entry.setsThisWeek
  return done
}

/**
 * The weekly target the caller supplied per group, where it supplied one. A
 * `null` here means "you judge it", and `weeklyTargets` is what judges it.
 */
export function suppliedTargets(
  volume: readonly MuscleVolumeEntry[] | undefined,
): Partial<Record<MuscleGroupId, number>> {
  const supplied: Partial<Record<MuscleGroupId, number>> = {}
  for (const entry of volume ?? []) {
    if (entry.targetSets !== null) supplied[entry.group] = entry.targetSets
  }
  return supplied
}

/** Days since each group was last trained. `null` where it has never been seen. */
export function daysSinceTrained(
  exposure: readonly MuscleExposureEntry[] | undefined,
): Record<MuscleGroupId, number | null> {
  const seen = {} as Record<MuscleGroupId, number | null>
  for (const group of MUSCLE_GROUP_IDS) seen[group] = null
  for (const entry of exposure ?? []) {
    const current = seen[entry.group]
    if (current === null || entry.daysAgo < current) seen[entry.group] = entry.daysAgo
  }
  return seen
}

interface ScoredGroup {
  readonly group: MuscleGroupId
  readonly need: number
  readonly reason: MusclePriorityReason
  readonly target: number
  readonly soFar: number
  readonly daysAgo: number | null
}

/**
 * How badly each group wants training today. Higher is more wanted.
 *
 * The three signals are deliberately ordered: an unmet weekly target is the
 * strongest, because it is the thing the week is actually measured on; how long
 * ago the group was trained breaks ties between equally-owed groups; and the
 * goal bias is already baked into the target rather than added again here, so a
 * goal cannot outvote a group that has genuinely been neglected.
 */
function scoreGroups(
  profile: Profile,
  volume: readonly MuscleVolumeEntry[] | undefined,
  exposure: readonly MuscleExposureEntry[] | undefined,
): ScoredGroup[] {
  const targets = { ...weeklyTargets(profile), ...suppliedTargets(volume) }
  const done = weeklySetsSoFar(volume)
  const since = daysSinceTrained(exposure)
  const goalGroups = new Set<MuscleGroupId>([
    ...(Object.keys(GOAL_EMPHASIS[profile.goals.primary] ?? {}) as MuscleGroupId[]),
  ])

  return MUSCLE_GROUP_IDS.map((group) => {
    const target = targets[group]
    const soFar = done[group]
    const deficit = Math.max(0, target - soFar)
    const deficitShare = target === 0 ? 0 : deficit / target
    const daysAgo = since[group]

    // A group trained yesterday is pushed down hard; one never seen is treated as
    // rested rather than as unknown, because with no history everything is.
    const rest = daysAgo === null ? 1 : Math.min(1, daysAgo / 3)
    const goalBoost = goalGroups.has(group) ? 0.25 : 0

    const need = deficitShare * 0.6 + rest * 0.25 + goalBoost

    let reason: MusclePriorityReason = 'balance'
    if (goalGroups.has(group) && goalBoost > 0 && deficitShare > 0.4) reason = 'goal'
    else if (deficitShare > 0.5) reason = 'weekly-volume-deficit'
    else if (daysAgo !== null && daysAgo >= 4) reason = 'not-trained-recently'
    else if (daysAgo === null) reason = 'goal'

    return { group, need, reason, target, soFar, daysAgo }
  })
}

export interface MusclePlan {
  readonly priorities: readonly MusclePriority[]
  readonly volumePlan: readonly VolumePlanEntry[]
}

/**
 * Choose the groups today trains and how many working sets each gets.
 *
 * `setBudget` is the total number of working sets the duration engine says the
 * session can hold. Priorities are shaped to that budget rather than to an ideal
 * session that then gets cut — which is what makes a 15-minute session a real
 * session instead of a truncated one.
 */
export function planMuscles(
  profile: Profile,
  setBudget: number,
  options: {
    readonly volume?: readonly MuscleVolumeEntry[]
    readonly exposure?: readonly MuscleExposureEntry[]
    /** How many groups the session may touch. Short sessions touch fewer. */
    readonly maxGroups: number
  },
): MusclePlan {
  const scored = scoreGroups(profile, options.volume, options.exposure)
    .slice()
    .sort((a, b) => b.need - a.need || a.group.localeCompare(b.group))

  const chosen = scored.slice(0, Math.max(1, options.maxGroups))
  const totalNeed = chosen.reduce((sum, entry) => sum + Math.max(entry.need, 0.01), 0)

  // Hand out the set budget in proportion to need, then give the remainder to the
  // most-wanted group rather than scattering single sets nobody asked for.
  const priorities: MusclePriority[] = []
  const volumePlan: VolumePlanEntry[] = []
  let assigned = 0

  chosen.forEach((entry, index) => {
    const share = Math.max(entry.need, 0.01) / totalNeed
    const raw = index === chosen.length - 1 ? setBudget - assigned : Math.round(setBudget * share)
    const sets = Math.max(index === 0 ? 1 : 0, Math.min(raw, setBudget - assigned))
    assigned += sets

    const level: MusclePriorityLevel = index === 0 ? 'primary' : index <= 2 ? 'secondary' : 'maintenance'
    priorities.push({ group: entry.group, level, reason: entry.reason, targetSets: sets })
    volumePlan.push({
      group: entry.group,
      plannedSets: sets,
      weeklyTargetSets: entry.target,
      weeklySetsSoFar: entry.soFar,
      lastTrainedDaysAgo: entry.daysAgo,
    })
  })

  return {
    priorities: priorities.filter((priority) => priority.targetSets > 0),
    volumePlan,
  }
}
