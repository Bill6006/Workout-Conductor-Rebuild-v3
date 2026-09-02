import { z } from 'zod'

/**
 * Ordered scales.
 *
 * Every scale in the catalog is a small ordered list of strings, and every
 * comparison between two of its values goes through `orderedScale()`. The point
 * is that `'high' > 'low'` is FALSE in JavaScript and true in English: a
 * comparison written against the strings is a bug that reads correctly. Ranking
 * an alternative, judging whether an exercise is difficult enough, and deciding
 * whether a demand is above a threshold all need the order, so the order is the
 * exported thing.
 *
 * The scale objects are frozen data plus pure functions — no clock, no storage.
 */

export interface OrderedScale<T extends string> {
  /** Ascending order. Index 0 is the least of the scale. */
  readonly values: readonly T[]
  readonly schema: z.ZodEnum<{ [K in T]: K }>
  /** 0-based position. Throws for a value outside the scale. */
  rank(value: T): number
  /** Negative when `a` is below `b`, as `Array.prototype.sort` expects. */
  compare(a: T, b: T): number
  /** True when `value` is at or above `minimum`. */
  atLeast(value: T, minimum: T): boolean
  /** True when `value` is at or below `maximum`. */
  atMost(value: T, maximum: T): boolean
  highest(a: T, b: T): T
  lowest(a: T, b: T): T
  is(value: unknown): value is T
}

export function orderedScale<const T extends readonly [string, ...string[]]>(
  values: T,
): OrderedScale<T[number]> {
  type Value = T[number]
  const order = new Map<string, number>(values.map((value, index) => [value, index]))

  function rank(value: Value): number {
    const index = order.get(value)
    if (index === undefined) throw new Error(`Value "${value}" is not on this scale`)
    return index
  }

  return {
    values,
    schema: z.enum(values),
    rank,
    compare: (a, b) => rank(a) - rank(b),
    atLeast: (value, minimum) => rank(value) >= rank(minimum),
    atMost: (value, maximum) => rank(value) <= rank(maximum),
    highest: (a, b) => (rank(a) >= rank(b) ? a : b),
    lowest: (a, b) => (rank(a) <= rank(b) ? a : b),
    is: (value): value is Value => typeof value === 'string' && order.has(value),
  }
}

/**
 * How well an exercise serves a training goal. Five rungs rather than a boolean,
 * because "can you use a cable fly to get stronger" has an honest answer that is
 * neither yes nor no, and the alternatives ranker needs to see the difference.
 */
export const SUITABILITY_SCALE = orderedScale([
  'unsuitable',
  'limited',
  'moderate',
  'good',
  'excellent',
] as const)
export type Suitability = (typeof SUITABILITY_SCALE.values)[number]

/** How much the grip is the limiter. `none` covers machines that strap you in. */
export const GRIP_DEMAND_SCALE = orderedScale(['none', 'low', 'moderate', 'high'] as const)
export type GripDemand = (typeof GRIP_DEMAND_SCALE.values)[number]

/** How much of the effort goes into staying in position rather than moving load. */
export const STABILITY_DEMAND_SCALE = orderedScale(['low', 'moderate', 'high', 'very-high'] as const)
export type StabilityDemand = (typeof STABILITY_DEMAND_SCALE.values)[number]

/** Who can be handed this exercise. Matches the profile's `experience` rungs. */
export const DIFFICULTY_SCALE = orderedScale(['beginner', 'intermediate', 'advanced'] as const)
export type Difficulty = (typeof DIFFICULTY_SCALE.values)[number]

/**
 * What it costs to move to this exercise from whatever came before: finding the
 * kit, loading it, and setting up. Paired with `setupTimeSeconds` on an exercise —
 * the seconds are for duration fitting, this rung is for ordering a session so a
 * person is not crossing the gym four times.
 */
export const TRANSITION_COST_SCALE = orderedScale(['low', 'moderate', 'high'] as const)
export type TransitionCost = (typeof TRANSITION_COST_SCALE.values)[number]

/**
 * Whether an exercise can serve as a warm-up.
 *   `unsuitable`     — never warm up on it (heavy, technical, or a finisher).
 *   `specific-ramp`  — lighter sets of the exercise itself ramp into it.
 *   `general`        — also usable as a general warm-up movement for the session.
 */
export const WARM_UP_SUITABILITY_SCALE = orderedScale(['unsuitable', 'specific-ramp', 'general'] as const)
export type WarmUpSuitability = (typeof WARM_UP_SUITABILITY_SCALE.values)[number]
