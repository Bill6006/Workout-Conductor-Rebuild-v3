/**
 * A STATIC, HAND-WRITTEN DEMO FIXTURE. NOT A GENERATOR AND NOT AN ENGINE.
 *
 * Every value below was typed by a human. Nothing here reads the profile, ranks
 * an exercise, picks a volume, or adapts to anything — there is no logic in this
 * file at all. It exists so the Phase 1 build can show the SHAPE of a session on
 * a real phone while the real workout engine does not exist yet.
 *
 * PHASE 3 OWNS WORKOUT GENERATION. When the engine lands, DELETE this file and
 * the card that renders it. Do not extend it, do not import it from the engine,
 * and do not treat it as a seed, a template, or a fallback — a hand-written
 * fixture that survives into a generated product becomes a silent second source
 * of truth for what a workout is.
 *
 * The exercise names are deliberately generic, universally known movement names.
 * This is NOT the Phase 2 exercise catalog and must never become a rival to it.
 *
 * Nothing here is ever written to IndexedDB, counted as training, or shown as
 * the user's plan. It is labelled as a demo everywhere it appears.
 */

export type DemoEmphasis = 'strength' | 'hypertrophy'

export interface DemoExercise {
  readonly id: string
  readonly name: string
  readonly sets: number
  /** Display text, because a range is what a real programme prescribes. */
  readonly reps: string
  readonly restSeconds: number
  readonly emphasis: DemoEmphasis
}

export interface DemoWorkout {
  readonly id: string
  readonly title: string
  readonly focus: string
  readonly styleLabel: string
  readonly estimatedMinutes: number
  readonly exercises: readonly DemoExercise[]
}

/** The one sentence that must appear wherever this fixture is rendered. */
export const DEMO_WORKOUT_DISCLAIMER =
  'This is a sample session, not your plan. Real workouts are built for you in Phase 3.'

export const DEMO_WORKOUT: DemoWorkout = {
  id: 'demo-upper-hybrid',
  title: 'Upper body — strength and size',
  focus: 'Upper body',
  styleLabel: 'Strength + hypertrophy',
  estimatedMinutes: 55,
  exercises: [
    { id: 'demo-1', name: 'Barbell Bench Press', sets: 4, reps: '5', restSeconds: 180, emphasis: 'strength' },
    {
      id: 'demo-2',
      name: 'Bent-Over Row',
      sets: 4,
      reps: '6–8',
      restSeconds: 150,
      emphasis: 'strength',
    },
    {
      id: 'demo-3',
      name: 'Overhead Press',
      sets: 3,
      reps: '8–10',
      restSeconds: 120,
      emphasis: 'hypertrophy',
    },
    { id: 'demo-4', name: 'Lat Pulldown', sets: 3, reps: '10–12', restSeconds: 90, emphasis: 'hypertrophy' },
    {
      id: 'demo-5',
      name: 'Incline Dumbbell Press',
      sets: 3,
      reps: '10–12',
      restSeconds: 90,
      emphasis: 'hypertrophy',
    },
    { id: 'demo-6', name: 'Face Pull', sets: 2, reps: '15', restSeconds: 60, emphasis: 'hypertrophy' },
  ],
}

/** Compact `m:ss` rest, which is how a rest interval is read on a phone. */
export function formatRest(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/** Spoken form of the same value, for the accessible name of a rest chip. */
export function describeRest(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`)
  if (rest > 0 || minutes === 0) parts.push(`${rest} ${rest === 1 ? 'second' : 'seconds'}`)
  return `Rest ${parts.join(' ')}`
}

/** `4 × 5`, with the multiplication sign rather than a letter x. */
export function formatSets(exercise: DemoExercise): string {
  return `${exercise.sets} × ${exercise.reps}`
}

export function describeSets(exercise: DemoExercise): string {
  return `${exercise.sets} sets of ${exercise.reps} reps`
}

export const EMPHASIS_LABEL: Record<DemoEmphasis, string> = {
  strength: 'Strength',
  hypertrophy: 'Size',
}
