import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { LimitationFlag, LocationSuitability } from '../../catalog/taxonomy/taxonomy'
import type { ConflictChecker } from '../alternatives/conflictPort'
import type { TechniquePermissions } from '../conflicts/conflictContext'
import type {
  ExercisePreferences,
  Goal,
  Profile,
  RestStyle,
  TrainingStyle,
  Weekday,
} from '../../core/validation/schemas'
import type { DurationChoice, RecalibrationMetadata, Workout } from '../../core/validation/workoutSchema'

/**
 * THE GENERATOR'S CONTRACT: what goes in, what comes out.
 *
 * WHY EVERY PHASE-6 AND PHASE-7 INPUT IS OPTIONAL. There is no workout history and
 * no progression state in the product today, and there will not be until Phases 6
 * and 7 build them. The generator therefore has to produce a good session from a
 * profile and a seed alone — an input whose absence broke generation would make
 * Phase 3 undeliverable. Every optional field below is a fact the generator cannot
 * invent, and its absence is REPORTED (`RecalibrationMetadata.inputsPresent`,
 * `Workout.confidence.limiters`) rather than guessed around silently.
 *
 * THE GENERATOR IS PURE. No React, no storage, no `Date.now()`, no `Math.random()`.
 * The date arrives on the input; variety comes from `seed`, never from ambience.
 * The same input must produce a byte-identical `Workout`, every time.
 *
 * THE CATALOG ARRIVES AS AN ARGUMENT. `exercises` is handed in by a caller that
 * has already dynamically imported the catalog, exactly as the alternatives ranker
 * takes its index. Nothing under `engine/` imports exercise DATA, which is what
 * keeps 127 entries off the boot chunk.
 *
 * THE CONFLICT ENGINE AND THE ALTERNATIVES RANKER ARE ASKED, NOT REIMPLEMENTED.
 * `conflicts` is the port onto the one conflict engine. A generator that grew its
 * own idea of "these two do not belong together" would be the second owner of a
 * rule that already has one.
 *
 * CHANGING THE DURATION REBUILDS THE SESSION. `generateWorkout` is called again
 * with a new `availableTime` and the SAME seed; it reconsiders priorities, volume,
 * pattern balance, order, supersets, drop sets, warm-up and rest, and returns the
 * best session for that time. It never trims the tail off a longer one.
 */

/** Bump when a change would make two generations incomparable. Stamped on the workout. */
export const GENERATOR_VERSION = '3.0.0'

/* ------------------------------------------------------------------ *
 * The pieces Phases 6 and 7 will supply
 * ------------------------------------------------------------------ */

/** What the person is training for. Defaults come off the profile's `goals`. */
export interface WorkoutGoals {
  readonly primary: Goal
  readonly secondary: Goal | null
  /** Hybrid, hypertrophy, or strength. Straight off the profile unless overridden. */
  readonly style: TrainingStyle
}

/** One day of a weekly plan: what this session is supposed to be. */
export interface PlannedSession {
  readonly day: Weekday
  /** A stable id for the slot, so two generations for the same day can be diffed. */
  readonly slotId: string
  /** Groups this day is meant to cover. Empty means "whatever the week needs". */
  readonly emphasis: readonly MuscleGroupId[]
  /** Minutes this slot is planned at. This is what `'default'` resolves to. */
  readonly plannedMinutes: number
}

/**
 * The week the session sits inside.
 *
 * `'default'` DURATION RESOLVES FROM HERE. When a plan is supplied, the matching
 * day's `plannedMinutes` is the complete duration; with no plan, the generator
 * falls back to `profile.schedule.typicalDurationMin`, which is the default
 * duration a person set in Settings. Neither is a constant in this module.
 */
export interface WeeklyPlan {
  readonly sessions: readonly PlannedSession[]
  /** Weekly working-set targets per group, when the plan sets them. */
  readonly weeklyTargetSets: Readonly<Partial<Record<MuscleGroupId, number>>>
}

/** A session already done. `daysAgo` is worked out by the caller from its own clock. */
export interface RecentWorkoutSummary {
  readonly workoutId: string
  readonly daysAgo: number
  /** Exercise ids performed, for variety and for progression lookups. */
  readonly exerciseIds: readonly string[]
  /** Working sets per group in that session. */
  readonly setsByGroup: Readonly<Partial<Record<MuscleGroupId, number>>>
  /** Movement patterns trained, for balance across the week. */
  readonly patterns: readonly MovementPatternId[]
}

/** Working sets already done this week, per group. */
export interface MuscleVolumeEntry {
  readonly group: MuscleGroupId
  readonly setsThisWeek: number
  /** The weekly target, when one is known. `null` leaves the generator to judge. */
  readonly targetSets: number | null
}

/** How long since a group was last worked hard. */
export interface MuscleExposureEntry {
  readonly group: MuscleGroupId
  readonly daysAgo: number
  /** Working sets in that most recent exposure. */
  readonly sets: number
}

/**
 * How recovered the person is. 0 (spent) to 1 (fresh) — the same direction as the
 * profile's readiness below and the OPPOSITE of the alternatives ranker's
 * `FatigueState`, which is why the two are separate types rather than one reused
 * badly. A group with no entry is treated as recovered.
 */
export interface RecoveryState {
  readonly systemic: number
  readonly byMuscleGroup: Readonly<Partial<Record<MuscleGroupId, number>>>
}

/** What the person said about today. Every field is theirs to leave out. */
export interface ReadinessState {
  /** 0..1. `null` when not asked. */
  readonly energy: number | null
  readonly sleepQuality: number | null
  readonly soreness: number | null
  /** How much time pressure they are under, 0..1. Influences rest and supersets. */
  readonly timePressure: number | null
}

/** Pain reported today. Never a diagnosis — an input to avoidance. */
export interface PainReport {
  /** The limitation flag the catalog reasons in, when it maps to one. */
  readonly flag: LimitationFlag | null
  readonly muscleGroup: MuscleGroupId | null
  /** 0..1. */
  readonly severity: number
}

/** Where the session is being trained. Mirrors the conflict engine's location. */
export interface GeneratorLocation {
  readonly id: string
  readonly name: string
  /** `null` for a location of no fixed kind — nothing may be concluded about it. */
  readonly suitability: LocationSuitability | null
}

/** Preferences that shape selection. Straight off the profile unless overridden. */
export interface GeneratorPreferences {
  readonly exercises: ExercisePreferences
  readonly restStyle: RestStyle
  /**
   * How hard to push for something different from recent sessions, 0..1. The
   * VARIETY it produces is derived from `seed`, never from a random number.
   */
  readonly varietyBias: number
}

/** What Phase 6 knows about a lift. Absent for every lift until Phase 6 ships. */
export interface ProgressionState {
  readonly exerciseId: string
  readonly progressionFamily: string
  /** The load that worked last time, in `unit`. `null` when never loaded. */
  readonly workingLoad: number | null
  readonly unit: 'kg' | 'lb'
  readonly targetReps: number | null
  /** Consecutive sessions that hit target. 0 when unknown. */
  readonly successStreak: number
  readonly lastPerformedDaysAgo: number | null
}

/** How often the person trains, and how far into the week they are. */
export interface TrainingFrequency {
  readonly sessionsPerWeek: number
  /** Sessions already done in the current week. */
  readonly sessionsThisWeek: number
  readonly availableDays: readonly Weekday[]
}

/* ------------------------------------------------------------------ *
 * The input
 * ------------------------------------------------------------------ */

export interface GenerateWorkoutInput {
  /** The whole profile. Goals, limitations, techniques and units all read from it. */
  readonly profile: Profile
  /** Overrides the profile's goals for this session only. Defaults to them. */
  readonly goals?: WorkoutGoals
  /** The week this session belongs to. Absent today; Phase 6 supplies it. */
  readonly weeklyPlan?: WeeklyPlan
  /** Sessions already done, newest first. Absent until Phase 7 has history. */
  readonly recentWorkouts?: readonly RecentWorkoutSummary[]
  readonly weeklyMuscleVolume?: readonly MuscleVolumeEntry[]
  readonly recentMuscleExposure?: readonly MuscleExposureEntry[]
  readonly recovery?: RecoveryState
  readonly readiness?: ReadinessState
  /** Empty and absent both mean "no pain reported"; absent additionally means "not asked". */
  readonly pain?: readonly PainReport[]
  readonly location: GeneratorLocation
  /** Every equipment id actually present where they are. */
  readonly equipment: readonly EquipmentId[]
  /** THE one length control. See `DurationChoice`. */
  readonly availableTime: DurationChoice
  readonly preferences?: GeneratorPreferences
  /** Which techniques are on. Defaults to `profile.techniques`. */
  readonly techniques?: TechniquePermissions
  readonly progression?: readonly ProgressionState[]
  readonly trainingFrequency?: TrainingFrequency
  /**
   * The day this session is FOR, `YYYY-MM-DD`, and the instant it is generated at.
   * Both are supplied: the generator reads no clock, so a session generated at
   * 23:59 is not for a different day than the caller meant.
   */
  readonly forDate: string
  readonly generatedAt: string
  /**
   * The explicit variety seed. The SAME seed and the same inputs must produce a
   * byte-identical workout; a DIFFERENT seed is how two consecutive sessions
   * differ. Never derive it inside the generator.
   */
  readonly seed: string
  /**
   * The catalog, handed in by a caller that already imported it. Required: the
   * generator has nothing to choose from without it, and importing it here would
   * put 127 entries on somebody's boot chunk.
   */
  readonly exercises: readonly Exercise[]
  /**
   * The port onto THE conflict engine. Supply one built from this session's
   * context; a generator that decides session safety for itself is a second owner
   * of rules that already have one.
   */
  readonly conflicts?: ConflictChecker
}

/* ------------------------------------------------------------------ *
 * The output
 * ------------------------------------------------------------------ */

/**
 * Why no session could be produced. It is an OUTCOME, never an empty workout the
 * caller has to interpret — the same choice the alternatives ranker makes for
 * "there is nothing you could do instead".
 */
export const NO_WORKOUT_REASONS = [
  'no-usable-exercises',
  'equipment-unavailable',
  'location-unsuitable',
  'limitations-block-everything',
  'time-too-short',
  'catalog-empty',
] as const
export type NoWorkoutReason = (typeof NO_WORKOUT_REASONS)[number]

export interface GeneratedWorkout {
  readonly outcome: 'generated'
  readonly workout: Workout
  /**
   * What the generator decided and why, structured so Phase 4 can diff two
   * generations and Phase 5 can render an explanation without re-deriving
   * anything. Persisted beside the workout by `workoutRepository`.
   */
  readonly recalibration: RecalibrationMetadata
}

export interface NoWorkout {
  readonly outcome: 'none'
  readonly reason: NoWorkoutReason
  /** One line a screen can show as-is. */
  readonly message: string
  /** How many catalog entries were considered before anything was ruled out. */
  readonly considered: number
}

export type GenerateWorkoutResult = GeneratedWorkout | NoWorkout

/** Narrows to the outcome that has a session. */
export function isGenerated(result: GenerateWorkoutResult): result is GeneratedWorkout {
  return result.outcome === 'generated'
}

/** The signature the generator module implements. Synchronous, pure, deterministic. */
export type GenerateWorkout = (input: GenerateWorkoutInput) => GenerateWorkoutResult

/* ------------------------------------------------------------------ *
 * Seeding
 * ------------------------------------------------------------------ */

/**
 * THE ONE WAY A SEED STRING BECOMES A NUMBER.
 *
 * Variety must be reproducible, so every generator decision that wants to differ
 * between sessions derives from `input.seed` and nothing else. This is FNV-1a over
 * the UTF-16 code units — small, pure, dependency-free, and stable across engines,
 * which `Math.random()` and `String.prototype.hashCode`-style ad-hockery are not.
 *
 * It lives here rather than inside the generator so that the generator, its tests,
 * and anything Phase 4 writes to reproduce a generation all hash a seed the same
 * way. Two hashes would mean a "reproduction" that quietly differed.
 *
 * Always returns a non-negative 32-bit integer.
 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    // FNV prime, 16777619, by shifts — `hash * 16777619` overflows to a float.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash >>> 0
}

/**
 * Derives a sub-seed for one decision, so two decisions in one generation do not
 * march in lockstep. `hashSeed(seed)` and `deriveSeed(seed, 'exercise-order')` are
 * independent; the same pair always gives the same number.
 */
export function deriveSeed(seed: string, label: string): number {
  return hashSeed(`${seed}::${label}`)
}
