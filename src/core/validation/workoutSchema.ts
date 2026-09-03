import { z } from 'zod'
import {
  MAX_EXERCISE_ID_LENGTH,
  humaniseExerciseId,
  isCatalogExerciseId,
} from '../../catalog/exercises/exerciseId'
import { movementPatternIdSchema } from '../../catalog/movementPatterns/movementPatterns'
import { muscleGroupIdSchema } from '../../catalog/muscles/muscles'
import {
  loadMeasureSchema,
  progressionFamilySchema,
  repUnitSchema,
  trainingRoleSchema,
} from '../../catalog/taxonomy/taxonomy'
import { isIsoTimestamp } from '../time/clock'
import { goalSchema, isoTimestampSchema, trainingStyleSchema, type KnownFields } from './schemas'
import { schemaValidator, type ValidationResult, type Validator } from './validate'

/**
 * THE generated-session data model.
 *
 * This file is the single owner of what a generated workout IS. Phase 3 writes
 * one, Phase 4 recalibrates one, Phase 5 logs against one, Phases 6 and 7 read
 * one back. Nothing else may declare a rival workout, block, set, or duration
 * type — extend here instead.
 *
 * THREE RULES SHAPED EVERYTHING BELOW.
 *
 * 1. A SET TARGET IS NOT A SET RECORD. A target is what the generator asked for;
 *    a record is what the person actually did. They are separate schemas joined
 *    by `setId`, never one schema with optional "actual" fields. Conflating them
 *    would make "3 x 8 at an unknown weight" and "3 x 8 at 60 kg, logged" the
 *    same shape, and Phase 4 could not then tell a plan from a result.
 *
 * 2. A SUPERSET IS ONE BLOCK OF EXACTLY TWO MOVES, AND EACH MOVE KEEPS ITS OWN
 *    RECORD. The pair is not merged into a pseudo-exercise: each move has its own
 *    targets, its own logged records, and its own replacement history, because a
 *    person swaps one half of a superset all the time and the other half's
 *    history must survive it. What is shared is the ROUND: a round advances both
 *    moves together, so both moves carry exactly `rounds` targets.
 *
 * 3. ONE CANONICAL LIST ROW PER BLOCK. The Active Workout List renders
 *    `workoutListRows()`, which yields one row per block — a superset is ONE row
 *    naming BOTH moves, and it is finished only when both moves are finished. The
 *    row is DERIVED, never stored: duplicated state is how a list ends up showing
 *    a superset member as an outstanding required exercise.
 *
 * FORWARD COMPATIBILITY, as in `schemas.ts`: every object here is a
 * `z.looseObject`, so a record written by a later build keeps its unknown fields
 * through a read -> write cycle. Do not tighten these to `z.object`.
 *
 * PURITY. Nothing here reads a clock, a random number, or storage. Timestamps
 * arrive as ISO strings the caller supplied.
 */

/** Bumped whenever a stored workout record needs a migration. */
export const WORKOUT_SCHEMA_VERSION = 1

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

/** A calendar day, `YYYY-MM-DD`. Never a timestamp: a session is planned for a DAY. */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a calendar date, YYYY-MM-DD')
  .refine(isIsoTimestamp, { message: 'Expected a real calendar date' })

/**
 * An id minted by the generator: block, entry, set, step, circuit. Opaque and
 * stable for the life of the workout — Phase 5 logs against these, so a
 * regeneration that reuses an id is claiming the same slot on purpose.
 */
export const generatedIdSchema = z.string().min(1).max(80)

/** A built-in or `custom:` exercise id, the same rule stored profiles use. */
export const workoutExerciseIdSchema = z
  .string()
  .min(1)
  .max(MAX_EXERCISE_ID_LENGTH)
  .refine(isCatalogExerciseId, { message: 'Expected a built-in or custom exercise id' })

/**
 * The symbol a weight is written in. Matches `Profile['bodyweight'].unit` and the
 * `WeightUnit` the label catalogue renders; a workout stores the symbol rather
 * than the unit SYSTEM, because a logged number is meaningless without it.
 */
export const weightUnitSchema = z.enum(['kg', 'lb'])
export type WeightUnit = z.infer<typeof weightUnitSchema>

/* ------------------------------------------------------------------ *
 * Duration choice — THE one length control
 * ------------------------------------------------------------------ */

/**
 * THE ONE workout-length control: 15, 30, 45, or "Default time".
 *
 * `'default'` MEANS "the complete duration the current plan generates". It is NOT
 * a fixed number of minutes and must never be rendered as one: on a four-day
 * hybrid plan it may be 52 minutes today and 61 next week. The resolved number
 * lands on `Workout.plannedMinutes` AFTER generation.
 *
 * THE CHOICE IS PER-WORKOUT. Picking 30 today does not change what tomorrow
 * generates; the only durable default is the one in Settings
 * (`Profile['schedule'].typicalDurationMin`), which feeds the plan that
 * `'default'` reads. A screen that wants to remember today's pick puts the id of
 * the session in settings, not the duration.
 *
 * CHANGING IT REBUILDS THE SESSION. It never truncates the tail. See
 * `engine/workoutGenerator/types.ts`.
 *
 * There is no Full, Lazy, Short, Density, or Recovery mode. This union is the
 * whole vocabulary of session length.
 */
export const DURATION_CHOICES = [15, 30, 45, 'default'] as const

export const durationChoiceSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal('default'),
])

export type DurationChoice = z.infer<typeof durationChoiceSchema>

/** True for a choice that names a fixed number of minutes. */
export function isFixedDurationChoice(choice: DurationChoice): choice is 15 | 30 | 45 {
  return choice !== 'default'
}

/**
 * The minutes a choice pins, or `null` for `'default'` — which pins nothing until
 * the generator has run. Callers that need a number for `'default'` read
 * `Workout.plannedMinutes` off the generated session.
 */
export function fixedDurationMinutes(choice: DurationChoice): number | null {
  return isFixedDurationChoice(choice) ? choice : null
}

/* ------------------------------------------------------------------ *
 * Set targets
 * ------------------------------------------------------------------ */

/**
 * What a set is FOR.
 *   `warm-up`  — a ramp set on the way to the working load. Counted in the time
 *                estimate, never in weekly volume.
 *   `working`  — the set the session exists for.
 *   `drop`     — a drop performed immediately after its parent working set. It is
 *                its own target so the logger has somewhere to put the reps.
 *   `back-off` — a lighter set after the heavy work, at the same exercise.
 */
export const SET_KINDS = ['warm-up', 'working', 'drop', 'back-off'] as const
export const setKindSchema = z.enum(SET_KINDS)
export type SetKind = z.infer<typeof setKindSchema>

/** How much of one set is asked for, in whatever `unit` names. */
export const repTargetSchema = z
  .looseObject({
    min: z.number().int().min(1).max(300),
    max: z.number().int().min(1).max(300),
    /** `reps` for almost everything; `seconds` for a hold or a carry. */
    unit: repUnitSchema,
  })
  .refine((range) => range.min <= range.max, {
    message: 'A rep range must not run backwards',
    path: ['max'],
  })

export type RepTarget = KnownFields<z.infer<typeof repTargetSchema>>

/**
 * Why a tempo was prescribed.
 *
 * TEMPO IS ONLY EVER PRESENT WITH A REASON. That is why `reason` is a required
 * field of the tempo object rather than a sibling of it: a tempo with no stated
 * purpose cannot be written down at all, so no screen has to decide whether
 * `3-1-1-0` is meaningful or leftover.
 */
export const TEMPO_REASONS = [
  'control-eccentric',
  'joint-friendly',
  'technique-focus',
  'intensity-without-load',
  'time-under-tension',
] as const
export const tempoReasonSchema = z.enum(TEMPO_REASONS)
export type TempoReason = z.infer<typeof tempoReasonSchema>

export const tempoSchema = z.looseObject({
  eccentricSeconds: z.number().int().min(0).max(10),
  bottomPauseSeconds: z.number().int().min(0).max(10),
  concentricSeconds: z.number().int().min(0).max(10),
  topPauseSeconds: z.number().int().min(0).max(10),
  reason: tempoReasonSchema,
})

export type Tempo = KnownFields<z.infer<typeof tempoSchema>>

/**
 * Why a weight target is unknown. A first session has no history and no
 * progression state, so "we do not know" is the honest and COMMON answer — it is
 * modelled as a first-class case rather than as a null the UI has to interpret.
 */
export const UNKNOWN_WEIGHT_REASONS = [
  'no-history',
  'first-session',
  'exercise-replaced',
  'progression-state-absent',
  'user-decides',
] as const
export const unknownWeightReasonSchema = z.enum(UNKNOWN_WEIGHT_REASONS)
export type UnknownWeightReason = z.infer<typeof unknownWeightReasonSchema>

/**
 * The load asked for on one set.
 *
 *   `unknown` — no number can honestly be given. Phase 5 shows an empty field and
 *               the reason; Phase 6 fills these in once history exists.
 *   `none`    — the movement carries no external load at all (bodyweight plank).
 *   `load`    — a number, its unit, and its `measure`. `measure` is not optional
 *               decoration: `per-hand` 20 and `total` 20 are different sessions,
 *               and storing the number without it halves or doubles a history.
 */
export const weightTargetSchema = z.discriminatedUnion('kind', [
  z.looseObject({ kind: z.literal('unknown'), reason: unknownWeightReasonSchema }),
  z.looseObject({ kind: z.literal('none') }),
  z.looseObject({
    kind: z.literal('load'),
    value: z.number().finite().min(0).max(2000),
    unit: weightUnitSchema,
    measure: loadMeasureSchema,
  }),
])

export type WeightTarget = KnownFields<z.infer<typeof weightTargetSchema>>

/**
 * The INTENT to drop, attached to the working set it follows.
 *
 * The intent lives here and the resulting drops are separate `drop` targets in
 * the same entry, so the logger has a row per drop and the time estimate can
 * charge for them. A generator that wants no drop set simply writes `null`.
 */
export const dropSetIntentSchema = z.looseObject({
  /** How many drops follow the parent set. */
  drops: z.number().int().min(1).max(3),
  /** How much load comes off at each drop, as a whole percentage. */
  loadReductionPercent: z.number().int().min(5).max(60),
  /** Seconds allowed to strip the load. Charged to the estimate; not a rest. */
  transitionSeconds: z.number().int().min(0).max(60),
})

export type DropSetIntent = KnownFields<z.infer<typeof dropSetIntentSchema>>

/**
 * ONE PROGRAMMED SET. This is a PLAN, not a result — see `setRecordSchema`.
 */
export const setTargetSchema = z.looseObject({
  /** Stable within the workout. What a `SetRecord` points back at. */
  setId: generatedIdSchema,
  kind: setKindSchema,
  reps: repTargetSchema,
  /**
   * Reps in reserve aimed for. `null` on a warm-up set, where the concept does
   * not apply, and on a set deliberately left open-ended.
   */
  rirTarget: z.number().int().min(0).max(10).nullable(),
  /** Rest AFTER this set, in seconds. Inside a superset this is the move-to-move gap. */
  restSeconds: z.number().int().min(0).max(900),
  weight: weightTargetSchema,
  /** Present only with a stated reason; `null` is the normal case. */
  tempo: tempoSchema.nullable(),
  /** Present only on the set the drop hangs off. `null` everywhere else. */
  dropSet: dropSetIntentSchema.nullable(),
  /** Work plus rest for this set alone. The entry's estimate is these plus setup. */
  estimatedSeconds: z.number().int().min(0).max(1800),
})

export type SetTarget = KnownFields<z.infer<typeof setTargetSchema>>

/** True for a ramp set — the one flag the list and the volume count both read. */
export function isWarmUpSet(target: SetTarget): boolean {
  return target.kind === 'warm-up'
}

/** Sets that count towards weekly volume: everything that is not a ramp. */
export function workingSets(targets: readonly SetTarget[]): SetTarget[] {
  return targets.filter((target) => !isWarmUpSet(target))
}

/* ------------------------------------------------------------------ *
 * Set records — what actually happened
 * ------------------------------------------------------------------ */

/**
 * How a set ended.
 *   `completed` — done, at or inside the target.
 *   `partial`   — done, but short of the target.
 *   `skipped`   — not performed. Still recorded, because "skipped" is data.
 */
export const SET_OUTCOMES = ['completed', 'partial', 'skipped'] as const
export const setOutcomeSchema = z.enum(SET_OUTCOMES)
export type SetOutcome = z.infer<typeof setOutcomeSchema>

/** The load actually used. `measure` travels with it for the same reason as above. */
export const actualLoadSchema = z.looseObject({
  value: z.number().finite().min(0).max(2000),
  unit: weightUnitSchema,
  measure: loadMeasureSchema,
})

export type ActualLoad = KnownFields<z.infer<typeof actualLoadSchema>>

/** One drop actually performed inside a drop set, in the order performed. */
export const dropRecordSchema = z.looseObject({
  reps: z.number().int().min(0).max(300),
  load: actualLoadSchema.nullable(),
})

export type DropRecord = KnownFields<z.infer<typeof dropRecordSchema>>

/**
 * ONE LOGGED SET. Phase 5 writes these; nothing in Phase 3 does.
 *
 * It names the target it answers by `setId` rather than by position, so a target
 * added or removed by a recalibration cannot silently re-point somebody's logged
 * work at a different set.
 */
export const setRecordSchema = z.looseObject({
  /** The `SetTarget.setId` this answers. Must name a target in the same entry. */
  setId: generatedIdSchema,
  outcome: setOutcomeSchema,
  /** Reps or seconds actually done, in `repUnit`. */
  reps: z.number().int().min(0).max(300),
  repUnit: repUnitSchema,
  /** `null` for an unloaded movement or a load the person did not record. */
  load: actualLoadSchema.nullable(),
  /** Reps in reserve reported afterwards. `null` when not asked or not answered. */
  rir: z.number().int().min(0).max(10).nullable(),
  loggedAt: isoTimestampSchema,
  /** One per drop performed, in order. Empty when the set carried no drop. */
  drops: z.array(dropRecordSchema).max(3),
  note: z.string().max(240),
})

export type SetRecord = KnownFields<z.infer<typeof setRecordSchema>>

/* ------------------------------------------------------------------ *
 * Replacement history — per move, never merged
 * ------------------------------------------------------------------ */

export const REPLACEMENT_REASONS = [
  'user-choice',
  'equipment-unavailable',
  'station-occupied',
  'pain',
  'conflict',
  'time',
  'recalibration',
] as const
export const replacementReasonSchema = z.enum(REPLACEMENT_REASONS)
export type ReplacementReason = z.infer<typeof replacementReasonSchema>

/**
 * One swap, kept on the ENTRY it happened to.
 *
 * Each half of a superset owns its own list. Swapping the second move must not
 * disturb the first move's history, which is exactly what a shared block-level
 * list would do.
 */
export const exerciseReplacementSchema = z.looseObject({
  fromExerciseId: workoutExerciseIdSchema,
  toExerciseId: workoutExerciseIdSchema,
  at: isoTimestampSchema,
  reason: replacementReasonSchema,
  /**
   * Whether working load, rep target and streak carried across. The answer comes
   * from `progressionCarriesAcross` in the taxonomy; this only records it.
   */
  preservedProgression: z.boolean(),
})

export type ExerciseReplacement = KnownFields<z.infer<typeof exerciseReplacementSchema>>

/* ------------------------------------------------------------------ *
 * Exercise entry
 * ------------------------------------------------------------------ */

/**
 * How much the session depends on this entry. Mirrors the alternatives ranker's
 * `SlotPriority`, deliberately — the same three rungs mean the same three things,
 * and a second scale would let a swap and a generation disagree about what may be
 * dropped for time.
 */
export const ENTRY_PRIORITIES = ['priority', 'normal', 'accessory'] as const
export const entryPrioritySchema = z.enum(ENTRY_PRIORITIES)
export type EntryPriority = z.infer<typeof entryPrioritySchema>

/**
 * ONE EXERCISE IN THE SESSION, with everything durable that belongs to it.
 *
 * A superset holds TWO of these. They are not merged and never will be: targets,
 * records, and replacements are per move.
 */
export const exerciseEntrySchema = z.looseObject({
  /** Stable, unique across the whole workout. The same exercise may appear twice. */
  entryId: generatedIdSchema,
  exerciseId: workoutExerciseIdSchema,
  role: trainingRoleSchema,
  priority: entryPrioritySchema,
  /** In performance order. At least one. */
  targets: z.array(setTargetSchema).min(1).max(30),
  /** Written by Phase 5. Empty on a freshly generated workout. */
  records: z.array(setRecordSchema).max(90),
  /** Written by Phase 5. Empty on a freshly generated workout. */
  replacements: z.array(exerciseReplacementSchema).max(20),
  /**
   * The progression family AT GENERATION TIME. Kept on the entry so Phase 6 can
   * tell a swap that carried history from one that reset it without reloading the
   * catalog as it stood then.
   */
  progressionFamily: progressionFamilySchema,
  /** Setup plus every set plus its rest. What duration fitting charges for. */
  estimatedSeconds: z.number().int().min(0).max(7200),
  /** One line, structured facts only. Never an exercise NAME. */
  note: z.string().max(240),
})

export type ExerciseEntry = KnownFields<z.infer<typeof exerciseEntrySchema>>

/** The target with this id, or `undefined`. */
export function findTarget(entry: ExerciseEntry, setId: string): SetTarget | undefined {
  return entry.targets.find((target) => target.setId === setId)
}

/** True once at least one record names this target — completed, partial, or skipped. */
export function isTargetResolved(entry: ExerciseEntry, setId: string): boolean {
  return entry.records.some((record) => record.setId === setId)
}

/** How many of the entry's targets have been answered by a record. */
export function resolvedTargetCount(entry: ExerciseEntry): number {
  return entry.targets.filter((target) => isTargetResolved(entry, target.setId)).length
}

/** True when the entry carries a drop-set intent on any set. */
export function entryHasDropSet(entry: ExerciseEntry): boolean {
  return entry.targets.some((target) => target.dropSet !== null)
}

/* ------------------------------------------------------------------ *
 * Blocks — single, or a two-move superset
 * ------------------------------------------------------------------ */

export const singleBlockSchema = z.looseObject({
  kind: z.literal('single'),
  blockId: generatedIdSchema,
  entry: exerciseEntrySchema,
  /** Setup plus work plus rest for the block. Equals the entry's estimate. */
  estimatedSeconds: z.number().int().min(0).max(7200),
})

export type SingleBlock = KnownFields<z.infer<typeof singleBlockSchema>>

/** Why the generator paired these two. Structured, so Phase 4 can diff a decision. */
export const SUPERSET_RATIONALES = [
  'time-pressure',
  'antagonist-pairing',
  'unrelated-muscles',
  'accessory-efficiency',
  'user-preference',
] as const
export const supersetRationaleSchema = z.enum(SUPERSET_RATIONALES)
export type SupersetRationale = z.infer<typeof supersetRationaleSchema>

/**
 * THE SUPERSET BLOCK — the locked two-move contract.
 *
 * EXACTLY TWO MOVES. Not "at least two", not "a group". A third movement is a
 * circuit, which is a different structure (`circuitGroupSchema`) sitting OVER
 * blocks, not a wider superset.
 *
 * A ROUND ADVANCES BOTH MOVES. `rounds` is the block's, and each move carries
 * exactly `rounds` targets — enforced by `workoutSchema`. Round 2 of move A and
 * round 2 of move B are `moves[0].targets[1]` and `moves[1].targets[1]`.
 *
 * NO RAMP SETS INSIDE. Warm-up sets belong to `Workout.warmUp` and to single
 * blocks; a superset whose first "round" was really a ramp would break the
 * round-for-round correspondence the whole model rests on.
 *
 * EACH MOVE KEEPS ITS OWN RECORD. `moves[0]` and `moves[1]` are complete
 * `ExerciseEntry` values with their own targets, records, and replacement
 * history. Nothing about a superset merges them.
 */
export const supersetBlockSchema = z.looseObject({
  kind: z.literal('superset'),
  blockId: generatedIdSchema,
  /** Exactly two, in the order they are performed within a round. */
  moves: z.tuple([exerciseEntrySchema, exerciseEntrySchema]),
  rounds: z.number().int().min(1).max(12),
  /** Seconds between the first move and the second, inside a round. */
  restBetweenMovesSeconds: z.number().int().min(0).max(300),
  /** Seconds after the second move, before the next round. */
  restAfterRoundSeconds: z.number().int().min(0).max(900),
  rationale: supersetRationaleSchema,
  estimatedSeconds: z.number().int().min(0).max(7200),
})

/**
 * The two-move guarantee survives into TypeScript. `z.infer` widens a tuple to an
 * array once `KnownFields` walks it, so `moves` is restated here as a readonly
 * pair — a caller that indexes `moves[2]` is a compile error, not a runtime
 * surprise.
 */
export type SupersetBlock = Omit<KnownFields<z.infer<typeof supersetBlockSchema>>, 'moves'> & {
  readonly moves: readonly [ExerciseEntry, ExerciseEntry]
}

export const workoutBlockSchema = z.discriminatedUnion('kind', [singleBlockSchema, supersetBlockSchema])

export type WorkoutBlock = SingleBlock | SupersetBlock

export function isSupersetBlock(block: WorkoutBlock): block is SupersetBlock {
  return block.kind === 'superset'
}

export function isSingleBlock(block: WorkoutBlock): block is SingleBlock {
  return block.kind === 'single'
}

/** Every entry in a block, in performance order: one for a single, two for a superset. */
export function blockEntries(block: WorkoutBlock): readonly ExerciseEntry[] {
  return isSupersetBlock(block) ? block.moves : [block.entry]
}

/** Every entry in the workout, in performance order. */
export function workoutEntries(workout: Workout): ExerciseEntry[] {
  return workout.blocks.flatMap((block) => [...blockEntries(block)])
}

/** The entry with this id, wherever it sits. */
export function findEntry(workout: Workout, entryId: string): ExerciseEntry | undefined {
  return workoutEntries(workout).find((entry) => entry.entryId === entryId)
}

/** The block containing this entry. */
export function blockForEntry(workout: Workout, entryId: string): WorkoutBlock | undefined {
  return workout.blocks.find((block) => blockEntries(block).some((entry) => entry.entryId === entryId))
}

/* ------------------------------------------------------------------ *
 * Circuits — a grouping OVER blocks, never a third block kind
 * ------------------------------------------------------------------ */

/**
 * An optional circuit: single blocks performed back to back for a number of
 * rounds.
 *
 * WHY THIS IS NOT A BLOCK KIND. A block is either one exercise or a superset —
 * that is locked, and it is what makes the two-move superset contract mean
 * something. A circuit is a different claim: it says how a RUN of blocks is
 * performed, and a member of it is still an ordinary block with its own entry,
 * its own records, and its own list row. Modelling it as a wider superset would
 * have quietly turned "exactly two moves" into "two or more".
 *
 * Members are `single` blocks only, and a block belongs to at most one circuit;
 * both are enforced by `workoutSchema`. Every member's entry carries exactly
 * `rounds` working targets, for the same round-for-round reason a superset does.
 */
export const circuitGroupSchema = z.looseObject({
  circuitId: generatedIdSchema,
  /** Block ids, in the order the stations are visited. Two to six. */
  blockIds: z.array(generatedIdSchema).min(2).max(6),
  rounds: z.number().int().min(1).max(10),
  restBetweenStationsSeconds: z.number().int().min(0).max(300),
  restAfterRoundSeconds: z.number().int().min(0).max(900),
})

export type CircuitGroup = KnownFields<z.infer<typeof circuitGroupSchema>>

/* ------------------------------------------------------------------ *
 * Warm-up
 * ------------------------------------------------------------------ */

/**
 * What a warm-up step is doing. Ramp sets on a specific lift are NOT steps — they
 * are `warm-up` targets inside the entry that needs them, so the logger can tick
 * them off against the exercise they belong to.
 */
export const WARM_UP_STEP_KINDS = ['raise', 'mobilise', 'activate', 'movement-rehearsal'] as const
export const warmUpStepKindSchema = z.enum(WARM_UP_STEP_KINDS)
export type WarmUpStepKind = z.infer<typeof warmUpStepKindSchema>

export const warmUpStepSchema = z.looseObject({
  stepId: generatedIdSchema,
  kind: warmUpStepKindSchema,
  /** A catalog movement when the step is one; `null` for a general instruction. */
  exerciseId: workoutExerciseIdSchema.nullable(),
  /** One short line, ready to render. */
  instruction: z.string().min(1).max(160),
  seconds: z.number().int().min(0).max(900),
  /** What the step prepares, so Phase 4 can tell a shortened warm-up from a different one. */
  targetGroups: z.array(muscleGroupIdSchema).max(8),
})

export type WarmUpStep = KnownFields<z.infer<typeof warmUpStepSchema>>

export const warmUpPlanSchema = z.looseObject({
  steps: z.array(warmUpStepSchema).max(10),
  /**
   * Entries that carry their own ramp sets. Derived data would be enough, but
   * naming them here lets a screen show "warm-up" as one thing without walking
   * every entry, and `workoutSchema` checks the list is true.
   */
  rampedEntryIds: z.array(generatedIdSchema).max(20),
  /** Steps plus ramp sets. */
  estimatedSeconds: z.number().int().min(0).max(3600),
  /** Why it is this long. Empty when there is nothing to say. */
  rationale: z.string().max(240),
})

export type WarmUpPlan = KnownFields<z.infer<typeof warmUpPlanSchema>>

/* ------------------------------------------------------------------ *
 * Muscle priorities
 * ------------------------------------------------------------------ */

export const MUSCLE_PRIORITY_LEVELS = ['primary', 'secondary', 'maintenance'] as const
export const musclePriorityLevelSchema = z.enum(MUSCLE_PRIORITY_LEVELS)
export type MusclePriorityLevel = z.infer<typeof musclePriorityLevelSchema>

/** Why a group is being emphasised. Structured, so an explanation needs no parsing. */
export const MUSCLE_PRIORITY_REASONS = [
  'goal',
  'weekly-volume-deficit',
  'not-trained-recently',
  'balance',
  'user-preference',
  'well-recovered',
  'specialisation',
] as const
export const musclePriorityReasonSchema = z.enum(MUSCLE_PRIORITY_REASONS)
export type MusclePriorityReason = z.infer<typeof musclePriorityReasonSchema>

export const musclePrioritySchema = z.looseObject({
  group: muscleGroupIdSchema,
  level: musclePriorityLevelSchema,
  reason: musclePriorityReasonSchema,
  /** Working sets this session aims to give the group. Warm-up sets excluded. */
  targetSets: z.number().int().min(0).max(40),
})

export type MusclePriority = KnownFields<z.infer<typeof musclePrioritySchema>>

/* ------------------------------------------------------------------ *
 * Explanation
 * ------------------------------------------------------------------ */

/**
 * Why the session looks like this. Every point carries a `code` and its structured
 * subjects, so Phase 4 diffs codes and Phase 5 renders `text` — neither has to
 * re-derive anything, and nobody parses a sentence back into facts.
 */
export const EXPLANATION_CODES = [
  'goal-emphasis',
  'muscle-priority',
  'weekly-volume-gap',
  'recent-exposure',
  'recovery',
  'readiness',
  'pain-avoidance',
  'equipment-limited',
  'location',
  'time-budget',
  'movement-pattern-balance',
  'progression-role',
  'exercise-preference',
  'superset-used',
  'drop-set-used',
  'circuit-used',
  'warm-up',
  'rest-length',
  'exercise-variety',
] as const
export const explanationCodeSchema = z.enum(EXPLANATION_CODES)
export type ExplanationCode = z.infer<typeof explanationCodeSchema>

export const EXPLANATION_WEIGHTS = ['major', 'supporting'] as const
export const explanationWeightSchema = z.enum(EXPLANATION_WEIGHTS)
export type ExplanationWeight = z.infer<typeof explanationWeightSchema>

export const explanationPointSchema = z.looseObject({
  code: explanationCodeSchema,
  /** Finished copy. Render it; never regex it. */
  text: z.string().min(1).max(200),
  weight: explanationWeightSchema,
  muscleGroups: z.array(muscleGroupIdSchema).max(8),
  /** Must name entries in this workout. */
  entryIds: z.array(generatedIdSchema).max(12),
  /** Must name blocks in this workout. */
  blockIds: z.array(generatedIdSchema).max(12),
})

export type ExplanationPoint = KnownFields<z.infer<typeof explanationPointSchema>>

export const workoutExplanationSchema = z.looseObject({
  /** One line a card can show on its own. */
  headline: z.string().min(1).max(160),
  points: z.array(explanationPointSchema).max(12),
})

export type WorkoutExplanation = KnownFields<z.infer<typeof workoutExplanationSchema>>

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

export const CONFIDENCE_LEVELS = ['low', 'moderate', 'high'] as const
export const confidenceLevelSchema = z.enum(CONFIDENCE_LEVELS)
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>

/** What is holding confidence down. Every one of these is absent-input honesty. */
export const CONFIDENCE_LIMITERS = [
  'no-workout-history',
  'no-progression-state',
  'unknown-weights',
  'limited-equipment',
  'short-time-budget',
  'recovery-unknown',
  'readiness-unknown',
  'pain-reported',
  'thin-catalog-coverage',
] as const
export const confidenceLimiterSchema = z.enum(CONFIDENCE_LIMITERS)
export type ConfidenceLimiter = z.infer<typeof confidenceLimiterSchema>

export const workoutConfidenceSchema = z.looseObject({
  level: confidenceLevelSchema,
  /** 0..1. The level is the rung; this is the number behind it. */
  score: z.number().min(0).max(1),
  limiters: z.array(confidenceLimiterSchema).max(9),
})

export type WorkoutConfidence = KnownFields<z.infer<typeof workoutConfidenceSchema>>

/* ------------------------------------------------------------------ *
 * Known compromises
 * ------------------------------------------------------------------ */

/**
 * WHAT THE SESSION GAVE UP.
 *
 * When the requested duration cannot hold the ideal session the generator says so
 * here, in structured form, rather than quietly producing less. An empty list is
 * a real claim: nothing was sacrificed.
 */
export const COMPROMISE_CODES = [
  'fewer-sets',
  'fewer-exercises',
  'muscle-group-dropped',
  'muscle-group-under-volume',
  'shorter-rest',
  'shorter-warm-up',
  'supersets-forced',
  'drop-sets-omitted',
  'pattern-imbalance',
  'accessory-dropped',
  'isolation-dropped',
  'second-choice-exercise',
  'equipment-substitute',
  'no-progression-data',
] as const
export const compromiseCodeSchema = z.enum(COMPROMISE_CODES)
export type CompromiseCode = z.infer<typeof compromiseCodeSchema>

export const COMPROMISE_SEVERITIES = ['minor', 'notable', 'significant'] as const
export const compromiseSeveritySchema = z.enum(COMPROMISE_SEVERITIES)
export type CompromiseSeverity = z.infer<typeof compromiseSeveritySchema>

export const knownCompromiseSchema = z.looseObject({
  code: compromiseCodeSchema,
  severity: compromiseSeveritySchema,
  /** Finished copy naming what was given up. */
  text: z.string().min(1).max(200),
  muscleGroups: z.array(muscleGroupIdSchema).max(8),
  entryIds: z.array(generatedIdSchema).max(12),
  blockIds: z.array(generatedIdSchema).max(12),
  /** Seconds this bought back, when the compromise was made for time. */
  secondsSaved: z.number().int().min(0).max(7200).nullable(),
})

export type KnownCompromise = KnownFields<z.infer<typeof knownCompromiseSchema>>

/* ------------------------------------------------------------------ *
 * The workout
 * ------------------------------------------------------------------ */

/**
 * A GENERATED SESSION.
 *
 * `plannedMinutes` is the budget the session was built to; for 15/30/45 it equals
 * the choice (enforced below), and for `'default'` it is the number the plan
 * produced. `estimatedMinutes` is what the built session is expected to take —
 * the two differ, and a screen that shows "45 min" must show `plannedMinutes`
 * while a screen that says "about 41 minutes" must show `estimatedMinutes`.
 */
export const workoutSchema = z
  .looseObject({
    schemaVersion: z.number().int().min(1),
    id: generatedIdSchema,
    generatedAt: isoTimestampSchema,
    forDate: calendarDateSchema,
    title: z.string().min(1).max(80),
    goal: goalSchema,
    /** The style the session was built in. Needed to rebuild it for a new duration. */
    trainingStyle: trainingStyleSchema,
    durationChoice: durationChoiceSchema,
    plannedMinutes: z.number().int().min(5).max(300),
    estimatedMinutes: z.number().int().min(1).max(300),
    musclePriorities: z.array(musclePrioritySchema).max(13),
    blocks: z.array(workoutBlockSchema).min(1).max(20),
    /** Optional circuits over `single` blocks. Empty when none were used. */
    circuits: z.array(circuitGroupSchema).max(4),
    warmUp: warmUpPlanSchema,
    explanation: workoutExplanationSchema,
    confidence: workoutConfidenceSchema,
    knownCompromises: z.array(knownCompromiseSchema).max(14),
    /** Which build of the generator produced this. Phase 4 refuses to diff across versions blindly. */
    generatorVersion: z.string().min(1).max(40),
    /** The explicit seed the caller supplied. Same seed plus same inputs, same session. */
    seed: z.string().min(1).max(120),
  })
  .superRefine((workout, ctx) => {
    const fixed = fixedDurationMinutes(workout.durationChoice)
    if (fixed !== null && workout.plannedMinutes !== fixed) {
      ctx.addIssue({
        code: 'custom',
        path: ['plannedMinutes'],
        message: `A ${fixed} minute choice must plan ${fixed} minutes, not ${workout.plannedMinutes}`,
      })
    }

    const blockIds = new Set<string>()
    const entryIds = new Set<string>()

    for (const [blockIndex, block] of workout.blocks.entries()) {
      if (blockIds.has(block.blockId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', blockIndex, 'blockId'],
          message: `Block id "${block.blockId}" is used twice`,
        })
      }
      blockIds.add(block.blockId)

      const entries = block.kind === 'superset' ? block.moves : [block.entry]

      for (const entry of entries) {
        if (entryIds.has(entry.entryId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['blocks', blockIndex],
            message: `Entry id "${entry.entryId}" is used twice`,
          })
        }
        entryIds.add(entry.entryId)

        const setIds = new Set<string>()
        for (const target of entry.targets) {
          if (setIds.has(target.setId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['blocks', blockIndex],
              message: `Set id "${target.setId}" is used twice in entry "${entry.entryId}"`,
            })
          }
          setIds.add(target.setId)
        }
        for (const record of entry.records) {
          if (!setIds.has(record.setId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['blocks', blockIndex],
              message: `Entry "${entry.entryId}" logs set "${record.setId}", which it does not program`,
            })
          }
        }
      }

      if (block.kind === 'superset') {
        const [first, second] = block.moves
        if (first.exerciseId === second.exerciseId) {
          ctx.addIssue({
            code: 'custom',
            path: ['blocks', blockIndex, 'moves'],
            message: 'A superset pairs two different exercises',
          })
        }
        for (const [moveIndex, move] of block.moves.entries()) {
          if (move.targets.some((target) => target.kind === 'warm-up')) {
            ctx.addIssue({
              code: 'custom',
              path: ['blocks', blockIndex, 'moves', moveIndex, 'targets'],
              message: 'A superset move carries no warm-up sets; ramp sets belong to the warm-up plan',
            })
          }
          if (move.targets.length !== block.rounds) {
            ctx.addIssue({
              code: 'custom',
              path: ['blocks', blockIndex, 'moves', moveIndex, 'targets'],
              message: `A round advances both moves: ${block.rounds} rounds needs ${block.rounds} targets, found ${move.targets.length}`,
            })
          }
        }
      }
    }

    const circuited = new Set<string>()
    for (const [circuitIndex, circuit] of workout.circuits.entries()) {
      for (const blockId of circuit.blockIds) {
        const block = workout.blocks.find((candidate) => candidate.blockId === blockId)
        if (!block) {
          ctx.addIssue({
            code: 'custom',
            path: ['circuits', circuitIndex, 'blockIds'],
            message: `Circuit names block "${blockId}", which is not in this workout`,
          })
          continue
        }
        if (block.kind !== 'single') {
          ctx.addIssue({
            code: 'custom',
            path: ['circuits', circuitIndex, 'blockIds'],
            message: `A circuit station is a single exercise; block "${blockId}" is a superset`,
          })
          continue
        }
        if (circuited.has(blockId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['circuits', circuitIndex, 'blockIds'],
            message: `Block "${blockId}" is already in another circuit`,
          })
        }
        circuited.add(blockId)

        const rounds = block.entry.targets.filter((target) => target.kind !== 'warm-up').length
        if (rounds !== circuit.rounds) {
          ctx.addIssue({
            code: 'custom',
            path: ['circuits', circuitIndex, 'rounds'],
            message: `Block "${blockId}" programs ${rounds} working sets, but the circuit runs ${circuit.rounds} rounds`,
          })
        }
      }
    }

    for (const entryId of workout.warmUp.rampedEntryIds) {
      const entry = workout.blocks
        .flatMap((block) => (block.kind === 'superset' ? [...block.moves] : [block.entry]))
        .find((candidate) => candidate.entryId === entryId)
      if (!entry) {
        ctx.addIssue({
          code: 'custom',
          path: ['warmUp', 'rampedEntryIds'],
          message: `Warm-up names entry "${entryId}", which is not in this workout`,
        })
      } else if (!entry.targets.some((target) => target.kind === 'warm-up')) {
        ctx.addIssue({
          code: 'custom',
          path: ['warmUp', 'rampedEntryIds'],
          message: `Entry "${entryId}" is listed as ramped but programs no warm-up sets`,
        })
      }
    }

    const referenced: {
      label: string
      path: (string | number)[]
      entryIds: readonly string[]
      blockIds: readonly string[]
    }[] = [
      ...workout.explanation.points.map((point, index) => ({
        label: 'Explanation point',
        path: ['explanation', 'points', index] as (string | number)[],
        entryIds: point.entryIds,
        blockIds: point.blockIds,
      })),
      ...workout.knownCompromises.map((compromise, index) => ({
        label: 'Compromise',
        path: ['knownCompromises', index] as (string | number)[],
        entryIds: compromise.entryIds,
        blockIds: compromise.blockIds,
      })),
    ]

    for (const reference of referenced) {
      for (const entryId of reference.entryIds) {
        if (!entryIds.has(entryId)) {
          ctx.addIssue({
            code: 'custom',
            path: reference.path,
            message: `${reference.label} names entry "${entryId}", which is not in this workout`,
          })
        }
      }
      for (const blockId of reference.blockIds) {
        if (!blockIds.has(blockId)) {
          ctx.addIssue({
            code: 'custom',
            path: reference.path,
            message: `${reference.label} names block "${blockId}", which is not in this workout`,
          })
        }
      }
    }
  })

/**
 * The generated session. `blocks` is restated so the two-move superset guarantee
 * survives `KnownFields`, which would otherwise widen the tuple inside it.
 */
export type Workout = Omit<KnownFields<z.infer<typeof workoutSchema>>, 'blocks'> & {
  readonly blocks: readonly WorkoutBlock[]
}

/* ------------------------------------------------------------------ *
 * Recalibration metadata — the generator's decision trace
 * ------------------------------------------------------------------ */

/** The stages of generation, in the order they run. */
export const GENERATION_STEPS = [
  'resolve-duration',
  'muscle-priorities',
  'exercise-selection',
  'set-and-rep-scheme',
  'rest-scheme',
  'ordering',
  'superset',
  'drop-set',
  'circuit',
  'warm-up',
  'time-fit',
  'explanation',
] as const
export const generationStepSchema = z.enum(GENERATION_STEPS)
export type GenerationStep = z.infer<typeof generationStepSchema>

/** One thing the generator decided, and what it decided it about. */
export const generationDecisionSchema = z.looseObject({
  step: generationStepSchema,
  /** Finished copy. One decision, one line. */
  text: z.string().min(1).max(200),
  muscleGroups: z.array(muscleGroupIdSchema).max(8),
  entryIds: z.array(generatedIdSchema).max(12),
  blockIds: z.array(generatedIdSchema).max(12),
  /**
   * The seed-derived index used where variety was wanted, so two generations that
   * differ only by seed can be told apart from two that differ by input.
   */
  varietyIndex: z.number().int().min(0).max(1_000_000).nullable(),
})

export type GenerationDecision = KnownFields<z.infer<typeof generationDecisionSchema>>

/** The time arithmetic, so Phase 4 need not re-estimate to diff two generations. */
export const timeBudgetSchema = z.looseObject({
  budgetSeconds: z.number().int().min(0).max(18_000),
  warmUpSeconds: z.number().int().min(0).max(18_000),
  workSeconds: z.number().int().min(0).max(18_000),
  restSeconds: z.number().int().min(0).max(18_000),
  /** Getting to and setting up the next thing. */
  transitionSeconds: z.number().int().min(0).max(18_000),
  estimatedSeconds: z.number().int().min(0).max(18_000),
  /** Budget minus estimate. Negative means the session overruns on purpose. */
  headroomSeconds: z.number().int().min(-18_000).max(18_000),
})

export type TimeBudget = KnownFields<z.infer<typeof timeBudgetSchema>>

/** Planned against known, per muscle group. Every "known" field is nullable. */
export const volumePlanEntrySchema = z.looseObject({
  group: muscleGroupIdSchema,
  /** Working sets this session gives the group. */
  plannedSets: z.number().int().min(0).max(60),
  /** The weekly target, when a plan supplied one. */
  weeklyTargetSets: z.number().int().min(0).max(200).nullable(),
  /** Sets already done this week, when history supplied them. */
  weeklySetsSoFar: z.number().int().min(0).max(200).nullable(),
  /** Whole days since the group was last trained. `null` when unknown. */
  lastTrainedDaysAgo: z.number().int().min(0).max(365).nullable(),
})

export type VolumePlanEntry = KnownFields<z.infer<typeof volumePlanEntrySchema>>

export const patternBalanceEntrySchema = z.looseObject({
  pattern: movementPatternIdSchema,
  count: z.number().int().min(0).max(20),
})

export type PatternBalanceEntry = KnownFields<z.infer<typeof patternBalanceEntrySchema>>

/** Why a candidate did not make the session. Coarse on purpose — the ranker owns detail. */
export const REJECTION_STAGES = ['excluded', 'conflict', 'outranked', 'no-time', 'volume-met'] as const
export const rejectionStageSchema = z.enum(REJECTION_STAGES)
export type RejectionStage = z.infer<typeof rejectionStageSchema>

export const rejectedCandidateSchema = z.looseObject({
  exerciseId: workoutExerciseIdSchema,
  stage: rejectionStageSchema,
  text: z.string().min(1).max(200),
})

export type RejectedCandidate = KnownFields<z.infer<typeof rejectedCandidateSchema>>

/** Which optional inputs actually arrived. A diff must not mistake absent for changed. */
export const GENERATOR_INPUT_FLAGS = [
  'weekly-plan',
  'recent-workouts',
  'weekly-muscle-volume',
  'recent-muscle-exposure',
  'recovery',
  'readiness',
  'pain',
  'preferences',
  'progression-state',
  'training-frequency',
] as const
export const generatorInputFlagSchema = z.enum(GENERATOR_INPUT_FLAGS)
export type GeneratorInputFlag = z.infer<typeof generatorInputFlagSchema>

/**
 * WHAT THE GENERATOR DECIDED AND WHY, in a shape two generations can be diffed
 * in. It sits BESIDE the workout rather than inside it: the workout is what a
 * person performs, this is the audit trail behind it. Both are persisted
 * together by `workoutRepository`.
 */
export const recalibrationMetadataSchema = z.looseObject({
  generatorVersion: z.string().min(1).max(40),
  seed: z.string().min(1).max(120),
  durationChoice: durationChoiceSchema,
  inputsPresent: z.array(generatorInputFlagSchema).max(GENERATOR_INPUT_FLAGS.length),
  decisions: z.array(generationDecisionSchema).max(120),
  timeBudget: timeBudgetSchema,
  volumePlan: z.array(volumePlanEntrySchema).max(13),
  patternBalance: z.array(patternBalanceEntrySchema).max(23),
  rejected: z.array(rejectedCandidateSchema).max(60),
})

export type RecalibrationMetadata = KnownFields<z.infer<typeof recalibrationMetadataSchema>>

/* ------------------------------------------------------------------ *
 * The durable record
 * ------------------------------------------------------------------ */

/**
 * THE ROW IN THE `workouts` STORE.
 *
 * Keyed by `id`, which equals `workout.id` — checked below, because a row whose
 * key disagreed with its content would read back as a different session. `forDate`
 * is lifted out of the workout so the store can index by day without opening
 * every record.
 *
 * A generated session is DURABLE DATA, not a setting: it never goes near
 * localStorage.
 */
export const generatedWorkoutRecordSchema = z
  .looseObject({
    schemaVersion: z.number().int().min(1),
    id: generatedIdSchema,
    /** Indexed. Mirrors `workout.forDate`. */
    forDate: calendarDateSchema,
    /** When this row was written, which is not when the workout was generated. */
    savedAt: isoTimestampSchema,
    workout: workoutSchema,
    recalibration: recalibrationMetadataSchema.nullable(),
  })
  .superRefine((record, ctx) => {
    if (record.id !== record.workout.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `The record key "${record.id}" does not match the workout it holds ("${record.workout.id}")`,
      })
    }
    if (record.forDate !== record.workout.forDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['forDate'],
        message: `The record date "${record.forDate}" does not match the workout's ("${record.workout.forDate}")`,
      })
    }
    if (record.schemaVersion > WORKOUT_SCHEMA_VERSION) {
      ctx.addIssue({
        code: 'custom',
        path: ['schemaVersion'],
        message: `Record is workout schema version ${record.schemaVersion}; this build understands ${WORKOUT_SCHEMA_VERSION}`,
      })
    }
  })

export type GeneratedWorkoutRecord = Omit<
  KnownFields<z.infer<typeof generatedWorkoutRecordSchema>>,
  'workout'
> & { readonly workout: Workout }

/** Wraps a generated workout as the row that will be stored. */
export function toWorkoutRecord(
  workout: Workout,
  savedAt: string,
  recalibration: RecalibrationMetadata | null = null,
): GeneratedWorkoutRecord {
  return {
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    id: workout.id,
    forDate: workout.forDate,
    savedAt,
    workout,
    recalibration,
  }
}

/* ------------------------------------------------------------------ *
 * THE CANONICAL LIST ROW
 * ------------------------------------------------------------------ */

/** What separates the two names of a superset row. One place, so it cannot drift. */
export const SUPERSET_TITLE_SEPARATOR = ' + '

export const ROW_STATUSES = ['not-started', 'in-progress', 'complete'] as const
export type RowStatus = (typeof ROW_STATUSES)[number]

/**
 * How far through a row the person is.
 *
 * A SUPERSET ROW IS COMPLETE ONLY WHEN BOTH MOVES ARE. That single rule is why
 * the list can never show one member as if the other were still an outstanding
 * required exercise: there is no per-move row to be out of step with.
 */
export interface RowProgress {
  readonly status: RowStatus
  /** Targets across every entry in the row. */
  readonly targetCount: number
  /** Targets that have at least one record against them. */
  readonly resolvedCount: number
  /** For a superset: rounds fully done by BOTH moves. `null` for a single. */
  readonly roundsComplete: number | null
  /** For a superset: the block's round count. `null` for a single. */
  readonly roundsPlanned: number | null
}

/**
 * ONE ROW OF THE ACTIVE WORKOUT LIST — one per block, never one per exercise.
 *
 * Derived by `workoutListRows()`. Nothing stores it, so it cannot drift from the
 * blocks it describes.
 */
export interface WorkoutListRow {
  /** The block's id. The row IS the block. */
  readonly rowId: string
  readonly kind: WorkoutBlock['kind']
  /** 1-based position in the session. */
  readonly position: number
  /** Both moves for a superset, in order. One entry for a single. */
  readonly entryIds: readonly string[]
  readonly exerciseIds: readonly string[]
  /** Names both moves for a superset: `Bench press + Seated row`. */
  readonly title: string
  /** Set or round counts. Structured numbers only — no exercise names in here. */
  readonly detail: string
  readonly estimatedSeconds: number
  /** The circuit this block is a station of, or `null`. */
  readonly circuitId: string | null
  readonly progress: RowProgress
}

function repText(reps: RepTarget): string {
  const amount = reps.min === reps.max ? `${reps.min}` : `${reps.min}-${reps.max}`
  return reps.unit === 'seconds' ? `${amount} sec` : `${amount} reps`
}

function singleDetail(entry: ExerciseEntry): string {
  const working = workingSets(entry.targets)
  const shown = working.length > 0 ? working : entry.targets
  const count = shown.length
  const unit = count === 1 ? 'set' : 'sets'
  const first = shown[0]
  const uniform = shown.every(
    (target) => target.reps.min === first.reps.min && target.reps.max === first.reps.max,
  )
  const warmUps = entry.targets.length - working.length
  const rampNote = working.length > 0 && warmUps > 0 ? ` · ${warmUps} warm-up` : ''
  return uniform ? `${count} ${unit} · ${repText(first.reps)}${rampNote}` : `${count} ${unit}${rampNote}`
}

function supersetDetail(block: SupersetBlock): string {
  const rounds = `${block.rounds} ${block.rounds === 1 ? 'round' : 'rounds'}`
  const [first, second] = block.moves
  return `${rounds} · ${repText(first.targets[0].reps)} / ${repText(second.targets[0].reps)}`
}

function progressFor(block: WorkoutBlock): RowProgress {
  const entries = blockEntries(block)
  const targetCount = entries.reduce((total, entry) => total + entry.targets.length, 0)
  const resolvedCount = entries.reduce((total, entry) => total + resolvedTargetCount(entry), 0)

  const status: RowStatus =
    resolvedCount === 0 ? 'not-started' : resolvedCount >= targetCount ? 'complete' : 'in-progress'

  if (!isSupersetBlock(block)) {
    return { status, targetCount, resolvedCount, roundsComplete: null, roundsPlanned: null }
  }

  // A round is done only when BOTH moves have answered it, so the slower move sets
  // the pace. Counting each move separately is exactly the bug this model exists
  // to prevent.
  const perMove = block.moves.map((move) => resolvedTargetCount(move))
  return {
    status,
    targetCount,
    resolvedCount,
    roundsComplete: Math.min(...perMove),
    roundsPlanned: block.rounds,
  }
}

/**
 * THE ONE READABLE ROW PER BLOCK.
 *
 * One row per block, in session order. A superset yields ONE row naming BOTH
 * moves and carrying both entry ids — so the Active Workout List can never show
 * one member of a pair as if the other were a separate outstanding exercise, and
 * a tap on the row can open both.
 *
 * `nameOf` is how a screen that has the catalog loaded supplies real names.
 * Screens on the boot path have not — the catalog is a lazy chunk — so the
 * fallback humanises the id, exactly as `exercisePreferenceNames` does. That is a
 * display fallback and never a stored value.
 */
export function workoutListRows(
  workout: Workout,
  nameOf?: (exerciseId: string) => string | null,
): WorkoutListRow[] {
  const circuitOf = new Map<string, string>()
  for (const circuit of workout.circuits) {
    for (const blockId of circuit.blockIds) circuitOf.set(blockId, circuit.circuitId)
  }

  const name = (id: string) => nameOf?.(id) ?? humaniseExerciseId(id)

  return workout.blocks.map((block, index) => {
    const entries = blockEntries(block)
    return {
      rowId: block.blockId,
      kind: block.kind,
      position: index + 1,
      entryIds: entries.map((entry) => entry.entryId),
      exerciseIds: entries.map((entry) => entry.exerciseId),
      title: entries.map((entry) => name(entry.exerciseId)).join(SUPERSET_TITLE_SEPARATOR),
      detail: isSupersetBlock(block) ? supersetDetail(block) : singleDetail(block.entry),
      estimatedSeconds: block.estimatedSeconds,
      circuitId: circuitOf.get(block.blockId) ?? null,
      progress: progressFor(block),
    }
  })
}

/** The row a given entry belongs to. A superset move finds the pair's single row. */
export function rowForEntry(rows: readonly WorkoutListRow[], entryId: string): WorkoutListRow | undefined {
  return rows.find((row) => row.entryIds.includes(entryId))
}

/** Total working sets in the session. Warm-up ramps excluded, by definition. */
export function totalWorkingSets(workout: Workout): number {
  return workoutEntries(workout).reduce((total, entry) => total + workingSets(entry.targets).length, 0)
}

/* ------------------------------------------------------------------ *
 * Validators
 * ------------------------------------------------------------------ */

/**
 * The generated-session validators.
 *
 * They live HERE rather than in `validate.ts` on purpose. `validate.ts` is on the
 * boot path — every launch parses a profile through it — and nothing shown before
 * a person opens a session needs the workout model. Keeping the import pointing
 * this way, and never back, is what holds this file off the first-paint chunk.
 *
 * There is no separate integrity pass as there is for the profile: the schemas
 * above carry their own cross-field rules (the two-move superset contract,
 * round-for-round targets, ids that must resolve), so the schema IS the whole
 * rule. The cast restores the exact type, whose superset tuple `z.infer` widens.
 */
export const workoutValidator: Validator<Workout> = {
  validate(value) {
    const parsed = schemaValidator(workoutSchema).validate(value)
    if (!parsed.ok) return parsed
    return { ok: true, value: parsed.value as unknown as Workout }
  },
}

/** The validator the `workouts` store writes through. */
export const workoutRecordValidator: Validator<GeneratedWorkoutRecord> = {
  validate(value) {
    const parsed = schemaValidator(generatedWorkoutRecordSchema).validate(value)
    if (!parsed.ok) return parsed
    return { ok: true, value: parsed.value as unknown as GeneratedWorkoutRecord }
  },
}

/** Convenience wrapper for one-off checks. */
export function parseWorkout(value: unknown): ValidationResult<Workout> {
  return workoutValidator.validate(value)
}
