import { MUSCLE_GROUP_IDS, type MuscleGroupId } from '../../catalog/muscles/muscles'
import type { Goal } from '../../core/validation/schemas'
import type {
  MusclePriority,
  MusclePriorityLevel,
  MusclePriorityReason,
} from '../../core/validation/workoutSchema'
import { roundSets } from './credit'
import type { ExposureMap, GroupExposure } from './exposure'
import {
  MAX_SETS_PER_GROUP_PER_SESSION,
  goalEmphasisFor,
  type VolumeTarget,
  type VolumeTargets,
} from './targets'
import type { VolumeLedger } from './volumeTypes'

/**
 * WHICH MUSCLES THIS SESSION IS FOR.
 *
 * This is where the two halves meet. `weeklyVolume` says what the week has had,
 * `exposure` says what is still sitting on each group, `targets` says what the
 * week is aiming for, and this file turns the three into an ordered answer to the
 * only question the generator actually asks: what am I training today, and how
 * much of it.
 *
 * FOUR SIGNALS, WEIGHTED, AND EVERY ONE OF THEM NEUTRAL WHEN IT HAS NOTHING TO
 * SAY. That last clause is the whole design. History is empty today, so the
 * common case is a person about whom three of the four signals know nothing —
 * and a signal that does not know must not shout. An absent history reads as 0.5
 * ("no opinion"), never as 1 ("maximally overdue"), because a value that is
 * maximal for all thirteen groups ranks none of them and would leave a first-ever
 * session to be decided by a tie-break. With everything unknown, the goal is the
 * only thing that knows anything, and the goal decides. That is the correct
 * first session, and it is a first session that gets visibly better the moment
 * Phase 7 supplies a single week of history.
 *
 * THE TIE-BREAK IS EXPLICIT. Equal scores go to the group with the larger weekly
 * target — when nothing else distinguishes two groups, the one with more work to
 * do this week goes first — and equal targets go to canonical group order. No
 * clock, no seed, no `Math.random()`: the same inputs rank the same way, and a
 * generator that wants variety between sessions gets it from ITS seed, not from
 * an unstable ordering here.
 */

/** How much each signal is worth. They sum to 1, which a test asserts. */
export const PRIORITY_WEIGHTS = {
  /** How far behind the week's target this group is. */
  deficit: 0.4,
  /** How recovered it is — the inverse of what is still sitting on it. */
  readiness: 0.25,
  /** How much the person's goals want this group. */
  goal: 0.25,
  /** Whether their preferred exercises point at it. */
  preference: 0.1,
} as const

/** The value every signal takes when it has nothing to say. */
export const NEUTRAL_SIGNAL = 0.5

/**
 * What a weekly plan naming a group is worth. Large enough that a planned group
 * outranks an unplanned one whatever the signals say — a stated plan is an
 * instruction, not a hint — and finite, so the rest of the list still ranks.
 */
export const PLAN_EMPHASIS_BONUS = 0.5

/** A group promoted to `primary` gets at least this many sets, or it is not one. */
export const MIN_PRIMARY_SETS = 3

/** The share of a primary group's per-session allowance it gets on top. */
export const PRIMARY_SET_BOOST = 1.25

export interface GroupStanding {
  readonly group: MuscleGroupId
  readonly target: VolumeTarget
  readonly exposure: GroupExposure
  /** Effective sets this group has had inside the volume window. */
  readonly setsThisWeek: number
  /** Sets still owed against the weekly target, floored at zero. */
  readonly deficit: number
  /** Each signal on 0..1, after the neutral rule. */
  readonly signals: {
    readonly deficit: number
    readonly readiness: number
    readonly goal: number
    readonly preference: number
  }
  /** True when a weekly plan named this group for this session. */
  readonly planned: boolean
  /** 0..1.5 — the weighted signals plus any plan bonus. */
  readonly score: number
  /** The signal that is doing the most work, as a structured reason. */
  readonly leadingReason: MusclePriorityReason
}

export interface PriorityInput {
  readonly targets: VolumeTargets
  readonly volume: VolumeLedger
  readonly exposure: ExposureMap
  readonly goals: { readonly primary: Goal; readonly secondary: Goal | null }
  /** Groups the person's preferred exercises reach. Absent means no opinion. */
  readonly preferredGroups?: readonly MuscleGroupId[]
  /** Groups a weekly plan says this session is for. Absent means no plan. */
  readonly plannedEmphasis?: readonly MuscleGroupId[]
  readonly sessionsPerWeek: number
  /** Sessions already trained this week. Defaults to what the ledger counted. */
  readonly sessionsThisWeek?: number
  /**
   * Per-group recovery, 0 (spent) to 1 (fresh), from the generator's
   * `RecoveryState`. It MULTIPLIES the exposure readiness rather than replacing
   * it: exposure knows what was programmed, a recovery model knows how the person
   * feels, and a group that is both freshly trained and reported sore should rank
   * below one that is only the first.
   */
  readonly recovery?: Readonly<Partial<Record<MuscleGroupId, number>>>
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Picks the reason from the signal that sits furthest ABOVE neutral, so a signal
 * that says the same thing about every group never explains any of them.
 *
 * The precedence on an exact tie is fixed and is this list, top first: `goal`,
 * `weekly-volume-deficit`, the readiness pair, `user-preference`. A plan
 * naming the group beats all of them. Nothing above neutral at all is `balance`
 * — which is the honest word for "this group is here because the session had room
 * and nothing said otherwise".
 */
function leadingReasonFor(standing: {
  signals: GroupStanding['signals']
  planned: boolean
  exposure: GroupExposure
}): MusclePriorityReason {
  if (standing.planned) return 'specialisation'

  const contributions: readonly { readonly reason: MusclePriorityReason; readonly value: number }[] = [
    { reason: 'goal', value: PRIORITY_WEIGHTS.goal * (standing.signals.goal - NEUTRAL_SIGNAL) },
    {
      reason: 'weekly-volume-deficit',
      value: PRIORITY_WEIGHTS.deficit * (standing.signals.deficit - NEUTRAL_SIGNAL),
    },
    {
      reason:
        standing.exposure.neglected || standing.exposure.daysAgo === null
          ? 'not-trained-recently'
          : 'well-recovered',
      value: PRIORITY_WEIGHTS.readiness * (standing.signals.readiness - NEUTRAL_SIGNAL),
    },
    {
      reason: 'user-preference',
      value: PRIORITY_WEIGHTS.preference * (standing.signals.preference - NEUTRAL_SIGNAL),
    },
  ]

  let best = contributions[0]
  for (const contribution of contributions.slice(1)) {
    if (contribution.value > best.value) best = contribution
  }
  return best.value > 0 ? best.reason : 'balance'
}

/**
 * Ranks every muscle group for one session, best candidate first.
 *
 * Every group is returned, not just the winners: the generator needs the tail to
 * decide what a session with time left over should pick up, and an explanation
 * needs to be able to say what was considered and passed over.
 */
export function rankGroups(input: PriorityInput): readonly GroupStanding[] {
  const planned = new Set(input.plannedEmphasis ?? [])
  const preferred = new Set(input.preferredGroups ?? [])
  const hasPreferences = preferred.size > 0
  const order = new Map(MUSCLE_GROUP_IDS.map((group, position) => [group, position]))

  const standings: GroupStanding[] = MUSCLE_GROUP_IDS.map((group) => {
    const target = input.targets.for(group)
    const exposure = input.exposure.for(group)
    const setsThisWeek = input.volume.groupSets(group)
    const deficit = roundSets(Math.max(0, target.targetSets - setsThisWeek))

    const deficitSignal = input.volume.hasHistory
      ? clamp01(target.targetSets === 0 ? 0 : deficit / target.targetSets)
      : NEUTRAL_SIGNAL

    const recovery = input.recovery?.[group]
    const readinessSignal = input.exposure.hasHistory
      ? clamp01(exposure.readiness * (typeof recovery === 'number' ? clamp01(recovery) : 1))
      : NEUTRAL_SIGNAL

    const signals = {
      deficit: deficitSignal,
      readiness: readinessSignal,
      goal: goalEmphasisFor(group, input.goals),
      preference: hasPreferences ? (preferred.has(group) ? 1 : NEUTRAL_SIGNAL) : NEUTRAL_SIGNAL,
    }

    const isPlanned = planned.has(group)
    const score = round4(
      PRIORITY_WEIGHTS.deficit * signals.deficit +
        PRIORITY_WEIGHTS.readiness * signals.readiness +
        PRIORITY_WEIGHTS.goal * signals.goal +
        PRIORITY_WEIGHTS.preference * signals.preference +
        (isPlanned ? PLAN_EMPHASIS_BONUS : 0),
    )

    return {
      group,
      target,
      exposure,
      setsThisWeek,
      deficit,
      signals,
      planned: isPlanned,
      score,
      leadingReason: leadingReasonFor({ signals, planned: isPlanned, exposure }),
    }
  })

  return standings
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.target.targetSets - a.target.targetSets ||
        (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0),
    )
}

/** Groups that are short of their weekly target, worst first. */
export function groupsBehindTarget(standings: readonly GroupStanding[]): readonly GroupStanding[] {
  return standings
    .filter((standing) => standing.deficit > 0)
    .slice()
    .sort((a, b) => b.deficit - a.deficit || b.score - a.score)
}

export interface MusclePriorityOptions {
  /** How many groups the session is built around. */
  readonly primaryCount?: number
  /** How many more it supports. */
  readonly secondaryCount?: number
  /** Include the rest at `maintenance` with zero programmed sets. */
  readonly includeMaintenance?: boolean
  readonly maxSetsPerGroup?: number
  readonly minPrimarySets?: number
}

/** How many sets one group should get in THIS session, given what is left. */
export function sessionSetsFor(
  standing: GroupStanding,
  level: MusclePriorityLevel,
  remainingSessions: number,
  options: MusclePriorityOptions = {},
): number {
  if (level === 'maintenance') return 0
  const ceiling = options.maxSetsPerGroup ?? MAX_SETS_PER_GROUP_PER_SESSION
  const floor = options.minPrimarySets ?? MIN_PRIMARY_SETS

  // With no history the deficit IS the whole target, which is the right answer:
  // nothing is known to have been done, so the week is entirely ahead.
  const owed = standing.deficit > 0 ? standing.deficit : standing.target.targetSets
  const share = owed / Math.max(1, remainingSessions)

  if (level === 'primary') return Math.min(ceiling, Math.max(floor, Math.ceil(share * PRIMARY_SET_BOOST)))
  return Math.min(ceiling, Math.max(1, Math.round(share)))
}

/**
 * The session's muscle priorities, in the shape the workout record stores.
 *
 * `MusclePriority` is owned by `core/validation/workoutSchema`; this function
 * fills it in rather than defining a rival shape, so the generator can put the
 * result straight onto the workout and Phase 4 can diff two sessions' priorities
 * without a translation layer in between.
 */
export function musclePriorities(
  input: PriorityInput,
  options: MusclePriorityOptions = {},
): MusclePriority[] {
  const primaryCount = Math.max(0, options.primaryCount ?? 2)
  const secondaryCount = Math.max(0, options.secondaryCount ?? 3)
  const standings = rankGroups(input)
  const sessionsDone = input.sessionsThisWeek ?? input.volume.sessions
  const remaining = Math.max(1, Math.round(input.sessionsPerWeek) - Math.max(0, sessionsDone))

  const priorities: MusclePriority[] = []
  standings.forEach((standing, position) => {
    const level: MusclePriorityLevel =
      position < primaryCount
        ? 'primary'
        : position < primaryCount + secondaryCount
          ? 'secondary'
          : 'maintenance'
    if (level === 'maintenance' && !options.includeMaintenance) return
    priorities.push({
      group: standing.group,
      level,
      reason: standing.leadingReason,
      targetSets: sessionSetsFor(standing, level, remaining, options),
    })
  })
  return priorities
}
