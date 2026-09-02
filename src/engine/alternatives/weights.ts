/**
 * THE WEIGHTS. This file is the ranking policy, and it is the file to argue with.
 *
 * Every factor scores a candidate on 0..1 and contributes `weight * score`. The
 * weights below total exactly 100, which `weights.test.ts` asserts, so a
 * `matchScore` is a percentage of the best possible match rather than an
 * arbitrary number that drifts every time a factor is added.
 *
 * RENORMALISATION, AND WHY IT CANNOT DEPEND ON THE CANDIDATE. Some factors have
 * nothing to say in some contexts: there is no superset to protect when the slot
 * is not in one, and no previous performance to weigh when none was supplied.
 * Those factors drop out and the remaining weights are scaled back up to 100, so
 * a score always means the same thing. Applicability is therefore a function of
 * the CONTEXT ONLY — never of the candidate. If a candidate could change the
 * denominator, two candidates in one call would be scored on different scales and
 * the ranking would be meaningless.
 *
 * THE ORDER OF THE ARGUMENT, in weight order:
 *
 *   Does it do the same job? (`primary-muscle` 14, `movement-pattern` 9,
 *   `stimulus` 8, `training-role` 6, `range-of-motion` 2 — 39 points). This is the
 *   largest block because it is the question. An alternative that trains something
 *   else is not an alternative, and the exclusion filter only enforces the coarse
 *   version of that (a shared muscle GROUP); the fine version is scored here so
 *   that upper-chest work outranks lower-chest work when the lift being replaced
 *   was an incline press.
 *
 *   `training-role` is worth more than it first looks because it is the factor
 *   that knows a push-up is not a substitute for a heavy bench press. Matching the
 *   muscle exactly is worth more than matching the role — but not by enough to
 *   outvote role and stimulus together, which is the balance that keeps an
 *   accessory from displacing the lift the session was built around.
 *   `range-of-motion` is worth the least of the five because it is the only one
 *   of them the catalog cannot state directly; see the proxy note in `factors.ts`.
 *
 *   Does the person want it? (`preference` 7, `previous-performance` 4,
 *   `hand-picked-substitution` 3 — 14 points). A stated preference outweighs every
 *   individual similarity factor except the primary muscle, on purpose: the
 *   catalog's opinion should not beat a person's. It does not outweigh the
 *   similarity block as a whole, because "I like curls" is not a reason to
 *   substitute a curl for a squat — and the muscle-group filter would have
 *   stopped that anyway.
 *
 *   Can they do it well, right now? (`remaining-time` 6, `equipment` 6,
 *   `setup-time` 4 — 16 points). Equipment and location are already hard filters;
 *   what is left to score is preferring kit that is literally already in their
 *   hands over kit they must go and find.
 *
 *   Will it wreck the rest of the session? (`joint-stress` 6, `session-overlap` 4,
 *   `fatigue` 4, `grip` 3, `conflict-caution` 3 — 20 points). Joint stress leads
 *   this block because it is the one whose cost is measured in weeks.
 *
 *   Does it keep what they have built? (`progression-continuity` 6,
 *   `superset-compatibility` 3, `drop-set-compatibility` 2 — 11 points).
 *   Progression continuity is weighted like a similarity factor rather than a
 *   nicety: staying in the family is what stops a swap resetting a working load.
 *
 * THE ONE RULE FOR CHANGING A WEIGHT: change it here, nowhere else, and add a
 * scenario to `rankAlternatives.test.ts` that the change is supposed to fix. The
 * ordering tests exist so a re-weighting has to state what it improves.
 */

export const FACTOR_KEYS = [
  'primary-muscle',
  'movement-pattern',
  'training-role',
  'stimulus',
  'range-of-motion',
  'equipment',
  'setup-time',
  'remaining-time',
  'session-overlap',
  'fatigue',
  'grip',
  'joint-stress',
  'preference',
  'previous-performance',
  'progression-continuity',
  'superset-compatibility',
  'drop-set-compatibility',
  'hand-picked-substitution',
  'conflict-caution',
] as const

export type FactorKey = (typeof FACTOR_KEYS)[number]

export const FACTOR_WEIGHTS: Readonly<Record<FactorKey, number>> = {
  'primary-muscle': 14,
  'movement-pattern': 9,
  'training-role': 6,
  stimulus: 8,
  'range-of-motion': 2,
  equipment: 6,
  'setup-time': 4,
  'remaining-time': 6,
  'session-overlap': 4,
  fatigue: 4,
  grip: 3,
  'joint-stress': 6,
  preference: 7,
  'previous-performance': 4,
  'progression-continuity': 6,
  'superset-compatibility': 3,
  'drop-set-compatibility': 2,
  'hand-picked-substitution': 3,
  'conflict-caution': 3,
}

/** What every weight must add up to. Asserted by a test, not by hope. */
export const TOTAL_WEIGHT = 100

/**
 * THE BASELINE A FACTOR IS BORING AT.
 *
 * The primary reason shown to a person is the factor whose score is furthest
 * ABOVE its baseline, not the one with the biggest raw contribution. Without
 * this, every alternative would be explained as "trains the same primary muscle",
 * because the filter already guaranteed that of all of them — a true statement
 * that distinguishes nothing.
 *
 * Each number is what a typical surviving candidate scores on that factor:
 *
 *   0.5   the honest midpoint — the factor genuinely splits candidates.
 *   0.85  `primary-muscle`: the pool is SEEDED by muscle group and the filter
 *         throws out anything that misses it, so most survivors match the muscle
 *         exactly. Saying so explains nothing; shifting the emphasis is the news.
 *   0.8   `movement-pattern`: seeded the same way, for the same reason.
 *   0.7   `equipment`: the filter has already established that the kit is here.
 *   0.9   `setup-time`: most candidates set up no slower than what they replace,
 *         so scoring 1 there is not news; being 0.4 is.
 *   1.0   `conflict-caution`: no caution is the normal case, so this factor can
 *         only ever push a candidate DOWN, which is exactly what it is for.
 *   0.2   `hand-picked-substitution`: almost nothing is hand-picked, so being
 *         hand-picked should shout.
 *   0.35  `progression-continuity`: most candidates are in another family.
 */
export const FACTOR_BASELINES: Readonly<Record<FactorKey, number>> = {
  'primary-muscle': 0.85,
  'movement-pattern': 0.8,
  'training-role': 0.6,
  stimulus: 0.6,
  'range-of-motion': 0.5,
  equipment: 0.7,
  'setup-time': 0.9,
  'remaining-time': 0.6,
  'session-overlap': 0.8,
  fatigue: 0.5,
  grip: 0.7,
  'joint-stress': 0.7,
  preference: 0.5,
  'previous-performance': 0.5,
  'progression-continuity': 0.35,
  'superset-compatibility': 0.7,
  'drop-set-compatibility': 0.5,
  'hand-picked-substitution': 0.2,
  'conflict-caution': 1,
}

/**
 * Score rungs, so a screen never invents its own thresholds and two screens never
 * disagree about what "a good match" is.
 *
 * They are deliberately generous at the top and unforgiving at the bottom: after
 * the exclusion filters, everything still standing is something the person CAN
 * do, so `weak` means "this will feel like a different exercise", not "this is
 * a bad idea".
 */
export const MATCH_QUALITY_THRESHOLDS = {
  excellent: 82,
  strong: 65,
  fair: 45,
} as const

/** How many alternatives a caller gets unless it asks for a different number. */
export const DEFAULT_ALTERNATIVE_LIMIT = 8
