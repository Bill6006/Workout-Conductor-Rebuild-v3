import { orderedScale } from '../../catalog/taxonomy/scales'
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { MuscleGroupId, MuscleId } from '../../catalog/muscles/muscles'
import type { JointStressTagId } from '../../catalog/taxonomy/joints'
import type {
  LimitationFlag,
  LocationSuitability,
  ProgressionFamilyId,
  StationId,
  TrainingRole,
} from '../../catalog/taxonomy/taxonomy'

/**
 * THE conflict vocabulary. One kind per reason a session can be wrong, one
 * severity scale, one shape.
 *
 * EVERY CONFLICT IS DETECTED FROM STRUCTURED METADATA. Not one rule in this
 * folder compares an exercise NAME, an alias, or any other prose. A rule that
 * cannot be expressed from ids, enums, and numbers is a missing catalog FIELD,
 * never a string comparison — a name match is wrong the first time somebody
 * relabels an exercise, and wrong in a way no test would notice.
 *
 * A CONFLICT IS DATA, NOT A DECISION. It says what is true and how much it
 * matters; what to DO about it belongs to the caller. Phase 3's generator will
 * refuse `blocking`, re-roll on `strong`, and quietly accept `advisory`. Phase 5's
 * alternatives list will rank by the same three rungs. Neither behaviour is
 * encoded here, which is what lets the same detection serve both.
 *
 * `reason` IS FINISHED COPY. A UI renders it verbatim — no template to fill, no
 * lookup to do. Every vocabulary word inside it comes from the catalog's label
 * catalogue (see `./conflictReasons`), so a joint or a station is named the same
 * here as it is everywhere else in the product.
 *
 * `detail` IS THE MACHINE-READABLE HALF. It carries the specifics — which joint,
 * which equipment ids, how far over the limit — so a caller can act on a conflict
 * (offer the missing kit, suggest a swap) without parsing the sentence.
 */

/* ------------------------------------------------------------------ *
 * Severity
 * ------------------------------------------------------------------ */

/**
 * How much a conflict matters, ascending.
 *
 *   `advisory` — true, worth surfacing, not a reason to change anything. Two
 *                exercises sharing a secondary muscle lives here.
 *   `strong`   — the session is worse for this. A generator should look for
 *                something better before accepting it.
 *   `blocking` — the session cannot be performed as written. Equipment that is
 *                not there, a declared injury, the same exercise twice.
 *
 * It is an `orderedScale` rather than three strings, because `'strong' >
 * 'advisory'` is false in JavaScript and true in English. Every comparison in the
 * engine goes through the scale.
 */
export const CONFLICT_SEVERITY_SCALE = orderedScale(['advisory', 'strong', 'blocking'] as const)
export type ConflictSeverity = (typeof CONFLICT_SEVERITY_SCALE.values)[number]
export const CONFLICT_SEVERITIES = CONFLICT_SEVERITY_SCALE.values

/* ------------------------------------------------------------------ *
 * Kinds
 * ------------------------------------------------------------------ */

/**
 * The kinds, listed worst-first. The order is not decoration: it is the tie-break
 * used to sort a report, so two conflicts of equal severity always come back in
 * the same order, run after run.
 */
export const CONFLICT_KINDS = [
  'limitation',
  'equipment',
  'location',
  'duplicate-exercise',
  'station',
  'superset',
  'progression-role',
  'joint-stress',
  'muscle-overlap',
  'duplicate-movement-pattern',
  'grip',
  'recovery',
  'time',
] as const

export type ConflictKind = (typeof CONFLICT_KINDS)[number]

const KIND_ORDER = new Map<ConflictKind, number>(CONFLICT_KINDS.map((kind, index) => [kind, index]))

/* ------------------------------------------------------------------ *
 * Details, one per kind
 * ------------------------------------------------------------------ */

/** The exercise is already in the session. */
export interface DuplicateExerciseDetail {
  readonly exerciseId: string
}

/**
 * `load` counts an identical pattern as 1 and a declared overlap as a half, so a
 * session drifting towards one movement is measurable rather than a yes/no.
 */
export interface DuplicateMovementPatternDetail {
  readonly pattern: MovementPatternId
  readonly identicalCount: number
  readonly overlappingPatterns: readonly MovementPatternId[]
  readonly load: number
}

/**
 * `score` is the heaviest single pairing, not a session total: overlap is a
 * property of a pair. The three shared lists are the union across every partner
 * reported, in canonical muscle order.
 */
export interface MuscleOverlapDetail {
  readonly score: number
  readonly sharedPrimary: readonly MuscleId[]
  readonly sharedMixed: readonly MuscleId[]
  readonly sharedSecondary: readonly MuscleId[]
  readonly groups: readonly MuscleGroupId[]
}

/**
 * Accumulated, weighted stress on ONE joint. `limited` is true when the user has
 * flagged that joint, which is what pulls both thresholds down.
 */
export interface JointStressDetail {
  readonly joint: JointStressTagId
  readonly load: number
  readonly advisoryLimit: number
  readonly strongLimit: number
  readonly limited: boolean
}

export interface GripDetail {
  readonly load: number
  readonly advisoryLimit: number
  readonly strongLimit: number
}

/** Required equipment the training location does not have. Never optional kit. */
export interface EquipmentDetail {
  readonly missing: readonly EquipmentId[]
  readonly locationId: string
  readonly locationName: string
}

/**
 * `superset` — two exercises in one superset occupy the same station, so they
 *              cannot be alternated. Physically impossible; blocking.
 * `queue`     — the session sends you back to one scarce station repeatedly.
 *              Possible, and a bad time at a busy gym; advisory.
 */
export interface StationDetail {
  readonly station: StationId
  readonly basis: 'superset' | 'queue'
  readonly occupancy: number
  readonly limit: number
}

/** The named superset rules. Each is one reason a pairing is a bad pairing. */
export const SUPERSET_RULES = [
  'not-permitted',
  'ineligible-exercise',
  'both-grip-heavy',
  'competing-demands',
  'two-heavy-compounds',
  'shared-joint-stress',
  'station-hopping',
] as const

export type SupersetRule = (typeof SUPERSET_RULES)[number]

export interface SupersetDetail {
  readonly rule: SupersetRule
  readonly groupId: string
  /** The demands or joints the pair share, when the rule is about sharing. */
  readonly shared: readonly string[]
}

/** `daysAgo` is supplied by the caller: this engine never reads a clock. */
export interface RecoveryDetail {
  readonly group: MuscleGroupId
  readonly daysAgo: number
  readonly minimumDays: number
}

export interface TimeDetail {
  readonly estimatedSeconds: number
  readonly budgetSeconds: number
  readonly overrunSeconds: number
}

/**
 * `contraindicated` — the catalog says outright to avoid this with that flag.
 * `joint-stress`    — not contraindicated, but heavy on a joint the user flagged.
 *
 * `note` is the exercise's own considerations line for that joint, or `''`.
 */
export interface LimitationDetail {
  readonly flag: LimitationFlag
  readonly basis: 'contraindicated' | 'joint-stress'
  readonly note: string
}

export interface LocationDetail {
  readonly locationId: string
  readonly locationName: string
  readonly trainingAt: LocationSuitability
  readonly suitableAt: readonly LocationSuitability[]
}

/**
 * `slot`   — two exercises were assigned the same programming slot. One slot
 *            holds one exercise; blocking.
 * `family` — two exercises share a progression family, so their history would be
 *            split between them and neither would progress cleanly.
 */
export interface ProgressionRoleDetail {
  readonly basis: 'slot' | 'family'
  readonly family: ProgressionFamilyId
  readonly slot: string | null
  readonly role: TrainingRole
  readonly otherRoles: readonly TrainingRole[]
}

/* ------------------------------------------------------------------ *
 * The conflict itself
 * ------------------------------------------------------------------ */

interface ConflictOf<K extends ConflictKind, D> {
  readonly kind: K
  readonly severity: ConflictSeverity
  /**
   * Every exercise the conflict is about, by id. For a candidate check the
   * candidate is first and the partners follow in session order; for a session
   * check they are all in session order. A conflict about one exercise alone
   * (equipment, limitation, location) carries just that id.
   */
  readonly exerciseIds: readonly string[]
  /** Finished, plain-language copy. Render it verbatim. */
  readonly reason: string
  readonly detail: D
}

export type Conflict =
  | ConflictOf<'duplicate-exercise', DuplicateExerciseDetail>
  | ConflictOf<'duplicate-movement-pattern', DuplicateMovementPatternDetail>
  | ConflictOf<'muscle-overlap', MuscleOverlapDetail>
  | ConflictOf<'joint-stress', JointStressDetail>
  | ConflictOf<'grip', GripDetail>
  | ConflictOf<'equipment', EquipmentDetail>
  | ConflictOf<'station', StationDetail>
  | ConflictOf<'superset', SupersetDetail>
  | ConflictOf<'recovery', RecoveryDetail>
  | ConflictOf<'time', TimeDetail>
  | ConflictOf<'limitation', LimitationDetail>
  | ConflictOf<'location', LocationDetail>
  | ConflictOf<'progression-role', ProgressionRoleDetail>

/** The one conflict of a given kind, with its detail narrowed. */
export type ConflictOfKind<K extends ConflictKind> = Extract<Conflict, { kind: K }>

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

/**
 * What both entry points return.
 *
 * `worst` and `blocked` are derived, and are here so that the overwhelmingly
 * common question — "may I use this?" — is answered without every caller writing
 * its own reduce and getting the severity order wrong.
 */
export interface ConflictReport {
  /** Sorted: worst severity first, then by kind order, then by exercise ids. */
  readonly conflicts: readonly Conflict[]
  /** The highest severity present, or `null` for a clean report. */
  readonly worst: ConflictSeverity | null
  /** True when at least one conflict is `blocking`. */
  readonly blocked: boolean
}

/** Descending by severity, then by kind order, then by ids. Total and stable. */
export function compareConflicts(a: Conflict, b: Conflict): number {
  const bySeverity = CONFLICT_SEVERITY_SCALE.compare(b.severity, a.severity)
  if (bySeverity !== 0) return bySeverity
  const byKind = (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0)
  if (byKind !== 0) return byKind
  return a.exerciseIds.join('|').localeCompare(b.exerciseIds.join('|'))
}

/** A new array in report order. Never mutates its argument. */
export function sortConflicts(conflicts: readonly Conflict[]): Conflict[] {
  return [...conflicts].sort(compareConflicts)
}

export function highestSeverity(conflicts: readonly Conflict[]): ConflictSeverity | null {
  let worst: ConflictSeverity | null = null
  for (const conflict of conflicts) {
    worst = worst === null ? conflict.severity : CONFLICT_SEVERITY_SCALE.highest(worst, conflict.severity)
  }
  return worst
}

/** Sorts, then fills in the derived answers. The only way a report is made. */
export function createConflictReport(conflicts: readonly Conflict[]): ConflictReport {
  const sorted = sortConflicts(conflicts)
  const worst = highestSeverity(sorted)
  return { conflicts: sorted, worst, blocked: worst === 'blocking' }
}

/** An empty, clean report. */
export const NO_CONFLICTS: ConflictReport = { conflicts: [], worst: null, blocked: false }

/** Narrows a report's conflicts to one kind, with the right detail type. */
export function conflictsOfKind<K extends ConflictKind>(
  conflicts: readonly Conflict[],
  kind: K,
): ConflictOfKind<K>[] {
  return conflicts.filter((conflict): conflict is ConflictOfKind<K> => conflict.kind === kind)
}

/** True when every conflict is at or below `limit`. */
export function withinSeverity(report: ConflictReport, limit: ConflictSeverity): boolean {
  return report.worst === null || CONFLICT_SEVERITY_SCALE.atMost(report.worst, limit)
}
