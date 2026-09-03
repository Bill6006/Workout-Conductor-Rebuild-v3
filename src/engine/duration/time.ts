/**
 * Time estimation and the budget behind the ONE duration control.
 *
 * THE RULE THIS MODULE EXISTS TO SERVE: a shorter duration REBUILDS the session,
 * it does not drop the last exercises. So nothing here truncates anything. It
 * hands the generator a budget and honest costs, and the generator builds the
 * best session that fits — which is why a 15-minute session is not a prefix of
 * the 60-minute one.
 *
 * Estimates must not be quietly optimistic: the number here is what the UI shows
 * and what someone plans their evening around.
 */
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { DurationChoice, SetTarget, WorkoutBlock } from '../../core/validation/workoutSchema'
import { isSupersetBlock } from '../../core/validation/workoutSchema'

/** Seconds a single rep of ordinary tempo work takes. */
export const SECONDS_PER_REP = 3.5
/** Seconds a timed set costs beyond its own duration (getting in and out of position). */
export const TIMED_SET_OVERHEAD = 8
/** What moving between two exercises costs, by the catalog's transition cost. */
export const TRANSITION_SECONDS: Readonly<Record<Exercise['transitionCost'], number>> = {
  low: 15,
  moderate: 35,
  high: 70,
}

/** Work time for one set, before its rest. */
export function setWorkSeconds(target: SetTarget): number {
  const reps = (target.reps.min + target.reps.max) / 2
  if (target.reps.unit === 'seconds') return Math.round(reps + TIMED_SET_OVERHEAD)

  const tempoFactor = target.tempo ? 1.35 : 1
  const base = reps * SECONDS_PER_REP * tempoFactor
  // A drop set is extra work plus the seconds spent changing the load.
  const drops = target.dropSet
    ? target.dropSet.drops * (reps * 0.6 * SECONDS_PER_REP + target.dropSet.transitionSeconds)
    : 0
  return Math.round(base + drops)
}

/** Work plus the rest that follows it. */
export function setTotalSeconds(target: SetTarget): number {
  return setWorkSeconds(target) + target.restSeconds
}

/**
 * What an exercise entry costs on its own: setup, the work, and the rest BETWEEN
 * its sets.
 *
 * The rest after the final set is deliberately excluded, because that gap is the
 * transition to the next exercise and `transitionSeconds` already charges for
 * it. Counting both was making every session estimate run several minutes long,
 * which then squeezed real exercises out of a session that had room for them.
 */
export function entrySeconds(targets: readonly SetTarget[], exercise: Exercise): number {
  const work = targets.reduce((sum, target) => sum + setWorkSeconds(target), 0)
  const betweenSets = targets.slice(0, -1).reduce((sum, target) => sum + target.restSeconds, 0)
  return Math.round(exercise.setupTimeSeconds + work + betweenSets)
}

/**
 * What a block costs. A superset is genuinely cheaper than the same two
 * exercises run separately, because one move's work is the other's rest — that
 * saving is the whole reason the technique earns its place in a short session,
 * so it is modelled as a block rather than as two entries.
 */
export function blockSeconds(
  block: WorkoutBlock,
  exerciseOf: (exerciseId: string) => Exercise | null,
): number {
  if (!isSupersetBlock(block)) {
    const exercise = exerciseOf(block.entry.exerciseId)
    if (!exercise) return block.entry.estimatedSeconds
    return entrySeconds(block.entry.targets, exercise)
  }

  const [first, second] = block.moves
  const setupA = exerciseOf(first.exerciseId)?.setupTimeSeconds ?? 0
  const setupB = exerciseOf(second.exerciseId)?.setupTimeSeconds ?? 0

  let seconds = setupA + setupB
  for (let round = 0; round < block.rounds; round += 1) {
    const a = first.targets[round]
    const b = second.targets[round]
    if (!a || !b) continue
    seconds += setWorkSeconds(a) + block.restBetweenMovesSeconds
    seconds += setWorkSeconds(b) + block.restAfterRoundSeconds
  }
  return Math.round(seconds)
}

/** The cost of getting from one block to the next. */
export function transitionSeconds(exercise: Exercise): number {
  return TRANSITION_SECONDS[exercise.transitionCost]
}

/* ------------------------------------------------------------------ *
 * The budget
 * ------------------------------------------------------------------ */

export interface DurationShape {
  /** The whole session's budget, in seconds. */
  readonly budgetSeconds: number
  /** Working sets the session should aim to hold. */
  readonly setBudget: number
  /** How many muscle groups it is worth touching at this length. */
  readonly maxGroups: number
  /** How many blocks the session should hold. */
  readonly maxBlocks: number
  /** Seconds to spend warming up. Short sessions do not get a long warm-up block. */
  readonly warmUpSeconds: number
  /** Rest scaling — short sessions use shorter but still realistic rests. */
  readonly restFactor: number
  /** Whether supersets should be actively sought rather than merely allowed. */
  readonly favourSupersets: boolean
  /**
   * The role each slot takes, by position.
   *
   * This is where "15 minutes favours high stimulus-to-time exercises" becomes
   * a real difference rather than a smaller version of the same session. A heavy
   * strength lift wants three minutes of rest between sets; at 15 minutes that
   * spends most of the session standing still, so a short session leads with
   * dense hypertrophy work instead. At 30 minutes and up there is room to open
   * with the heavy movement, which is where it belongs.
   */
  readonly slotRoles: readonly TrainingRole[]
}

const SHORT_SESSION_ROLES: readonly TrainingRole[] = [
  'primary-hypertrophy',
  'secondary-hypertrophy',
  'isolation',
]

const FULL_SESSION_ROLES: readonly TrainingRole[] = [
  'primary-strength',
  'primary-hypertrophy',
  'secondary-hypertrophy',
  'isolation',
]

/**
 * The shape of each duration.
 *
 * These follow the product plan's stated expectations for 15 / 30 / 45 /
 * Default. They are design guidance rather than rigid counts — the generator
 * still decides from real context, and `maxBlocks` is a ceiling it need not
 * reach — but they are what stops every duration producing the same session with
 * a different number on it.
 */
export function shapeFor(choice: DurationChoice, defaultMinutes: number): DurationShape {
  switch (choice) {
    case 15:
      // The fewest, highest-value exercises. Minimal setup changes, high
      // stimulus-to-time, one primary priority. The plan is explicit that this
      // is NOT where a long optional warm-up block belongs.
      return {
        budgetSeconds: 15 * 60,
        setBudget: 6,
        maxGroups: 2,
        maxBlocks: 3,
        warmUpSeconds: 90,
        restFactor: 0.7,
        favourSupersets: true,
        slotRoles: SHORT_SESSION_ROLES,
      }
    case 30:
      // One main movement, one or two supporting, one targeted pairing, a
      // compact warm-up, controlled rest.
      return {
        budgetSeconds: 30 * 60,
        setBudget: 12,
        maxGroups: 3,
        maxBlocks: 5,
        warmUpSeconds: 180,
        restFactor: 0.85,
        favourSupersets: true,
        slotRoles: FULL_SESSION_ROLES,
      }
    case 45:
      // A complete abbreviated session: primary strength work, meaningful
      // hypertrophy volume, balanced supporting work, efficient rests.
      return {
        budgetSeconds: 45 * 60,
        setBudget: 18,
        maxGroups: 4,
        maxBlocks: 7,
        warmUpSeconds: 300,
        restFactor: 0.95,
        favourSupersets: false,
        slotRoles: FULL_SESSION_ROLES,
      }
    default: {
      // Default is an OUTPUT, not a fixed number — it is whatever the complete
      // plan costs. The profile's typical length is the starting budget, and the
      // session is allowed to land where it lands.
      const minutes = Math.max(20, Math.min(180, defaultMinutes))
      return {
        budgetSeconds: minutes * 60,
        setBudget: Math.round(minutes * 0.42),
        maxGroups: 5,
        maxBlocks: Math.max(4, Math.min(9, Math.round(minutes / 8))),
        warmUpSeconds: 360,
        restFactor: 1,
        favourSupersets: false,
        slotRoles: FULL_SESSION_ROLES,
      }
    }
  }
}

/**
 * The shortest session worth calling a session. Below this the plan says to show
 * the closest realistic plan and say it may run over, rather than pretend
 * impossible volume fits.
 */
export const MINIMUM_VIABLE_SECONDS = 6 * 60

export interface FitOutcome {
  /** True when the built session genuinely fits its budget. */
  readonly fits: boolean
  /** Positive when there is room left, negative when it runs over. */
  readonly headroomSeconds: number
  /** Set when the session cannot be made to fit and the user must be told. */
  readonly overrunMinutes: number | null
}

/**
 * Judge a built session against its budget. This reports; it never trims. A
 * caller that wants a shorter session asks for a shorter session and gets one
 * rebuilt, which is the locked behaviour of the duration control.
 */
export function judgeFit(estimatedSeconds: number, budgetSeconds: number): FitOutcome {
  const headroomSeconds = budgetSeconds - estimatedSeconds
  if (headroomSeconds >= 0) return { fits: true, headroomSeconds, overrunMinutes: null }
  return {
    fits: false,
    headroomSeconds,
    overrunMinutes: Math.max(1, Math.round(-headroomSeconds / 60)),
  }
}
