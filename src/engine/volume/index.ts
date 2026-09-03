/**
 * THE VOLUME ENGINE — the public surface.
 *
 * One owner for one responsibility: how much work each muscle has had, how
 * recently it had it, how much it should be getting, and therefore which groups
 * this session is for. Nothing else in the product counts sets.
 *
 * HOW THE PIECES FIT, in the order a generator uses them:
 *
 *     const volume   = buildVolumeLedger(recentSessions)       // what the week had
 *     const exposure = buildExposure(recentSessions)           // what is still on it
 *     const targets  = volumeTargetsFromProfile(profile)       // what it should have
 *     const priorities = musclePriorities({ targets, volume, exposure, goals, sessionsPerWeek })
 *
 * WITH NO HISTORY — which is every session until Phase 7 ships — the first two
 * are empty, every signal that depends on them goes neutral, and the goals decide.
 * That is deliberate and it is documented at the top of `priorities.ts`.
 *
 * PURE, DETERMINISTIC, NO CATALOG DATA. Sessions arrive with their own `daysAgo`,
 * exercises arrive as values, and nothing here imports the exercise catalog, so
 * this folder can be pulled into any chunk without dragging 127 entries behind it.
 *
 * THE RECOVERY WINDOWS ARE THE CONFLICT ENGINE'S. `exposure.ts` reads
 * `recoveryDaysFor` from `engine/conflicts/conflictPolicy` rather than holding a
 * second opinion about how long a group needs.
 */

export {
  SECONDARY_MUSCLE_CREDIT,
  SET_KIND_CREDIT,
  creditSets,
  groupCreditFor,
  groupReach,
  reachOf,
  roundSets,
} from './credit'
export type { MuscleReach } from './credit'

export {
  DEFAULT_VOLUME_WINDOW_DAYS,
  buildVolumeLedger,
  combineGroupSets,
  emptyVolumeLedger,
  volumeOfSession,
} from './weeklyVolume'
export type { VolumeLedgerOptions } from './weeklyVolume'

export {
  DEFAULT_EXPOSURE_WINDOW_DAYS,
  DEFAULT_NEGLECT_DAYS,
  HARD_SESSION_SETS,
  buildExposure,
  emptyExposure,
  exposureFromEntries,
  neglectedGroups,
} from './exposure'
export type { ExposureMap, ExposureOptions, GroupExposure } from './exposure'

export {
  BASE_WEEKLY_BANDS,
  EXPERIENCE_VOLUME_MULTIPLIER,
  GOAL_BIASES,
  MAX_SETS_PER_GROUP_PER_SESSION,
  SECONDARY_GOAL_WEIGHT,
  STYLE_VOLUME_MULTIPLIER,
  goalEmphasisFor,
  planTargetsFrom,
  resolveVolumeTargets,
  volumeTargetsFromProfile,
} from './targets'
export type { GoalBias, VolumeBand, VolumeTarget, VolumeTargetInput, VolumeTargets } from './targets'

export {
  MIN_PRIMARY_SETS,
  NEUTRAL_SIGNAL,
  PLAN_EMPHASIS_BONUS,
  PRIMARY_SET_BOOST,
  PRIORITY_WEIGHTS,
  groupsBehindTarget,
  musclePriorities,
  rankGroups,
  sessionSetsFor,
} from './priorities'
export type { GroupStanding, MusclePriorityOptions, PriorityInput } from './priorities'

export type {
  GroupVolume,
  MuscleVolume,
  SessionVolume,
  VolumeExercise,
  VolumeLedger,
  WorkedExercise,
} from './volumeTypes'
