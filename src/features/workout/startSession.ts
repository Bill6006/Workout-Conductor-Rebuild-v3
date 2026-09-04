import { writeSetting } from '../../core/storage/settings'
import { getWorkoutRepository } from '../../core/storage/workoutRepository'
import { nowIso } from '../../core/time/clock'
import type { Workout } from '../../core/validation/workoutSchema'

/**
 * Begin a session: remember which one is running, and persist it.
 *
 * Split out of `useActiveSession` so Today can reach it through a dynamic
 * import. Today is the landing route, and the session hook pulls in the workout
 * Zod schema — which put ten kilobytes of model on the boot chunk for a button
 * nobody has pressed yet.
 *
 * Returns whether the session was actually saved. A caller that navigates to the
 * Workout tab regardless would land somebody on a screen backed by nothing.
 */
export async function startSession(workout: Workout): Promise<boolean> {
  try {
    const result = await getWorkoutRepository().saveWorkout(workout, nowIso())
    if (!result.ok) return false
    writeSetting('activeSessionId', workout.id)
    return true
  } catch {
    return false
  }
}
