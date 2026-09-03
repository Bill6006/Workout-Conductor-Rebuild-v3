import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { LoadMeasure, RepUnit } from '../../catalog/taxonomy/taxonomy'
import type {
  SetTarget,
  UnknownWeightReason,
  WarmUpPlan,
  WarmUpStep,
  WarmUpStepKind,
  WeightTarget,
  WeightUnit,
} from '../../core/validation/workoutSchema'
import { type DurationKey, type TimeBudgetPlan, durationKey } from './budget'
import { repMidpoint, setWorkSeconds, tempoSecondsPerRep } from './timeModel'

/**
 * WARM-UP PLANNING — a ramp that fits the time and the movement it leads into.
 *
 * TWO DIFFERENT THINGS, KEPT APART ON PURPOSE.
 *
 *   RAMP SETS are lighter sets OF THE FIRST REAL MOVEMENT. They are `SetTarget`s
 *   with `kind: 'warm-up'` living inside that exercise's own entry, so the logger
 *   ticks them off against the lift they belong to. This is the part that makes a
 *   heavy set safe, and it is the part a short session keeps.
 *
 *   GENERAL STEPS are the optional block — raise, mobilise, activate, rehearse.
 *   They are `WarmUpStep`s on `WarmUpPlan.steps`. This is the part a short session
 *   spends least on: the plan says that at fifteen minutes the time goes into the
 *   work, and `budget.generalStepCapSeconds` is where that is enforced.
 *
 * THE FLAG IS THE WHOLE POINT. Every ramp set produced here carries
 * `kind: 'warm-up'`, and `workingSets()` in the durable schema filters on exactly
 * that. Phases 6 and 7 must exclude ramp sets from progression, plateau detection,
 * personal records and working-set totals — a ramp double logged as a working set
 * would show up as a volume increase the person never did and, worse, as a
 * regression in average load. There is no other way to mark a set as a ramp, and
 * no ramp is produced by any other route.
 *
 * PURE AND DETERMINISTIC. Ids are minted from a caller-supplied prefix, never
 * from a counter, a clock, or a random number.
 */

/* ------------------------------------------------------------------ *
 * The ramp
 * ------------------------------------------------------------------ */

/** One rung of a ramp: a share of the working load, at a share of the reps. */
export interface RampRung {
  readonly loadPercent: number
  readonly repFactor: number
}

/**
 * THE RAMP LADDERS, indexed by how many rungs there is time for.
 *
 * Each ladder ends well short of the working load — the last rung is a rehearsal
 * of the groove at a weight that costs nothing, not a set that eats into the work.
 * Reps come DOWN as load goes up, which is what makes a ramp cheap: three rungs
 * of a ten-rep lift cost about a minute of work between them.
 *
 * There is no four-rung ladder. Beyond three the ramp starts taking time from the
 * session it is preparing, and the plan's own guidance at every duration is that
 * the work is the point.
 */
export const RAMP_LADDERS: readonly (readonly RampRung[])[] = [
  [],
  [{ loadPercent: 60, repFactor: 0.6 }],
  [
    { loadPercent: 50, repFactor: 0.8 },
    { loadPercent: 75, repFactor: 0.5 },
  ],
  [
    { loadPercent: 45, repFactor: 0.9 },
    { loadPercent: 65, repFactor: 0.6 },
    { loadPercent: 85, repFactor: 0.4 },
  ],
]

/** The most rungs any ramp uses. */
export const MAX_RAMP_SETS = RAMP_LADDERS.length - 1

/**
 * A LOADED COMPOUND NEVER RAMPS ON FEWER THAN TWO SETS, whatever the clock says.
 *
 * This is the one place the warm-up refuses to scale down further. Going from
 * nothing to a working set of squats is how people hurt themselves, and fifty
 * seconds is not a saving worth that. When the allowance cannot hold two rungs
 * they are planned anyway and the excess is REPORTED as `overAllowanceSeconds`,
 * so the caller trades it against work rather than against safety by accident.
 */
export const MIN_RAMP_SETS_FOR_LOADED_COMPOUND = 2

/** Rest between ramp rungs at the complete duration, scaled by the rest policy. */
export const BASE_RAMP_REST_SECONDS = 40
/** However squeezed the session is, a ramp rung still gets this long. */
export const MIN_RAMP_REST_SECONDS = 20

/** The rest between ramp rungs under a budget's rest policy. */
export function rampRestSeconds(plan: TimeBudgetPlan): number {
  return Math.max(MIN_RAMP_REST_SECONDS, Math.round(BASE_RAMP_REST_SECONDS * plan.restPolicy.multiplier))
}

/**
 * HOW MANY RUNGS THIS EXERCISE WANTS, before the clock has a say.
 *
 *   `warmUpSuitability: 'unsuitable'` means never warm up ON it — no rungs at all,
 *   and the general block prepares for it instead. That is the catalog's own
 *   judgement and this module does not second-guess it.
 *   An unloaded movement ramps into itself, so it gets one rehearsal rung at most
 *   and an unloaded isolation gets none.
 *   A loaded compound gets the full three: it is the movement the ramp exists for.
 */
export function idealRampSets(exercise: Exercise | null): number {
  if (exercise === null) return 1
  if (exercise.warmUpSuitability === 'unsuitable') return 0
  if (exercise.load.measure === 'none') return exercise.compoundOrIsolation === 'compound' ? 1 : 0
  return exercise.compoundOrIsolation === 'compound' ? MAX_RAMP_SETS : 1
}

export interface RampRequest {
  /** `null` for a `custom:` movement — it still gets a single rehearsal rung. */
  readonly exercise: Exercise | null
  /** The entry the rungs are inserted at the head of. */
  readonly entryId: string
  /** Ids are `${idPrefix}-warmup-1`, `-2`, … Stable, so a rebuild reproduces them. */
  readonly idPrefix: string
  /** Seconds the ramp may spend. `MIN_RAMP_SETS_FOR_LOADED_COMPOUND` may overrun it. */
  readonly allowanceSeconds: number
  readonly restSeconds: number
  /** The reps the working sets ask for. Rungs are shares of this. */
  readonly workingReps: number
  readonly repUnit: RepUnit
  /** The load the working sets ask for, when one is known. */
  readonly workingLoad: {
    readonly value: number
    readonly unit: WeightUnit
    readonly measure: LoadMeasure
  } | null
  /** Why the load is unknown, when it is. Honest by default: there is no history. */
  readonly unknownWeightReason?: UnknownWeightReason
}

function rampWeight(rung: RampRung, request: RampRequest): WeightTarget {
  if (request.exercise !== null && request.exercise.load.measure === 'none') return { kind: 'none' }
  if (request.workingLoad === null) {
    return { kind: 'unknown', reason: request.unknownWeightReason ?? 'no-history' }
  }
  if (request.workingLoad.measure === 'none') return { kind: 'none' }
  return {
    kind: 'load',
    value: Math.max(0, Math.round((request.workingLoad.value * rung.loadPercent) / 100)),
    unit: request.workingLoad.unit,
    measure: request.workingLoad.measure,
  }
}

function rungReps(rung: RampRung, workingReps: number): number {
  return Math.min(300, Math.max(1, Math.round(workingReps * rung.repFactor)))
}

function rungSeconds(rung: RampRung, request: RampRequest): number {
  const reps = rungReps(rung, request.workingReps)
  const work = setWorkSeconds({
    reps,
    repUnit: request.repUnit,
    unilateral: request.exercise?.unilateral ?? false,
    secondsPerRep: tempoSecondsPerRep(null),
  })
  return work + Math.max(0, request.restSeconds)
}

/** What a ladder of `count` rungs would cost in total. */
export function rampCostSeconds(request: RampRequest, count: number): number {
  const ladder = RAMP_LADDERS[Math.min(Math.max(0, count), MAX_RAMP_SETS)]
  return ladder.reduce((total, rung) => total + rungSeconds(rung, request), 0)
}

/**
 * How many rungs the allowance actually holds — the largest ladder that fits,
 * never fewer than the floor a loaded compound insists on.
 */
export function rampSetCount(request: RampRequest): number {
  const ideal = idealRampSets(request.exercise)
  const floor = ideal >= MAX_RAMP_SETS ? MIN_RAMP_SETS_FOR_LOADED_COMPOUND : 0
  for (let count = ideal; count > floor; count -= 1) {
    if (rampCostSeconds(request, count) <= request.allowanceSeconds) return count
  }
  return floor
}

/**
 * THE RAMP SETS THEMSELVES — every one flagged `kind: 'warm-up'`.
 *
 * `rirTarget` is `null` on every rung: reps in reserve is a statement about how
 * close a working set came to failure, and a ramp set is not trying. Writing a
 * number there would feed Phase 6 an intensity that never happened.
 */
export function rampSets(request: RampRequest): SetTarget[] {
  const count = rampSetCount(request)
  const ladder = RAMP_LADDERS[count]
  return ladder.map((rung, index) => {
    const reps = rungReps(rung, request.workingReps)
    return {
      setId: `${request.idPrefix}-warmup-${index + 1}`,
      kind: 'warm-up',
      reps: { min: reps, max: reps, unit: request.repUnit },
      rirTarget: null,
      restSeconds: Math.max(0, Math.round(request.restSeconds)),
      weight: rampWeight(rung, request),
      tempo: null,
      dropSet: null,
      estimatedSeconds: Math.round(rungSeconds(rung, request)),
    }
  })
}

/* ------------------------------------------------------------------ *
 * The general block
 * ------------------------------------------------------------------ */

interface StepSpec {
  readonly kind: WarmUpStepKind
  readonly seconds: number
  readonly instruction: string
  /** Rehearsal only means something with a movement to rehearse. */
  readonly needsMovement: boolean
}

/**
 * The general block, in DESCENDING importance, per duration.
 *
 * The order is the drop order: when the cap cannot hold the whole list, the tail
 * comes off. Raising the pulse leads every list because it is the step that does
 * the most for the least time, and it is the only step allowed to be SHORTENED
 * rather than dropped — a shorter pulse-raiser is still a pulse-raiser, whereas
 * thirty seconds of mobility is a gesture.
 *
 * Instructions name no exercise. The movement a rehearsal step refers to travels
 * as `exerciseId`, so a screen can render its real name and this module never
 * builds a sentence out of one.
 */
export const GENERAL_STEP_PLANS: Readonly<Record<DurationKey, readonly StepSpec[]>> = {
  '15': [
    {
      kind: 'raise',
      seconds: 60,
      instruction: 'Raise your heart rate with a minute of easy continuous movement.',
      needsMovement: false,
    },
  ],
  '30': [
    {
      kind: 'raise',
      seconds: 90,
      instruction: 'Raise your heart rate and temperature with easy continuous movement.',
      needsMovement: false,
    },
    {
      kind: 'movement-rehearsal',
      seconds: 45,
      instruction: 'Rehearse the first movement unloaded, at the speed you mean to use.',
      needsMovement: true,
    },
  ],
  '45': [
    {
      kind: 'raise',
      seconds: 120,
      instruction: 'Raise your heart rate and temperature with easy continuous movement.',
      needsMovement: false,
    },
    {
      kind: 'mobilise',
      seconds: 60,
      instruction: 'Take the joints this session uses through their full range, unloaded.',
      needsMovement: false,
    },
    {
      kind: 'movement-rehearsal',
      seconds: 45,
      instruction: 'Rehearse the first movement unloaded, at the speed you mean to use.',
      needsMovement: true,
    },
  ],
  default: [
    {
      kind: 'raise',
      seconds: 150,
      instruction: 'Raise your heart rate and temperature with easy continuous movement.',
      needsMovement: false,
    },
    {
      kind: 'mobilise',
      seconds: 90,
      instruction: 'Take the joints this session uses through their full range, unloaded.',
      needsMovement: false,
    },
    {
      kind: 'movement-rehearsal',
      seconds: 45,
      instruction: 'Rehearse the first movement unloaded, at the speed you mean to use.',
      needsMovement: true,
    },
    {
      kind: 'activate',
      seconds: 60,
      instruction: 'Wake up the muscles this session leads with, using light controlled reps.',
      needsMovement: false,
    },
  ],
}

/** The shortest a pulse-raiser is still worth doing. Below this it is dropped. */
export const MIN_RAISE_SECONDS = 45

/** The most steps a plan may carry, matching `warmUpPlanSchema`. */
export const MAX_WARM_UP_STEPS = 10

/* ------------------------------------------------------------------ *
 * Putting it together
 * ------------------------------------------------------------------ */

export interface WarmUpRequest {
  readonly budget: TimeBudgetPlan
  /** The session's first real movement. `null` when there is nothing to lead into. */
  readonly firstMovement: Exercise | null
  /** The entry that movement sits in. `null` skips ramping entirely. */
  readonly firstEntryId: string | null
  /** Ids are minted `${idPrefix}-step-N` and `${idPrefix}-warmup-N`. */
  readonly idPrefix: string
  /** What the general steps prepare. Trimmed to the eight the schema allows. */
  readonly targetGroups?: readonly MuscleGroupId[]
  /** The reps the first movement's working sets ask for. Defaults to its typical range. */
  readonly workingReps?: number
  readonly workingLoad?: {
    readonly value: number
    readonly unit: WeightUnit
    readonly measure: LoadMeasure
  } | null
  readonly unknownWeightReason?: UnknownWeightReason
}

export interface WarmUpDraft {
  /** Ready for `Workout.warmUp`. `estimatedSeconds` is steps PLUS ramp sets. */
  readonly plan: WarmUpPlan
  /** Insert these at the HEAD of the first entry's targets. All `kind: 'warm-up'`. */
  readonly rampSets: readonly SetTarget[]
  readonly stepSeconds: number
  readonly rampSeconds: number
  readonly totalSeconds: number
  /**
   * Seconds the warm-up went past its allowance. Non-zero only when a loaded
   * compound's two-rung floor could not be afforded — reported, never silent.
   */
  readonly overAllowanceSeconds: number
}

function fitSteps(specs: readonly StepSpec[], capSeconds: number, hasMovement: boolean): StepSpec[] {
  const chosen: StepSpec[] = []
  let used = 0
  for (const spec of specs.slice(0, MAX_WARM_UP_STEPS)) {
    if (spec.needsMovement && !hasMovement) continue
    const remaining = capSeconds - used
    if (spec.seconds <= remaining) {
      chosen.push(spec)
      used += spec.seconds
      continue
    }
    // Only the pulse-raiser scales down rather than dropping out.
    if (spec.kind === 'raise' && remaining >= MIN_RAISE_SECONDS) {
      chosen.push({ ...spec, seconds: Math.floor(remaining) })
      used += Math.floor(remaining)
    }
  }
  return chosen
}

function rationaleFor(
  budget: TimeBudgetPlan,
  rampCount: number,
  stepCount: number,
  overAllowanceSeconds: number,
): string {
  const parts: string[] = []
  if (rampCount > 0) parts.push(`${rampCount} ramp set${rampCount === 1 ? '' : 's'} into the first movement`)
  if (stepCount > 0) parts.push(`${stepCount} general step${stepCount === 1 ? '' : 's'}`)
  if (parts.length === 0) return 'No warm-up was needed for the movements in this session.'
  const head = parts.join(' and ')
  if (!budget.capped) return `${head}, at the length the complete plan allows.`
  if (overAllowanceSeconds > 0) return `${head}. Ramping the first movement came before the general work.`
  return `${head}, scaled to ${budget.plannedMinutes} minutes so the time goes into the work.`
}

/**
 * THE WARM-UP FOR A SESSION OF THIS LENGTH.
 *
 * SPECIFIC BEFORE GENERAL. The ramp takes its share of the allowance first,
 * because ramping into the movement you are about to load is what the warm-up is
 * FOR; the general block then gets whatever is left, capped again by
 * `generalStepCapSeconds`. That ordering is what makes a fifteen-minute session
 * come out with two ramp sets and a short pulse-raiser rather than four minutes
 * of mobility and a cold first set.
 */
export function planWarmUp(request: WarmUpRequest): WarmUpDraft {
  const { budget } = request
  const key = durationKey(budget.durationChoice)

  const exercise = request.firstMovement
  const workingReps =
    request.workingReps ?? (exercise === null ? 10 : Math.round(repMidpoint(exercise.typicalRepRange)))

  const ramp: readonly SetTarget[] =
    request.firstEntryId === null
      ? []
      : rampSets({
          exercise,
          entryId: request.firstEntryId,
          idPrefix: request.idPrefix,
          allowanceSeconds: budget.warmUpAllowanceSeconds,
          restSeconds: rampRestSeconds(budget),
          workingReps,
          repUnit: exercise?.repUnit ?? 'reps',
          workingLoad: request.workingLoad ?? null,
          unknownWeightReason: request.unknownWeightReason,
        })

  const rampSeconds = ramp.reduce((total, set) => total + set.estimatedSeconds, 0)
  const stepCap = Math.min(
    budget.generalStepCapSeconds,
    Math.max(0, budget.warmUpAllowanceSeconds - rampSeconds),
  )
  const specs = fitSteps(GENERAL_STEP_PLANS[key], stepCap, exercise !== null)

  const targetGroups = (request.targetGroups ?? []).slice(0, 8)
  const steps: WarmUpStep[] = specs.map((spec, index) => ({
    stepId: `${request.idPrefix}-step-${index + 1}`,
    kind: spec.kind,
    exerciseId: spec.needsMovement && exercise !== null ? exercise.id : null,
    instruction: spec.instruction,
    seconds: spec.seconds,
    targetGroups: [...targetGroups],
  }))

  const stepSeconds = steps.reduce((total, step) => total + step.seconds, 0)
  const totalSeconds = stepSeconds + rampSeconds
  const overAllowanceSeconds = Math.max(0, totalSeconds - budget.warmUpAllowanceSeconds)

  return {
    plan: {
      steps,
      rampedEntryIds: ramp.length > 0 && request.firstEntryId !== null ? [request.firstEntryId] : [],
      estimatedSeconds: totalSeconds,
      rationale: rationaleFor(budget, ramp.length, steps.length, overAllowanceSeconds),
    },
    rampSets: ramp,
    stepSeconds,
    rampSeconds,
    totalSeconds,
    overAllowanceSeconds,
  }
}
