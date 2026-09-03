/**
 * The set, rep, RIR and rest scheme for one slot.
 *
 * This is where the hybrid strength-and-hypertrophy model becomes numbers.
 * Strength work gets lower reps, longer rest, and fewer high-quality sets;
 * hypertrophy work gets moderate-to-higher reps, controlled RIR, and shorter
 * rests. The catalog's own `typicalRepRange` is the anchor — a calf raise and a
 * deadlift do not share a rep range just because they share a role.
 *
 * A session where everything is 3x10 is the most likely way to get this phase
 * wrong, so `schemeFor` deliberately varies by role and the generator asserts
 * the variety in its tests.
 */
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type { RepUnit } from '../../catalog/taxonomy/taxonomy'
import type { TrainingStyle } from '../../core/validation/schemas'
import type { Tempo, TempoReason } from '../../core/validation/workoutSchema'

export interface Scheme {
  readonly sets: number
  readonly reps: { readonly min: number; readonly max: number; readonly unit: RepUnit }
  readonly rirTarget: number | null
  readonly restSeconds: number
}

/**
 * How each role sits on the strength-to-hypertrophy axis. 0 is pure strength,
 * 1 is pure hypertrophy. The role decides the shape; the exercise's own rep
 * range decides where inside that shape it lands.
 */
const ROLE_BIAS: Readonly<Record<TrainingRole, number>> = {
  'primary-strength': 0,
  'secondary-strength': 0.25,
  'primary-hypertrophy': 0.7,
  'secondary-hypertrophy': 0.8,
  isolation: 1,
  specialisation: 0.9,
  corrective: 1,
  'warm-up': 1,
  finisher: 1,
}

const STYLE_SHIFT: Readonly<Record<TrainingStyle, number>> = {
  strength: -0.2,
  hybrid: 0,
  hypertrophy: 0.2,
}

/** Rest, in seconds, at each end of the axis. */
const REST_STRENGTH = 180
const REST_HYPERTROPHY = 75

/**
 * Build the scheme for one slot.
 *
 * `restFactor` comes from the duration shape: a 15-minute session uses shorter
 * but still realistic rests rather than pretending rest is optional.
 */
export function schemeFor(
  exercise: Exercise,
  role: TrainingRole,
  options: {
    readonly style: TrainingStyle
    readonly sets: number
    readonly restFactor: number
  },
): Scheme {
  const bias = clamp01(ROLE_BIAS[role] + STYLE_SHIFT[options.style])
  const { min, max } = exercise.typicalRepRange

  // Slide inside the exercise's own range rather than replacing it. A strength
  // slot sits at the bottom of the range it was given, a hypertrophy slot nearer
  // the top — and a movement whose honest range is 12-20 never becomes a triple.
  const span = max - min
  const lowEnd = Math.round(min + span * bias * 0.35)
  const highEnd = Math.round(min + span * (0.45 + bias * 0.55))

  const reps = {
    min: Math.max(min, Math.min(lowEnd, max)),
    max: Math.max(Math.max(min, Math.min(lowEnd, max)), Math.min(highEnd, max)),
    unit: exercise.repUnit,
  }

  // Heavier work is taken further from failure; isolation work closer to it.
  const rirTarget = role === 'warm-up' ? null : Math.round(3 - bias * 2)

  const rest = Math.round((REST_STRENGTH + (REST_HYPERTROPHY - REST_STRENGTH) * bias) * options.restFactor)

  return {
    sets: Math.max(1, options.sets),
    reps,
    rirTarget,
    // Never so short it is a lie, never so long a phone timer looks broken.
    restSeconds: Math.max(30, Math.min(300, rest)),
  }
}

/**
 * Whether a tempo prescription earns its place. The plan is explicit that tempo
 * should not be prescribed without a clear reason, so the default is no tempo at
 * all — it appears only where slowing the movement is the point.
 */
export function tempoReasonFor(exercise: Exercise, role: TrainingRole): TempoReason | null {
  // A corrective slot is where slowing down IS the prescription.
  if (role === 'corrective') return 'technique-focus'
  // Isolation work on a stable machine or cable is where time under tension is
  // worth buying; anything demanding balance is not made better by a tempo cue.
  if (role !== 'isolation' || exercise.compoundOrIsolation !== 'isolation') return null
  if (exercise.stabilityDemand === 'very-high' || exercise.stabilityDemand === 'high') return null
  return 'time-under-tension'
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** The tempo a reason implies. Only ever called when `tempoReasonFor` gave a reason. */
export function tempoFor(reason: TempoReason): Tempo {
  return {
    eccentricSeconds: reason === 'technique-focus' ? 3 : 3,
    bottomPauseSeconds: reason === 'technique-focus' ? 1 : 0,
    concentricSeconds: 1,
    topPauseSeconds: reason === 'time-under-tension' ? 1 : 0,
    reason,
  }
}
