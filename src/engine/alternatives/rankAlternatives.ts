import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { AlternativesIndex } from './catalogIndex'
import type { ConflictChecker, ConflictSource } from './conflictPort'
import { defaultSlotEstimator, estimateSlotWith, type SlotEstimator } from './estimate'
import { screenCandidate } from './exclusions'
import {
  describeDifferences,
  explainReasons,
  matchQualityFor,
  progressionContinuity,
  summarise,
  supersetImpact,
} from './explain'
import { factorApplicability, scoreCandidate } from './factors'
import { createConflictChecker } from './conflictsAdapter'
import { buildPreferenceLookup } from './preferences'
import { readSession } from './sessionView'
import type { ConflictPolicy } from '../conflicts/conflictPolicy'
import type {
  AlternativesContext,
  AlternativesResult,
  ExcludedCandidate,
  ExclusionCode,
  NoAlternativeReason,
  PerformanceRecord,
  RankedAlternative,
} from './types'
import { DEFAULT_ALTERNATIVE_LIMIT } from './weights'

/**
 * THE ONE ENTRY POINT. Give it an index, a context, and optionally an injected
 * conflict engine; get back a ranked list or an explicit "nothing suitable".
 *
 * THE SHAPE OF THE ANSWER IS THE POINT. `outcome: 'none'` is a first-class result
 * carrying a machine-readable `reason` and a line a screen can render, because
 * "we found nothing you can safely do right now" is information a person needs
 * and an empty array is a screen guessing. The TYPE enforces the other half:
 * `outcome: 'ranked'` carries a non-empty tuple, so a caller that has narrowed the
 * union can read `alternatives[0]` without a null check.
 *
 * DETERMINISM IS A CONTRACT, NOT A HOPE. Nothing here reads a clock, generates a
 * random number, or iterates an unordered structure into the output. Ties break
 * on setup time and then on exercise id, both total orders, so the same input
 * produces byte-identical output every time — which is what makes the ordering
 * tests meaningful and what stops a list reshuffling under a person's thumb.
 *
 * COST. One O(n) index build (amortised across every call), then work proportional
 * to the candidate POOL — a few dozen entries for a realistic catalog, not the
 * whole of it. Each candidate is screened once and scored once, and the conflict
 * engine is asked once per surviving candidate rather than once per rule.
 */

export interface RankingOptions {
  /** How many alternatives to return. Defaults to `DEFAULT_ALTERNATIVE_LIMIT`. */
  readonly limit?: number
  /**
   * Drop anything scoring below this. Defaults to 0 — "nothing suitable" means
   * everything was EXCLUDED, not that everything scored badly, and a caller that
   * wants a quality bar should have to ask for one and name it.
   */
  readonly minimumScore?: number
  /**
   * The caller has already accepted that the superset may end. Superset conflicts
   * stop excluding candidates and are reported as `superset.effect: 'broken'`
   * instead.
   */
  readonly allowSupersetBreak?: boolean
  /**
   * A conflict checker the caller already holds. Omitted, the ranker builds one
   * from `src/engine/conflicts` around this context — which is the normal path.
   * See `conflictPort.ts` and `conflictsAdapter.ts`.
   */
  readonly conflictChecker?: ConflictChecker
  /** Overrides for the conflict engine's thresholds. Passed straight through. */
  readonly conflictPolicy?: Partial<ConflictPolicy>
  /** Phase 3's duration model, once it exists. See `estimate.ts`. */
  readonly estimateSlotSeconds?: SlotEstimator
}

/** Which exclusions are evidence about the PERSON'S SITUATION rather than pool noise. */
const NO_ALTERNATIVE_CAUSE: Readonly<Partial<Record<ExclusionCode, NoAlternativeReason>>> = {
  'equipment-unavailable': 'equipment-unavailable',
  'requires-location-change': 'requires-location-change',
  'location-unsuitable': 'location-unsuitable',
  'limitation-contraindicated': 'limitation-blocked',
  'does-not-fit-remaining-time': 'time-insufficient',
  'duplicate-in-session': 'session-conflict',
  'excessive-overlap': 'session-conflict',
  'interferes-with-priority': 'session-conflict',
  'unsafe-joint-stress': 'session-conflict',
  'superset-conflict': 'session-conflict',
  'session-conflict': 'session-conflict',
  disliked: 'user-excluded',
  'below-quality-floor': 'below-quality-floor',
}

const NO_ALTERNATIVE_MESSAGE: Readonly<Record<NoAlternativeReason, string>> = {
  'no-candidates-in-catalog': 'Nothing in the catalog trains this the way your current exercise does.',
  'equipment-unavailable': 'Nothing that trains this is possible with the equipment here.',
  'requires-location-change': 'Everything that would work needs equipment from one of your other locations.',
  'location-unsuitable': 'Nothing that trains this suits where you are training today.',
  'limitation-blocked': 'Everything that would work is ruled out by a limitation you recorded.',
  'time-insufficient': 'Nothing that trains this fits the time you have left.',
  'session-conflict': 'Everything that would work clashes with the rest of this session.',
  'user-excluded': 'Everything that would work is on your list of exercises to avoid.',
  'below-quality-floor': 'Nothing reached the match quality you asked for.',
  mixed: 'Nothing suitable is available right now — the reasons differ from one exercise to the next.',
}

/**
 * The canonical order ties break on, most concrete cause first. A user can act
 * on "you do not have the kit" far more easily than on "nothing scored well
 * enough", so when two causes eliminated the same number of candidates the more
 * actionable one is the one worth saying out loud.
 *
 * This is deliberately an explicit list rather than the key order of a record:
 * relying on object key order would make the message a user sees depend on how
 * someone happened to sort a map literal.
 */
export const NO_ALTERNATIVE_PRIORITY = [
  'no-candidates-in-catalog',
  'equipment-unavailable',
  'requires-location-change',
  'location-unsuitable',
  'limitation-blocked',
  'time-insufficient',
  'session-conflict',
  'user-excluded',
  'below-quality-floor',
] as const satisfies readonly NoAlternativeReason[]

/**
 * Names the dominant cause, or `mixed` when no single one accounts for at least
 * half of the eliminations. Ties break on the canonical reason order, so the
 * message is the same on every run.
 */
function noAlternativeReasonFrom(excluded: readonly ExcludedCandidate[]): NoAlternativeReason {
  const counts = new Map<NoAlternativeReason, number>()
  let total = 0
  for (const entry of excluded) {
    const cause = NO_ALTERNATIVE_CAUSE[entry.code]
    if (!cause) continue
    counts.set(cause, (counts.get(cause) ?? 0) + 1)
    total += 1
  }
  if (total === 0) return 'no-candidates-in-catalog'

  // Walking the canonical order rather than the map means a tie resolves to the
  // earlier reason, which is what makes the message stable across catalog edits.
  let best: NoAlternativeReason = 'mixed'
  let bestCount = 0
  for (const reason of NO_ALTERNATIVE_PRIORITY) {
    const count = counts.get(reason) ?? 0
    if (count > bestCount) {
      best = reason
      bestCount = count
    }
  }
  return bestCount * 2 >= total ? best : 'mixed'
}

/** Rounded before comparison so floating-point dust never decides an order. */
const SORT_PRECISION = 1e6

export function rankAlternatives(
  index: AlternativesIndex,
  context: AlternativesContext,
  options: RankingOptions = {},
): AlternativesResult {
  const view = readSession(context)
  const current = view.target.exercise
  const estimate = options.estimateSlotSeconds ?? defaultSlotEstimator
  const checker =
    options.conflictChecker ??
    createConflictChecker(context, view, estimate, { policy: options.conflictPolicy })
  const conflictSource: ConflictSource = options.conflictChecker ? 'injected' : 'engine'
  const allowSupersetBreak = options.allowSupersetBreak ?? false
  const limit = options.limit ?? DEFAULT_ALTERNATIVE_LIMIT
  const minimumScore = options.minimumScore ?? 0

  const available: ReadonlySet<EquipmentId> = new Set(context.availableEquipment)
  const preferences = buildPreferenceLookup(context.preferences, index)
  const performanceById = new Map<string, PerformanceRecord>(
    (context.performance ?? []).map((record) => [record.exerciseId, record]),
  )

  const candidates = index.candidatesFor(current)
  const applicability = factorApplicability(context, view, preferences.hasAnyPreference)

  const excluded: ExcludedCandidate[] = []
  const scored: { alternative: RankedAlternative; rawScore: number }[] = []

  for (const candidate of candidates) {
    const screen = screenCandidate({
      candidate,
      current,
      context,
      view,
      available,
      preferences,
      estimate,
      checker,
      allowSupersetBreak,
    })
    if (screen.excluded) {
      excluded.push(screen.excluded)
      continue
    }

    const progression = progressionContinuity(candidate, current)
    const superset = supersetImpact(candidate, view, screen.conflicts)
    const estimatedSeconds = estimateSlotWith(estimate, view.target, candidate)

    const { matchScore, rawScore, factors } = scoreCandidate(
      {
        candidate,
        current,
        context,
        view,
        available,
        preference: preferences.match(candidate),
        performance: performanceById.get(candidate.id) ?? null,
        conflicts: screen.conflicts,
        estimatedSeconds,
        progression,
        superset,
      },
      applicability,
    )

    const differences = describeDifferences(candidate, current, view, progression, superset)
    const { primary, supporting } = explainReasons(factors)
    const keyDifference = differences[0] ?? null

    scored.push({
      rawScore,
      alternative: {
        exerciseId: candidate.id,
        name: candidate.name,
        matchScore,
        matchQuality: matchQualityFor(matchScore),
        primaryReason: primary,
        supportingReasons: supporting,
        keyDifference,
        differences,
        equipment: candidate.equipment,
        optionalEquipment: candidate.optionalEquipment,
        setupTimeSeconds: candidate.setupTimeSeconds,
        estimatedSlotSeconds: estimatedSeconds,
        progression,
        superset,
        warnings: screen.conflicts.map((conflict) => conflict.reason),
        factors,
        summary: summarise(primary, keyDifference),
      },
    })
  }

  scored.sort(
    (a, b) =>
      Math.round(b.rawScore * SORT_PRECISION) - Math.round(a.rawScore * SORT_PRECISION) ||
      a.alternative.setupTimeSeconds - b.alternative.setupTimeSeconds ||
      a.alternative.exerciseId.localeCompare(b.alternative.exerciseId),
  )

  for (const entry of scored) {
    if (entry.alternative.matchScore < minimumScore) {
      excluded.push({
        exerciseId: entry.alternative.exerciseId,
        name: entry.alternative.name,
        code: 'below-quality-floor',
        text: `Scored ${entry.alternative.matchScore}, below the ${minimumScore} you asked for`,
        missingEquipment: [],
        availableAt: [],
        conflictKind: null,
      })
    }
  }

  const kept = scored
    .filter((entry) => entry.alternative.matchScore >= minimumScore)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.alternative)

  // Exclusions are collected in whatever order the index yielded candidates, so
  // two catalogs holding the same exercises in a different file order would
  // return the same ranking but a differently ordered `excluded` list. Sorting
  // makes the whole result a pure function of its inputs, which is what lets a
  // caller diff two runs and what keeps a UI listing exclusions stable across
  // an unrelated catalog edit.
  excluded.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))

  const base = {
    currentExerciseId: current.id,
    currentExerciseName: current.name,
    considered: candidates.length,
    excluded,
    conflictSource,
  } as const

  if (kept.length === 0) {
    const reason = noAlternativeReasonFrom(excluded)
    return { ...base, outcome: 'none', reason, message: NO_ALTERNATIVE_MESSAGE[reason], alternatives: [] }
  }

  return { ...base, outcome: 'ranked', alternatives: [kept[0], ...kept.slice(1)] }
}
