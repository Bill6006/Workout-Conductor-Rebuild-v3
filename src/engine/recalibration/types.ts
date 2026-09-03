/**
 * The recalibration contract.
 *
 * Recalibration is a core system, not a one-time feature: everything that can
 * change a session mid-flight comes through here, so there is exactly one place
 * that decides what may be rewritten and what may not.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: completed work is never touched. Not
 * the exercises, not the sets, not the logged weights, reps, RIR, earned
 * records, or notes. A recalibration that loses somebody's logged set is worse
 * than no recalibration at all.
 */
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Profile } from '../../core/validation/schemas'
import type { DurationChoice, Workout } from '../../core/validation/workoutSchema'
import type { GenerateWorkoutInput } from '../workoutGenerator/types'

/**
 * Everything that can ask for a recalibration.
 *
 * Every trigger the product plan names has an entry, including the ones no
 * surface can fire yet — a trigger the engine knows about is a trigger Phase 5
 * and Phase 6 can wire up without reopening this contract.
 */
export const RECALIBRATION_TRIGGERS = [
  'duration-changed',
  'location-changed',
  'equipment-profile-changed',
  'equipment-unavailable',
  'exercise-replaced',
  'exercise-skipped',
  'pain-reported',
  'exercise-uncomfortable',
  'over-performed',
  'under-performed',
  'target-weight-changed',
  'supersets-toggled',
  'drop-sets-toggled',
  'circuits-toggled',
  'readiness-changed',
  'available-time-changed',
  'resumed-after-interruption',
  'completed-work-changed-priorities',
  'station-unavailable',
  'finished-early',
  'harder-remaining',
  'easier-remaining',
] as const
export type RecalibrationTrigger = (typeof RECALIBRATION_TRIGGERS)[number]

/**
 * How much of the session a trigger is allowed to touch.
 *
 * The plan is explicit that a full rebuild is the wrong answer to a small local
 * change — swapping one exercise must not reshuffle the rest of somebody's
 * session. `scopeFor` decides this, and it is deliberately a lookup rather than
 * a judgement made at each call site.
 */
export type RecalibrationScope = 'single-exercise' | 'remaining-session' | 'full-session'

const TRIGGER_SCOPE: Readonly<Record<RecalibrationTrigger, RecalibrationScope>> = {
  // One exercise changes; everything else stays exactly where it was.
  'exercise-replaced': 'single-exercise',
  'exercise-skipped': 'single-exercise',
  'exercise-uncomfortable': 'single-exercise',
  'equipment-unavailable': 'single-exercise',
  'station-unavailable': 'single-exercise',
  'target-weight-changed': 'single-exercise',

  // The rest of the session is reconsidered; what is done stays done.
  'over-performed': 'remaining-session',
  'under-performed': 'remaining-session',
  'pain-reported': 'remaining-session',
  'readiness-changed': 'remaining-session',
  'completed-work-changed-priorities': 'remaining-session',
  'finished-early': 'remaining-session',
  'harder-remaining': 'remaining-session',
  'easier-remaining': 'remaining-session',
  'resumed-after-interruption': 'remaining-session',
  'available-time-changed': 'remaining-session',

  // The shape of the whole session is in question.
  'duration-changed': 'full-session',
  'location-changed': 'full-session',
  'equipment-profile-changed': 'full-session',
  'supersets-toggled': 'full-session',
  'drop-sets-toggled': 'full-session',
  'circuits-toggled': 'full-session',
}

export function scopeFor(trigger: RecalibrationTrigger): RecalibrationScope {
  return TRIGGER_SCOPE[trigger]
}

/**
 * A recalibration request. Every field the product plan lists is here, and the
 * ones later phases supply are optional so a surface can ask for a
 * recalibration with only what it actually knows.
 */
export interface RecalibrationRequest {
  readonly trigger: RecalibrationTrigger
  /** The session as it stands, completed work and all. */
  readonly current: Workout
  readonly profile: Profile
  /** Entries the user pinned, or that carry an accepted alternative. Never rewritten. */
  readonly lockedEntryIds?: readonly string[]
  /** The entry being performed right now, if any. Locked once its first working set is logged. */
  readonly currentEntryId?: string | null
  readonly requestedDuration?: DurationChoice
  readonly location?: GenerateWorkoutInput['location']
  readonly equipment?: readonly EquipmentId[]
  /**
   * Equipment that is unavailable for THIS SESSION ONLY — the "Equipment Busy"
   * case. It never touches the saved equipment profile.
   */
  readonly busyEquipment?: readonly EquipmentId[]
  /** The single exercise a single-exercise trigger is about. */
  readonly targetEntryId?: string
  /** Its replacement, when the caller already chose one. */
  readonly replacementExerciseId?: string
  readonly recovery?: GenerateWorkoutInput['recovery']
  readonly readiness?: GenerateWorkoutInput['readiness']
  readonly pain?: GenerateWorkoutInput['pain']
  /** Minutes already spent. Subtracted from the budget when the session is under way. */
  readonly elapsedMinutes?: number
  /** A short human reason, carried into the change summary. */
  readonly reason?: string
  readonly timestamp: string
  /** The catalog, handed in by a caller that already loaded it. */
  readonly exercises: GenerateWorkoutInput['exercises']
  readonly conflicts?: GenerateWorkoutInput['conflicts']
  readonly seed?: string
}

/* ------------------------------------------------------------------ *
 * What changed
 * ------------------------------------------------------------------ */

export const CHANGE_KINDS = [
  'exercise-added',
  'exercise-removed',
  'exercise-replaced',
  'sets-increased',
  'sets-reduced',
  'reps-changed',
  'rest-changed',
  'superset-added',
  'superset-removed',
  'drop-set-added',
  'drop-set-removed',
  'order-changed',
  'warm-up-shortened',
  'warm-up-lengthened',
  'nothing-changed',
] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]

export interface WorkoutChange {
  readonly kind: ChangeKind
  /** One line a screen can render as-is. */
  readonly text: string
  readonly entryIds: readonly string[]
  readonly blockIds: readonly string[]
}

/**
 * The compact summary the plan asks for — "Recalibrated to 30 min: 2 exercises
 * removed, 1 superset added." — plus the structured changes behind it, so a UI
 * can also mark exactly which rows moved.
 */
export interface ChangeSummary {
  readonly headline: string
  readonly changes: readonly WorkoutChange[]
  readonly minutesBefore: number
  readonly minutesAfter: number
  /** Entries that survived untouched, so a UI can leave them visually stable. */
  readonly unchangedEntryIds: readonly string[]
}

/* ------------------------------------------------------------------ *
 * The outcome
 * ------------------------------------------------------------------ */

export const RECALIBRATION_FAILURES = [
  'no-usable-exercises',
  'nothing-to-change',
  'locked-work-would-be-lost',
  'generation-failed',
  'impossible-duration',
] as const
export type RecalibrationFailure = (typeof RECALIBRATION_FAILURES)[number]

export interface RecalibrationSuccess {
  readonly outcome: 'recalibrated'
  readonly workout: Workout
  readonly summary: ChangeSummary
  readonly trigger: RecalibrationTrigger
  readonly scope: RecalibrationScope
  /**
   * Set when the request could not be met exactly but a usable session was
   * produced anyway — the plan's "show the closest realistic plan and say it may
   * run a few minutes over" case.
   */
  readonly compromise: string | null
}

export interface RecalibrationRejected {
  readonly outcome: 'failed'
  readonly reason: RecalibrationFailure
  /** A readable line. The plan requires a readable error, not a stack trace. */
  readonly message: string
  /**
   * THE PREVIOUS VALID WORKOUT, returned so a caller can restore it without
   * having kept its own copy. A failed recalibration must never leave the
   * session in a partial state.
   */
  readonly restored: Workout
  readonly trigger: RecalibrationTrigger
}

export type RecalibrationResult = RecalibrationSuccess | RecalibrationRejected

export function isRecalibrated(result: RecalibrationResult): result is RecalibrationSuccess {
  return result.outcome === 'recalibrated'
}
