import type { DurationChoice, EntryPriority, TimeBudget } from '../../core/validation/workoutSchema'
import type { TimeBudgetPlan } from './budget'
import { budgetPressure } from './budget'
import type { SessionEstimate } from './estimate'
import { type EstimateBand, estimateBand, secondsToMinutes } from './timeModel'

/**
 * DURATION FITTING — deciding what a length of time can actually hold.
 *
 * WHAT THIS FILE IS NOT: A TRUNCATOR. The plan is emphatic that changing the
 * duration REBUILDS the session rather than dropping the last exercises off a
 * longer one, so there is deliberately no function here that takes an ordered
 * session and cuts its tail. What there is instead is the material a rebuild
 * needs — a budget, the cost of every candidate, and the marginal value of adding
 * or removing work — and a selection over that material that is value-led rather
 * than order-led.
 *
 * `fitToBudget` makes the difference concrete. It sorts by VALUE PER SECOND, so a
 * cheap high-value accessory can beat an expensive one that happened to come
 * earlier, and it keeps scanning after a skip, so a small item still gets in
 * after a large one was passed over. Hand it the candidates for fifteen minutes
 * and it chooses fifteen minutes' worth; hand it the candidates for forty-five
 * and it chooses again from scratch. Neither answer is a prefix of the other, and
 * that is the whole point.
 *
 * IT IS GREEDY, AND SAYS SO. A density-ordered greedy fill is not the optimal
 * knapsack. It is deterministic, explicable in one sentence to a person asking
 * why an exercise was dropped, and correct enough at the sizes involved — a
 * session is under twenty candidates. An optimal solver would buy a percent of
 * packing efficiency at the cost of an explanation nobody could follow.
 *
 * THE IMPOSSIBLE CASE IS REPORTED, NEVER HIDDEN. See `assessDuration`: a session
 * that cannot fit says so, with the number of minutes it will run over, and the
 * caller shows the closest realistic plan alongside that admission. Nothing here
 * returns a session that lies about its length.
 */

/* ------------------------------------------------------------------ *
 * Marginal value
 * ------------------------------------------------------------------ */

/**
 * A PIECE OF WORK THE GENERATOR IS CONSIDERING.
 *
 * `value` is the generator's own judgement on 0..1 — goal fit, muscle priority,
 * volume deficit, progression role, all of which belong to it and none of which
 * belong here. This module never scores an exercise; it only weighs a score
 * against a cost.
 */
export interface FitItem {
  readonly itemId: string
  /** From `estimateCandidate`. Setup and walk included. */
  readonly costSeconds: number
  /** 0..1, the generator's. Higher is more worth doing. */
  readonly value: number
  readonly priority: EntryPriority
  /**
   * True for work the session cannot be the session without — the anchor lift.
   * Required items are taken FIRST and in the order given, even when that
   * overruns; the overrun is then reported rather than resolved by dropping them.
   */
  readonly required: boolean
}

/** Priority as a number, for a deterministic tie-break. Lower sorts first. */
const PRIORITY_RANK: Readonly<Record<EntryPriority, number>> = {
  priority: 0,
  normal: 1,
  accessory: 2,
}

/**
 * VALUE PER SECOND — the primitive a rebuild is built on.
 *
 * The cost is floored at one second so a zero-cost item cannot divide by zero and
 * cannot swamp the ordering with `Infinity`.
 */
export function marginalValuePerSecond(item: Pick<FitItem, 'value' | 'costSeconds'>): number {
  return item.value / Math.max(1, item.costSeconds)
}

/**
 * WHAT REMOVING THIS WOULD BUY AND WHAT IT WOULD COST, as one signed number.
 *
 * Positive means the seconds are worth more than the work. It is the same
 * quantity as `marginalValuePerSecond` read from the other end, and it exists as
 * its own function because "what should come out" is a question the generator
 * asks in exactly those words when a rebuild overruns.
 */
export function removalCase(item: Pick<FitItem, 'value' | 'costSeconds'>): {
  readonly secondsFreed: number
  readonly valueLost: number
  readonly valuePerSecondLost: number
} {
  return {
    secondsFreed: Math.max(0, Math.round(item.costSeconds)),
    valueLost: item.value,
    valuePerSecondLost: marginalValuePerSecond(item),
  }
}

/* ------------------------------------------------------------------ *
 * The selection
 * ------------------------------------------------------------------ */

export const FIT_EXCLUSION_REASONS = ['no-time', 'outranked'] as const
export type FitExclusionReason = (typeof FIT_EXCLUSION_REASONS)[number]

export interface ExcludedFitItem {
  readonly itemId: string
  readonly reason: FitExclusionReason
  /** How far over the remaining room this item was when it was passed over. */
  readonly shortfallSeconds: number
}

export interface FitOutcome {
  /** In the order they were given, not in density order. Selection reorders nothing. */
  readonly included: readonly string[]
  readonly excluded: readonly ExcludedFitItem[]
  readonly usedSeconds: number
  /** Budget minus used. Negative only when required work alone overran. */
  readonly headroomSeconds: number
  /** Seconds by which the REQUIRED items alone exceed the budget. 0 normally. */
  readonly requiredOverrunSeconds: number
}

/**
 * CHOOSE THE BEST SET OF WORK FOR A NUMBER OF SECONDS.
 *
 * Required items first, in the order given — they are the session. Then
 * everything else in descending value per second, taking whatever still fits, and
 * continuing past anything that does not so a cheap item is not locked out by an
 * expensive one ahead of it.
 *
 * TIE-BREAKS ARE TOTAL AND SEEDLESS: density, then priority rung, then the
 * caller's own order. Two identical inputs always produce byte-identical output,
 * with no randomness and no clock anywhere near the decision. Where the generator
 * wants two sessions to DIFFER it varies what it offers, never how this chooses.
 */
export function fitToBudget(items: readonly FitItem[], budgetSeconds: number): FitOutcome {
  const order = new Map(items.map((item, index) => [item.itemId, index]))
  const chosen = new Set<string>()
  const excluded: ExcludedFitItem[] = []

  let used = 0
  let requiredOverrun = 0

  for (const item of items) {
    if (!item.required) continue
    chosen.add(item.itemId)
    used += Math.max(0, item.costSeconds)
  }
  if (used > budgetSeconds) requiredOverrun = Math.round(used - budgetSeconds)

  const optional = items
    .filter((item) => !item.required)
    .sort((a, b) => {
      const byDensity = marginalValuePerSecond(b) - marginalValuePerSecond(a)
      if (byDensity !== 0) return byDensity
      const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (byPriority !== 0) return byPriority
      return (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0)
    })

  for (const item of optional) {
    const cost = Math.max(0, item.costSeconds)
    if (used + cost <= budgetSeconds) {
      chosen.add(item.itemId)
      used += cost
    } else {
      excluded.push({
        itemId: item.itemId,
        reason: 'no-time',
        shortfallSeconds: Math.round(used + cost - budgetSeconds),
      })
    }
  }

  return {
    included: items.filter((item) => chosen.has(item.itemId)).map((item) => item.itemId),
    excluded: excluded.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0)),
    usedSeconds: Math.round(used),
    headroomSeconds: Math.round(budgetSeconds - used),
    requiredOverrunSeconds: requiredOverrun,
  }
}

/**
 * HOW MANY MORE SETS OF SOMETHING THE REMAINING TIME HOLDS.
 *
 * The cheapest way to use leftover time is almost always another set of work
 * already set up, not another exercise: a set pays no setup and no walk. This is
 * the primitive that says how many.
 */
export function setsThatFit(remainingSeconds: number, marginalSetSeconds: number): number {
  if (marginalSetSeconds <= 0) return 0
  return Math.max(0, Math.floor(remainingSeconds / marginalSetSeconds))
}

/* ------------------------------------------------------------------ *
 * The verdict, including the impossible case
 * ------------------------------------------------------------------ */

/**
 * WHAT THE CLOCK SAYS ABOUT A BUILT SESSION.
 *
 *   under      — real room left. The rebuild should add work, not stop here.
 *   on-target  — it fills the usable budget without eating the reserve.
 *   tight      — it is into the reserve. It will fit, with nothing spare.
 *   over       — it exceeds the whole budget. HONEST ADMISSION REQUIRED: the
 *                caller shows this as the closest realistic plan and states the
 *                minutes it may run over.
 *   impossible — the budget cannot hold even a minimum viable session, so no
 *                amount of rebuilding produces something worth doing at this
 *                length. Still reported WITH the closest realistic plan, never as
 *                an empty session and never as a session pretending to fit.
 */
export const DURATION_VERDICTS = ['under', 'on-target', 'tight', 'over', 'impossible'] as const
export type DurationVerdict = (typeof DURATION_VERDICTS)[number]

/** Below this share of the usable budget there is room worth filling. */
export const UNDER_FILLED_THRESHOLD = 0.85

export const LENGTH_NOTICE_CODES = ['runs-over', 'no-viable-session', 'room-for-more'] as const
export type LengthNoticeCode = (typeof LENGTH_NOTICE_CODES)[number]

/**
 * The admission, in a form a screen renders and the generator can turn into a
 * `KnownCompromise`. `text` is finished copy; `code` is what anything else
 * branches on. Nobody parses the sentence.
 */
export interface LengthNotice {
  readonly code: LengthNoticeCode
  readonly text: string
  /** Minutes over, rounded UP. Zero for `room-for-more`. */
  readonly minutesOver: number
}

/** The length, stated three ways, so nothing has to promise the point estimate. */
export interface HonestLength extends EstimateBand {
  /** The point estimate as minutes. `Workout.estimatedMinutes`. */
  readonly minutes: number
  /** The minute a finish-time promise should be made against — the HIGH end. */
  readonly promiseMinutes: number
}

export interface DurationFit {
  readonly verdict: DurationVerdict
  readonly durationChoice: DurationChoice
  readonly plan: TimeBudgetPlan
  readonly estimatedSeconds: number
  /** Usable budget minus the estimate. Negative once the reserve is eaten. */
  readonly headroomSeconds: number
  /** Whole budget minus the estimate. What `TimeBudget.headroomSeconds` stores. */
  readonly budgetHeadroomSeconds: number
  /** Seconds past the whole budget. 0 unless `over` or `impossible`. */
  readonly overrunSeconds: number
  /** `overrunSeconds` in minutes, rounded UP. An overrun is never rounded down. */
  readonly overrunMinutes: number
  /** True when the session comes in at or under the budget. */
  readonly fits: boolean
  /** 0..1. How full the usable budget is. */
  readonly pressure: number
  readonly honest: HonestLength
  readonly notice: LengthNotice | null
}

export interface AssessDurationInput {
  readonly plan: TimeBudgetPlan
  /** Either a whole `SessionEstimate` or just its seconds. */
  readonly estimate: SessionEstimate | number
}

function secondsOf(estimate: SessionEstimate | number): number {
  return typeof estimate === 'number' ? Math.max(0, Math.round(estimate)) : estimate.totalSeconds
}

function noticeFor(verdict: DurationVerdict, minutesOver: number): LengthNotice | null {
  switch (verdict) {
    case 'impossible':
      return {
        code: 'no-viable-session',
        text:
          minutesOver > 0
            ? `There is not enough time here for a session worth doing. This is the closest realistic plan, and it runs about ${minutesOver} minute${minutesOver === 1 ? '' : 's'} over.`
            : 'There is not enough time here for a session worth doing.',
        minutesOver,
      }
    case 'over':
      return {
        code: 'runs-over',
        text: `This is the closest realistic plan for the time. Expect it to run about ${minutesOver} minute${minutesOver === 1 ? '' : 's'} over.`,
        minutesOver,
      }
    case 'under':
      return {
        code: 'room-for-more',
        text: 'There is time left over. More work would fit.',
        minutesOver: 0,
      }
    default:
      return null
  }
}

/**
 * THE TYPED ANSWER TO "DOES THIS FIT?".
 *
 * `'default'` NEVER RUNS OVER, because there is nothing for it to run over: the
 * complete session's own cost IS the default length, and `resolveDefaultMinutes`
 * writes it onto the workout. The only verdict an uncapped budget can reach
 * besides `on-target` is `impossible`, which for `'default'` means the plan
 * itself asks for less time than a session needs.
 */
export function assessDuration(input: AssessDurationInput): DurationFit {
  const { plan } = input
  const estimatedSeconds = secondsOf(input.estimate)
  const band = estimateBand(estimatedSeconds)

  const headroomSeconds = plan.usableSeconds - estimatedSeconds
  const budgetHeadroomSeconds = plan.budgetSeconds - estimatedSeconds

  const cannotHoldAnything = plan.usableSeconds < plan.minimumViableSeconds
  const overrunSeconds = cannotHoldAnything
    ? Math.max(0, plan.minimumViableSeconds - plan.budgetSeconds)
    : plan.capped
      ? Math.max(0, -budgetHeadroomSeconds)
      : 0

  const verdict: DurationVerdict = cannotHoldAnything
    ? 'impossible'
    : !plan.capped
      ? 'on-target'
      : budgetHeadroomSeconds < 0
        ? 'over'
        : headroomSeconds < 0
          ? 'tight'
          : estimatedSeconds < plan.usableSeconds * UNDER_FILLED_THRESHOLD
            ? 'under'
            : 'on-target'

  const overrunMinutes = Math.ceil(overrunSeconds / 60)

  return {
    verdict,
    durationChoice: plan.durationChoice,
    plan,
    estimatedSeconds,
    headroomSeconds: Math.round(headroomSeconds),
    budgetHeadroomSeconds: Math.round(budgetHeadroomSeconds),
    overrunSeconds,
    overrunMinutes,
    fits: verdict !== 'over' && verdict !== 'impossible',
    pressure: budgetPressure(plan, estimatedSeconds),
    honest: {
      ...band,
      minutes: secondsToMinutes(band.seconds),
      promiseMinutes: Math.ceil(band.highSeconds / 60),
    },
    notice: noticeFor(verdict, overrunMinutes),
  }
}

/**
 * SECONDS THAT WOULD HAVE TO COME OFF to finish by a hard stop.
 *
 * The other half of the "End by exact time" material: pair it with
 * `removalCase()` over the session's items and the answer to "what goes" is
 * arithmetic rather than judgement. It measures against the HIGH end of the band,
 * because a promise to be finished by ten past is not kept by an estimate that is
 * right on average.
 */
export function secondsToShed(fit: DurationFit, hardStopSeconds: number): number {
  return Math.max(0, Math.round(fit.honest.highSeconds - hardStopSeconds))
}

/**
 * The whole `TimeBudget` row for `RecalibrationMetadata`, assembled from the plan
 * and the estimate so the audit trail can never disagree with either.
 */
export function toTimeBudget(
  fit: DurationFit,
  parts: Pick<TimeBudget, 'warmUpSeconds' | 'workSeconds' | 'restSeconds' | 'transitionSeconds'>,
): TimeBudget {
  return {
    budgetSeconds: fit.plan.budgetSeconds,
    warmUpSeconds: parts.warmUpSeconds,
    workSeconds: parts.workSeconds,
    restSeconds: parts.restSeconds,
    transitionSeconds: parts.transitionSeconds,
    estimatedSeconds: fit.estimatedSeconds,
    headroomSeconds: fit.budgetHeadroomSeconds,
  }
}
