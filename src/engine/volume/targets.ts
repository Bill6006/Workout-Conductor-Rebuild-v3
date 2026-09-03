import {
  MUSCLE_GROUP_IDS,
  getMuscleGroup,
  isMuscleGroupId,
  type MuscleGroupId,
} from '../../catalog/muscles/muscles'
import type { Experience, Goal, Profile, TrainingStyle } from '../../core/validation/schemas'
import { roundSets } from './credit'

/**
 * HOW MUCH EACH GROUP SHOULD GET IN A WEEK, AND WHY IT IS NOT THE SAME FOR
 * EVERYONE.
 *
 * A band, not a number. `minSets` is the floor below which a group is not really
 * being trained; `targetSets` is what the week is aiming for; `maxSets` is the
 * point past which more sets stop buying anything and start costing recovery.
 * Programming needs all three: the floor decides what counts as a deficit, the
 * target decides what to allocate, and the ceiling stops a specialisation goal
 * from turning a session into arm day forever.
 *
 * THE UNITS ARE THIS FOLDER'S EFFECTIVE SETS. A number here is comparable with
 * `VolumeLedger.groupSets`, which means secondary work is already counted at
 * `SECONDARY_MUSCLE_CREDIT`. Read against a raw count of exercises these numbers
 * are too high; read against effective sets they are the intended bands.
 *
 * WHY THE BASE BANDS ARE WHAT THEY ARE. They are the mainstream hypertrophy
 * range — roughly ten to twenty hard sets a week for a group people train
 * directly — narrowed by two facts the catalog already states. A group whose
 * `indirectlyTrained` flag is set (`forearms`, `adductors`, `hip-flexors`) gets a
 * floor of zero and a low target, because that group is normally trained as a
 * side effect of compound work and a floor would make the generator prescribe
 * direct wrist work nobody asked for. The arms and calves sit lower than the
 * chest and back because they are single-joint groups that also collect a large
 * share of indirect credit from every press and pull.
 *
 * BIAS IS MULTIPLICATIVE AND THE BASE IS VISIBLE. A goal never rewrites a band;
 * it scales one. `VolumeTarget.multiplier` reports the scaling that was applied,
 * so an explanation can say "your arms are up because you asked for bigger arms"
 * from a number rather than from a guess.
 *
 * EMPHASIS DOES NOT STARVE ANYTHING. `bigger-arms` raises arms and touches
 * nothing else: a person who wants bigger arms does MORE arm work, not the same
 * amount of arm work and less of everything else. The thing that stops the week
 * running away is the per-session cap and the clock, not a secret tax on the
 * chest. Two goals that deliberately DO trim — `get-stronger`, which spends its
 * budget on the big lifts, and `stay-consistent`, which lowers the whole bar
 * because the goal is turning up — say so in their own entries below.
 */

export interface VolumeBand {
  readonly minSets: number
  readonly targetSets: number
  readonly maxSets: number
}

/** The unbiased weekly bands, in effective sets. See the file note. */
export const BASE_WEEKLY_BANDS: Readonly<Record<MuscleGroupId, VolumeBand>> = {
  chest: { minSets: 10, targetSets: 14, maxSets: 20 },
  back: { minSets: 10, targetSets: 16, maxSets: 22 },
  shoulders: { minSets: 8, targetSets: 12, maxSets: 18 },
  biceps: { minSets: 6, targetSets: 10, maxSets: 16 },
  triceps: { minSets: 6, targetSets: 10, maxSets: 16 },
  forearms: { minSets: 0, targetSets: 3, maxSets: 8 },
  quads: { minSets: 8, targetSets: 12, maxSets: 18 },
  hamstrings: { minSets: 6, targetSets: 10, maxSets: 16 },
  glutes: { minSets: 6, targetSets: 10, maxSets: 16 },
  adductors: { minSets: 0, targetSets: 3, maxSets: 8 },
  'hip-flexors': { minSets: 0, targetSets: 2, maxSets: 6 },
  calves: { minSets: 6, targetSets: 10, maxSets: 16 },
  core: { minSets: 4, targetSets: 8, maxSets: 14 },
}

/**
 * What a goal does to the bands.
 *
 * `emphasis`   — per-group multipliers. Anything unlisted is left alone.
 * `uniform`    — a multiplier on every group, for goals that move the whole bar.
 * `floorShare` — raises each group's FLOOR to this share of its target. It is how
 *                `balanced-development` says "no group may be skipped" without
 *                claiming any group needs more than it did.
 */
export interface GoalBias {
  readonly emphasis: Readonly<Partial<Record<MuscleGroupId, number>>>
  readonly uniform: number
  readonly floorShare: number
}

const NO_BIAS: GoalBias = { emphasis: {}, uniform: 1, floorShare: 0 }

export const GOAL_BIASES: Readonly<Record<Goal, GoalBias>> = {
  // The default shape. The base bands ARE the build-muscle bands.
  'build-muscle': NO_BIAS,

  // The specialisation the product names first. Half again on the elbow flexors
  // and extensors, a smaller lift for the forearms, which grow off the same work.
  'bigger-arms': { emphasis: { biceps: 1.5, triceps: 1.5, forearms: 1.3 }, uniform: 1, floorShare: 0 },

  // Chest leads; the triceps and front delts do the work with it, so they follow
  // it up a little rather than being left to soak up the extra pressing by luck.
  'bigger-chest': { emphasis: { chest: 1.5, triceps: 1.15, shoulders: 1.1 }, uniform: 1, floorShare: 0 },

  // Everything that carries size, evenly. Deliberately gentler than a
  // specialisation: "bigger everywhere" is a slower ask than "bigger arms".
  'overall-size': {
    emphasis: { chest: 1.1, back: 1.1, shoulders: 1.1, quads: 1.1, hamstrings: 1.1, glutes: 1.1 },
    uniform: 1,
    floorShare: 0,
  },

  // Strength buys its budget back from the single-joint groups: a smaller number
  // of harder sets on the lifts that carry the total, and less accessory volume
  // competing for the same recovery.
  'get-stronger': {
    emphasis: {
      chest: 1.05,
      back: 1.05,
      quads: 1.05,
      biceps: 0.85,
      triceps: 0.9,
      forearms: 0.85,
      calves: 0.85,
    },
    uniform: 1,
    floorShare: 0,
  },

  // No group emphasised, no group skippable. The floor is the whole intervention.
  'balanced-development': { emphasis: {}, uniform: 1, floorShare: 0.6 },

  // The goal is showing up. Lower the bar everywhere so a week is reachable.
  'stay-consistent': { emphasis: {}, uniform: 0.85, floorShare: 0 },
}

/** What the training style does to total volume. Strength trades sets for load. */
export const STYLE_VOLUME_MULTIPLIER: Readonly<Record<TrainingStyle, number>> = {
  strength: 0.9,
  hybrid: 1,
  hypertrophy: 1.1,
}

/**
 * What experience does to it.
 *
 * A beginner grows off less and recovers from less well-executed work more
 * slowly, and a beginner given eighteen sets of chest simply stops turning up.
 * An advanced lifter needs more to be worth doing.
 */
export const EXPERIENCE_VOLUME_MULTIPLIER: Readonly<Record<Experience, number>> = {
  beginner: 0.75,
  intermediate: 1,
  advanced: 1.15,
}

/**
 * The most sets one group can usefully take in ONE session. A weekly target that
 * cannot be reached in the sessions available is not a target, it is a reproach,
 * so a target is capped at what the week's sessions can actually deliver.
 */
export const MAX_SETS_PER_GROUP_PER_SESSION = 10

/** A secondary goal pulls half as hard as the primary one. */
export const SECONDARY_GOAL_WEIGHT = 0.5

export interface VolumeTarget {
  readonly group: MuscleGroupId
  readonly minSets: number
  readonly targetSets: number
  readonly maxSets: number
  /** True when a goal moved this group off its base band. */
  readonly emphasised: boolean
  /** The combined multiplier applied to the base target, to two decimals. */
  readonly multiplier: number
  /** True when the target came from a weekly plan rather than from these bands. */
  readonly fromPlan: boolean
}

export interface VolumeTargets {
  /** Every group, canonical order. */
  readonly byGroup: readonly VolumeTarget[]
  for(group: MuscleGroupId): VolumeTarget
  /** Sum of every group's target. Useful for sanity-checking a bias. */
  readonly totalTargetSets: number
}

export interface VolumeTargetInput {
  readonly goals: { readonly primary: Goal; readonly secondary: Goal | null }
  readonly trainingStyle: TrainingStyle
  readonly experience?: Experience
  readonly sessionsPerWeek: number
  /**
   * Weekly targets a plan has already fixed. THESE WIN. A weekly plan is a
   * stated intention and these bands are an inference; an inference does not get
   * to overrule the thing it was inferring.
   */
  readonly planTargets?: Readonly<Partial<Record<MuscleGroupId, number>>>
}

/** Blends one goal's multiplier towards 1 by how much that goal counts. */
function blend(multiplier: number, weight: number): number {
  return 1 + (multiplier - 1) * weight
}

function multiplierFor(group: MuscleGroupId, bias: GoalBias, weight: number): number {
  return blend(bias.emphasis[group] ?? 1, weight) * blend(bias.uniform, weight)
}

/**
 * Resolves the weekly bands for one person.
 *
 * The order is fixed and each step is reported: base band, goal bias (primary at
 * full weight, secondary at half), training style, experience, then the
 * per-session reachability cap, then the floors. Doing the cap before the floors
 * matters — a floor raised above a capped target would describe a week nobody
 * could train.
 */
export function resolveVolumeTargets(input: VolumeTargetInput): VolumeTargets {
  const primaryBias = GOAL_BIASES[input.goals.primary]
  const secondaryBias = input.goals.secondary === null ? null : GOAL_BIASES[input.goals.secondary]
  const style = STYLE_VOLUME_MULTIPLIER[input.trainingStyle]
  const experience = EXPERIENCE_VOLUME_MULTIPLIER[input.experience ?? 'intermediate']
  const sessions = Math.max(1, Math.round(input.sessionsPerWeek))
  const reachable = sessions * MAX_SETS_PER_GROUP_PER_SESSION
  const floorShare = Math.max(
    primaryBias.floorShare,
    secondaryBias === null ? 0 : secondaryBias.floorShare * SECONDARY_GOAL_WEIGHT,
  )

  const byGroup: VolumeTarget[] = MUSCLE_GROUP_IDS.map((group) => {
    const base = BASE_WEEKLY_BANDS[group]
    const planned = input.planTargets?.[group]

    const goalMultiplier =
      multiplierFor(group, primaryBias, 1) *
      (secondaryBias === null ? 1 : multiplierFor(group, secondaryBias, SECONDARY_GOAL_WEIGHT))
    const multiplier = goalMultiplier * style * experience

    const scaledTarget = Math.min(reachable, Math.round(base.targetSets * multiplier))
    const targetSets = typeof planned === 'number' ? Math.max(0, Math.round(planned)) : scaledTarget
    const maxSets = Math.max(targetSets, Math.min(reachable, Math.round(base.maxSets * multiplier)))

    // An indirectly-trained group keeps its zero floor even under a balance goal:
    // its floor is zero because the group is trained as a side effect, and a
    // floor would have the generator prescribing direct work for it.
    const indirect = getMuscleGroup(group).indirectlyTrained
    const scaledFloor = Math.round(base.minSets * multiplier)
    const balanceFloor = indirect ? 0 : Math.round(targetSets * floorShare)
    const minSets = Math.min(targetSets, Math.max(scaledFloor, balanceFloor))

    return {
      group,
      minSets,
      targetSets,
      maxSets,
      emphasised: roundSets(goalMultiplier) !== 1,
      multiplier: roundSets(multiplier),
      fromPlan: typeof planned === 'number',
    }
  })

  const index = new Map(byGroup.map((row) => [row.group, row]))

  return {
    byGroup,
    for: (group) => index.get(group) as VolumeTarget,
    totalTargetSets: byGroup.reduce((total, row) => total + row.targetSets, 0),
  }
}

/**
 * The same thing, read off a profile. The one place the profile's field names are
 * translated into this module's vocabulary, so a rename in `schemas.ts` breaks in
 * one place rather than in every caller.
 */
export function volumeTargetsFromProfile(
  profile: Profile,
  planTargets?: Readonly<Partial<Record<MuscleGroupId, number>>>,
): VolumeTargets {
  return resolveVolumeTargets({
    goals: { primary: profile.goals.primary, secondary: profile.goals.secondary },
    trainingStyle: profile.trainingStyle,
    experience: profile.experience,
    sessionsPerWeek: profile.schedule.sessionsPerWeek,
    planTargets,
  })
}

/**
 * How much a goal emphasises a group, on 0..1, for ranking rather than for
 * programming. 0.5 is "no opinion"; above it the goal wants more of this group.
 *
 * It reads the SAME `GOAL_BIASES` table the bands do, so a group cannot be
 * emphasised in the targets and neutral in the ranking. The compression is
 * deliberate: a 1.5x band is a large programming change and only a moderate
 * ranking preference, because the bands have already done most of the work.
 */
export function goalEmphasisFor(
  group: MuscleGroupId,
  goals: { readonly primary: Goal; readonly secondary: Goal | null },
): number {
  const primary = multiplierFor(group, GOAL_BIASES[goals.primary], 1)
  const secondary =
    goals.secondary === null ? 1 : multiplierFor(group, GOAL_BIASES[goals.secondary], SECONDARY_GOAL_WEIGHT)
  const combined = primary * secondary
  // A 1.5x emphasis reaches 1, a 0.5x emphasis reaches 0, 1x sits at 0.5.
  return Math.min(1, Math.max(0, 0.5 + (combined - 1)))
}

/** Narrows unknown strings to group ids when reading a plan's target record. */
export function planTargetsFrom(
  raw: Readonly<Record<string, number>>,
): Readonly<Partial<Record<MuscleGroupId, number>>> {
  const targets: Partial<Record<MuscleGroupId, number>> = {}
  for (const [group, sets] of Object.entries(raw)) {
    if (isMuscleGroupId(group) && Number.isFinite(sets)) targets[group] = sets
  }
  return targets
}
