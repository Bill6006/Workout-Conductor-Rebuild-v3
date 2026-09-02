import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { CompetingDemand, LimitationFlag, LocationSuitability } from '../../catalog/taxonomy/taxonomy'
import type { ExercisePreferences, TrainingStyle } from '../../core/validation/schemas'
import type { ConflictKind, ConflictSource } from './conflictPort'
import type { RecentTraining, TechniquePermissions } from '../conflicts/conflictContext'
import type { FactorKey } from './weights'

/**
 * The vocabulary of the alternatives ranker: what goes in, what comes out.
 *
 * NOTHING HERE IS UI. Every string on a returned alternative is a short,
 * plain-language rendering of a structured field that sits beside it. The Phase 5
 * screen reads `code`, `magnitude`, `effect`, `preservesHistory` and so on; the
 * `text` is there so a screen that only needs a line can take one without parsing
 * a sentence back into facts. A screen must never regex a `text`.
 *
 * NOTHING HERE IMPORTS EXERCISE DATA. The ranker is handed an index built from
 * whatever catalog the caller has already dynamically imported, so this module —
 * and everything under `engine/alternatives` — stays off the boot chunk on its own
 * merits, not by accident.
 */

/* ------------------------------------------------------------------ *
 * The session the swap is happening inside
 * ------------------------------------------------------------------ */

/**
 * How much the session depends on a slot.
 *   `priority`  — the reason the session exists. Nothing may be swapped in that
 *                 compromises a later one; that is the `interferes-with-priority`
 *                 exclusion.
 *   `normal`    — ordinary programmed work.
 *   `accessory` — the first thing dropped when time runs short.
 */
export const SLOT_PRIORITIES = ['priority', 'normal', 'accessory'] as const
export type SlotPriority = (typeof SLOT_PRIORITIES)[number]

/**
 * Where a slot is in the session. Only `pending` slots constrain a substitution:
 * work already done cannot be reordered, and its fatigue is reported through
 * `FatigueState` rather than re-derived from the finished exercise.
 */
export const SLOT_STATUSES = ['pending', 'in-progress', 'completed'] as const
export type SlotStatus = (typeof SLOT_STATUSES)[number]

/** One programmed exercise in the session being edited. */
export interface SessionSlot {
  /** Identifies the slot, not the exercise — the same exercise may appear twice. */
  readonly slotId: string
  readonly exercise: Exercise
  readonly priority: SlotPriority
  readonly status: SlotStatus
  /** Slots sharing a non-null id are supersetted together. */
  readonly supersetId: string | null
  readonly plannedSets: number
  /** Rest programmed between this slot's sets, in seconds. */
  readonly restSeconds: number
  /** True when the slot is programmed as a drop set. */
  readonly usesDropSet: boolean
}

/** What `defineSessionSlot` fills in for an omitted field. */
export const SESSION_SLOT_DEFAULTS = {
  priority: 'normal',
  status: 'pending',
  supersetId: null,
  plannedSets: 3,
  restSeconds: 90,
  usesDropSet: false,
} as const

export type SessionSlotInput = Pick<SessionSlot, 'slotId' | 'exercise'> &
  Partial<Omit<SessionSlot, 'slotId' | 'exercise'>>

/**
 * Writes one slot, filling the documented defaults. It exists so that a caller
 * building a session — and every test in this module — states only what it cares
 * about, and so the defaults live in exactly one place.
 */
export function defineSessionSlot(input: SessionSlotInput): SessionSlot {
  return {
    slotId: input.slotId,
    exercise: input.exercise,
    priority: input.priority ?? SESSION_SLOT_DEFAULTS.priority,
    status: input.status ?? SESSION_SLOT_DEFAULTS.status,
    supersetId: input.supersetId ?? SESSION_SLOT_DEFAULTS.supersetId,
    plannedSets: input.plannedSets ?? SESSION_SLOT_DEFAULTS.plannedSets,
    restSeconds: input.restSeconds ?? SESSION_SLOT_DEFAULTS.restSeconds,
    usesDropSet: input.usesDropSet ?? SESSION_SLOT_DEFAULTS.usesDropSet,
  }
}

/* ------------------------------------------------------------------ *
 * The person's state
 * ------------------------------------------------------------------ */

/**
 * How cooked the person is. Every number is 0 (fresh) to 1 (spent).
 *
 * It is supplied, never derived here: the ranker has no clock and no history
 * store, and a fatigue model belongs to whoever owns the session, not to a
 * scoring function. `null` on the context means "not measured", and the fatigue
 * factor drops out of the score rather than guessing a value.
 */
export interface FatigueState {
  /** Whole-body fatigue: how much is left in the tank at all. */
  readonly systemic: number
  /** Per muscle group. A group with no entry is treated as fresh. */
  readonly byMuscleGroup: Readonly<Partial<Record<MuscleGroupId, number>>>
  /** Grip specifically — the thing that quits before the back does. */
  readonly grip: number
}

/**
 * What the person has done on an exercise before.
 *
 * A swap onto something with a known working load is safer than a swap onto
 * something they have never touched, which is why familiarity is a ranking factor
 * rather than a display field.
 */
export interface PerformanceRecord {
  readonly exerciseId: string
  /** Sessions logged on this exercise. 0, or an absent record, means "never". */
  readonly sessions: number
  /** 0..1 — the share of those sessions that hit their target. `null` if unknown. */
  readonly successRate: number | null
}

/** A saved location other than the one the person is at. */
export interface AlternativeLocation {
  readonly id: string
  readonly name: string
  readonly equipment: readonly EquipmentId[]
}

/* ------------------------------------------------------------------ *
 * The request
 * ------------------------------------------------------------------ */

export interface AlternativesContext {
  /** The whole session, in order, including the slot being replaced. */
  readonly session: readonly SessionSlot[]
  /** Which slot is being replaced. Must name a slot in `session`. */
  readonly targetSlotId: string
  /** Every equipment id present at the location the person is at right now. */
  readonly availableEquipment: readonly EquipmentId[]
  /** The kind of place they are training. */
  readonly location: LocationSuitability
  /**
   * Their other saved locations. Supplying them turns "you do not have the kit"
   * into the more useful "you could do this at the gym": a candidate blocked only
   * on equipment that another location has is reported as
   * `requires-location-change` with the locations named.
   */
  readonly otherLocations?: readonly AlternativeLocation[]
  /** Declared limitations, as the catalog names them. */
  readonly limitations: readonly LimitationFlag[]
  /** Straight off the profile. Both sides, both lists — free text included. */
  readonly preferences: ExercisePreferences
  /** Which suitability the stimulus factor weights. Straight off the profile. */
  readonly goal: TrainingStyle
  /** Seconds left in the session. `null` when the caller is not fitting a clock. */
  readonly remainingSeconds: number | null
  /** `null` when fatigue has not been measured. */
  readonly fatigue: FatigueState | null
  /** Previous performance, by exercise id. Absent means no history is known. */
  readonly performance?: readonly PerformanceRecord[]
  /**
   * Which techniques the person has turned on, straight off the profile. Passed
   * through to the conflict engine, which needs it to judge a superset or a drop
   * set. Absent means "all of them", which is the engine's own default.
   */
  readonly techniques?: TechniquePermissions
  /**
   * Sessions already done, for the engine's recovery rule. `daysAgo` is worked out
   * by the caller from its own clock — nothing in this module reads one.
   */
  readonly recentTraining?: readonly RecentTraining[]
}

/* ------------------------------------------------------------------ *
 * Exclusions — the hard filters
 * ------------------------------------------------------------------ */

/**
 * Why a candidate never reached the score. Order is canonical and is the order
 * the filters run in: the FIRST code that fires is the one reported, so a
 * candidate that fails four ways is explained by the cheapest, most concrete one.
 *
 * These are filters, not penalties. An exercise a person cannot do, must not do,
 * or has said they do not want is not a weak alternative — it is not one.
 */
export const EXCLUSION_CODES = [
  'is-current-exercise',
  'not-production-enabled',
  'wrong-primary-muscle',
  'disliked',
  'location-unsuitable',
  'requires-location-change',
  'equipment-unavailable',
  'does-not-fit-remaining-time',
  'limitation-contraindicated',
  'duplicate-in-session',
  'excessive-overlap',
  'interferes-with-priority',
  'unsafe-joint-stress',
  'superset-conflict',
  'session-conflict',
  'below-quality-floor',
] as const

export type ExclusionCode = (typeof EXCLUSION_CODES)[number]

export interface ExcludedCandidate {
  readonly exerciseId: string
  readonly name: string
  readonly code: ExclusionCode
  /** One short line saying why, for a "show what was ruled out" affordance. */
  readonly text: string
  /** Equipment the candidate needs that the current location does not have. */
  readonly missingEquipment: readonly EquipmentId[]
  /** Locations that DO have it, when that is the only thing in the way. */
  readonly availableAt: readonly AlternativeLocation[]
  /** Set when the exclusion came from the conflict engine rather than a filter. */
  readonly conflictKind: ConflictKind | null
}

/* ------------------------------------------------------------------ *
 * Reasons and differences — what Phase 5 renders
 * ------------------------------------------------------------------ */

export const REASON_CODES = [
  'same-primary-muscle',
  'same-muscle-group',
  'same-movement-pattern',
  'similar-movement-pattern',
  'same-training-role',
  'similar-stimulus',
  'similar-range-of-motion',
  'equipment-on-hand',
  'quicker-setup',
  'fits-remaining-time',
  'avoids-session-overlap',
  'low-fatigue-cost',
  'spares-grip',
  'gentler-on-joints',
  'preferred-exercise',
  'proven-history',
  'keeps-progression',
  'superset-safe',
  'drop-set-safe',
  'hand-picked-substitution',
  'no-conflicts',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export interface AlternativeReason {
  readonly code: ReasonCode
  /** Short plain-language line. Never parse it; read the code. */
  readonly text: string
  /** Which factor produced it, so a reviewer can trace a reason to its weight. */
  readonly factor: FactorKey
  /** 0..1 — how much this reason is doing the work of ranking this candidate. */
  readonly strength: number
}

export const DIFFERENCE_CODES = [
  'muscle-emphasis-shift',
  'different-pattern',
  'different-equipment',
  'compound-isolation-change',
  'range-of-motion-change',
  'unilateral-change',
  'stability-change',
  'grip-change',
  'rep-unit-change',
  'rep-range-shift',
  'difficulty-change',
  'setup-time-change',
  'drop-set-unavailable',
  'progression-resets',
  'superset-changes',
] as const

export type DifferenceCode = (typeof DIFFERENCE_CODES)[number]

/** How much a difference matters. Ordered; `major` is the one to lead with. */
export const DIFFERENCE_MAGNITUDES = ['slight', 'notable', 'major'] as const
export type DifferenceMagnitude = (typeof DIFFERENCE_MAGNITUDES)[number]

export interface AlternativeDifference {
  readonly code: DifferenceCode
  readonly text: string
  readonly magnitude: DifferenceMagnitude
}

/* ------------------------------------------------------------------ *
 * Progression and superset facts — required on every alternative
 * ------------------------------------------------------------------ */

export interface ProgressionContinuity {
  /**
   * True when working load, rep target, and streak travel across the swap. The
   * answer comes from `progressionCarriesAcross` in the taxonomy, which owns the
   * rule; this field only reports it.
   */
  readonly preservesHistory: boolean
  readonly currentFamily: string
  readonly candidateFamily: string
  readonly text: string
}

/**
 * What the swap does to the superset the slot is in.
 *   `not-in-superset` — the slot was never supersetted.
 *   `preserved`       — the pairing still works the way it did.
 *   `changed`         — it still works, but differently: a new competing demand,
 *                       a grip clash, a different station.
 *   `broken`          — the pairing cannot stand. Only reachable when the caller
 *                       passed `allowSupersetBreak`; otherwise such a candidate is
 *                       excluded as `superset-conflict` instead.
 */
export const SUPERSET_EFFECTS = ['not-in-superset', 'preserved', 'changed', 'broken'] as const
export type SupersetEffect = (typeof SUPERSET_EFFECTS)[number]

export interface SupersetImpact {
  readonly effect: SupersetEffect
  /** The slot this one is paired with, when there is exactly one. */
  readonly partnerSlotId: string | null
  readonly partnerExerciseId: string | null
  /** True when candidate and partner would want the same station at once. */
  readonly stationClash: boolean
  /** Demands both movements make, which is what ruins the second one. */
  readonly sharedDemands: readonly CompetingDemand[]
  readonly text: string
}

/* ------------------------------------------------------------------ *
 * Scores
 * ------------------------------------------------------------------ */

/** One factor's verdict on one candidate. The whole audit trail of a score. */
export interface FactorScore {
  readonly key: FactorKey
  /** The factor's share of 100, AFTER renormalising over applicable factors. */
  readonly weight: number
  /** 0..1. */
  readonly score: number
  /** `weight * score`. These sum to `matchScore` before rounding. */
  readonly contribution: number
  /**
   * How far this candidate sits above (or below) the factor's neutral baseline,
   * in the same units as `contribution`. This — not raw contribution — is what
   * picks the primary reason, because "trains the same muscle" is true of every
   * candidate and therefore explains none of them.
   */
  readonly standout: number
  readonly code: ReasonCode
  readonly text: string
}

/** Rungs, so a screen does not have to invent thresholds. */
export const MATCH_QUALITIES = ['weak', 'fair', 'strong', 'excellent'] as const
export type MatchQuality = (typeof MATCH_QUALITIES)[number]

export interface RankedAlternative {
  readonly exerciseId: string
  readonly name: string
  /** 0-100, whole number. 100 is a perfect match FOR THIS CONTEXT. */
  readonly matchScore: number
  readonly matchQuality: MatchQuality
  /** The single line that explains why this one is up here. Never null. */
  readonly primaryReason: AlternativeReason
  /** At most two more, strongest first. */
  readonly supportingReasons: readonly AlternativeReason[]
  /** The one thing that will feel different. `null` when nothing material differs. */
  readonly keyDifference: AlternativeDifference | null
  readonly differences: readonly AlternativeDifference[]
  readonly equipment: readonly EquipmentId[]
  readonly optionalEquipment: readonly EquipmentId[]
  readonly setupTimeSeconds: number
  /** Setup plus work plus rest, from the slot estimator. Seconds. */
  readonly estimatedSlotSeconds: number
  readonly progression: ProgressionContinuity
  readonly superset: SupersetImpact
  /** Non-blocking conflict-engine findings. Shown, not hidden; they cost score. */
  readonly warnings: readonly string[]
  /** Every factor, in canonical order. For debugging and for review. */
  readonly factors: readonly FactorScore[]
  /** Primary reason and key difference in one line, for a compact row. */
  readonly summary: string
}

/* ------------------------------------------------------------------ *
 * The result
 * ------------------------------------------------------------------ */

/**
 * Why nothing came back. `mixed` means no single cause accounted for the
 * eliminations; the `excluded` list still carries every candidate's own reason.
 */
export const NO_ALTERNATIVE_REASONS = [
  'no-candidates-in-catalog',
  'equipment-unavailable',
  'requires-location-change',
  'location-unsuitable',
  'limitation-blocked',
  'time-insufficient',
  'session-conflict',
  'user-excluded',
  'below-quality-floor',
  'mixed',
] as const

export type NoAlternativeReason = (typeof NO_ALTERNATIVE_REASONS)[number]

interface AlternativesResultBase {
  readonly currentExerciseId: string
  readonly currentExerciseName: string
  /** How many catalog entries were considered before any filter ran. */
  readonly considered: number
  /** Every candidate that was ruled out, with the reason it was ruled out. */
  readonly excluded: readonly ExcludedCandidate[]
  /** Whether the injected conflict engine was used, or the stand-in. */
  readonly conflictSource: ConflictSource
}

export interface RankedAlternatives extends AlternativesResultBase {
  readonly outcome: 'ranked'
  /** Best first. Non-empty by construction — the type says so. */
  readonly alternatives: readonly [RankedAlternative, ...RankedAlternative[]]
}

/**
 * "No safe alternative exists" — an outcome of its own, never an empty array the
 * screen has to interpret. It carries a machine-readable `reason` and a line the
 * screen can show as-is.
 */
export interface NoAlternatives extends AlternativesResultBase {
  readonly outcome: 'none'
  readonly reason: NoAlternativeReason
  readonly message: string
  readonly alternatives: readonly []
}

export type AlternativesResult = RankedAlternatives | NoAlternatives

/** Narrows to the outcome that has alternatives. */
export function isRanked(result: AlternativesResult): result is RankedAlternatives {
  return result.outcome === 'ranked'
}
