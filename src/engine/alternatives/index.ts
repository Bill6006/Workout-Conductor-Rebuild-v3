/**
 * THE ALTERNATIVES RANKER — the public surface.
 *
 * Given the exercise a person is standing in front of and everything true about
 * their situation, it produces a ranked list of things they could do instead, or
 * says plainly that there is nothing.
 *
 * HOW TO USE IT, in the order the pieces are meant to be used:
 *
 *     const { EXERCISES } = await import('../../catalog/exercises/exerciseData')
 *     const index = buildAlternativesIndex(EXERCISES)     // once, and keep it
 *     const result = rankAlternatives(index, context)     // per swap
 *     if (result.outcome === 'none') showMessage(result.message)
 *     else showList(result.alternatives)                  // non-empty, best first
 *
 * WHAT THIS IS NOT. It is not the Phase 5 alternatives screen, it is not a
 * generator, and it is not a conflict engine. It holds no state, touches no
 * storage, and imports no exercise DATA — the catalog arrives as an argument, so
 * this module never puts the catalog on anybody's chunk.
 *
 * THE CONFLICT ENGINE IS ASKED, NOT REIMPLEMENTED. Session safety — limitations,
 * duplicates, overlap, priority interference, joint stress, supersets — is
 * decided by whatever satisfies `ConflictChecker`. Read `conflictPort.ts` before
 * changing anything about exclusion.
 */

export { buildAlternativesIndex } from './catalogIndex'
export type { AlternativesIndex } from './catalogIndex'

export { NO_ALTERNATIVE_PRIORITY, rankAlternatives } from './rankAlternatives'
export type { RankingOptions } from './rankAlternatives'

export { CONFLICT_KIND_TO_EXCLUSION, CONFLICT_SOURCES, SUPERSET_CONFLICT_KINDS } from './conflictPort'
export type {
  Conflict,
  ConflictChecker,
  ConflictKind,
  ConflictSeverity,
  ConflictSource,
} from './conflictPort'

export { createConflictChecker } from './conflictsAdapter'
export type { ConflictCheckerOptions } from './conflictsAdapter'

export { SECONDS_PER_REP, defaultSlotEstimator, estimateSlotWith } from './estimate'
export type { SlotEstimateInput, SlotEstimator } from './estimate'

export {
  DEFAULT_ALTERNATIVE_LIMIT,
  FACTOR_BASELINES,
  FACTOR_KEYS,
  FACTOR_WEIGHTS,
  MATCH_QUALITY_THRESHOLDS,
  TOTAL_WEIGHT,
} from './weights'
export type { FactorKey } from './weights'

export { ADVISORY_CONFLICT_COST, STRONG_CONFLICT_COST, factorApplicability, scoreCandidate } from './factors'
export type { CandidateScore, FactorApplicability, ScoringInput } from './factors'

export { locationsWith, screenCandidate } from './exclusions'
export type { ScreenInput, ScreenResult } from './exclusions'

export {
  describeDifferences,
  explainReasons,
  matchQualityFor,
  progressionContinuity,
  summarise,
  supersetImpact,
} from './explain'
export type { ExplainedReasons } from './explain'

export { buildPreferenceLookup } from './preferences'
export type { PreferenceLookup, PreferenceMatch, PreferenceRoute, PreferenceSide } from './preferences'

export {
  UnknownSlotError,
  jaccard,
  overlapScore,
  peakOverlap,
  primaryGroups,
  readSession,
} from './sessionView'
export type { SessionView } from './sessionView'

export {
  DIFFERENCE_CODES,
  DIFFERENCE_MAGNITUDES,
  EXCLUSION_CODES,
  MATCH_QUALITIES,
  NO_ALTERNATIVE_REASONS,
  REASON_CODES,
  SESSION_SLOT_DEFAULTS,
  SLOT_PRIORITIES,
  SLOT_STATUSES,
  SUPERSET_EFFECTS,
  defineSessionSlot,
  isRanked,
} from './types'
export type {
  AlternativeDifference,
  AlternativeLocation,
  AlternativeReason,
  AlternativesContext,
  AlternativesResult,
  DifferenceCode,
  DifferenceMagnitude,
  ExcludedCandidate,
  ExclusionCode,
  FactorScore,
  FatigueState,
  MatchQuality,
  NoAlternativeReason,
  NoAlternatives,
  PerformanceRecord,
  ProgressionContinuity,
  RankedAlternative,
  RankedAlternatives,
  ReasonCode,
  SessionSlot,
  SessionSlotInput,
  SlotPriority,
  SlotStatus,
  SupersetEffect,
  SupersetImpact,
} from './types'
