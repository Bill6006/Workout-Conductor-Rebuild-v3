import { z } from 'zod'

/**
 * THE canonical muscle model.
 *
 * This file is the single owner of muscle identity. It defines two levels and the
 * relation between them:
 *
 *   - a MUSCLE, which is what an exercise names in `primaryMuscles` /
 *     `secondaryMuscles` — fine-grained enough that "incline press" and "decline
 *     press" are not the same entry;
 *   - a MUSCLE GROUP, which is what a person reads and what weekly volume is
 *     counted in.
 *
 * THE ROLLUP IS EXPLICIT, NOT IMPLIED. Every muscle names its `group`, so Phase 7
 * can total per-set volume by muscle and roll it up to a group without guessing
 * from the id string. `rollUpMuscles()` is that rollup; nothing downstream should
 * re-derive it by parsing names.
 *
 * REGION vs GROUP are two independent axes, and they disagree in exactly one
 * place. A muscle's `region` says where the WORK lands ('upper' | 'lower' |
 * 'core'); a group's `region` says where the group is DISPLAYED. `lower-back`
 * sits in the `back` group (that is where a person looks for it) but its region is
 * `core`, because a loaded hinge is trunk work. Both facts are true and both are
 * needed, so both are stored rather than derived.
 *
 * Ids are stable, kebab-case, and durable: they end up in saved analytics and in
 * custom exercises a user writes, so an id may be added but never renamed.
 */

export const MUSCLE_GROUP_IDS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'hip-flexors',
  'calves',
  'core',
] as const

export type MuscleGroupId = (typeof MUSCLE_GROUP_IDS)[number]

export const MUSCLE_IDS = [
  // Chest
  'upper-chest',
  'mid-chest',
  'lower-chest',
  // Back
  'lats',
  'upper-back',
  'lower-back',
  'upper-traps',
  // Shoulders
  'front-delt',
  'side-delt',
  'rear-delt',
  // Arms — elbow flexors
  'biceps-long-head',
  'biceps-short-head',
  'brachialis',
  // Arms — elbow extensors
  'triceps-long-head',
  'triceps-lateral-head',
  'triceps-medial-head',
  // Forearms
  'brachioradialis',
  'forearm-flexors',
  'forearm-extensors',
  // Legs
  'quads',
  'hamstrings',
  'glute-max',
  'glute-medius-minimus',
  'adductors',
  'hip-flexors',
  'gastrocnemius',
  'soleus',
  // Trunk
  'rectus-abdominis',
  'obliques',
  'deep-core',
] as const

export type MuscleId = (typeof MUSCLE_IDS)[number]

/** Where the work lands. A group is displayed under its own region. */
export const BODY_REGIONS = ['upper', 'lower', 'core'] as const
export type BodyRegion = (typeof BODY_REGIONS)[number]

export interface Muscle {
  readonly id: MuscleId
  /** The group this muscle's volume rolls up into. */
  readonly group: MuscleGroupId
  /** Where the work lands — not always its group's region. See the file note. */
  readonly region: BodyRegion
}

export interface MuscleGroup {
  readonly id: MuscleGroupId
  /** Where the group is displayed. */
  readonly region: BodyRegion
  /**
   * True when a group is trained almost entirely as a side effect of compound
   * work. Phase 7 uses this to decide whether a low weekly total is a gap worth
   * reporting or simply how that group is normally trained.
   */
  readonly indirectlyTrained: boolean
}

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  { id: 'chest', region: 'upper', indirectlyTrained: false },
  { id: 'back', region: 'upper', indirectlyTrained: false },
  { id: 'shoulders', region: 'upper', indirectlyTrained: false },
  { id: 'biceps', region: 'upper', indirectlyTrained: false },
  { id: 'triceps', region: 'upper', indirectlyTrained: false },
  { id: 'forearms', region: 'upper', indirectlyTrained: true },
  { id: 'quads', region: 'lower', indirectlyTrained: false },
  { id: 'hamstrings', region: 'lower', indirectlyTrained: false },
  { id: 'glutes', region: 'lower', indirectlyTrained: false },
  { id: 'adductors', region: 'lower', indirectlyTrained: true },
  { id: 'hip-flexors', region: 'lower', indirectlyTrained: true },
  { id: 'calves', region: 'lower', indirectlyTrained: false },
  { id: 'core', region: 'core', indirectlyTrained: false },
]

export const MUSCLES: readonly Muscle[] = [
  { id: 'upper-chest', group: 'chest', region: 'upper' },
  { id: 'mid-chest', group: 'chest', region: 'upper' },
  { id: 'lower-chest', group: 'chest', region: 'upper' },

  { id: 'lats', group: 'back', region: 'upper' },
  { id: 'upper-back', group: 'back', region: 'upper' },
  { id: 'lower-back', group: 'back', region: 'core' },
  { id: 'upper-traps', group: 'back', region: 'upper' },

  { id: 'front-delt', group: 'shoulders', region: 'upper' },
  { id: 'side-delt', group: 'shoulders', region: 'upper' },
  { id: 'rear-delt', group: 'shoulders', region: 'upper' },

  { id: 'biceps-long-head', group: 'biceps', region: 'upper' },
  { id: 'biceps-short-head', group: 'biceps', region: 'upper' },
  { id: 'brachialis', group: 'biceps', region: 'upper' },

  { id: 'triceps-long-head', group: 'triceps', region: 'upper' },
  { id: 'triceps-lateral-head', group: 'triceps', region: 'upper' },
  { id: 'triceps-medial-head', group: 'triceps', region: 'upper' },

  { id: 'brachioradialis', group: 'forearms', region: 'upper' },
  { id: 'forearm-flexors', group: 'forearms', region: 'upper' },
  { id: 'forearm-extensors', group: 'forearms', region: 'upper' },

  { id: 'quads', group: 'quads', region: 'lower' },
  { id: 'hamstrings', group: 'hamstrings', region: 'lower' },
  { id: 'glute-max', group: 'glutes', region: 'lower' },
  { id: 'glute-medius-minimus', group: 'glutes', region: 'lower' },
  { id: 'adductors', group: 'adductors', region: 'lower' },
  { id: 'hip-flexors', group: 'hip-flexors', region: 'lower' },
  { id: 'gastrocnemius', group: 'calves', region: 'lower' },
  { id: 'soleus', group: 'calves', region: 'lower' },

  { id: 'rectus-abdominis', group: 'core', region: 'core' },
  { id: 'obliques', group: 'core', region: 'core' },
  { id: 'deep-core', group: 'core', region: 'core' },
]

const MUSCLE_BY_ID = new Map<string, Muscle>(MUSCLES.map((muscle) => [muscle.id, muscle]))
const GROUP_BY_ID = new Map<string, MuscleGroup>(MUSCLE_GROUPS.map((group) => [group.id, group]))

export const muscleIdSchema = z.enum(MUSCLE_IDS)
export const muscleGroupIdSchema = z.enum(MUSCLE_GROUP_IDS)
export const bodyRegionSchema = z.enum(BODY_REGIONS)

export function isMuscleId(value: unknown): value is MuscleId {
  return typeof value === 'string' && MUSCLE_BY_ID.has(value)
}

export function isMuscleGroupId(value: unknown): value is MuscleGroupId {
  return typeof value === 'string' && GROUP_BY_ID.has(value)
}

export function getMuscle(id: MuscleId): Muscle {
  const muscle = MUSCLE_BY_ID.get(id)
  if (!muscle) throw new Error(`Unknown muscle id: ${id}`)
  return muscle
}

export function getMuscleGroup(id: MuscleGroupId): MuscleGroup {
  const group = GROUP_BY_ID.get(id)
  if (!group) throw new Error(`Unknown muscle group id: ${id}`)
  return group
}

/** The group a muscle's volume counts towards. */
export function muscleGroupOf(id: MuscleId): MuscleGroupId {
  return getMuscle(id).group
}

/** Where a muscle's work lands. */
export function regionOfMuscle(id: MuscleId): BodyRegion {
  return getMuscle(id).region
}

/** Every muscle in a group, in canonical order. */
export function musclesInGroup(group: MuscleGroupId): MuscleId[] {
  return MUSCLES.filter((muscle) => muscle.group === group).map((muscle) => muscle.id)
}

/**
 * THE rollup. Muscles in, groups out, in canonical group order, deduplicated,
 * with anything unrecognised dropped rather than guessed at.
 */
export function rollUpMuscles(ids: readonly string[]): MuscleGroupId[] {
  const groups = new Set<MuscleGroupId>()
  for (const id of ids) {
    if (isMuscleId(id)) groups.add(muscleGroupOf(id))
  }
  return MUSCLE_GROUPS.filter((group) => groups.has(group.id)).map((group) => group.id)
}

/** Muscle ids sorted into canonical order, unknown ids dropped. */
export function sortMuscleIds(ids: readonly string[]): MuscleId[] {
  const wanted = new Set(ids)
  return MUSCLES.filter((muscle) => wanted.has(muscle.id)).map((muscle) => muscle.id)
}

/** True when two muscle lists touch the same group — the first cut for overlap. */
export function sharesMuscleGroup(a: readonly string[], b: readonly string[]): boolean {
  const first = new Set(rollUpMuscles(a))
  return rollUpMuscles(b).some((group) => first.has(group))
}
