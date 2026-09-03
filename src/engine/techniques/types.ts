import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { LocationSuitability, StationId, TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { ConflictKind, ConflictSeverity, SupersetRule } from '../conflicts/conflictTypes'
import type { TechniquePermissions } from '../conflicts/conflictContext'
import type { Experience, Goal, TrainingStyle } from '../../core/validation/schemas'
import type { DropSetIntent, EntryPriority, SupersetRationale } from '../../core/validation/workoutSchema'
import type { TechniquePolicy } from './policy'

/**
 * SUPERSETS, DROP SETS AND CIRCUITS — THE VOCABULARY.
 *
 * NOTHING HERE CHANGES A SESSION. Every function in this folder returns
 * PROPOSALS: typed suggestions carrying why they were made and what they cost or
 * save. The generator owns the session and decides what to accept on its own time
 * budget; a proposal engine that edited the plan would be a second owner of the
 * plan. That is also why a proposal names slots by id and never returns blocks —
 * assembling a `SupersetBlock` is the generator's job, from the numbers here.
 *
 * NONE OF THE THREE IS AUTOMATICALLY BETTER. A superset is not a free minute, a
 * drop set is not extra effort for nothing, and a circuit is not a fitter way to
 * train. Each is worth proposing only in the conditions its rules name, and the
 * REJECTIONS are as much of the output as the proposals: they are what lets the
 * generator (and Phase 5's explanation) say why a technique the user switched ON
 * was not used today.
 *
 * ALL THREE ARE USER-GATED. `techniques.supersets`, `.dropSets` and `.circuits`
 * come off the profile. A technique that is off is never proposed, and the
 * rejection says so once for the whole technique rather than once per pair.
 *
 * THE CONFLICT ENGINE IS ASKED, NOT REIMPLEMENTED. Whether two exercises may be
 * supersetted at all is `src/engine/conflicts`' question and it already answers
 * it — same station, both grip-heavy, competing demands, two heavy compounds,
 * shared joint stress, station hopping. This folder adds only the judgements the
 * engine has no opinion on: whether a legal pairing is WORTH it.
 *
 * PURE AND DETERMINISTIC. No React, no storage, no `Date.now()`, no
 * `Math.random()`. Every walk is over an array in session order, so the same
 * context always produces byte-identical proposals in the same order.
 */

/* ------------------------------------------------------------------ *
 * Which technique a proposal or rejection is about
 * ------------------------------------------------------------------ */

export const TECHNIQUE_KINDS = ['superset', 'drop-set', 'circuit'] as const
export type TechniqueKind = (typeof TECHNIQUE_KINDS)[number]

/* ------------------------------------------------------------------ *
 * What the generator hands in
 * ------------------------------------------------------------------ */

/**
 * ONE PLACED EXERCISE, as a technique proposer needs to see it.
 *
 * It is deliberately NOT `ExerciseEntry`. An entry is the durable record with its
 * targets, records and replacements; the question here is asked BEFORE targets
 * exist, from the plan alone. `slotId` is whatever the generator calls the slot —
 * an entry id later, an internal id now — and comes straight back on the proposal.
 */
export interface TechniqueCandidate {
  /** Identifies the slot, not the exercise: the same exercise may appear twice. */
  readonly slotId: string
  readonly exercise: Exercise
  /** How much the session depends on this slot. Mirrors `EntryPriority`. */
  readonly priority: EntryPriority
  /** The role the generator assigned. `primary-*` roles are the session's anchors. */
  readonly role: TrainingRole
  /** Working sets planned. Ramp sets are not counted and are never supersetted. */
  readonly plannedSets: number
  /** Rest programmed between this slot's straight sets, in seconds. */
  readonly restSeconds: number
  /** 0-based position in the session, so "a later priority lift" is answerable. */
  readonly position: number
}

/** Weekly volume still owed to a muscle group. `0` means the target is met. */
export interface MuscleVolumeNeed {
  readonly group: MuscleGroupId
  readonly setsRemaining: number
}

/**
 * HOW LONG A SET'S WORK TAKES — an injection point, not a duration model.
 *
 * Phase 3's duration engine owns time estimation. Two of the rules here need a
 * number anyway: a drop set is only worth proposing when it delivers volume more
 * cheaply than another straight set would, and that is a comparison of seconds.
 * So the estimator is INJECTED, with a documented default below, exactly as
 * `engine/alternatives/estimate.ts` does it. When the duration engine lands, pass
 * it in and delete nothing here but this paragraph.
 */
export interface WorkSecondsInput {
  readonly exercise: Exercise
  /**
   * Reps (or seconds, per the exercise's `repUnit`) to charge for. `null` asks
   * for the exercise's own typical range midpoint.
   */
  readonly reps: number | null
}

export type WorkSecondsEstimator = (input: WorkSecondsInput) => number

/* ------------------------------------------------------------------ *
 * The context
 * ------------------------------------------------------------------ */

/**
 * Everything the proposers are allowed to know. A plain, serialisable value: no
 * store, no clock, no React.
 *
 * WHY RECOVERY POINTS THE WAY IT DOES. `systemicRecovery` is 0 (spent) to 1
 * (fresh) — the same direction as the generator's `RecoveryState.systemic` and
 * the OPPOSITE of the alternatives ranker's `FatigueState`. The generator is this
 * module's caller, so it matches the generator; reusing the ranker's inverted
 * scale would have made "fatigue supports a circuit" mean its own negation.
 *
 * `null` on any measurement means NOT MEASURED, and is handled explicitly by each
 * rule rather than defaulted to a number nobody supplied. There is no history and
 * no recovery model in the product until Phases 6 and 7, so `null` is the normal
 * case today and every rule below has to behave sensibly under it.
 */
export interface TechniqueContext {
  /** The placed session, in performance order. */
  readonly candidates: readonly TechniqueCandidate[]
  /** Straight off the profile. A technique that is off is never proposed. */
  readonly techniques: TechniquePermissions
  readonly style: TrainingStyle
  readonly goal: Goal
  readonly experience: Experience
  /** `null` for a location of no fixed kind — nothing may be concluded about it. */
  readonly location: LocationSuitability | null
  /** Every equipment id present where they are. The circuit rules' safety net. */
  readonly availableEquipment: readonly EquipmentId[]
  /** Seconds the session is allowed, or `null` when no clock is being fitted. */
  readonly timeBudgetSeconds: number | null
  /** Seconds the session as planned is expected to take. */
  readonly estimatedSeconds: number
  /** What the person said about time pressure, 0..1. `null` when not asked. */
  readonly timePressure: number | null
  /** Weekly volume still owed. `null` until Phase 6 supplies it. */
  readonly muscleVolumeNeed: readonly MuscleVolumeNeed[] | null
  /** 0 spent .. 1 fresh. `null` until Phase 6 supplies it. */
  readonly systemicRecovery: number | null
  readonly estimateWorkSeconds: WorkSecondsEstimator
  readonly policy: TechniquePolicy
}

/** What a caller passes. Everything but the candidates has a documented default. */
export interface TechniqueContextInput {
  readonly candidates?: readonly TechniqueCandidate[]
  readonly techniques?: Partial<TechniquePermissions>
  readonly style?: TrainingStyle
  readonly goal?: Goal
  readonly experience?: Experience
  readonly location?: LocationSuitability | null
  readonly availableEquipment?: readonly EquipmentId[]
  readonly timeBudgetSeconds?: number | null
  readonly estimatedSeconds?: number
  readonly timePressure?: number | null
  readonly muscleVolumeNeed?: readonly MuscleVolumeNeed[] | null
  readonly systemicRecovery?: number | null
  readonly estimateWorkSeconds?: WorkSecondsEstimator
  readonly policy?: Partial<TechniquePolicy>
}

/* ------------------------------------------------------------------ *
 * Why a technique WAS proposed
 * ------------------------------------------------------------------ */

/**
 * The reasons a proposal carries. Structured first, prose second: a screen reads
 * the `code`, and the `text` is there so a row that only needs a line can take one
 * without parsing a sentence back into facts. Never regex a `text`.
 */
export const TECHNIQUE_REASON_CODES = [
  'saves-time',
  'time-pressure',
  'antagonist-pairing',
  'no-muscle-overlap',
  'accessory-work',
  'quick-transition',
  'separate-stations',
  'grip-unaffected',
  'volume-still-owed',
  'hypertrophy-focus',
  'simple-to-strip',
  'goal-suits-circuit',
  'recovered-enough',
] as const

export type TechniqueReasonCode = (typeof TECHNIQUE_REASON_CODES)[number]

export interface TechniqueReason {
  readonly code: TechniqueReasonCode
  /** Short, finished copy. Render it as-is; read the code to act on it. */
  readonly text: string
}

/* ------------------------------------------------------------------ *
 * Why a technique was NOT proposed
 * ------------------------------------------------------------------ */

/**
 * Every reason a technique is left alone, in the order the rules run.
 *
 * THE FIRST CODE THAT FIRES IS THE ONE REPORTED, so a pairing that is wrong four
 * ways is explained by the cheapest, most concrete one — the same choice the
 * alternatives ranker makes for its exclusions. Order is therefore not decoration:
 * disabled beats unsafe, unsafe beats "would not save much".
 */
export const TECHNIQUE_REJECTION_CODES = [
  /* -- gates that apply to the whole technique ---------------------- */
  'technique-disabled',
  'not-enough-candidates',
  'strength-session',
  'goal-does-not-suit-circuits',
  'fatigue-too-high',

  /* -- what THE conflict engine says, asked before any judgement ---- */
  'blocked-by-conflict',
  'weakens-pairing',

  /* -- what may never be touched ------------------------------------ */
  'protects-priority-lift',
  'compromises-later-priority',

  /* -- what the person can be asked to do --------------------------- */
  'beyond-experience',
  'too-many-compounds-for-experience',

  /* -- structure ---------------------------------------------------- */
  'too-few-rounds',
  'shares-muscle-with-member',
  'same-station',
  'scarce-station',
  'transition-too-costly',
  'equipment-unavailable',
  'too-few-members',
  'circuit-already-full',

  /* -- drop-set specifics ------------------------------------------- */
  'unsafe-for-drop-set',
  'no-load-to-drop',
  'not-a-hypertrophy-context',
  'strength-priority-slot',
  'no-time-pressure',
  'volume-already-met',
  'setup-too-complex',
  'enough-drop-sets-already',

  /* -- the last two questions asked --------------------------------- */
  'saves-too-little-time',
  'too-far-apart',
] as const

export type TechniqueRejectionCode = (typeof TECHNIQUE_REJECTION_CODES)[number]

/**
 * One technique not taken, and why.
 *
 * `slotIds` names what the rejection is about: both halves of a rejected pairing,
 * the one slot a drop set was declined on, every candidate member of a circuit
 * that did not form, or an empty list for a whole-technique gate.
 */
export interface TechniqueRejection {
  readonly technique: TechniqueKind
  readonly code: TechniqueRejectionCode
  readonly slotIds: readonly string[]
  /** Short, finished copy naming the rule, never an exercise name. */
  readonly text: string
  /** Set when the conflict engine produced the rejection, `null` otherwise. */
  readonly conflictKind: ConflictKind | null
  readonly conflictRule: SupersetRule | null
  readonly conflictSeverity: ConflictSeverity | null
}

/* ------------------------------------------------------------------ *
 * What a technique costs, or saves
 * ------------------------------------------------------------------ */

/**
 * THE TIME ARITHMETIC, EXPOSED RATHER THAN SUMMARISED.
 *
 * The generator accepts or rejects a proposal on its time budget, so it needs the
 * numbers, not a verdict. `beforeSeconds` and `afterSeconds` cover the SAME
 * stretch of the session either way — the sets the technique touches — so
 * `savedSeconds` is exactly their difference and can be added to a running budget
 * without double-counting anything.
 *
 * Work time is unchanged by a superset or a circuit: the same sets are performed,
 * the rest between them is what moves. A drop set is the exception and is the
 * reason `addedSeconds` exists: it adds real work, and its case is that an equal
 * amount of volume as another straight set would have cost more.
 */
export interface TimeEffect {
  /** What this stretch costs as ordinary straight sets. */
  readonly beforeSeconds: number
  /** What it costs with the technique applied. */
  readonly afterSeconds: number
  /** `beforeSeconds - afterSeconds`. Negative when the technique costs time. */
  readonly savedSeconds: number
  /** Seconds of extra work the technique introduces. `0` for a superset. */
  readonly addedSeconds: number
}

/* ------------------------------------------------------------------ *
 * The proposals
 * ------------------------------------------------------------------ */

interface ProposalBase {
  readonly technique: TechniqueKind
  /** 0-100. Higher is a better use of the technique HERE; not a quality grade. */
  readonly score: number
  /** Strongest first. Never empty — a proposal with no reason is not a proposal. */
  readonly reasons: readonly [TechniqueReason, ...TechniqueReason[]]
  readonly timeEffect: TimeEffect
  /** One line combining the leading reason and the saving, for a compact row. */
  readonly summary: string
}

/**
 * PAIR TWO SLOTS INTO ONE TWO-MOVE BLOCK.
 *
 * `firstSlotId` and `secondSlotId` are in the order the moves are performed within
 * a round, and that order is the two slots' own session order — a proposal never
 * reverses what the generator decided about which lift comes first.
 *
 * `rounds` is `min(plannedSets)` across the two. When one slot planned more sets
 * than the other, the remainder is reported in `unpairedSets` rather than quietly
 * dropped: the session model requires each move to carry exactly `rounds` targets,
 * so the generator must place those leftover sets itself or accept fewer.
 */
export interface SupersetProposal extends ProposalBase {
  readonly technique: 'superset'
  readonly firstSlotId: string
  readonly secondSlotId: string
  readonly rounds: number
  /** Sets left over on the longer slot, if any. Empty in the usual case. */
  readonly unpairedSets: readonly { readonly slotId: string; readonly sets: number }[]
  readonly restBetweenMovesSeconds: number
  readonly restAfterRoundSeconds: number
  /** The session model's own vocabulary, so the block can be stamped with it. */
  readonly rationale: SupersetRationale
  /** How many slots apart the two sit today. `1` is adjacent; > 1 needs a reorder. */
  readonly slotDistance: number
  /** True when accepting this means moving the two slots together. */
  readonly reorderRequired: boolean
}

/**
 * HANG A DROP SET OFF ONE SLOT'S LAST WORKING SET.
 *
 * A drop set is a TIME-EFFICIENT HYPERTROPHY TOOL, not a default intensifier: it
 * buys close to another set's worth of stimulus for a fraction of another set's
 * worth of clock. `intent` is the session model's own `DropSetIntent`, ready to
 * be written onto the parent `SetTarget`.
 */
export interface DropSetProposal extends ProposalBase {
  readonly technique: 'drop-set'
  readonly slotId: string
  /** 0-based index of the working set the drops hang off — always the last one. */
  readonly setIndex: number
  readonly intent: DropSetIntent
  /** Roughly how many straight sets' worth of stimulus this stands in for. */
  readonly equivalentStraightSets: number
}

/**
 * RUN A GROUP OF SLOTS AS A CIRCUIT.
 *
 * Members are slots that will be `single` blocks; the session model puts a circuit
 * OVER blocks rather than making it a third block kind, so nothing here merges two
 * slots into one. `blockIds` on the eventual `CircuitGroup` are these slots'
 * blocks, in this order.
 */
export interface CircuitProposal extends ProposalBase {
  readonly technique: 'circuit'
  /** Two to `policy.maxCircuitMembers`, in the order the stations are visited. */
  readonly memberSlotIds: readonly string[]
  readonly rounds: number
  readonly restBetweenStationsSeconds: number
  readonly restAfterRoundSeconds: number
  /** The stations the circuit ties up for its whole duration. */
  readonly stations: readonly StationId[]
}

/* ------------------------------------------------------------------ *
 * The result
 * ------------------------------------------------------------------ */

/** What one proposer returns: what it suggests, and what it declined and why. */
export interface TechniqueFindings<TProposal> {
  /** Best first. Ties broken by slot id, so the order is total and stable. */
  readonly proposals: readonly TProposal[]
  readonly rejections: readonly TechniqueRejection[]
}

/** All three techniques, considered together. Nothing here mutates a session. */
export interface TechniqueProposals {
  readonly supersets: readonly SupersetProposal[]
  readonly dropSets: readonly DropSetProposal[]
  readonly circuits: readonly CircuitProposal[]
  /** Every rejection from all three proposers, in technique order. */
  readonly rejections: readonly TechniqueRejection[]
}
