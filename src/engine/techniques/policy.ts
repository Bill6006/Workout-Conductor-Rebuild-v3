import { DEFAULT_CONFLICT_POLICY } from '../conflicts/conflictPolicy'
import type { Difficulty, TransitionCost } from '../../catalog/taxonomy/scales'
import type { LoadBasis, StationId } from '../../catalog/taxonomy/taxonomy'
import type { Experience, Goal } from '../../core/validation/schemas'

/**
 * EVERY THRESHOLD THE THREE TECHNIQUES USE, IN ONE PLACE.
 *
 * The rule files contain no numbers of their own. A rule says what is being
 * measured; this file says how much is enough; a test moves a threshold to prove
 * the rule reads it rather than a constant it inlined.
 *
 * THE NUMBERS ARE THE PRODUCT DECISION. "Worth it" is not a fact about a pair of
 * exercises — it is a judgement about how much time has to be saved before
 * changing how somebody trains is justified. Putting those judgements here means
 * they can be argued about, tuned, and tested in one file rather than found
 * scattered through three.
 *
 * NOTHING HERE IS PERSISTED. A policy is a runtime argument. It never reaches
 * IndexedDB and never needs a schema version.
 *
 * SCARCE STATIONS ARE THE CONFLICT ENGINE'S LIST, NOT A SECOND ONE. `scarce` is
 * read straight off `DEFAULT_CONFLICT_POLICY`, because "a gym has one of these"
 * is one fact about the world and a copy of it here would drift.
 */

export interface TechniquePolicy {
  /* -- supersets ---------------------------------------------------- */
  /**
   * How many slots apart two candidates may sit and still be proposed as a pair.
   * Beyond this the generator's session order would have to be torn up, which
   * costs more than the pairing saves. `1` means adjacent only.
   */
  readonly maxSupersetSlotDistance: number
  /** Rounds a pairing must reach to be worth setting up. */
  readonly minSupersetRounds: number
  /** Seconds the pairing must save before it is proposed at all. */
  readonly minSupersetSavingSeconds: number
  /** The base gap between the two moves inside a round, before transition cost. */
  readonly supersetMoveGapSeconds: number
  /** The round's rest, as a fraction of the longer of the two slots' own rest. */
  readonly supersetRoundRestFactor: number
  /** Floor under the round rest, so a fraction never produces a token pause. */
  readonly minSupersetRoundRestSeconds: number
  /** Seconds added per round for moving between set-ups, by transition cost. */
  readonly transitionPenaltySeconds: Readonly<Record<TransitionCost, number>>
  /**
   * How many rungs above the person's own experience an exercise may sit and
   * still be put inside a superset. `0` means "not above their level at all":
   * alternating two movements is a coordination and pacing demand ON TOP of each
   * lift, so an exercise they are only just ready for is done on its own.
   */
  readonly supersetExperienceHeadroom: number
  /** Compound movements allowed in one pairing, by experience. */
  readonly maxSupersetCompounds: Readonly<Record<Experience, number>>

  /* -- drop sets ---------------------------------------------------- */
  /** Drop sets proposed in one session. A drop set is a tool, not a theme. */
  readonly maxDropSetsPerSession: number
  /** Time pressure at or above which two drops are proposed instead of one. */
  readonly dropSetSecondDropPressure: number
  readonly dropSetLoadReductionPercent: number
  /** Seconds allowed to strip the load between drops. Charged, never rested. */
  readonly dropSetTransitionSeconds: number
  /** Reps in a drop, as a fraction of the parent set's target. */
  readonly dropSetRepFactor: number
  /** Setup longer than this is not a quick strip, whatever the load basis says. */
  readonly dropSetMaxSetupSeconds: number
  /** Load bases whose weight comes off in seconds. Anything else is stripping plates. */
  readonly dropSetQuickBases: readonly LoadBasis[]
  /** Seconds a drop set must beat another straight set by, to be worth proposing. */
  readonly minDropSetSavingSeconds: number

  /* -- circuits ----------------------------------------------------- */
  /** Goals a circuit serves. A circuit is not a way to get stronger. */
  readonly circuitGoals: readonly Goal[]
  readonly minCircuitMembers: number
  readonly maxCircuitMembers: number
  readonly minCircuitRounds: number
  /** Recovery at or above which a circuit is a reasonable ask. 0 spent .. 1 fresh. */
  readonly circuitMinRecovery: number
  /** The base gap between stations, before transition cost. */
  readonly circuitStationGapSeconds: number
  /** The round's rest, as a fraction of the members' mean straight-set rest. */
  readonly circuitRoundRestFactor: number
  readonly minCircuitRoundRestSeconds: number
  /** The costliest transition a circuit member may have. */
  readonly maxCircuitTransitionCost: TransitionCost
  readonly minCircuitSavingSeconds: number
  /** Stations a gym has one of. A circuit may not tie one up. */
  readonly scarceStations: readonly StationId[]

  /* -- shared ------------------------------------------------------- */
  /**
   * Reported time pressure at or above which the session counts as time-pressed.
   * ONE number, read by every rule that asks the question, so a superset and a
   * drop set can never disagree about whether today is a rush.
   */
  readonly timePressureThreshold: number
  /** Estimated seconds over budget at which the session counts as time-pressed. */
  readonly overBudgetPressureSeconds: number
  /** Seconds saved that a proposal's score treats as a full marks saving. */
  readonly savingScoreScaleSeconds: number
}

/** Seconds per rep, tempo and turnaround included. Matches the ranker's estimate. */
export const SECONDS_PER_REP = 3

/**
 * THE SHIPPED POLICY.
 *
 * The superset numbers, read together: a pairing must save a clear minute
 * (`minSupersetSavingSeconds`) across at least two rounds. With two slots resting
 * 90 s each, three rounds of straight sets spend 540 s resting; supersetted they
 * spend 3 x (20 + transition + 72), which saves roughly 200 s. Drop the rests to
 * 45 s each and the same pairing saves about 30 s and is NOT proposed — which is
 * the honest answer, because at that point the pairing is only making the session
 * harder to follow.
 *
 * `timePressureThreshold` at 0.4 is what keeps a drop set from becoming a default
 * intensifier: with no time pressure reported and no clock being fitted, the tool
 * has nothing to be efficient ABOUT, and an ordinary extra set is the better buy.
 */
export const DEFAULT_TECHNIQUE_POLICY: TechniquePolicy = {
  maxSupersetSlotDistance: 3,
  minSupersetRounds: 2,
  minSupersetSavingSeconds: 60,
  supersetMoveGapSeconds: 20,
  supersetRoundRestFactor: 0.8,
  minSupersetRoundRestSeconds: 30,
  transitionPenaltySeconds: { low: 0, moderate: 10, high: 25 },
  supersetExperienceHeadroom: 0,
  maxSupersetCompounds: { beginner: 1, intermediate: 2, advanced: 2 },

  maxDropSetsPerSession: 2,
  dropSetSecondDropPressure: 0.7,
  dropSetLoadReductionPercent: 20,
  dropSetTransitionSeconds: 15,
  dropSetRepFactor: 0.6,
  dropSetMaxSetupSeconds: 45,
  dropSetQuickBases: ['dumbbell', 'kettlebell', 'machine-stack', 'cable-stack', 'band'],
  minDropSetSavingSeconds: 20,

  circuitGoals: ['stay-consistent', 'balanced-development', 'overall-size'],
  minCircuitMembers: 2,
  maxCircuitMembers: 4,
  minCircuitRounds: 2,
  circuitMinRecovery: 0.5,
  circuitStationGapSeconds: 15,
  circuitRoundRestFactor: 0.9,
  minCircuitRoundRestSeconds: 45,
  maxCircuitTransitionCost: 'moderate',
  minCircuitSavingSeconds: 90,
  scarceStations: DEFAULT_CONFLICT_POLICY.scarceStations,

  timePressureThreshold: 0.4,
  overBudgetPressureSeconds: 120,
  savingScoreScaleSeconds: 240,
}

/** A policy with the shipped defaults filled in for anything left out. */
export function resolveTechniquePolicy(overrides?: Partial<TechniquePolicy>): TechniquePolicy {
  if (!overrides) return DEFAULT_TECHNIQUE_POLICY
  return { ...DEFAULT_TECHNIQUE_POLICY, ...overrides }
}

/**
 * The hardest exercise a person may be handed inside a technique.
 *
 * Experience and difficulty are the same three rungs by design (`DIFFICULTY_SCALE`
 * says so), so headroom is arithmetic on one scale rather than a mapping table.
 */
export function difficultyCeiling(experience: Experience, headroom: number): Difficulty {
  const rungs: readonly Difficulty[] = ['beginner', 'intermediate', 'advanced']
  const index = rungs.indexOf(experience)
  const raised = Math.min(rungs.length - 1, Math.max(0, index + headroom))
  return rungs[raised]
}
