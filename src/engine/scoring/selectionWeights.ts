/**
 * THE SELECTION WEIGHTS. This file is the policy, and it is the file to argue
 * with.
 *
 * Each factor scores a candidate on 0..1 and contributes `weight * score`. The
 * weights total exactly 100, which a test asserts, so a selection score is a
 * percentage of the best possible fill for THIS slot rather than a number that
 * drifts every time a factor is added.
 *
 * RENORMALISATION, AND WHY IT CANNOT DEPEND ON THE CANDIDATE. A factor with
 * nothing to say drops out and the rest scale back up to 100 — there is no
 * progression history to keep before Phase 6, and no session to balance against
 * on the first slot. Applicability is therefore a function of the SLOT AND THE
 * CONTEXT only. If a candidate could change the denominator, two candidates in
 * one call would be measured on different scales and the ranking would be
 * meaningless. This is the same discipline `alternatives/weights.ts` keeps, for
 * the same reason.
 *
 * THE ORDER OF THE ARGUMENT, in weight order:
 *
 *   Does it fill the slot? (`target-muscle` 17, `role-fit` 10,
 *   `style-suitability` 10 — 37 points). The slot exists to train a muscle in a
 *   particular way; a candidate that misses that is not a fill, it is a
 *   different session. `target-muscle` leads because the exclusion filter only
 *   enforces the coarse version — the group is touched at all — and the fine
 *   version, whether the exact head the priorities asked for is the one the
 *   exercise trains, is what separates an incline press from a decline one.
 *
 *   Does it fit the session being built? (`pattern-balance` 8,
 *   `session-overlap` 7, `joint-stress` 7 — 22 points). This block is the
 *   difference between a session and a list. Nothing here re-decides SAFETY —
 *   the conflict engine owns that and has already had its say — these three
 *   prefer a session that is varied, spread across patterns, and does not put
 *   everything through one joint.
 *
 *   Does the person want it? (`preference` 8, `recent-exposure` 5 — 13 points).
 *   A stated preference outweighs every individual fit factor except the target
 *   muscle: the catalog's opinion should not beat a person's. Disliked exercises
 *   are EXCLUDED rather than weighted, so this factor only ever pushes upward.
 *
 *   Can they do it well, here, now? (`equipment-on-hand` 5, `experience-fit` 3,
 *   `setup-cost` 4 — 12 points). Equipment and location are hard filters
 *   already; what is left to score is preferring kit that is literally out over
 *   kit they must go and find.
 *
 *   Does it keep what they have built, and does it do what the slot asked?
 *   (`progression-continuity` 5, `warm-up-fit` 4, `technique-fit` 3 — 12 points).
 *
 *   `conflict-caution` 4. Non-blocking conflict findings cost real score. The
 *   engine's `blocking` rung has already excluded; this is what `strong` and
 *   `advisory` are worth.
 *
 * THE ONE RULE FOR CHANGING A WEIGHT: change it here, nowhere else, and add a
 * scenario to `rankCandidates.test.ts` that the change is supposed to fix.
 */

export const SELECTION_FACTOR_KEYS = [
  'target-muscle',
  'role-fit',
  'style-suitability',
  'pattern-balance',
  'session-overlap',
  'joint-stress',
  'preference',
  'recent-exposure',
  'equipment-on-hand',
  'setup-cost',
  'experience-fit',
  'progression-continuity',
  'warm-up-fit',
  'technique-fit',
  'conflict-caution',
] as const

export type SelectionFactorKey = (typeof SELECTION_FACTOR_KEYS)[number]

export const SELECTION_WEIGHTS: Readonly<Record<SelectionFactorKey, number>> = {
  'target-muscle': 17,
  'role-fit': 10,
  'style-suitability': 10,
  'pattern-balance': 8,
  'session-overlap': 7,
  'joint-stress': 7,
  preference: 8,
  'recent-exposure': 5,
  'equipment-on-hand': 5,
  'setup-cost': 4,
  'experience-fit': 3,
  'progression-continuity': 5,
  'warm-up-fit': 4,
  'technique-fit': 3,
  'conflict-caution': 4,
}

/** What every weight must add up to. Asserted by a test, not by hope. */
export const TOTAL_SELECTION_WEIGHT = 100

/**
 * THE BASELINE A FACTOR IS BORING AT.
 *
 * The leading factor reported on a candidate is the one whose score sits
 * furthest ABOVE its baseline, not the one with the biggest raw contribution.
 * Without this, every pick would be explained as "trains the target muscle",
 * which the filter already guaranteed of all of them and which therefore
 * distinguishes none of them.
 *
 *   0.5   the honest midpoint — the factor genuinely splits candidates.
 *   0.85  `target-muscle`: the pool is SEEDED by the target group, so most
 *         survivors hit it. Hitting the exact head is the news.
 *   0.7   `equipment-on-hand`, `joint-stress`: the filters and the engine have
 *         already dealt with the impossible cases.
 *   0.8   `session-overlap`: most candidates overlap nothing much.
 *   0.9   `setup-cost`, `warm-up-fit`, `technique-fit`: near enough always fine.
 *   1.0   `conflict-caution`: no caution is the normal case, so this factor can
 *         only push a candidate DOWN — which is exactly what it is for.
 *   0.3   `progression-continuity`: most candidates are in a family the person
 *         has no history in, so being in one should shout.
 */
export const SELECTION_BASELINES: Readonly<Record<SelectionFactorKey, number>> = {
  'target-muscle': 0.85,
  'role-fit': 0.6,
  'style-suitability': 0.6,
  'pattern-balance': 0.7,
  'session-overlap': 0.8,
  'joint-stress': 0.7,
  preference: 0.5,
  'recent-exposure': 0.7,
  'equipment-on-hand': 0.7,
  'setup-cost': 0.9,
  'experience-fit': 0.8,
  'progression-continuity': 0.3,
  'warm-up-fit': 0.9,
  'technique-fit': 0.9,
  'conflict-caution': 1,
}

/**
 * How close two candidates have to be before the generator is entitled to pick
 * between them with its seed. Points of the 0-100 score.
 *
 * Variety lives HERE rather than in the ranking: this module is deterministic and
 * says which candidate is best, and `topWithin` says which others are close
 * enough that choosing one of them costs nothing. The generator does the seeded
 * pick. A ranker that jittered its own scores would make two identical inputs
 * produce different sessions, which the phase brief forbids.
 */
export const SELECTION_TIE_TOLERANCE = 4

/** How many candidates a caller gets unless it asks for a different number. */
export const DEFAULT_CANDIDATE_LIMIT = 8
