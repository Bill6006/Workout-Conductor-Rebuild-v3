import { activeLocation } from '../../core/validation/schemas'
import { LIMITATION_FLAGS } from '../../catalog/taxonomy/taxonomy'
import { resolveConflictPolicy, type ConflictPolicy } from './conflictPolicy'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { JointStressTagId } from '../../catalog/taxonomy/joints'
import type { LimitationFlag, LocationSuitability } from '../../catalog/taxonomy/taxonomy'
import type { LocationKind, Profile } from '../../core/validation/schemas'

/**
 * EVERYTHING THE ENGINE IS ALLOWED TO KNOW.
 *
 * The context is a plain, serialisable value. No store, no repository, no clock,
 * no React. That is what makes every detection deterministic and testable: the
 * same context always produces the same report, and a test can build one by hand
 * in five lines.
 *
 * THE ENGINE NEVER READS THE TIME. `RecentTraining.daysAgo` is a number the
 * caller works out from its own clock. An engine that called `Date.now()` would
 * give a different answer either side of midnight for the same session, which is
 * the sort of bug that only ever reproduces at 23:59.
 *
 * THE ENGINE NEVER LOADS THE CATALOG. It is handed the `Exercise` records it is
 * to reason about. Nothing here imports exercise DATA, so the engine can be
 * pulled into any chunk without dragging the catalog behind it.
 */

/**
 * One exercise as it sits in a session.
 *
 * Everything but the exercise is optional, because Phase 2 has no session model
 * and Phase 3 will. Each optional field is a fact the engine cannot invent:
 *
 *   `supersetGroup`    — entries sharing a group id are performed as a superset.
 *   `slot`             — the programming slot the entry fills. Two entries in one
 *                        slot is a conflict; slots are opaque strings here, so
 *                        Phase 3 can name them however it likes.
 *   `estimatedSeconds` — how long this entry takes, INCLUDING its sets and rest.
 *                        DURATION FITTING IS NOT THIS ENGINE'S JOB: it never
 *                        invents set counts or rest lengths. Given an estimate it
 *                        adds it up; given none it falls back to the exercise's
 *                        own `setupTimeSeconds`, which is honest about being only
 *                        the setup.
 */
export interface SessionEntry {
  readonly exercise: Exercise
  readonly supersetGroup?: string | null
  readonly slot?: string | null
  readonly estimatedSeconds?: number
}

/**
 * Where a candidate exercise would GO, for a single-addition check.
 *
 * `replaces` is what makes Phase 5 possible: "what would this session look like
 * if this exercise stood in for that one?" Without it, every swap would report
 * the exercise being replaced as a duplicate of itself.
 */
export interface CandidatePlacement {
  readonly supersetGroup?: string | null
  readonly slot?: string | null
  readonly estimatedSeconds?: number
  /** Id of the entry the candidate would stand in for, if any. */
  readonly replaces?: string | null
}

/**
 * Where the session is being trained.
 *
 * `suitability` is `null` for a location of no fixed kind: the catalog's
 * `locationSuitability` has no value for `custom`, so nothing can be concluded
 * about it and the location rule stays silent rather than guessing.
 */
export interface ConflictLocation {
  readonly id: string
  readonly name: string
  readonly suitability: LocationSuitability | null
}

/**
 * A session the user has already done. `daysAgo` is whole days, 0 for today.
 * `muscleGroups` are the groups that session worked hard enough to matter.
 */
export interface RecentTraining {
  readonly daysAgo: number
  readonly muscleGroups: readonly MuscleGroupId[]
}

/** Which techniques the user has turned on. Mirrors `Profile['techniques']`. */
export interface TechniquePermissions {
  readonly supersets: boolean
  readonly dropSets: boolean
  readonly circuits: boolean
}

/** The resolved context every rule reads. Build it with `createConflictContext`. */
export interface ConflictContext {
  readonly session: readonly SessionEntry[]
  readonly availableEquipment: readonly EquipmentId[]
  readonly location: ConflictLocation
  readonly limitations: readonly LimitationFlag[]
  readonly techniques: TechniquePermissions
  readonly recentTraining: readonly RecentTraining[]
  /** Seconds available for the whole session, or `null` for no budget. */
  readonly timeBudgetSeconds: number | null
  readonly policy: ConflictPolicy
}

/** What a caller passes. Everything but the session has a documented default. */
export interface ConflictContextInput {
  readonly session?: readonly SessionEntry[]
  readonly availableEquipment?: readonly EquipmentId[]
  readonly location?: ConflictLocation
  readonly limitations?: readonly LimitationFlag[]
  readonly techniques?: Partial<TechniquePermissions>
  readonly recentTraining?: readonly RecentTraining[]
  readonly timeBudgetSeconds?: number | null
  readonly policy?: Partial<ConflictPolicy>
}

/**
 * The default location: no fixed kind, so the location rule says nothing and the
 * equipment rule finds nothing available. A caller that gives no equipment gets
 * every equipment-needing exercise blocked, which is the safe direction to fail —
 * the alternative is inventing a gym the user does not have.
 */
const UNKNOWN_LOCATION: ConflictLocation = { id: '', name: 'this location', suitability: null }

const ALL_TECHNIQUES: TechniquePermissions = { supersets: true, dropSets: true, circuits: true }

/** Fills in the defaults. The one way a `ConflictContext` is made. */
export function createConflictContext(input: ConflictContextInput = {}): ConflictContext {
  return {
    session: input.session ?? [],
    availableEquipment: input.availableEquipment ?? [],
    location: input.location ?? UNKNOWN_LOCATION,
    limitations: input.limitations ?? [],
    techniques: { ...ALL_TECHNIQUES, ...input.techniques },
    recentTraining: input.recentTraining ?? [],
    timeBudgetSeconds: input.timeBudgetSeconds ?? null,
    policy: resolveConflictPolicy(input.policy),
  }
}

/**
 * THE mapping from the profile's limitation booleans to the catalog's flags.
 *
 * `taxonomy.ts` documents that `LIMITATION_FLAGS` mirrors `Profile['limitations']`
 * — camelCase keys on one side because it is an object, kebab ids on the other
 * because it is a list. This function is that correspondence, written once. A
 * second copy somewhere else is how `avoidBarbellSquat` quietly stops reaching
 * `barbell-squat`.
 *
 * The result is in `LIMITATION_FLAGS` order, so a report never depends on object
 * key order.
 */
export function limitationFlagsFrom(limitations: {
  readonly shoulder: boolean
  readonly knee: boolean
  readonly lowerBack: boolean
  readonly avoidBarbellSquat: boolean
}): LimitationFlag[] {
  const on: Record<LimitationFlag, boolean> = {
    shoulder: limitations.shoulder,
    knee: limitations.knee,
    'lower-back': limitations.lowerBack,
    'barbell-squat': limitations.avoidBarbellSquat,
  }
  return LIMITATION_FLAGS.filter((flag) => on[flag])
}

/**
 * The joint each limitation flag is about.
 *
 * `barbell-squat` maps to nothing: it is a person declining a LIFT, not reporting
 * a joint, and mapping it onto the knee would silently invent a knee complaint
 * they never made.
 */
export const LIMITATION_JOINTS: Readonly<Record<LimitationFlag, JointStressTagId | null>> = {
  shoulder: 'shoulder',
  knee: 'knee',
  'lower-back': 'lower-back',
  'barbell-squat': null,
}

/** The joints a user has flagged. Drives the tighter joint-stress limits. */
export function limitedJoints(flags: readonly LimitationFlag[]): Set<JointStressTagId> {
  const joints = new Set<JointStressTagId>()
  for (const flag of flags) {
    const joint = LIMITATION_JOINTS[flag]
    if (joint !== null) joints.add(joint)
  }
  return joints
}

/**
 * The catalog's suitability value for a profile location kind, or `null` for
 * `custom`. See `LOCATION_SUITABILITIES` — it is the profile's `LocationKind`
 * minus `custom`, because a location of no fixed kind cannot be reasoned about.
 */
export function locationSuitabilityForKind(kind: LocationKind): LocationSuitability | null {
  return kind === 'custom' ? null : kind
}

/**
 * The profile-derived half of a context: equipment, location, limitations, and
 * techniques, all taken from the ACTIVE location.
 *
 * Session, time budget, and recent training come from whatever is generating or
 * validating the session, so they are left to the caller to spread in:
 *
 *     createConflictContext({ ...conflictInputsFromProfile(profile), session })
 */
export function conflictInputsFromProfile(
  profile: Profile,
): Required<Pick<ConflictContextInput, 'availableEquipment' | 'location' | 'limitations' | 'techniques'>> {
  const location = activeLocation(profile)
  return {
    availableEquipment: location.equipment,
    location: {
      id: location.id,
      name: location.name,
      suitability: locationSuitabilityForKind(location.kind),
    },
    limitations: limitationFlagsFrom(profile.limitations),
    techniques: {
      supersets: profile.techniques.supersets,
      dropSets: profile.techniques.dropSets,
      circuits: profile.techniques.circuits,
    },
  }
}
