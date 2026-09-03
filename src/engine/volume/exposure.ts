import { MUSCLE_GROUP_IDS, isMuscleGroupId, type MuscleGroupId } from '../../catalog/muscles/muscles'
import { recoveryDaysFor, resolveConflictPolicy, type ConflictPolicy } from '../conflicts/conflictPolicy'
import { groupCreditFor, roundSets } from './credit'
import type { SessionVolume } from './volumeTypes'

/**
 * HOW RECENTLY, AND HOW HARD. The other half of the volume question.
 *
 * WHY THIS IS SEPARATE FROM THE WEEKLY LEDGER. A group can be behind on the week
 * AND have been hammered yesterday; it can be ahead on the week and untouched for
 * six days. One number cannot say either of those, so there are two: the ledger
 * counts what the week contained, and this counts what is still sitting on the
 * muscle. The generator needs both — the first to find the gap, the second to
 * find out whether today is the day to fill it.
 *
 * THE RECOVERY WINDOW IS THE CONFLICT ENGINE'S, NOT A SECOND OPINION.
 * `recoveryDaysFor` and `DEFAULT_CONFLICT_POLICY` already own "how long a group
 * gets before it is trained hard again", and the engine reports a `recovery`
 * conflict against exactly those numbers. Deriving a different window here would
 * give the product two answers to one question, and the generator would program
 * sessions the conflict engine then complained about.
 *
 * DECAY IS LINEAR, AND ON PURPOSE. `1 - daysAgo / recoveryDays`, floored at zero.
 * An exponential never reaches zero, so a hard session would keep a small vote
 * against a group forever; a linear ramp says "spent, then recovering, then done"
 * and reaches done on the day the policy says it does. The curve is a scale, not
 * a physiological model, and the only property that has to hold is that it hits
 * zero at `recoveryDays`.
 *
 * ABSENCE IS NOT NEGLECT. With no history at all, every group reads as fully
 * ready and NOT neglected. That is the whole point: on a first-ever session,
 * "nobody has trained anything" must not become "everything is maximally
 * overdue", because a signal that is maximal for all thirteen groups ranks none
 * of them. `hasHistory` is how a caller tells the two apart.
 */

/** Effective sets that count as a full-effort session for one group. */
export const HARD_SESSION_SETS = 8

/** Days without work after which a group is reported as neglected. */
export const DEFAULT_NEGLECT_DAYS = 10

/** Days of history the exposure map looks back over. */
export const DEFAULT_EXPOSURE_WINDOW_DAYS = 14

export interface GroupExposure {
  readonly group: MuscleGroupId
  /** Days since the group was last worked at all. `null` when never, in window. */
  readonly daysAgo: number | null
  /** Effective sets in that most recent exposure. */
  readonly setsThen: number
  /** Effective sets across the whole window. */
  readonly setsInWindow: number
  /** The policy's recovery window for this group, in days. */
  readonly recoveryDays: number
  /** 0..1 — how much recent work is still sitting on the group. */
  readonly residualLoad: number
  /** `1 - residualLoad`. 1 is fully recovered, or never trained in the window. */
  readonly readiness: number
  /** True only when there IS history and this group has been left out of it. */
  readonly neglected: boolean
}

export interface ExposureMap {
  /** Every group, in canonical order — including the ones with no exposure. */
  readonly byGroup: readonly GroupExposure[]
  /** False when no session was supplied. See the file note on absence. */
  readonly hasHistory: boolean
  for(group: MuscleGroupId): GroupExposure
}

export interface ExposureOptions {
  readonly windowDays?: number
  readonly neglectDays?: number
  /** Overrides for the recovery windows. Passed straight to the conflict policy. */
  readonly policy?: Partial<ConflictPolicy>
}

/** What one session did to one group, before decay. */
function sessionSetsForGroup(session: SessionVolume, group: MuscleGroupId): number {
  let sets = 0
  for (const item of session.items ?? []) {
    if (item.sets > 0) sets += groupCreditFor(item.exercise, group, item.sets)
  }
  const summarised = session.setsByGroup?.[group]
  if (typeof summarised === 'number' && summarised > 0) sets += summarised
  return roundSets(sets)
}

/**
 * How much of one session's work is still on the muscle.
 *
 * Two things scale it: how hard the session was for that group, capped at
 * `HARD_SESSION_SETS` (twelve sets do not sit on a muscle half again as long as
 * eight — past a point it is simply a hard session), and how far through the
 * recovery window it is.
 */
function residualOf(sets: number, daysAgo: number, recoveryDays: number): number {
  if (recoveryDays <= 0) return 0
  const effort = Math.min(1, sets / HARD_SESSION_SETS)
  const decay = Math.max(0, 1 - daysAgo / recoveryDays)
  return effort * decay
}

export function buildExposure(
  sessions: readonly SessionVolume[],
  options: ExposureOptions = {},
): ExposureMap {
  const windowDays = options.windowDays ?? DEFAULT_EXPOSURE_WINDOW_DAYS
  const neglectDays = options.neglectDays ?? DEFAULT_NEGLECT_DAYS
  const policy = resolveConflictPolicy(options.policy)

  const inWindow = sessions.filter((session) => session.daysAgo >= 0 && session.daysAgo < windowDays)
  const hasHistory = inWindow.length > 0

  const byGroup: GroupExposure[] = MUSCLE_GROUP_IDS.map((group) => {
    const recoveryDays = recoveryDaysFor(group, policy)
    let daysAgo: number | null = null
    let setsThen = 0
    let setsInWindow = 0
    let residual = 0

    for (const session of inWindow) {
      const sets = sessionSetsForGroup(session, group)
      if (sets <= 0) continue
      setsInWindow += sets
      residual += residualOf(sets, session.daysAgo, recoveryDays)
      // The most recent exposure wins; a tie on the same day takes the harder
      // of the two, so two sessions in one day read as one hard day.
      if (daysAgo === null || session.daysAgo < daysAgo) {
        daysAgo = session.daysAgo
        setsThen = sets
      } else if (session.daysAgo === daysAgo) {
        setsThen = Math.max(setsThen, sets)
      }
    }

    const residualLoad = roundSets(Math.min(1, residual))
    return {
      group,
      daysAgo,
      setsThen: roundSets(setsThen),
      setsInWindow: roundSets(setsInWindow),
      recoveryDays,
      residualLoad,
      readiness: roundSets(1 - residualLoad),
      neglected: hasHistory && (daysAgo === null || daysAgo >= neglectDays),
    }
  })

  const index = new Map(byGroup.map((row) => [row.group, row]))

  return {
    byGroup,
    hasHistory,
    for: (group) => index.get(group) as GroupExposure,
  }
}

/** The exposure map of a person with no history. Every group ready, none neglected. */
export function emptyExposure(options: ExposureOptions = {}): ExposureMap {
  return buildExposure([], options)
}

/**
 * The groups that have gone longest without work, worst first.
 *
 * Returns nothing when there is no history — see the file note. The tie-break is
 * explicit: longer since trained first, then fewer sets across the whole window
 * (a group touched once beats one touched three times at the same distance),
 * then canonical group order.
 */
export function neglectedGroups(exposure: ExposureMap): readonly GroupExposure[] {
  if (!exposure.hasHistory) return []
  const order = new Map(MUSCLE_GROUP_IDS.map((group, position) => [group, position]))
  return exposure.byGroup
    .filter((row) => row.neglected)
    .slice()
    .sort(
      (a, b) =>
        (b.daysAgo ?? Number.MAX_SAFE_INTEGER) - (a.daysAgo ?? Number.MAX_SAFE_INTEGER) ||
        a.setsInWindow - b.setsInWindow ||
        (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0),
    )
}

/**
 * Builds an exposure map from the group-level summaries Phase 6 hands the
 * generator (`MuscleExposureEntry`), for a caller that has those and not the
 * sessions behind them.
 */
export function exposureFromEntries(
  entries: readonly { readonly group: string; readonly daysAgo: number; readonly sets: number }[],
  options: ExposureOptions = {},
): ExposureMap {
  const sessions = new Map<number, Partial<Record<MuscleGroupId, number>>>()
  for (const entry of entries) {
    if (!isMuscleGroupId(entry.group) || entry.daysAgo < 0) continue
    const bucket = sessions.get(entry.daysAgo) ?? {}
    bucket[entry.group] = (bucket[entry.group] ?? 0) + entry.sets
    sessions.set(entry.daysAgo, bucket)
  }
  const ordered = [...sessions.entries()].sort((a, b) => a[0] - b[0])
  return buildExposure(
    ordered.map(([daysAgo, setsByGroup]) => ({ daysAgo, setsByGroup })),
    options,
  )
}
