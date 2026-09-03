import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { ConflictKind } from '../alternatives/conflictPort'
import { defaultSlotEstimator } from '../alternatives/estimate'
import { buildPreferenceLookup } from '../alternatives/preferences'
import { factorApplicability, scoreCandidate, type SelectionFactorScore } from './selectionFactors'
import { screenCandidate } from './selectionFilters'
import type { SelectionIndex } from './selectionIndex'
import { DEFAULT_CANDIDATE_LIMIT, SELECTION_TIE_TOLERANCE, type SelectionFactorKey } from './selectionWeights'
import { createSelectionConflictChecker, estimateForSlot, readSessionState } from './sessionState'
import type {
  ExcludedSelection,
  NoCandidateReason,
  SelectionContext,
  SelectionExclusionCode,
  SlotRequest,
} from './selectionTypes'

/**
 * THE RANKER. A slot goes in, an ordered list of exercises that could fill it
 * comes out — or a plain statement that nothing can.
 *
 * WHAT IT NEVER RETURNS: anything the conflict engine calls `blocking`. Every
 * candidate is screened before it is scored, and `screenCandidate` excludes on
 * `blocking` with no exception at all. A test asserts the property directly by
 * re-asking the engine about every candidate that came back.
 *
 * DETERMINISM IS A HARD REQUIREMENT AND THE TIE-BREAK IS PART OF IT. Candidates
 * are ordered by score, then — explicitly, in this order — by the shorter
 * estimate (a cheaper fill leaves more of the session's time for everything
 * else), then by catalog position, then by id. Nothing consults a clock, a seed
 * or a random number, so the same index and the same context produce a
 * byte-identical list every time.
 *
 * VARIETY IS THE CALLER'S, DERIVED FROM ITS SEED. `topWithin` reports the head of
 * the list whose scores are close enough that choosing between them costs
 * nothing; the generator picks from that with `deriveSeed`. A ranker that
 * shuffled its own output would make two identical inputs produce different
 * sessions, which the phase brief forbids.
 *
 * ONE DETECTOR PER CALL. The conflict checker is built once per slot and every
 * candidate reads it, so screening a pool costs one session index rather than
 * one per candidate. A caller filling a dozen slots can also pass its own
 * `context.conflicts` and reuse a detector it already holds.
 */

export interface RankedCandidate {
  readonly exerciseId: string
  readonly exercise: Exercise
  /** 0-100, whole number. */
  readonly score: number
  /** Every factor, in canonical order. For debugging and for review. */
  readonly factors: readonly SelectionFactorScore[]
  /** The factor doing the most to put this candidate where it is. */
  readonly leadingFactor: SelectionFactorKey
  /** Non-blocking conflict findings, by kind. Shown, not hidden; they cost score. */
  readonly warnings: readonly ConflictKind[]
  /** Setup plus work plus rest, from the shared slot estimator. Seconds. */
  readonly estimatedSeconds: number
}

interface SelectionResultBase {
  readonly slotId: string
  /** How many catalog entries were in the pool before any filter ran. */
  readonly considered: number
  /** Every candidate ruled out, with the reason it was ruled out. */
  readonly excluded: readonly ExcludedSelection[]
}

export interface RankedSelection extends SelectionResultBase {
  readonly outcome: 'ranked'
  /** Best first. Non-empty by construction — the type says so. */
  readonly candidates: readonly [RankedCandidate, ...RankedCandidate[]]
}

export interface NoSelection extends SelectionResultBase {
  readonly outcome: 'none'
  readonly reason: NoCandidateReason
  readonly candidates: readonly []
}

export type SelectionResult = RankedSelection | NoSelection

/** Narrows to the outcome that has candidates. */
export function isRankedSelection(result: SelectionResult): result is RankedSelection {
  return result.outcome === 'ranked'
}

export interface SelectionOptions {
  /** How many candidates to return. Default 8. */
  readonly limit?: number
  /** Refuse anything below this score. Default: no floor — a fill beats a gap. */
  readonly minScore?: number | null
}

/**
 * Which "nothing could fill this" reason to report.
 *
 * When one cause accounts for every eliminated candidate it is named; otherwise
 * the answer is `mixed` and the `excluded` list still carries each candidate's
 * own reason. Reporting the most common cause instead would be a guess dressed
 * as an explanation.
 */
const EXCLUSION_TO_REASON: Readonly<Partial<Record<SelectionExclusionCode, NoCandidateReason>>> = {
  'equipment-unavailable': 'equipment-unavailable',
  'requires-location-change': 'equipment-unavailable',
  'location-unsuitable': 'location-unsuitable',
  'limitation-contraindicated': 'limitation-blocked',
  disliked: 'user-excluded',
  'does-not-fit-remaining-time': 'time-insufficient',
  'below-quality-floor': 'below-quality-floor',
}

function noCandidateReason(excluded: readonly ExcludedSelection[]): NoCandidateReason {
  if (excluded.length === 0) return 'no-candidates-in-catalog'
  const codes = new Set(excluded.map((entry) => entry.code))
  if (codes.size === 1) {
    const only = [...codes][0]
    return EXCLUSION_TO_REASON[only] ?? 'session-conflict'
  }
  return 'mixed'
}

export function rankCandidates(
  index: SelectionIndex,
  slot: SlotRequest,
  context: SelectionContext,
  options: SelectionOptions = {},
): SelectionResult {
  const pool = index.candidatesFor(slot)
  const state = readSessionState(context)
  const estimate = context.estimate ?? defaultSlotEstimator
  const available: ReadonlySet<EquipmentId> = new Set(context.availableEquipment)
  const preferences = buildPreferenceLookup(context.preferences, index.alternatives)
  const checker = context.conflicts ?? createSelectionConflictChecker(slot, context, estimate)
  const applicability = factorApplicability(slot, context, preferences.hasAnyPreference)
  const minScore = options.minScore ?? null

  const excluded: ExcludedSelection[] = []
  const ranked: RankedCandidate[] = []

  for (const candidate of pool) {
    const screened = screenCandidate({
      candidate,
      slot,
      context,
      state,
      available,
      preferences,
      estimate,
      checker,
    })
    if (screened.excluded) {
      excluded.push(screened.excluded)
      continue
    }

    const scored = scoreCandidate({
      candidate,
      slot,
      context,
      state,
      available,
      preference: preferences.match(candidate),
      conflicts: screened.conflicts,
      applicability,
    })

    if (minScore !== null && scored.total < minScore) {
      excluded.push({
        exerciseId: candidate.id,
        code: 'below-quality-floor',
        missingEquipment: [],
        conflictKind: null,
      })
      continue
    }

    ranked.push({
      exerciseId: candidate.id,
      exercise: candidate,
      score: scored.total,
      factors: scored.factors,
      leadingFactor: scored.leadingFactor,
      warnings: screened.conflicts
        .filter((conflict) => conflict.severity !== 'blocking')
        .map((conflict) => conflict.kind),
      estimatedSeconds: estimateForSlot(estimate, slot, candidate),
    })
  }

  if (ranked.length === 0) {
    return {
      outcome: 'none',
      slotId: slot.slotId,
      considered: pool.length,
      excluded,
      reason: noCandidateReason(excluded),
      candidates: [],
    }
  }

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.estimatedSeconds - b.estimatedSeconds ||
      index.positionOf(a.exerciseId) - index.positionOf(b.exerciseId) ||
      a.exerciseId.localeCompare(b.exerciseId),
  )

  const limited = ranked.slice(0, Math.max(1, options.limit ?? DEFAULT_CANDIDATE_LIMIT))
  return {
    outcome: 'ranked',
    slotId: slot.slotId,
    considered: pool.length,
    excluded,
    candidates: limited as [RankedCandidate, ...RankedCandidate[]],
  }
}

/**
 * The head of the list whose scores are within `tolerance` points of the best.
 *
 * This is the ONLY sanctioned place variety comes from: the generator derives a
 * number from its seed and picks one of these, so two sessions differ without
 * either of them being non-deterministic. Always at least one candidate.
 */
export function topWithin(
  result: SelectionResult,
  tolerance: number = SELECTION_TIE_TOLERANCE,
): readonly RankedCandidate[] {
  if (!isRankedSelection(result)) return []
  const best = result.candidates[0].score
  return result.candidates.filter((candidate) => best - candidate.score <= Math.max(0, tolerance))
}

/** The single best fill, or `null` when nothing can fill the slot. */
export function bestCandidate(result: SelectionResult): RankedCandidate | null {
  return isRankedSelection(result) ? result.candidates[0] : null
}
