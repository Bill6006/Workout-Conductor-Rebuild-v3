import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { RestStyle } from '../../core/validation/schemas'
import type { DurationChoice } from '../../core/validation/workoutSchema'
import { fixedDurationMinutes, isFixedDurationChoice } from '../../core/validation/workoutSchema'
import { secondsToMinutes } from './timeModel'

/**
 * THE TIME BUDGET — what 15, 30, 45 and "Default time" actually mean in seconds.
 *
 * THE ONE RULE THIS FILE EXISTS TO SERVE: A SHORTER DURATION REBUILDS THE
 * SESSION. It does not truncate the tail off a longer one. Nothing here trims a
 * list; what it produces is the ROOM — a budget, a warm-up allowance, and a rest
 * policy — so that the generator can build the best session for that time from
 * scratch. `fit.ts` then weighs candidates against that room.
 *
 * `'default'` IS AN OUTPUT, NOT A NUMBER. The other three choices are caps: pick
 * 30 and the session must come in at 30. "Default time" is the complete duration
 * the current plan generates, so its budget is `capped: false` — an expectation
 * to build towards, not a ceiling to fit under — and the length that lands on
 * `Workout.plannedMinutes` is whatever the finished session costs
 * (`resolveDefaultMinutes`). Treating it as a fourth fixed number is the bug this
 * flag exists to prevent.
 *
 * WHAT COMES OFF THE TOP, AND WHY IT IS NAMED. A 45-minute budget does not hold
 * 45 minutes of programmed work: some of it is the walk in, the warm-up, and the
 * ordinary friction of a real session. Both deductions are explicit fields rather
 * than a hidden multiplier, so a screen can show where the time went and a
 * reviewer can argue with the number:
 *
 *   reserveSeconds  — friction. Deliberately small, because `timeModel.ts`
 *                     already charges rest and walking honestly; this covers the
 *                     things no model sees, like a machine being occupied.
 *   warmUpAllowanceSeconds — set aside before selection so the warm-up is not
 *                     whatever happens to be left. If the warm-up comes in under
 *                     its allowance the difference returns as headroom.
 *
 * THERE IS NO FULL, LAZY, SHORT, DENSITY OR RECOVERY MODE HERE. A duration is a
 * number of seconds and a set of allowances. Recovery, readiness and time
 * pressure reach the generator as inputs that change what it builds inside this
 * room; none of them opens a second kind of session.
 */

/* ------------------------------------------------------------------ *
 * The dials
 * ------------------------------------------------------------------ */

/**
 * The fraction of a fixed budget held back for friction, and its bounds.
 *
 * SIX PER CENT, floored at 45 seconds and capped at 180. It is small on purpose:
 * the time model already charges every rest including the last, and the walk
 * between exercises, so the big honest costs are already in the estimate. What is
 * left for a reserve is the unmodellable — a bench in use, a shoelace, a message.
 * Making it larger would be paying twice for caution and would under-fill every
 * session; making it zero would mean a session that estimates at exactly 45 has
 * no chance at all of finishing in 45.
 */
export const RESERVE_FRACTION = 0.06
export const MIN_RESERVE_SECONDS = 45
export const MAX_RESERVE_SECONDS = 180

/**
 * THE TOTAL WARM-UP ALLOWANCE, per duration, in seconds. Ramp sets and general
 * steps together.
 *
 * The 15-minute number is the interesting one. Three minutes of warm-up in a
 * fifteen-minute session is a fifth of it, and the plan is explicit that a short
 * session is not the place for a long optional warm-up block — so 150 seconds,
 * and `GENERAL_STEP_CAP_SECONDS` below spends almost all of it on the specific
 * ramp rather than on general preparation. Ramping into the one heavy movement is
 * what keeps a short session safe; five minutes of mobility is what makes it
 * pointless.
 */
export const WARM_UP_ALLOWANCE_SECONDS: Readonly<Record<DurationKey, number>> = {
  '15': 150,
  '30': 330,
  '45': 450,
  default: 540,
}

/**
 * THE HARD CAP ON THE GENERAL WARM-UP BLOCK — pulse-raising, mobility,
 * activation, rehearsal. Specific ramp sets are NOT charged against it.
 *
 * This is where "at 15 minutes, do not spend it on a long optional warm-up block"
 * is actually enforced. Sixty seconds buys one pulse-raiser and nothing else.
 */
export const GENERAL_STEP_CAP_SECONDS: Readonly<Record<DurationKey, number>> = {
  '15': 60,
  '30': 180,
  '45': 270,
  default: 330,
}

/**
 * BASE REST BY TRAINING ROLE, in seconds, at the standard rest style and the
 * complete duration.
 *
 * These are the rests the role actually needs: a heavy compound needs three
 * minutes to repeat itself honestly, an isolation set does not. They are the
 * BASE — the duration and the person's rest style scale them below, and the
 * generator may override any of them with something it knows better.
 */
export const BASE_REST_SECONDS: Readonly<Record<TrainingRole, number>> = {
  'primary-strength': 180,
  'secondary-strength': 150,
  'primary-hypertrophy': 120,
  'secondary-hypertrophy': 90,
  isolation: 60,
  specialisation: 75,
  corrective: 45,
  'warm-up': 30,
  finisher: 45,
}

/** What the person asked for in Settings. Their preference, not the clock's. */
export const REST_STYLE_MULTIPLIER: Readonly<Record<RestStyle, number>> = {
  short: 0.75,
  standard: 1,
  long: 1.3,
}

/**
 * HOW MUCH THE CLOCK COMPRESSES REST, per duration.
 *
 * A short session is bought partly with shorter rests — that is what "short but
 * realistic rests" means, and it is a legitimate trade because a 15-minute
 * session is not attempting a maximal single. It is NOT bought by cutting rest to
 * nothing: `MIN_WORKING_REST_SECONDS` floors every result, because below about
 * half a minute a set is not repeated, it is rushed, and the second set is worth
 * less than the time it took.
 */
export const DURATION_REST_MULTIPLIER: Readonly<Record<DurationKey, number>> = {
  '15': 0.65,
  '30': 0.8,
  '45': 0.9,
  default: 1,
}

/** No working set rests less than this, whatever the pressure. */
export const MIN_WORKING_REST_SECONDS = 30
/** Nothing in a generated session rests longer than this. */
export const MAX_REST_SECONDS = 300

/**
 * HOW STRONGLY EACH DURATION WANTS SUPERSETS, 0..1.
 *
 * A bias, not a rule. The conflict engine decides whether a given pair is legal
 * and `supersetSaving()` decides whether it is actually faster; this only says
 * how hard the generator should look. At 15 minutes it should look hard.
 */
export const SUPERSET_BIAS: Readonly<Record<DurationKey, number>> = {
  '15': 0.9,
  '30': 0.6,
  '45': 0.4,
  default: 0.25,
}

/**
 * THE SMALLEST SESSION WORTH DOING, in seconds.
 *
 * One compound movement, a two-set ramp into it, three working sets at a
 * compressed rest, and the walk to it. Below this there is no session to build —
 * see `assessDuration`'s `'impossible'` verdict, which reports that rather than
 * quietly returning a single set and calling it a workout.
 */
export const MINIMUM_VIABLE_SECONDS = 6 * 60

/* ------------------------------------------------------------------ *
 * Rest policy
 * ------------------------------------------------------------------ */

export interface RestPolicy {
  readonly durationChoice: DurationChoice
  readonly restStyle: RestStyle
  /** `REST_STYLE_MULTIPLIER` times `DURATION_REST_MULTIPLIER`. */
  readonly multiplier: number
  /** Every role's rest, already scaled, floored and capped. Materialised so it can be stored. */
  readonly byRole: Readonly<Record<TrainingRole, number>>
}

function clampRest(seconds: number): number {
  return Math.min(MAX_REST_SECONDS, Math.max(MIN_WORKING_REST_SECONDS, Math.round(seconds)))
}

/** The four keys the per-duration tables above are written under. */
export type DurationKey = '15' | '30' | '45' | 'default'

/** The key `WARM_UP_ALLOWANCE_SECONDS` and friends are written under. */
export function durationKey(choice: DurationChoice): DurationKey {
  return isFixedDurationChoice(choice) ? (String(choice) as '15' | '30' | '45') : 'default'
}

export function restPolicyFor(choice: DurationChoice, restStyle: RestStyle): RestPolicy {
  const multiplier = REST_STYLE_MULTIPLIER[restStyle] * DURATION_REST_MULTIPLIER[durationKey(choice)]
  const byRole = {} as Record<TrainingRole, number>
  for (const [role, base] of Object.entries(BASE_REST_SECONDS)) {
    byRole[role as TrainingRole] = clampRest(base * multiplier)
  }
  return { durationChoice: choice, restStyle, multiplier, byRole }
}

/** The rest a role gets under a policy. */
export function restSecondsFor(policy: RestPolicy, role: TrainingRole): number {
  return policy.byRole[role]
}

/** The gaps a superset programs, and the rests its two moves' targets carry. */
export interface SupersetRests {
  /** Move one to move two, inside a round. Doubles as the walk across. */
  readonly betweenMovesSeconds: number
  /** After move two, before the next round. */
  readonly afterRoundSeconds: number
  /** Move one's `SetTarget.restSeconds` — the between-moves gap. */
  readonly moveARestSeconds: number
  /** Move two's `SetTarget.restSeconds` — the round rest. */
  readonly moveBRestSeconds: number
}

/**
 * THE REST SCHEME THAT MAKES A SUPERSET A SUPERSET.
 *
 * One round rest replaces two straight rests, and a short gap replaces the
 * second. Both are derived from the LONGER of the two moves' straight rests,
 * because the harder movement sets what the pair needs.
 *
 * THE CAPS ARE LOAD-BEARING, not tidiness. Without them a pairing of one
 * long-rested lift with one short-rested one would cost more REST paired than
 * separately (1.1 x 300 against 300 + 30). Capped at 60 and 240 the paired scheme
 * can never exceed 300 seconds a round, while any pair reaching those caps rests
 * at least 313 separately. `budget.test.ts` sweeps the whole grid.
 *
 * THE REST ARITHMETIC IS NOT THE WHOLE STORY, AND THIS FUNCTION DOES NOT PRETEND
 * IT IS. A superset also pays the walk across on every round instead of once, so
 * at the very bottom of the rest range — two isolation movements at fifteen
 * minutes, already down at the floor — pairing costs time rather than saving it.
 * Ask `supersetSaving()` before pairing; it is the function that knows about the
 * walk, and it is allowed to answer no. `estimate.test.ts` pins both sides of
 * that boundary.
 */
export function supersetRests(policy: RestPolicy, roleA: TrainingRole, roleB: TrainingRole): SupersetRests {
  const pairRest = Math.max(restSecondsFor(policy, roleA), restSecondsFor(policy, roleB))
  const betweenMovesSeconds = Math.min(60, Math.max(15, Math.round(pairRest * 0.25)))
  const afterRoundSeconds = Math.min(240, Math.max(45, Math.round(pairRest * 0.85)))
  return {
    betweenMovesSeconds,
    afterRoundSeconds,
    moveARestSeconds: betweenMovesSeconds,
    moveBRestSeconds: afterRoundSeconds,
  }
}

/* ------------------------------------------------------------------ *
 * What each duration allows
 * ------------------------------------------------------------------ */

/**
 * The techniques a duration opens the door to. Each is ANDed with what the person
 * turned on in Settings — a duration never enables something they switched off.
 */
export interface TechniqueAllowance {
  /** 0..1. How hard to look for a legal, time-saving pairing. */
  readonly supersetBias: number
  readonly allowSupersets: boolean
  readonly allowDropSets: boolean
  readonly allowCircuits: boolean
  /**
   * Whether there is room for general warm-up steps at all. False at 15 minutes
   * once the ramp has taken its share — the plan says the time goes into the work.
   */
  readonly allowGeneralWarmUpBlock: boolean
}

export interface TimeBudgetPlan {
  readonly durationChoice: DurationChoice
  /** What lands on `Workout.plannedMinutes`. Equals the choice when it is fixed. */
  readonly plannedMinutes: number
  readonly budgetSeconds: number
  /** False for `'default'`: an expectation to build towards, not a ceiling. */
  readonly capped: boolean
  readonly reserveSeconds: number
  /** Budget minus reserve. What a session is actually built into. */
  readonly usableSeconds: number
  readonly warmUpAllowanceSeconds: number
  readonly generalStepCapSeconds: number
  /** Usable minus the warm-up allowance. The room the blocks compete for. */
  readonly workAllowanceSeconds: number
  readonly minimumViableSeconds: number
  readonly restPolicy: RestPolicy
  readonly techniques: TechniqueAllowance
}

/** What the person has switched on. Straight off `Profile['techniques']`. */
export interface TechniquePreferences {
  readonly supersets: boolean
  readonly dropSets: boolean
  readonly circuits: boolean
}

export interface BudgetOptions {
  readonly restStyle?: RestStyle
  readonly techniques?: TechniquePreferences
  /**
   * The complete duration the plan generates, in minutes. REQUIRED in spirit for
   * `'default'`: it comes from the weekly plan's slot, or failing that from
   * `profile.schedule.typicalDurationMin`. It is a starting expectation only —
   * the length that ends up on the workout is `resolveDefaultMinutes`.
   */
  readonly defaultMinutes?: number
  /** Overrides `MINIMUM_VIABLE_SECONDS` when the caller has costed a real anchor. */
  readonly minimumViableSeconds?: number
}

/** The expectation used for `'default'` when the caller supplies nothing. */
export const FALLBACK_DEFAULT_MINUTES = 60

/**
 * THE BUDGET FOR A DURATION CHOICE.
 *
 * Deterministic and total: same choice and options, same plan, every time. It
 * reads no clock — a "default" length comes from the plan or the profile, never
 * from how much of the day is left.
 */
export function budgetFor(choice: DurationChoice, options: BudgetOptions = {}): TimeBudgetPlan {
  const key = durationKey(choice)
  const fixed = fixedDurationMinutes(choice)
  const capped = fixed !== null
  const plannedMinutes = fixed ?? Math.max(5, Math.round(options.defaultMinutes ?? FALLBACK_DEFAULT_MINUTES))

  const budgetSeconds = plannedMinutes * 60
  const reserveSeconds = Math.round(
    Math.min(MAX_RESERVE_SECONDS, Math.max(MIN_RESERVE_SECONDS, budgetSeconds * RESERVE_FRACTION)),
  )
  const usableSeconds = Math.max(0, budgetSeconds - reserveSeconds)

  const warmUpAllowanceSeconds = Math.min(WARM_UP_ALLOWANCE_SECONDS[key], Math.round(usableSeconds * 0.25))
  const generalStepCapSeconds = Math.min(GENERAL_STEP_CAP_SECONDS[key], warmUpAllowanceSeconds)
  const workAllowanceSeconds = Math.max(0, usableSeconds - warmUpAllowanceSeconds)

  const restStyle = options.restStyle ?? 'standard'
  const techniques = options.techniques ?? { supersets: true, dropSets: true, circuits: false }

  return {
    durationChoice: choice,
    plannedMinutes,
    budgetSeconds,
    capped,
    reserveSeconds,
    usableSeconds,
    warmUpAllowanceSeconds,
    generalStepCapSeconds,
    workAllowanceSeconds,
    minimumViableSeconds: options.minimumViableSeconds ?? MINIMUM_VIABLE_SECONDS,
    restPolicy: restPolicyFor(choice, restStyle),
    techniques: {
      supersetBias: SUPERSET_BIAS[key],
      allowSupersets: techniques.supersets,
      allowDropSets: techniques.dropSets,
      allowCircuits: techniques.circuits,
      allowGeneralWarmUpBlock: generalStepCapSeconds > 0,
    },
  }
}

/**
 * A BUDGET FOR AN ARBITRARY HARD STOP — the material an "End by exact time" mode
 * needs.
 *
 * It is deliberately NOT a fifth duration choice, and it never reaches
 * `Workout.durationChoice`: the vocabulary of session length is 15, 30, 45 and
 * Default, and this is a caller saying "I have to leave at ten past". It borrows
 * the nearest fixed choice's allowances so a 22-minute stop behaves like a short
 * session rather than like an unrecognised one.
 */
export function budgetForExactEnd(seconds: number, options: BudgetOptions = {}): TimeBudgetPlan {
  const minutes = Math.max(5, secondsToMinutes(seconds))
  const nearest: DurationChoice = minutes <= 22 ? 15 : minutes <= 37 ? 30 : minutes <= 55 ? 45 : 'default'
  const plan = budgetFor(nearest, { ...options, defaultMinutes: minutes })
  const budgetSeconds = minutes * 60
  const reserveSeconds = Math.round(
    Math.min(MAX_RESERVE_SECONDS, Math.max(MIN_RESERVE_SECONDS, budgetSeconds * RESERVE_FRACTION)),
  )
  const usableSeconds = Math.max(0, budgetSeconds - reserveSeconds)
  const warmUpAllowanceSeconds = Math.min(plan.warmUpAllowanceSeconds, Math.round(usableSeconds * 0.25))
  return {
    ...plan,
    plannedMinutes: minutes,
    budgetSeconds,
    capped: true,
    reserveSeconds,
    usableSeconds,
    warmUpAllowanceSeconds,
    generalStepCapSeconds: Math.min(plan.generalStepCapSeconds, warmUpAllowanceSeconds),
    workAllowanceSeconds: Math.max(0, usableSeconds - warmUpAllowanceSeconds),
  }
}

/**
 * WHAT `'default'` RESOLVED TO. The complete session's own length, rounded to
 * minutes and clamped into the range `Workout.plannedMinutes` accepts.
 *
 * For a fixed choice this returns the choice unchanged, because the durable
 * schema refuses a workout whose `plannedMinutes` disagrees with a 15/30/45
 * `durationChoice`.
 */
export function resolveDefaultMinutes(plan: TimeBudgetPlan, estimatedSeconds: number): number {
  if (plan.capped) return plan.plannedMinutes
  return Math.min(300, Math.max(5, secondsToMinutes(estimatedSeconds)))
}

/**
 * How squeezed the session is, 0..1, where 1 means the usable budget is full.
 *
 * The generator feeds this into decisions that legitimately depend on the clock —
 * how hard to look for a superset, whether an accessory is worth its setup. It is
 * a pressure, not a mode: nothing branches into a different KIND of session on it.
 */
export function budgetPressure(plan: TimeBudgetPlan, estimatedSeconds: number): number {
  if (plan.usableSeconds <= 0) return 1
  return Math.min(1, Math.max(0, estimatedSeconds / plan.usableSeconds))
}
