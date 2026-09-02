/**
 * THE conflict engine's public surface.
 *
 * One owner for one responsibility: everything that decides whether two exercises
 * belong in the same session lives behind this barrel, and no feature, generator,
 * or ranker writes a rule of its own. If a new judgement is needed, it becomes a
 * rule here.
 *
 * NOTHING IN THIS FOLDER IMPORTS EXERCISE DATA. The engine is handed the
 * `Exercise` records it reasons about, so it can be pulled into any chunk without
 * dragging the catalog behind it.
 *
 * Most callers need only:
 *
 *     const detector = createConflictDetector({ ...conflictInputsFromProfile(profile), session })
 *     const report = detector.detect(candidate)      // adding one exercise
 *     const whole  = detector.validate()             // the session as it stands
 */

export { createConflictDetector, detectConflicts, validateSession } from './conflictEngine'
export type { ConflictDetector } from './conflictEngine'

export {
  CONFLICT_KINDS,
  CONFLICT_SEVERITIES,
  CONFLICT_SEVERITY_SCALE,
  NO_CONFLICTS,
  SUPERSET_RULES,
  compareConflicts,
  conflictsOfKind,
  createConflictReport,
  highestSeverity,
  sortConflicts,
  withinSeverity,
} from './conflictTypes'
export type {
  Conflict,
  ConflictKind,
  ConflictOfKind,
  ConflictReport,
  ConflictSeverity,
  DuplicateExerciseDetail,
  DuplicateMovementPatternDetail,
  EquipmentDetail,
  GripDetail,
  JointStressDetail,
  LimitationDetail,
  LocationDetail,
  MuscleOverlapDetail,
  ProgressionRoleDetail,
  RecoveryDetail,
  StationDetail,
  SupersetDetail,
  SupersetRule,
  TimeDetail,
} from './conflictTypes'

export {
  LIMITATION_JOINTS,
  conflictInputsFromProfile,
  createConflictContext,
  limitationFlagsFrom,
  limitedJoints,
  locationSuitabilityForKind,
} from './conflictContext'
export type {
  CandidatePlacement,
  ConflictContext,
  ConflictContextInput,
  ConflictLocation,
  RecentTraining,
  SessionEntry,
  TechniquePermissions,
} from './conflictContext'

export { DEFAULT_CONFLICT_POLICY, recoveryDaysFor, resolveConflictPolicy } from './conflictPolicy'
export type { ConflictPolicy } from './conflictPolicy'

export { buildSessionIndex, idsOf, prepareEntry } from './sessionIndex'
export type { PreparedEntry, SessionIndex } from './sessionIndex'
