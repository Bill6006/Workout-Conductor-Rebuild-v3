/**
 * THE WORKOUT GENERATOR — the public surface.
 *
 * Phase 3 splits this folder between agents: this barrel and `types.ts` are the
 * contract every other part is written against, and the generation itself lands
 * beside them. Everything a caller outside `engine/workoutGenerator` needs is
 * re-exported here; nothing outside should reach into a file directly.
 *
 * HOW IT IS MEANT TO BE USED:
 *
 *     const { EXERCISES } = await import('../../catalog/exercises/exerciseData')
 *     const result = generateWorkout({
 *       profile,
 *       location,
 *       equipment,
 *       availableTime: 45,          // 15 | 30 | 45 | 'default'
 *       forDate: '2026-09-02',
 *       generatedAt: clock.now(),
 *       seed: `${profile.id}:2026-09-02`,
 *       exercises: EXERCISES,
 *     })
 *     if (result.outcome === 'none') showMessage(result.message)
 *     else render(workoutListRows(result.workout, nameOf))
 *
 * THE SESSION MODEL IS NOT DEFINED HERE. `Workout`, its blocks, its set targets
 * and records, `DurationChoice`, and the canonical list row all live in
 * `src/core/validation/workoutSchema.ts`, because they are DURABLE data that
 * storage, Phase 4, Phase 5 and Phase 7 all read. This folder produces one; it
 * does not own the shape.
 *
 * WHAT THIS IS NOT. It is not a screen, not a store, and not a second conflict
 * engine or alternatives ranker. It holds no state, touches no storage, imports
 * no exercise DATA, and reads neither the clock nor a random number.
 */

export { GENERATOR_VERSION, NO_WORKOUT_REASONS, deriveSeed, hashSeed, isGenerated } from './types'
export type {
  GenerateWorkout,
  GenerateWorkoutInput,
  GenerateWorkoutResult,
  GeneratedWorkout,
  GeneratorLocation,
  GeneratorPreferences,
  MuscleExposureEntry,
  MuscleVolumeEntry,
  NoWorkout,
  NoWorkoutReason,
  PainReport,
  PlannedSession,
  ProgressionState,
  ReadinessState,
  RecentWorkoutSummary,
  RecoveryState,
  TrainingFrequency,
  WeeklyPlan,
  WorkoutGoals,
} from './types'
