/**
 * Supersets, drop sets, and circuits — proposals, not decisions.
 *
 * All three are optional and user-gated, and none of them is automatically
 * better than doing the work straight. These functions answer "would this
 * genuinely help here?"; the generator decides whether the time budget wants it.
 *
 * The conflict engine owns whether two exercises clash in a session. What lives
 * here is the narrower question the product plan spells out: whether a PAIRING
 * is a good idea, which is about grip, stations, competing demands, and not
 * wrecking a priority lift.
 */
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'

/**
 * Whether two exercises should be run as a two-move superset.
 *
 * Every rule below is one the plan names explicitly. `eager` is the duration
 * engine saying time is tight, which widens what counts as worth pairing — but
 * it never relaxes a safety rule, only the "is this worth the bother" ones.
 */
export function proposeSuperset(first: Exercise, second: Exercise, eager: boolean): boolean {
  if (!first.supersetCompatibility.eligible || !second.supersetCompatibility.eligible) return false
  if (first.id === second.id) return false

  // Two demanding compounds is the pairing that ruins both.
  if (first.compoundOrIsolation === 'compound' && second.compoundOrIsolation === 'compound') {
    return false
  }

  // The same scarce station cannot hold two exercises at once, and hopping
  // between two stations mid-round is the "unsafe station-hopping" case.
  const stationA = first.supersetCompatibility.stationId
  const stationB = second.supersetCompatibility.stationId
  if (stationA !== null && stationA === stationB) return false

  // Two grip-heavy moves leave grip as the limiting factor rather than the muscle.
  if (first.supersetCompatibility.gripHeavy && second.supersetCompatibility.gripHeavy) return false

  // Anything both moves lean on hard — bracing, lower back, balance — accumulates
  // across the pair rather than resting.
  const shared = first.supersetCompatibility.competingDemands.filter((demand) =>
    second.supersetCompatibility.competingDemands.includes(demand),
  )
  if (shared.length > 0) return false

  // The same joint taking high stress twice in a round is the same problem.
  const heavyJoints = (exercise: Exercise) =>
    exercise.jointStressTags.filter((tag) => tag.intensity === 'high').map((tag) => tag.joint)
  const jointsA = heavyJoints(first)
  if (jointsA.some((joint) => heavyJoints(second).includes(joint))) return false

  // A pairing that needs a long setup on both sides saves nothing.
  const setup = first.setupTimeSeconds + second.setupTimeSeconds
  if (setup > (eager ? 150 : 100)) return false

  // Pairing the same muscle back-to-back is a technique in its own right, but it
  // is not what a superset is for here — the time saving comes from one move
  // resting while the other works.
  const sameTarget = first.primaryMuscles.some((muscle) => second.primaryMuscles.includes(muscle))
  if (sameTarget && !eager) return false

  return true
}

/**
 * Whether the last set of this exercise should carry a drop.
 *
 * The plan is explicit that a drop set is a TIME-EFFICIENT HYPERTROPHY TOOL, not
 * a default intensifier — so it wants a simple setup, a safe exercise, and a
 * hypertrophy slot. It is never proposed on a strength lift, where the point is
 * the load and stripping it mid-set is both slow and unsafe.
 */
export function proposeDropSet(exercise: Exercise, role: TrainingRole): boolean {
  if (!exercise.safeForDropSet) return false
  if (role === 'primary-strength' || role === 'secondary-strength') return false
  if (role === 'warm-up' || role === 'corrective') return false

  // Changing the load has to be quick. A pin or a dial is; stripping plates is
  // not, which is why the catalog's own load basis decides this rather than a
  // guess from the name.
  const quickToChange =
    exercise.load.basis === 'machine-stack' ||
    exercise.load.basis === 'cable-stack' ||
    exercise.load.basis === 'dumbbell' ||
    exercise.load.basis === 'band'
  if (!quickToChange) return false

  // A long setup undoes the time saving the technique exists for.
  return exercise.setupTimeSeconds <= 45
}

/**
 * Whether a circuit suits this session at all.
 *
 * Deliberately conservative: the plan says to use circuits only when goal,
 * equipment, location and fatigue support them, and never to force one into a
 * strength-priority session. Nothing in Phase 3 supplies fatigue, so a
 * strength-leaning session simply says no.
 */
export function proposeCircuit(options: {
  readonly enabled: boolean
  readonly hasStrengthPriority: boolean
  readonly blockCount: number
  readonly locationKind: 'gym' | 'home' | 'travel'
}): boolean {
  if (!options.enabled) return false
  if (options.hasStrengthPriority) return false
  // A circuit needs enough stations to be a circuit rather than a long superset.
  if (options.blockCount < 3) return false
  // Circling between stations in a busy gym is how you lose them.
  return options.locationKind !== 'gym'
}
