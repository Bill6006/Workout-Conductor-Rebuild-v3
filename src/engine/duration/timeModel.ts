import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { TransitionCost } from '../../catalog/taxonomy/scales'
import type { RepUnit } from '../../catalog/taxonomy/taxonomy'
import type { RepTarget, Tempo } from '../../core/validation/workoutSchema'

/**
 * THE TIME MODEL. This file is the policy, and it is the file to argue with.
 *
 * Everything the duration engine believes about how long a thing takes is a
 * constant or a primitive in here. `estimate.ts`, `budget.ts`, `fit.ts` and
 * `warmUp.ts` do arithmetic with these and add no opinions of their own, so a
 * disagreement with reality is fixed in ONE place and every level of the estimate
 * moves together.
 *
 * THE ESTIMATE MUST NOT BE QUIETLY OPTIMISTIC. It is what the UI shows, and a
 * session that says 45 and takes 58 is worse than one that says 52. Three things
 * keep it honest, and each is a separate, named dial rather than one hidden fudge
 * factor:
 *
 *   1. REST IS CHARGED TO THE SET IT FOLLOWS, INCLUDING THE LAST ONE. The common
 *      shortcut is `sets - 1` rest intervals, which quietly assumes the last rest
 *      of every exercise is free. It is not: a person really does stand there
 *      after the last set of squats before walking to the next thing. Charging it
 *      also matches `SetTarget.estimatedSeconds`, which the durable schema
 *      defines as "work plus rest for this set alone".
 *
 *   2. THE WALK IS CHARGED ONLY FOR THE PART THE REST CANNOT ABSORB. Because rule
 *      1 charges the trailing rest, charging a full transition on top would count
 *      the same minute twice. So a transition costs `TRANSITION_SECONDS` for its
 *      rung MINUS the fraction of the previous rest that can realistically be
 *      spent walking (`TRANSITION_REST_OVERLAP`). It is a fraction and not the
 *      whole rest because a rest is mostly spent resting. `setupTimeSeconds` is
 *      NOT given this credit — finding and loading a bar is work you do on top.
 *
 *   3. THE SPREAD IS REPORTED, NOT SMOOTHED AWAY. `estimateBand` puts a low and a
 *      high either side of the point estimate, from one documented variance. The
 *      UI shows the point estimate; anything that promises a finish time reads
 *      the high one. See `ESTIMATE_VARIANCE`.
 *
 * PURE. No clock, no randomness, no I/O. Every function here is a total function
 * of its arguments, which is what lets the whole generator be deterministic.
 */

/* ------------------------------------------------------------------ *
 * The constants
 * ------------------------------------------------------------------ */

/**
 * Seconds one rep takes when no tempo is prescribed: the concentric, the
 * eccentric, and the turnaround at each end.
 *
 * THREE, AND NOT A PER-EXERCISE NUMBER. A deadlift rep is slower than a lateral
 * raise rep, but the catalog does not state rep duration and inventing a field
 * for it would be guessing with more decimal places. Where a rep's speed actually
 * matters the generator prescribes a `Tempo`, and `tempoSecondsPerRep` uses that
 * instead — a stated tempo is a fact, an inferred one is not.
 *
 * `engine/alternatives/estimate.ts` holds a deliberately crude local copy of this
 * number for candidate-versus-candidate comparison, and says in its own header
 * that it defers to this model. `timeModel.test.ts` asserts the two agree, so the
 * crude copy cannot drift away from the real one unnoticed.
 */
export const SECONDS_PER_REP = 3

/** Rehandling, resetting, and getting the second side started. */
export const SIDE_SWITCH_SECONDS = 5

/**
 * What moving to a piece of equipment costs, by its `transitionCost` rung.
 *
 *   low      — it is where you already are, or a step away. A dumbbell change.
 *   moderate — across the floor, or a machine that needs adjusting to you.
 *   high     — find it, wait for it, load it. A rack, a platform, a busy cable.
 *
 * These are the RAW costs. What a session is actually charged is
 * `transitionChargeSeconds`, which nets off the rest the walk happens during.
 */
export const TRANSITION_SECONDS: Readonly<Record<TransitionCost, number>> = {
  low: 15,
  moderate: 30,
  high: 60,
}

/**
 * How much of a programmed rest can realistically be spent moving to the next
 * thing. Half, because the other half is spent resting — which is the point of
 * it. Set this to 1 and the model claims every transition is free, which is the
 * optimism this engine exists to avoid; set it to 0 and every rest is counted
 * twice.
 */
export const TRANSITION_REST_OVERLAP = 0.5

/**
 * What a set of an exercise the catalog does not know costs to set up.
 *
 * A `custom:` exercise is a first-class thing a person may add, and it carries no
 * catalog metadata at all. Estimating it as free would make a session full of
 * custom movements read as far shorter than it is, so the unknown case gets a
 * plain middling setup and the default rep speed. Its absence is a fact the
 * caller can see — `estimateEntry` reports `usedFallback`.
 */
export const FALLBACK_SETUP_SECONDS = 45

/** The transition rung assumed for an exercise the catalog does not know. */
export const FALLBACK_TRANSITION: TransitionCost = 'moderate'

/**
 * How wide the honest band around a point estimate is, either side.
 *
 * TWELVE PER CENT, from what actually varies: whether the equipment is free, how
 * long the person spends on their phone between sets, and how close the real rep
 * speed is to the assumed one. It is deliberately symmetric — a session runs
 * short about as often as it runs long — and it is deliberately NOT applied to
 * the point estimate itself. A model that silently inflated every number would be
 * lying in the other direction and would make two estimates incomparable.
 */
export const ESTIMATE_VARIANCE = 0.12

/* ------------------------------------------------------------------ *
 * The one currency: a four-bucket cost
 * ------------------------------------------------------------------ */

/**
 * WHAT A PIECE OF A SESSION COSTS, split the same way at every level.
 *
 * A set, an entry, a block and a whole session all report these buckets, and a
 * parent's buckets are the sum of its children's plus whatever the parent adds.
 * The split is not decoration: `RecalibrationMetadata.timeBudget` in the durable
 * schema stores exactly these four numbers, so Phase 4 can diff two generations
 * without re-estimating anything.
 *
 *   work       — moving the load, holding the hold, and stripping plates for a drop.
 *   rest       — programmed rest, charged to the set it follows.
 *   transition — setting up, and the part of the walk the rest could not absorb.
 */
export interface TimeCost {
  readonly workSeconds: number
  readonly restSeconds: number
  readonly transitionSeconds: number
  /** The three above. Always exactly their sum. */
  readonly totalSeconds: number
}

export const ZERO_COST: TimeCost = {
  workSeconds: 0,
  restSeconds: 0,
  transitionSeconds: 0,
  totalSeconds: 0,
}

/** Builds a cost, rounding each bucket to whole seconds so the total is exact. */
export function timeCost(workSeconds: number, restSeconds: number, transitionSeconds: number): TimeCost {
  const work = Math.max(0, Math.round(workSeconds))
  const rest = Math.max(0, Math.round(restSeconds))
  const transition = Math.max(0, Math.round(transitionSeconds))
  return {
    workSeconds: work,
    restSeconds: rest,
    transitionSeconds: transition,
    totalSeconds: work + rest + transition,
  }
}

/** Adds costs bucket by bucket. The total stays the sum of the buckets. */
export function addCosts(...costs: readonly TimeCost[]): TimeCost {
  let work = 0
  let rest = 0
  let transition = 0
  for (const cost of costs) {
    work += cost.workSeconds
    rest += cost.restSeconds
    transition += cost.transitionSeconds
  }
  return timeCost(work, rest, transition)
}

/** Sums a list. `addCosts(...list)` on a long list is a spread nobody needs. */
export function sumCosts(costs: readonly TimeCost[]): TimeCost {
  return addCosts(...costs)
}

/* ------------------------------------------------------------------ *
 * Reps, tempo, and the work in one set
 * ------------------------------------------------------------------ */

/**
 * Seconds per rep implied by a prescribed tempo: the four phases, added up.
 *
 * A stated tempo BEATS `SECONDS_PER_REP` because it is a fact rather than an
 * assumption — a 4-1-1-0 eccentric really does make a set of eight take twice as
 * long, and a session of tempo work that estimated at the default speed would run
 * minutes over. A tempo of all zeros is not a claim about speed, so it falls back.
 */
export function tempoSecondsPerRep(tempo: Tempo | null): number {
  if (tempo === null) return SECONDS_PER_REP
  const total =
    tempo.eccentricSeconds + tempo.bottomPauseSeconds + tempo.concentricSeconds + tempo.topPauseSeconds
  return total > 0 ? total : SECONDS_PER_REP
}

/** The middle of a rep range. What an estimate has to assume, absent a record. */
export function repMidpoint(reps: RepTarget | { readonly min: number; readonly max: number }): number {
  return (reps.min + reps.max) / 2
}

export interface SetWorkInput {
  /** Reps, or seconds when `repUnit` is `'seconds'`. */
  readonly reps: number
  readonly repUnit: RepUnit
  /** Both sides are performed within one set, with a switch between them. */
  readonly unilateral: boolean
  /** From `tempoSecondsPerRep`, or `SECONDS_PER_REP` when nothing is prescribed. */
  readonly secondsPerRep: number
}

/**
 * THE WORK IN ONE SET, and nothing else — no rest, no setup.
 *
 * `repUnit` decides what the number MEANS. A 45-second plank is 45 seconds of
 * work, not 45 reps of it; getting this wrong makes every carry and hold in the
 * catalog estimate at three times its length. A unilateral set is performed
 * twice, with `SIDE_SWITCH_SECONDS` to rehandle in between.
 */
export function setWorkSeconds(input: SetWorkInput): number {
  const oneSide = input.repUnit === 'seconds' ? input.reps : input.reps * input.secondsPerRep
  const both = input.unilateral ? oneSide * 2 + SIDE_SWITCH_SECONDS : oneSide
  return Math.max(0, Math.round(both))
}

/* ------------------------------------------------------------------ *
 * Setup and transition
 * ------------------------------------------------------------------ */

/** Setup for an exercise, or the documented fallback for one the catalog lacks. */
export function setupSecondsFor(exercise: Exercise | null): number {
  return exercise === null ? FALLBACK_SETUP_SECONDS : exercise.setupTimeSeconds
}

/** The raw walk cost for an exercise, before any rest is netted off. */
export function walkSecondsFor(exercise: Exercise | null): number {
  return TRANSITION_SECONDS[exercise === null ? FALLBACK_TRANSITION : exercise.transitionCost]
}

/**
 * WHAT MOVING TO THE NEXT THING ACTUALLY COSTS.
 *
 * `previousRestSeconds` is the rest already charged to the set you just finished,
 * or `null` at the very start of a session, where there is nothing to walk
 * during. The credit is capped at `TRANSITION_REST_OVERLAP` of that rest, so a
 * long rest can absorb a long walk but never more than half of itself.
 *
 * Setup is NOT netted this way and is charged in full by the entry: walking to a
 * rack can happen while you recover, but loading it is extra time on your feet.
 */
export function transitionChargeSeconds(
  exercise: Exercise | null,
  previousRestSeconds: number | null,
): number {
  const walk = walkSecondsFor(exercise)
  if (previousRestSeconds === null) return walk
  const absorbed = Math.max(0, previousRestSeconds) * TRANSITION_REST_OVERLAP
  return Math.max(0, Math.round(walk - absorbed))
}

/* ------------------------------------------------------------------ *
 * The honest band
 * ------------------------------------------------------------------ */

/** A point estimate with the spread that is honestly around it. */
export interface EstimateBand {
  readonly seconds: number
  readonly lowSeconds: number
  readonly highSeconds: number
}

/**
 * The band around a point estimate.
 *
 * Show `seconds`. Fit against `seconds` too — the budget's own reserve is what
 * absorbs the ordinary overrun, and fitting against `highSeconds` as well would
 * apply the same caution twice and systematically under-fill every session. Read
 * `highSeconds` when something has to PROMISE a finish time, which is the whole
 * material an "End by exact time" mode needs.
 */
export function estimateBand(seconds: number): EstimateBand {
  const point = Math.max(0, Math.round(seconds))
  return {
    seconds: point,
    lowSeconds: Math.round(point * (1 - ESTIMATE_VARIANCE)),
    highSeconds: Math.round(point * (1 + ESTIMATE_VARIANCE)),
  }
}

/**
 * Seconds as the minutes a screen shows.
 *
 * Rounded to nearest, because a point estimate that always rounded up would drift
 * a minute per session away from the number the band already reports honestly.
 * An OVERRUN is rounded the other way — see `overrunMinutes` in `fit.ts`.
 */
export function secondsToMinutes(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60))
}
