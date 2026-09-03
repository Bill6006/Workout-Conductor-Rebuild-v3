/**
 * THE DURATION AND TIME ENGINE — the public surface.
 *
 * It answers three questions and nothing else:
 *
 *   How long does this take?        `estimateSession`, `estimateEntry`,
 *                                   `estimateSetTarget`, `estimateCandidate`
 *   How much room is there?         `budgetFor`, `restPolicyFor`, `supersetRests`
 *   What fits, and does it fit?     `fitToBudget`, `assessDuration`, `planWarmUp`
 *
 * HOW IT IS MEANT TO BE USED, in the order the generator uses it:
 *
 *     const plan = budgetFor(availableTime, { restStyle, techniques, defaultMinutes })
 *     const lookup = lookupFrom(input.exercises)
 *     const items = candidates.map((c) => ({
 *       itemId: c.id,
 *       costSeconds: estimateCandidate({ exercise: c.exercise, ... }).totalSeconds,
 *       value: c.score,                       // the generator's judgement, not ours
 *       priority: c.priority,
 *       required: c.isAnchor,
 *     }))
 *     const chosen = fitToBudget(items, plan.workAllowanceSeconds)
 *     const warmUp = planWarmUp({ budget: plan, firstMovement, firstEntryId, idPrefix })
 *     const estimate = estimateSession({ blocks, warmUpStepSeconds: warmUp.stepSeconds }, lookup)
 *     const fit = assessDuration({ plan, estimate })
 *     if (!fit.fits) show(fit.notice)         // it may run over; say so
 *
 * A SHORTER DURATION REBUILDS THE SESSION. There is no function here that trims
 * the tail off a longer one, deliberately. Call `budgetFor` with the new choice
 * and select again from every candidate; the fifteen-minute answer is not a
 * prefix of the forty-five-minute one and must not be.
 *
 * WHAT THIS IS NOT. It does not choose exercises, score them, decide volume, or
 * judge whether a pairing is safe — those have owners already (`workoutGenerator`,
 * the alternatives ranker, the conflict engine). It weighs seconds. `value` is
 * always supplied by the caller.
 *
 * PURE. No React, no storage, no exercise DATA, no clock, no randomness. Same
 * inputs, byte-identical output, every time.
 */

export {
  ESTIMATE_VARIANCE,
  FALLBACK_SETUP_SECONDS,
  FALLBACK_TRANSITION,
  SECONDS_PER_REP,
  SIDE_SWITCH_SECONDS,
  TRANSITION_REST_OVERLAP,
  TRANSITION_SECONDS,
  ZERO_COST,
  addCosts,
  estimateBand,
  repMidpoint,
  secondsToMinutes,
  setWorkSeconds,
  setupSecondsFor,
  sumCosts,
  tempoSecondsPerRep,
  timeCost,
  transitionChargeSeconds,
  walkSecondsFor,
} from './timeModel'
export type { EstimateBand, SetWorkInput, TimeCost } from './timeModel'

export {
  DROP_REP_FRACTION,
  EMPTY_SESSION_COST,
  FALLBACK_REPS,
  estimateBlock,
  estimateCandidate,
  estimateEntry,
  estimateSession,
  estimateSetTarget,
  estimateWorkout,
  lookupFrom,
  supersetSaving,
  supersetWalkSeconds,
  timeBudgetFields,
  warmUpStepSeconds,
} from './estimate'
export type {
  BlockEstimate,
  CandidateCost,
  CandidateSpec,
  EntryEstimate,
  ExerciseLookup,
  SessionEstimate,
  SessionEstimateInput,
  SetEstimate,
  SupersetSaving,
  SupersetSavingInput,
} from './estimate'

export {
  BASE_REST_SECONDS,
  DURATION_REST_MULTIPLIER,
  FALLBACK_DEFAULT_MINUTES,
  GENERAL_STEP_CAP_SECONDS,
  MAX_RESERVE_SECONDS,
  MAX_REST_SECONDS,
  MIN_RESERVE_SECONDS,
  MIN_WORKING_REST_SECONDS,
  MINIMUM_VIABLE_SECONDS,
  RESERVE_FRACTION,
  REST_STYLE_MULTIPLIER,
  SUPERSET_BIAS,
  WARM_UP_ALLOWANCE_SECONDS,
  budgetFor,
  budgetForExactEnd,
  budgetPressure,
  durationKey,
  resolveDefaultMinutes,
  restPolicyFor,
  restSecondsFor,
  supersetRests,
} from './budget'
export type {
  BudgetOptions,
  DurationKey,
  RestPolicy,
  SupersetRests,
  TechniqueAllowance,
  TechniquePreferences,
  TimeBudgetPlan,
} from './budget'

export {
  DURATION_VERDICTS,
  FIT_EXCLUSION_REASONS,
  LENGTH_NOTICE_CODES,
  UNDER_FILLED_THRESHOLD,
  assessDuration,
  fitToBudget,
  marginalValuePerSecond,
  removalCase,
  secondsToShed,
  setsThatFit,
  toTimeBudget,
} from './fit'
export type {
  AssessDurationInput,
  DurationFit,
  DurationVerdict,
  ExcludedFitItem,
  FitExclusionReason,
  FitItem,
  FitOutcome,
  HonestLength,
  LengthNotice,
  LengthNoticeCode,
} from './fit'

export {
  BASE_RAMP_REST_SECONDS,
  GENERAL_STEP_PLANS,
  MAX_RAMP_SETS,
  MAX_WARM_UP_STEPS,
  MIN_RAISE_SECONDS,
  MIN_RAMP_REST_SECONDS,
  MIN_RAMP_SETS_FOR_LOADED_COMPOUND,
  RAMP_LADDERS,
  idealRampSets,
  planWarmUp,
  rampCostSeconds,
  rampRestSeconds,
  rampSetCount,
  rampSets,
} from './warmUp'
export type { RampRequest, RampRung, WarmUpDraft, WarmUpRequest } from './warmUp'
