import { STRESS_WEIGHTS } from '../../catalog/taxonomy/joints'
import type { StressIntensity } from '../../catalog/taxonomy/joints'
import type { GripDemand } from '../../catalog/taxonomy/scales'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'

/**
 * EVERY THRESHOLD THE ENGINE USES, IN ONE PLACE.
 *
 * The rules in this folder contain no numbers of their own. That is the point: a
 * rule file says what is being measured, this file says how much is too much, and
 * a test can move a threshold to prove a rule reads it rather than a constant it
 * inlined.
 *
 * THE UNITS ARE SCALES, NOT MEASUREMENTS. Joint stress is counted in the catalog's
 * doubling weights (`STRESS_WEIGHTS`: low 1, moderate 2, high 4), so a limit of 10
 * means "roughly two heavy movements plus a moderate one", not ten of anything.
 * Grip is counted the same way. Comparing these totals across joints is meaningful;
 * reading them as minutes, kilos, or sets is not.
 *
 * NOTHING HERE IS PERSISTED. A policy is a runtime argument, not a stored record —
 * it never reaches IndexedDB and never needs a schema version. A later phase that
 * wants a per-user policy builds one from the profile and passes it in.
 */

export interface ConflictPolicy {
  /* -- duplicate movement pattern ---------------------------------- */
  /** An identical pattern already in the session counts this much. */
  readonly identicalPatternWeight: number
  /** A pattern the catalog declares as overlapping counts this much. */
  readonly overlappingPatternWeight: number
  readonly patternAdvisoryLoad: number
  readonly patternStrongLoad: number

  /* -- muscle overlap ---------------------------------------------- */
  /** Both exercises name the muscle as primary. */
  readonly primaryPrimaryWeight: number
  /** Primary for one, secondary for the other. */
  readonly primarySecondaryWeight: number
  /** Secondary for both — the case the brief calls advisory. */
  readonly secondarySecondaryWeight: number
  readonly muscleOverlapAdvisory: number
  readonly muscleOverlapStrong: number

  /* -- joint stress ------------------------------------------------ */
  readonly jointStressAdvisory: number
  readonly jointStressStrong: number
  /**
   * Multiplier applied to both joint limits when the user has flagged that joint.
   * Below 1, so a flagged shoulder runs out of room sooner than a sound one.
   */
  readonly limitedJointFactor: number
  /**
   * The intensity at which an exercise the catalog did NOT contraindicate is
   * still worth warning about on a flagged joint.
   */
  readonly limitedJointWarnIntensity: StressIntensity

  /* -- grip -------------------------------------------------------- */
  readonly gripWeights: Readonly<Record<GripDemand, number>>
  /** The demand at which an exercise is counted as a grip contributor at all. */
  readonly gripContributorDemand: GripDemand
  readonly gripAdvisory: number
  readonly gripStrong: number

  /* -- stations ---------------------------------------------------- */
  /** Stations a gym typically has ONE of. Queueing is only a risk on these. */
  readonly scarceStations: readonly StationId[]
  /** Entries on one scarce station at which the queue becomes worth mentioning. */
  readonly stationQueueLimit: number

  /* -- recovery ---------------------------------------------------- */
  readonly defaultRecoveryDays: number
  /** Groups that come back faster than the default. */
  readonly recoveryDaysByGroup: Readonly<Partial<Record<MuscleGroupId, number>>>

  /* -- time -------------------------------------------------------- */
  /** Over budget by more than this ratio is `strong` rather than `advisory`. */
  readonly timeStrongRatio: number
  /** Over budget by more than this ratio is `blocking`. */
  readonly timeBlockingRatio: number
}

/**
 * Grip counted on the same doubling scale as joint stress, for the same reason:
 * a count would make four easy holds look like two hard ones.
 */
const GRIP_WEIGHTS: Readonly<Record<GripDemand, number>> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 4,
}

/**
 * The stations a commercial gym has exactly one of.
 *
 * `selectorised-machine`, `dumbbell-rack` and `cable-tower` are deliberately
 * absent: a gym has several, so three exercises on "a machine" is not a queue.
 * The same-station rule inside a superset does not consult this list — you cannot
 * alternate on one machine however many the gym owns.
 */
const SCARCE_STATIONS: readonly StationId[] = [
  'squat-rack',
  'bench-station',
  'smith-machine',
  'lat-pulldown-station',
  'seated-row-station',
  'leg-press-station',
  'pull-up-bar',
  'dip-station',
  'preacher-station',
  'back-extension-station',
  'platform',
]

/**
 * The shipped policy.
 *
 * Joint numbers, read in `STRESS_WEIGHTS` units: two heavy movements on one joint
 * total 8 and are advisory; a third moderate one reaches 10 and is strong. With a
 * flagged joint both halve, so a single heavy movement plus a moderate one is
 * already strong — which is the behaviour a person who told us their shoulder
 * hurts is entitled to expect.
 */
export const DEFAULT_CONFLICT_POLICY: ConflictPolicy = {
  identicalPatternWeight: 1,
  overlappingPatternWeight: 0.5,
  patternAdvisoryLoad: 0.5,
  patternStrongLoad: 2,

  primaryPrimaryWeight: 4,
  primarySecondaryWeight: 2,
  secondarySecondaryWeight: 1,
  muscleOverlapAdvisory: 1,
  muscleOverlapStrong: 8,

  jointStressAdvisory: 8,
  jointStressStrong: 10,
  limitedJointFactor: 0.5,
  limitedJointWarnIntensity: 'moderate',

  gripWeights: GRIP_WEIGHTS,
  gripContributorDemand: 'moderate',
  gripAdvisory: 8,
  gripStrong: 12,

  scarceStations: SCARCE_STATIONS,
  stationQueueLimit: 3,

  defaultRecoveryDays: 2,
  recoveryDaysByGroup: {
    biceps: 1,
    triceps: 1,
    forearms: 1,
    calves: 1,
    core: 1,
    'hip-flexors': 1,
    adductors: 1,
  },

  timeStrongRatio: 1.1,
  timeBlockingRatio: 1.5,
}

/** A policy with the shipped defaults filled in for anything left out. */
export function resolveConflictPolicy(overrides?: Partial<ConflictPolicy>): ConflictPolicy {
  if (!overrides) return DEFAULT_CONFLICT_POLICY
  return { ...DEFAULT_CONFLICT_POLICY, ...overrides }
}

/** Days a muscle group is given before it is trained hard again. */
export function recoveryDaysFor(group: MuscleGroupId, policy: ConflictPolicy): number {
  return policy.recoveryDaysByGroup[group] ?? policy.defaultRecoveryDays
}

/** Re-exported so a caller reading a joint total knows what its units are. */
export { STRESS_WEIGHTS }
