import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type {
  CircuitGroup,
  DropSetIntent,
  ExerciseEntry,
  SetTarget,
  SupersetBlock,
  Tempo,
  TimeBudget,
  WarmUpPlan,
  Workout,
  WorkoutBlock,
} from '../../core/validation/workoutSchema'
import {
  type EstimateBand,
  type TimeCost,
  ZERO_COST,
  addCosts,
  estimateBand,
  repMidpoint,
  secondsToMinutes,
  setWorkSeconds,
  setupSecondsFor,
  sumCosts,
  tempoSecondsPerRep,
  timeCost,
  transitionChargeSeconds,
  walkSecondsFor,
} from './timeModel'

/**
 * HOW LONG A SESSION ACTUALLY TAKES.
 *
 * Estimation at three levels, as the plan asks: one set, one exercise entry, one
 * whole session — plus a fourth the generator needs before entries exist, the
 * cost of a CANDIDATE it is considering. Every one of them is arithmetic over
 * `timeModel.ts`; there are no second opinions about time in this file.
 *
 * THE CATALOG ARRIVES AS A LOOKUP, NOT AN IMPORT. A session may contain a
 * `custom:` exercise that no catalog entry describes, so `ExerciseLookup` is
 * allowed to answer `null` and the estimate falls back to documented defaults
 * rather than to zero. Every estimate reports `usedFallback`, so a caller can
 * tell "45 minutes" from "45 minutes, some of it guessed".
 *
 * A SUPERSET IS ESTIMATED AS THE BLOCK IT IS. Two exercises alternated are not
 * two exercises performed separately: one long rest per round replaces two, and
 * the walk between the pair is the gap between the moves rather than an extra
 * transition. `supersetSaving()` states the difference as a number, and it is
 * allowed to come out NEGATIVE — pairing two far-apart movements that already
 * rested briefly costs time rather than saving it, and a model that could not say
 * so would talk the generator into bad pairings.
 *
 * THE ONE DOUBLE-COUNT TO WATCH. Ramp sets are `warm-up` targets living INSIDE an
 * entry, while warm-up steps live on `WarmUpPlan.steps`. A session estimate
 * therefore counts the steps once and lets the ramp sets be counted by the block
 * they sit in. `warmUpTotalSeconds` (steps + ramps) exists for
 * `WarmUpPlan.estimatedSeconds` and must never be added to a session total that
 * already walked the blocks. `estimate.test.ts` pins this.
 */

/** Answers with the catalog entry for an id, or `null` for one it does not know. */
export type ExerciseLookup = (exerciseId: string) => Exercise | null

/** A lookup built from a list. The generator already holds `input.exercises`. */
export function lookupFrom(exercises: readonly Exercise[]): ExerciseLookup {
  const index = new Map<string, Exercise>()
  for (const exercise of exercises) index.set(exercise.id, exercise)
  return (exerciseId) => index.get(exerciseId) ?? null
}

/* ------------------------------------------------------------------ *
 * Level one: a single set
 * ------------------------------------------------------------------ */

export interface SetEstimate {
  readonly setId: string
  readonly kind: SetTarget['kind']
  readonly cost: TimeCost
}

/**
 * ONE PROGRAMMED SET: the work in it, plus the rest that follows it.
 *
 * A drop-set intent charges only its `transitionSeconds` per drop — the seconds
 * spent stripping load. The drops THEMSELVES are separate `drop` targets in the
 * same entry and are estimated here in their own right, so charging their work
 * here as well would count every drop twice.
 */
export function estimateSetTarget(target: SetTarget, exercise: Exercise | null): SetEstimate {
  const work = setWorkSeconds({
    reps: repMidpoint(target.reps),
    repUnit: target.reps.unit,
    unilateral: exercise?.unilateral ?? false,
    secondsPerRep: tempoSecondsPerRep(target.tempo),
  })
  const stripping = target.dropSet === null ? 0 : target.dropSet.drops * target.dropSet.transitionSeconds
  return {
    setId: target.setId,
    kind: target.kind,
    cost: timeCost(work + stripping, target.restSeconds, 0),
  }
}

/* ------------------------------------------------------------------ *
 * Level two: an exercise entry
 * ------------------------------------------------------------------ */

export interface EntryEstimate {
  readonly entryId: string
  readonly exerciseId: string
  /** Setup, every set, and every set's rest. */
  readonly cost: TimeCost
  readonly sets: readonly SetEstimate[]
  /** The part of `cost.totalSeconds` spent on `warm-up` targets. */
  readonly rampSeconds: number
  /** True when the catalog could not describe this exercise. */
  readonly usedFallback: boolean
}

/**
 * ONE EXERCISE: setup, then every set with its rest.
 *
 * Setup is charged once, to the entry, because you set a thing up once and then
 * do all of your sets on it. A superset pays TWO setups for the same reason: it
 * occupies two stations for the whole block.
 */
export function estimateEntry(entry: ExerciseEntry, lookup: ExerciseLookup): EntryEstimate {
  const exercise = lookup(entry.exerciseId)
  const sets = entry.targets.map((target) => estimateSetTarget(target, exercise))
  const setup = timeCost(0, 0, setupSecondsFor(exercise))
  const rampSeconds = sets
    .filter((set) => set.kind === 'warm-up')
    .reduce((total, set) => total + set.cost.totalSeconds, 0)

  return {
    entryId: entry.entryId,
    exerciseId: entry.exerciseId,
    cost: addCosts(...sets.map((set) => set.cost), setup),
    sets,
    rampSeconds,
    usedFallback: exercise === null,
  }
}

/* ------------------------------------------------------------------ *
 * Level three: a block
 * ------------------------------------------------------------------ */

export interface BlockEstimate {
  readonly blockId: string
  readonly kind: WorkoutBlock['kind']
  readonly cost: TimeCost
  readonly entries: readonly EntryEstimate[]
  /** The rest charged to the LAST set of the block. What the next walk nets off. */
  readonly trailingRestSeconds: number
  readonly usedFallback: boolean
}

/** The exercise a block is entered at — move one, for a superset. */
function leadExercise(block: WorkoutBlock, lookup: ExerciseLookup): Exercise | null {
  return lookup(block.kind === 'superset' ? block.moves[0].exerciseId : block.entry.exerciseId)
}

function trailingRestOf(entry: ExerciseEntry): number {
  const last = entry.targets[entry.targets.length - 1]
  return last === undefined ? 0 : last.restSeconds
}

/**
 * The seconds a superset spends WALKING between its two moves beyond the gap it
 * already programmed.
 *
 * Inside a round you go straight from move one to move two, so the programmed
 * `restBetweenMovesSeconds` IS the walk — there is no resting to overlap with and
 * no `TRANSITION_REST_OVERLAP` credit here. What is charged is only the part the
 * gap cannot cover, per round, which is zero for a well-chosen pair and real for
 * a pair on opposite sides of a gym.
 */
export function supersetWalkSeconds(block: SupersetBlock, lookup: ExerciseLookup): number {
  const walk = walkSecondsFor(lookup(block.moves[1].exerciseId))
  const [first] = block.moves
  let total = 0
  for (let round = 0; round < block.rounds; round += 1) {
    const gap = first.targets[round]?.restSeconds ?? block.restBetweenMovesSeconds
    total += Math.max(0, walk - gap)
  }
  return total
}

export function estimateBlock(block: WorkoutBlock, lookup: ExerciseLookup): BlockEstimate {
  if (block.kind === 'single') {
    const entry = estimateEntry(block.entry, lookup)
    return {
      blockId: block.blockId,
      kind: 'single',
      cost: entry.cost,
      entries: [entry],
      trailingRestSeconds: trailingRestOf(block.entry),
      usedFallback: entry.usedFallback,
    }
  }

  const entries = block.moves.map((move) => estimateEntry(move, lookup))
  const walk = timeCost(0, 0, supersetWalkSeconds(block, lookup))
  return {
    blockId: block.blockId,
    kind: 'superset',
    cost: addCosts(...entries.map((entry) => entry.cost), walk),
    entries,
    trailingRestSeconds: trailingRestOf(block.moves[1]),
    usedFallback: entries.some((entry) => entry.usedFallback),
  }
}

/* ------------------------------------------------------------------ *
 * Level four: the whole session
 * ------------------------------------------------------------------ */

export interface SessionEstimate {
  /** Warm-up STEPS only. Ramp sets are counted inside the block that holds them. */
  readonly warmUpStepSeconds: number
  /** Ramp sets, pulled back out of the blocks so a screen can name the warm-up. */
  readonly rampSeconds: number
  /** Steps plus ramps. For `WarmUpPlan.estimatedSeconds`; NEVER add it to the total. */
  readonly warmUpTotalSeconds: number
  readonly workSeconds: number
  readonly restSeconds: number
  readonly transitionSeconds: number
  /** Warm-up steps plus work plus rest plus transition. The honest length. */
  readonly totalSeconds: number
  /** What a screen shows. */
  readonly minutes: number
  readonly band: EstimateBand
  readonly blocks: readonly BlockEstimate[]
  /** True when any entry fell back to defaults because the catalog lacked it. */
  readonly usedFallback: boolean
}

export interface SessionEstimateInput {
  readonly blocks: readonly WorkoutBlock[]
  /** `warmUpStepSeconds(plan)`, or 0 for a draft with no steps yet. */
  readonly warmUpStepSeconds: number
  /** Circuits over the blocks. Each extra round revisits every station. */
  readonly circuits?: readonly CircuitGroup[]
}

/** Warm-up steps only — the part that is not ramp sets inside an entry. */
export function warmUpStepSeconds(plan: Pick<WarmUpPlan, 'steps'>): number {
  return plan.steps.reduce((total, step) => total + step.seconds, 0)
}

/**
 * The extra walking a circuit costs.
 *
 * A block's own transition pays for ARRIVING at it once. A circuit visits every
 * station on every round, so each round after the first pays the walk again —
 * netted against the circuit's own between-station rest, exactly as an ordinary
 * transition is.
 */
function circuitWalkSeconds(
  circuits: readonly CircuitGroup[],
  blocks: readonly WorkoutBlock[],
  lookup: ExerciseLookup,
): number {
  const byId = new Map(blocks.map((block) => [block.blockId, block]))
  let total = 0
  for (const circuit of circuits) {
    const extraRounds = Math.max(0, circuit.rounds - 1)
    if (extraRounds === 0) continue
    for (const blockId of circuit.blockIds) {
      const block = byId.get(blockId)
      if (block === undefined) continue
      total +=
        extraRounds * transitionChargeSeconds(leadExercise(block, lookup), circuit.restBetweenStationsSeconds)
    }
  }
  return total
}

/**
 * THE NUMBER THE UI SHOWS.
 *
 * Warm-up steps, then every block in order, then the walk between them. The walk
 * before the first block is charged in full — there is no previous rest to spend
 * it during — and every later one is netted against the rest the previous block
 * ended on.
 */
export function estimateSession(input: SessionEstimateInput, lookup: ExerciseLookup): SessionEstimate {
  const blocks = input.blocks.map((block) => estimateBlock(block, lookup))

  let previousRest: number | null = null
  let walkSeconds = 0
  for (const [index, block] of input.blocks.entries()) {
    walkSeconds += transitionChargeSeconds(leadExercise(block, lookup), previousRest)
    previousRest = blocks[index].trailingRestSeconds
  }
  walkSeconds += circuitWalkSeconds(input.circuits ?? [], input.blocks, lookup)

  const body = addCosts(sumCosts(blocks.map((block) => block.cost)), timeCost(0, 0, walkSeconds))
  const steps = Math.max(0, Math.round(input.warmUpStepSeconds))
  const rampSeconds = blocks.reduce(
    (total, block) => total + block.entries.reduce((sum, entry) => sum + entry.rampSeconds, 0),
    0,
  )
  const totalSeconds = steps + body.totalSeconds

  return {
    warmUpStepSeconds: steps,
    rampSeconds,
    warmUpTotalSeconds: steps + rampSeconds,
    workSeconds: body.workSeconds,
    restSeconds: body.restSeconds,
    transitionSeconds: body.transitionSeconds,
    totalSeconds,
    minutes: secondsToMinutes(totalSeconds),
    band: estimateBand(totalSeconds),
    blocks,
    usedFallback: blocks.some((block) => block.usedFallback),
  }
}

/** The same estimate, taken straight off a generated session. */
export function estimateWorkout(workout: Workout, lookup: ExerciseLookup): SessionEstimate {
  return estimateSession(
    {
      blocks: workout.blocks,
      warmUpStepSeconds: warmUpStepSeconds(workout.warmUp),
      circuits: workout.circuits,
    },
    lookup,
  )
}

/**
 * The four numbers `RecalibrationMetadata.timeBudget` stores, minus the budget
 * itself. Kept here so the audit trail and the estimate can never disagree.
 */
export function timeBudgetFields(
  estimate: SessionEstimate,
): Pick<
  TimeBudget,
  'warmUpSeconds' | 'workSeconds' | 'restSeconds' | 'transitionSeconds' | 'estimatedSeconds'
> {
  return {
    warmUpSeconds: estimate.warmUpStepSeconds,
    workSeconds: estimate.workSeconds,
    restSeconds: estimate.restSeconds,
    transitionSeconds: estimate.transitionSeconds,
    estimatedSeconds: estimate.totalSeconds,
  }
}

/* ------------------------------------------------------------------ *
 * A candidate the generator has not committed to yet
 * ------------------------------------------------------------------ */

/**
 * How much of the parent set's reps a drop is worth.
 *
 * Only the CANDIDATE estimate needs this. In a built session the drops are real
 * `drop` targets with their own rep ranges and are estimated exactly; here there
 * is nothing to read yet, and a drop taken to failure at a reduced load lands at
 * roughly two thirds of the parent set before it stops.
 */
export const DROP_REP_FRACTION = 0.65

/** The default reps assumed for an exercise the catalog cannot describe. */
export const FALLBACK_REPS = 10

export interface CandidateSpec {
  /** `null` for a `custom:` movement. Costed from the documented fallbacks. */
  readonly exercise: Exercise | null
  readonly workingSets: number
  /** Defaults to the midpoint of the exercise's `typicalRepRange`. */
  readonly reps?: number
  readonly restSeconds: number
  readonly warmUpSets?: number
  readonly warmUpRestSeconds?: number
  /** The intent hung on the last working set, if any. */
  readonly dropSet?: DropSetIntent | null
  readonly tempo?: Tempo | null
  /** Rest the previous block ended on. `null` when this would open the session. */
  readonly previousRestSeconds?: number | null
}

export interface CandidateCost extends TimeCost {
  /** Work plus rest for ONE working set. */
  readonly perSetSeconds: number
  /**
   * WHAT ONE MORE WORKING SET WOULD COST. The primitive a rebuild reaches for
   * first: adding volume is nearly always cheaper than adding an exercise,
   * because it pays no setup and no walk.
   */
  readonly marginalSetSeconds: number
  readonly setupSeconds: number
  readonly rampSeconds: number
  /** The walk to reach it, already netted against `previousRestSeconds`. */
  readonly walkSeconds: number
}

/** The reps an estimate assumes for a candidate when the caller names none. */
function candidateReps(exercise: Exercise | null, reps?: number): number {
  if (reps !== undefined) return reps
  return exercise === null ? FALLBACK_REPS : repMidpoint(exercise.typicalRepRange)
}

/** The work in one set of a candidate, from the exercise's own facts. */
function candidateWorkPerSet(exercise: Exercise | null, reps?: number, tempo: Tempo | null = null): number {
  return setWorkSeconds({
    reps: candidateReps(exercise, reps),
    repUnit: exercise?.repUnit ?? 'reps',
    unilateral: exercise?.unilateral ?? false,
    secondsPerRep: tempoSecondsPerRep(tempo),
  })
}

/**
 * WHAT PUTTING THIS EXERCISE IN THE SESSION WOULD COST, before any entry exists.
 *
 * This is the number duration fitting weighs value against. It is the same
 * arithmetic `estimateEntry` does, from a proposed scheme rather than from
 * programmed targets, so a candidate that is chosen and then built estimates the
 * same both times.
 */
export function estimateCandidate(spec: CandidateSpec): CandidateCost {
  const exercise = spec.exercise
  const tempo = spec.tempo ?? null
  const reps = candidateReps(exercise, spec.reps)

  const workPerSet = candidateWorkPerSet(exercise, reps, tempo)
  const workingSets = Math.max(0, Math.trunc(spec.workingSets))
  const rest = Math.max(0, spec.restSeconds)

  const warmUpSets = Math.max(0, Math.trunc(spec.warmUpSets ?? 0))
  const warmUpRest = Math.max(0, spec.warmUpRestSeconds ?? 0)
  const warmUpWorkPerSet = candidateWorkPerSet(exercise, Math.max(1, Math.round(reps * 0.6)), tempo)

  const drop = spec.dropSet ?? null
  const dropWork =
    drop === null
      ? 0
      : drop.drops *
        (drop.transitionSeconds +
          candidateWorkPerSet(exercise, Math.max(1, Math.round(reps * DROP_REP_FRACTION)), tempo))

  const walkSeconds = transitionChargeSeconds(exercise, spec.previousRestSeconds ?? null)
  const setupSeconds = setupSecondsFor(exercise)

  const work = workingSets * workPerSet + warmUpSets * warmUpWorkPerSet + dropWork
  const restTotal = workingSets * rest + warmUpSets * warmUpRest
  const cost = timeCost(work, restTotal, setupSeconds + walkSeconds)

  return {
    ...cost,
    perSetSeconds: workPerSet + rest,
    marginalSetSeconds: workPerSet + rest,
    setupSeconds,
    rampSeconds: Math.round(warmUpSets * (warmUpWorkPerSet + warmUpRest)),
    walkSeconds,
  }
}

/* ------------------------------------------------------------------ *
 * What a superset is worth, in seconds
 * ------------------------------------------------------------------ */

export interface SupersetSaving {
  /** What the pair costs performed as one alternating block. */
  readonly pairedSeconds: number
  /** What the same two exercises cost performed one after the other. */
  readonly separateSeconds: number
  /** `separateSeconds - pairedSeconds`. NEGATIVE when pairing costs time. */
  readonly savedSeconds: number
  /** True only when the pairing is actually faster. */
  readonly saves: boolean
}

export interface SupersetSavingInput {
  readonly first: Exercise | null
  readonly second: Exercise | null
  readonly rounds: number
  readonly repsFirst?: number
  readonly repsSecond?: number
  /** The straight-set rests the two would have had on their own. */
  readonly straightRestFirstSeconds: number
  readonly straightRestSecondSeconds: number
  /** The pairing's own gaps, from `supersetRests` in `budget.ts`. */
  readonly betweenMovesSeconds: number
  readonly afterRoundSeconds: number
}

/**
 * WHAT PAIRING TWO EXERCISES SAVES — and it is allowed to be negative.
 *
 * Separately, each round of each exercise pays its own full rest, and moving from
 * the first to the second pays a transition once. Paired, a round pays one short
 * gap and one round rest between them, and the gap doubles as the walk.
 *
 * The honest answer is sometimes "nothing". Two isolation movements that already
 * rested 30 seconds, on opposite sides of a gym, cost MORE alternated than
 * performed in turn, because the walk happens six times instead of once. A
 * generator that assumed supersets always save time would pair those and then
 * wonder why the session ran long.
 */
export function supersetSaving(input: SupersetSavingInput): SupersetSaving {
  const rounds = Math.max(0, Math.trunc(input.rounds))
  const between = Math.max(0, input.betweenMovesSeconds)
  const after = Math.max(0, input.afterRoundSeconds)

  const workFirst = candidateWorkPerSet(input.first, input.repsFirst)
  const workSecond = candidateWorkPerSet(input.second, input.repsSecond)

  // Paired: both stations set up once, entered once, then a round is
  // work - gap - work - round rest, with the gap doubling as the walk across.
  const paired =
    setupSecondsFor(input.first) +
    setupSecondsFor(input.second) +
    transitionChargeSeconds(input.first, null) +
    rounds * (workFirst + between + workSecond + after) +
    rounds * Math.max(0, walkSecondsFor(input.second) - between)

  const firstAlone = estimateCandidate({
    exercise: input.first,
    workingSets: rounds,
    reps: input.repsFirst,
    restSeconds: input.straightRestFirstSeconds,
    previousRestSeconds: null,
  })
  const secondAlone = estimateCandidate({
    exercise: input.second,
    workingSets: rounds,
    reps: input.repsSecond,
    restSeconds: input.straightRestSecondSeconds,
    previousRestSeconds: input.straightRestFirstSeconds,
  })

  const separate = firstAlone.totalSeconds + secondAlone.totalSeconds
  const savedSeconds = Math.round(separate - paired)

  return {
    pairedSeconds: Math.round(paired),
    separateSeconds: Math.round(separate),
    savedSeconds,
    saves: savedSeconds > 0,
  }
}

/** An empty session still has a shape. Used where a draft has no blocks yet. */
export const EMPTY_SESSION_COST: TimeCost = ZERO_COST
