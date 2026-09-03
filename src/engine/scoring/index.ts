/**
 * THE SELECTION RANKER — the public surface.
 *
 * Given a slot (a muscle group, a role, a set count) and everything true about
 * the person and the session so far, it produces an ordered list of exercises
 * that could fill it, or says plainly that nothing can.
 *
 * HOW TO USE IT, in the order the pieces are meant to be used:
 *
 *     const { EXERCISES } = await import('../../catalog/exercises/catalog')
 *     const index = buildSelectionIndex(EXERCISES)          // once, and keep it
 *     const result = rankCandidates(index, slot, context)   // per slot
 *     if (result.outcome === 'none') reportGap(result.reason)
 *     else pick(topWithin(result))                          // seeded by the caller
 *
 * WHAT THIS IS NOT. It is not the generator, not the duration engine, and not a
 * conflict engine. It holds no state, touches no storage, reads no clock, and
 * imports no exercise DATA — the catalog arrives as an argument.
 *
 * THE CONFLICT ENGINE IS ASKED, NOT REIMPLEMENTED. Session safety is decided by
 * whatever satisfies `ConflictChecker`; `selectionFilters.ts` only decides what
 * to do with the verdict, and its policy is written out in that file's header.
 *
 * IT SHARES WITH THE ALTERNATIVES RANKER RATHER THAN COPYING IT. The catalog
 * index, the preference lookup, the slot estimator, the overlap maths, the
 * conflict port and the exclusion vocabulary are all that module's. What is not
 * shared is the scoring, because the two answer different questions: alternatives
 * compares candidates against an incumbent exercise, selection has no incumbent.
 */

export { buildSelectionIndex } from './selectionIndex'
export type { SelectionIndex } from './selectionIndex'

export { bestCandidate, isRankedSelection, rankCandidates, topWithin } from './rankCandidates'
export type {
  NoSelection,
  RankedCandidate,
  RankedSelection,
  SelectionOptions,
  SelectionResult,
} from './rankCandidates'

export { STRONG_EXCLUDES_KINDS, screenCandidate, servesRole } from './selectionFilters'
export type { ScreenInput, ScreenResult } from './selectionFilters'

export {
  ROLE_TIERS,
  SETUP_CEILING_SECONDS,
  STYLE_SUITABILITY_WEIGHTS,
  VARIETY_WINDOW_DAYS,
  conflictCautionScore,
  equipmentScore,
  experienceFitScore,
  factorApplicability,
  jointStressScore,
  patternBalanceScore,
  preferenceScore,
  progressionScore,
  recentExposureScore,
  roleFitScore,
  scoreCandidate,
  sessionOverlapScore,
  setupCostScore,
  styleSuitabilityScore,
  targetMuscleScore,
  techniqueFitScore,
  warmUpFitScore,
} from './selectionFactors'
export type {
  CandidateScore,
  FactorApplicability,
  ScoringInput,
  SelectionFactorScore,
} from './selectionFactors'

export {
  DEFAULT_CANDIDATE_LIMIT,
  SELECTION_BASELINES,
  SELECTION_FACTOR_KEYS,
  SELECTION_TIE_TOLERANCE,
  SELECTION_WEIGHTS,
  TOTAL_SELECTION_WEIGHT,
} from './selectionWeights'
export type { SelectionFactorKey } from './selectionWeights'

export { createSelectionConflictChecker, estimateForSlot, readSessionState } from './sessionState'
export type { SessionState } from './sessionState'

export { NO_CANDIDATE_REASONS } from './selectionTypes'
export type {
  ChosenExercise,
  ExcludedSelection,
  KnownProgression,
  NoCandidateReason,
  RecentExercise,
  SelectionContext,
  SelectionExclusionCode,
  SlotRequest,
} from './selectionTypes'
