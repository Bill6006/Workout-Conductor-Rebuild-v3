import { isConstraintOnlyEquipment } from '../../catalog/equipment/equipment'
import { stressRank, tagForJoint } from '../../catalog/taxonomy/joints'
import { LIMITATION_FLAGS } from '../../catalog/taxonomy/taxonomy'
import { equipmentReason, limitationReason, locationReason } from './conflictReasons'
import { LIMITATION_JOINTS } from './conflictContext'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { LimitationFlag } from '../../catalog/taxonomy/taxonomy'
import type { Conflict } from './conflictTypes'
import type { ConflictContext } from './conflictContext'

/**
 * RULES THAT JUDGE ONE EXERCISE ON ITS OWN.
 *
 * Nothing here looks at the rest of the session: an exercise needing a cable
 * machine is wrong at a location without one whether it is the first entry or the
 * ninth. That makes these the cheapest rules to run and the right ones to run
 * first when filtering a large candidate set.
 */

/** The exercise's own plain-language note for a flag, or `''` when it has none. */
function considerationFor(exercise: Exercise, flag: LimitationFlag): string {
  if (flag === 'shoulder') return exercise.shoulderConsiderations
  if (flag === 'knee') return exercise.kneeConsiderations
  if (flag === 'lower-back') return exercise.lowerBackConsiderations
  return ''
}

/**
 * LIMITATION. A declared injury is the one thing that is never negotiable.
 *
 * TWO TIERS, AND THE SECOND IS THE USEFUL ONE. An exercise the catalog lists in
 * `contraindicatedFor` is `blocking` — there is no severity at which a declared
 * injury is overridden. But most exercises that hurt a bad shoulder are not on
 * anybody's contraindicated list; they are simply heavy on the shoulder. So a
 * flagged joint ALSO produces a `strong` conflict for any exercise carrying a
 * joint-stress tag at or above the policy's warning intensity. Without that second
 * tier the whole feature would come down to how exhaustively a catalog author
 * remembered to fill in one array.
 *
 * Flags are emitted in `LIMITATION_FLAGS` order so a report never depends on the
 * order the profile happened to list them in.
 */
export function limitationConflicts(exercise: Exercise, context: ConflictContext): Conflict[] {
  const active = new Set(context.limitations)
  if (active.size === 0) return []

  const conflicts: Conflict[] = []
  const warnRank = stressRank(context.policy.limitedJointWarnIntensity)

  for (const flag of LIMITATION_FLAGS) {
    if (!active.has(flag)) continue

    if (exercise.contraindicatedFor.includes(flag)) {
      conflicts.push({
        kind: 'limitation',
        severity: 'blocking',
        exerciseIds: [exercise.id],
        reason: limitationReason(flag, 'contraindicated'),
        detail: { flag, basis: 'contraindicated', note: considerationFor(exercise, flag) },
      })
      continue
    }

    const joint = LIMITATION_JOINTS[flag]
    if (joint === null) continue
    const tag = tagForJoint(exercise.jointStressTags, joint)
    if (tag === null || stressRank(tag.intensity) < warnRank) continue

    conflicts.push({
      kind: 'limitation',
      severity: 'strong',
      exerciseIds: [exercise.id],
      reason: limitationReason(flag, 'joint-stress'),
      detail: { flag, basis: 'joint-stress', note: considerationFor(exercise, flag) },
    })
  }

  return conflicts
}

/**
 * EQUIPMENT. Required kit the training location does not have.
 *
 * `optionalEquipment` is never consulted: it makes an exercise better, not
 * possible, so its absence is not a conflict at any severity.
 *
 * `bodyweight-only` is treated as available everywhere. It is a constraint id —
 * it names the ABSENCE of equipment — so an exercise that lists it is asking for
 * nothing, and blocking it at a fully equipped gym would be exactly backwards.
 *
 * Missing ids come back in the exercise's own order, which is the order a catalog
 * author wrote them and therefore stable.
 */
export function equipmentConflicts(exercise: Exercise, context: ConflictContext): Conflict[] {
  const available = new Set<string>(context.availableEquipment)
  const missing: EquipmentId[] = exercise.equipment.filter(
    (id) => !isConstraintOnlyEquipment(id) && !available.has(id),
  )
  if (missing.length === 0) return []

  return [
    {
      kind: 'equipment',
      severity: 'blocking',
      exerciseIds: [exercise.id],
      reason: equipmentReason(missing, context.location.name),
      detail: { missing, locationId: context.location.id, locationName: context.location.name },
    },
  ]
}

/**
 * LOCATION. The exercise is possible with the kit present but is a poor fit for
 * where the session is happening — a loud jumping movement in a flat, a lift that
 * wants a spotter at home.
 *
 * IT IS A SEPARATE RULE FROM EQUIPMENT ON PURPOSE. Equipment answers "can this be
 * done here at all" and is blocking; suitability answers "should it be" and is
 * `strong` — a person who wants to do it anyway is not wrong, and the generator
 * simply prefers something else.
 *
 * A location of no fixed kind produces no conflict. The catalog has no
 * suitability value for `custom`, so there is nothing to compare and a guess
 * would be worse than silence.
 */
export function locationConflicts(exercise: Exercise, context: ConflictContext): Conflict[] {
  const trainingAt = context.location.suitability
  if (trainingAt === null) return []
  if (exercise.locationSuitability.includes(trainingAt)) return []

  return [
    {
      kind: 'location',
      severity: 'strong',
      exerciseIds: [exercise.id],
      reason: locationReason(trainingAt),
      detail: {
        locationId: context.location.id,
        locationName: context.location.name,
        trainingAt,
        suitableAt: exercise.locationSuitability,
      },
    },
  ]
}

/** Every single-exercise rule, in report-worthy order. */
export function entryConflicts(exercise: Exercise, context: ConflictContext): Conflict[] {
  return [
    ...limitationConflicts(exercise, context),
    ...equipmentConflicts(exercise, context),
    ...locationConflicts(exercise, context),
  ]
}
