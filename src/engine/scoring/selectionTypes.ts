import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId, MuscleId } from '../../catalog/muscles/muscles'
import type { LimitationFlag, LocationSuitability, TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { Experience, ExercisePreferences, TrainingStyle } from '../../core/validation/schemas'
import type { ConflictChecker, ConflictKind } from '../alternatives/conflictPort'
import type { SlotEstimator } from '../alternatives/estimate'
import type { ExclusionCode, SlotPriority } from '../alternatives/types'
import type { ConflictPolicy } from '../conflicts/conflictPolicy'
import type { TechniquePermissions } from '../conflicts/conflictContext'
import type { ExposureMap } from '../volume/exposure'

/**
 * WHAT A SLOT IS, AND WHAT THE SESSION AROUND IT LOOKS LIKE.
 *
 * THE QUESTION THIS MODULE ANSWERS IS NOT THE ONE THE ALTERNATIVES RANKER
 * ANSWERS, AND THAT IS WHY BOTH EXIST. `engine/alternatives` asks "what could I
 * do INSTEAD of this?" — every one of its factors is a comparison against an
 * incumbent exercise, and its whole vocabulary (`is-current-exercise`,
 * `keyDifference`, `preservesHistory`) is about a swap. Selection has no
 * incumbent: the session is empty and a slot is a description of the work that
 * should go in it. A ranker built to compare against something cannot answer a
 * question with nothing to compare against, so the two rank differently and
 * SHARE everything that is genuinely the same — the catalog index, the
 * preference lookup, the slot estimator, the overlap maths, the conflict port,
 * and the exclusion vocabulary below, which is `ExclusionCode` plus the one code
 * that only slot-filling can produce.
 *
 * EXCLUSION IS STILL THE CONFLICT ENGINE'S. Nothing here re-decides whether two
 * exercises belong in one session. `selectionFilters.ts` screens the candidate
 * against the PERSON'S SITUATION — the kit that is here, the place they are in,
 * what they said they dislike, whether it trains the slot's muscle at all — and
 * asks `ConflictChecker` about everything else, which is exactly the split
 * `alternatives/conflictPort.ts` documents.
 */

/** What a slot needs filling with. Written by the generator, read by the ranker. */
export interface SlotRequest {
  readonly slotId: string
  /** The muscle group this slot exists to train. */
  readonly targetGroup: MuscleGroupId
  /**
   * Finer targets inside the group, when the priorities name heads. Empty means
   * "anywhere in the group": a slot that names `upper-chest` prefers an incline
   * press, a slot that names nothing is happy with any chest work.
   */
  readonly targetMuscles?: readonly MuscleId[]
  readonly role: TrainingRole
  readonly priority: SlotPriority
  readonly plannedSets: number
  readonly restSeconds: number
  /**
   * Refuse anything that reaches the target group only as a secondary muscle.
   * Off by default: a home-gym user with two dumbbells has to be given a session,
   * and a candidate that reaches the group indirectly is a poor fill rather than
   * an impossible one — the score says so loudly. The generator turns it ON for
   * the slots the session is built around, where a poor fill is not acceptable.
   */
  readonly requirePrimaryTarget?: boolean
  /** True when this slot is meant to be one half of a superset. */
  readonly wantsSuperset?: boolean
  /** True when this slot is meant to carry a drop set. */
  readonly wantsDropSet?: boolean
  /** The superset group id the slot would join, for the conflict engine. */
  readonly supersetGroup?: string | null
  /** Seconds the slot may take. `null` when the caller is not fitting a clock. */
  readonly maxSeconds?: number | null
}

/** One exercise already committed to the session being built. */
export interface ChosenExercise {
  readonly slotId: string
  readonly exercise: Exercise
  readonly priority: SlotPriority
  readonly supersetId: string | null
  readonly plannedSets: number
  readonly restSeconds: number
}

/** What a lift the person has a working load for looks like to the ranker. */
export interface KnownProgression {
  readonly exerciseId: string
  readonly progressionFamily: string
}

/** An exercise performed recently, for variety. `daysAgo` comes from the caller. */
export interface RecentExercise {
  readonly exerciseId: string
  readonly daysAgo: number
}

/**
 * Everything true about the person and the session so far.
 *
 * Every Phase-6 and Phase-7 input is optional and its absence makes the factor
 * that reads it INAPPLICABLE rather than zero — a candidate must never be
 * penalised for a fact the product cannot yet know.
 */
export interface SelectionContext {
  /** The session so far, in order. Empty for the first slot. */
  readonly chosen: readonly ChosenExercise[]
  readonly availableEquipment: readonly EquipmentId[]
  /** `null` for a location of no fixed kind — nothing may be concluded about it. */
  readonly location: LocationSuitability | null
  readonly limitations: readonly LimitationFlag[]
  readonly preferences: ExercisePreferences
  readonly trainingStyle: TrainingStyle
  readonly experience: Experience
  readonly techniques: TechniquePermissions
  /** Absent until Phase 7 has history. Drives the variety factor. */
  readonly recentExercises?: readonly RecentExercise[]
  /** Absent until Phase 6 has progression state. Drives the continuity factor. */
  readonly progression?: readonly KnownProgression[]
  /** From `engine/volume`. Lets selection avoid a group trained yesterday. */
  readonly exposure?: ExposureMap
  /** Sessions already done, for the conflict engine's recovery rule. */
  readonly recentTraining?: readonly {
    readonly daysAgo: number
    readonly muscleGroups: readonly MuscleGroupId[]
  }[]
  /**
   * The port onto THE conflict engine. Supply one to reuse a detector across
   * slots; when absent, one is built from this context.
   */
  readonly conflicts?: ConflictChecker
  readonly policy?: Partial<ConflictPolicy>
  /** Overrides the slot estimator. Defaults to the alternatives ranker's. */
  readonly estimate?: SlotEstimator
}

/**
 * Why a candidate never reached the score.
 *
 * It is `ExclusionCode` — the alternatives ranker's vocabulary, not a rival —
 * plus `unsuitable-for-role`, the one thing only slot-filling can find: an
 * exercise the catalog says must never be warmed up on, offered for a warm-up
 * slot. A swap cannot produce it because a swap inherits the slot's role.
 */
export type SelectionExclusionCode = ExclusionCode | 'unsuitable-for-role'

export interface ExcludedSelection {
  readonly exerciseId: string
  readonly code: SelectionExclusionCode
  /** Equipment the candidate needs that this location does not have. */
  readonly missingEquipment: readonly EquipmentId[]
  /** Set when the exclusion came from the conflict engine rather than a filter. */
  readonly conflictKind: ConflictKind | null
}

/** Why nothing could fill the slot. An outcome, never an empty array to interpret. */
export const NO_CANDIDATE_REASONS = [
  'no-candidates-in-catalog',
  'equipment-unavailable',
  'location-unsuitable',
  'limitation-blocked',
  'user-excluded',
  'session-conflict',
  'time-insufficient',
  'below-quality-floor',
  'mixed',
] as const
export type NoCandidateReason = (typeof NO_CANDIDATE_REASONS)[number]
