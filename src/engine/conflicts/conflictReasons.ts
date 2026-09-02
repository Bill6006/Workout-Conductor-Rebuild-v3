import { equipmentLabel } from '../../catalog/equipment/equipment'
import {
  competingDemandLabel,
  jointLabel,
  limitationFlagLabel,
  locationSuitabilityLabel,
  movementPatternLabel,
  muscleGroupLabel,
  stationLabel,
  trainingRoleLabel,
} from '../../catalog/labels/catalogLabels'
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { JointStressTagId } from '../../catalog/taxonomy/joints'
import type {
  CompetingDemand,
  LimitationFlag,
  LocationSuitability,
  StationId,
  TrainingRole,
} from '../../catalog/taxonomy/taxonomy'
import type { SupersetRule } from './conflictTypes'

/**
 * THE conflict copy, in one file.
 *
 * A `reason` is rendered verbatim by whatever shows a conflict, so it is finished
 * writing rather than a template: one sentence, no jargon, no app-as-subject
 * promises about what will happen next.
 *
 * IT NAMES NOTHING ITSELF. Every joint, station, muscle group, pattern, and piece
 * of equipment is named by the catalog's label catalogue, which is the single
 * owner of value-to-display-string in this product. A second spelling of "Lat
 * pulldown" written here would drift from the one the rest of the app shows.
 *
 * WHY THE COLON FORM. Labels are written in sentence case ('Smith machine',
 * 'Lower back'), and dropping one into the middle of a sentence forces a choice
 * between a capital in an odd place and lowercasing a proper noun. Putting the
 * label after a colon keeps the catalogue's spelling exactly as written and reads
 * well at 360px, where a long sentence would wrap three times.
 *
 * NO EXERCISE NAMES. A reason never names an exercise: the conflict carries
 * `exerciseIds`, and the surface showing it has the catalog loaded and can render
 * whatever name it likes. Baking a name into the sentence would also mean this
 * engine held prose it is forbidden to reason about.
 */

const COUNT_WORDS = ['zero', 'one', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

/** Sentence-initial count word for 2 and above; the digits beyond ten. */
function countWord(count: number): string {
  return count >= 2 && count < COUNT_WORDS.length ? COUNT_WORDS[count] : String(count)
}

function list(labels: readonly string[]): string {
  return labels.join(', ')
}

function whenWord(daysAgo: number): string {
  if (daysAgo <= 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  return `${daysAgo} days ago`
}

export function duplicateExerciseReason(): string {
  return 'This exercise is already in the session.'
}

export function duplicateMovementPatternReason(
  pattern: MovementPatternId,
  identicalCount: number,
  overlapping: readonly MovementPatternId[],
): string {
  if (identicalCount === 1) {
    return `Another exercise here uses the same movement pattern: ${movementPatternLabel(pattern)}.`
  }
  if (identicalCount > 1) {
    const count = countWord(identicalCount)
    return `${count} exercises here use the same movement pattern: ${movementPatternLabel(pattern)}.`
  }
  return `This trains much the same movement as something already here: ${list(
    overlapping.map(movementPatternLabel),
  )}.`
}

export function muscleOverlapReason(groups: readonly MuscleGroupId[], strong: boolean): string {
  const named = list(groups.map(muscleGroupLabel))
  return strong
    ? `Another exercise here has the same main muscles: ${named}.`
    : `This shares muscles with something already here: ${named}.`
}

export function jointStressReason(joint: JointStressTagId, limited: boolean, strong: boolean): string {
  const named = jointLabel(joint)
  if (limited) return `You told us about this joint, and the session keeps loading it: ${named}.`
  return strong
    ? `A lot of this session lands on one joint: ${named}.`
    : `Several exercises here load the same joint: ${named}.`
}

export function gripReason(strong: boolean): string {
  return strong
    ? 'Grip is likely to give out before the muscles being trained do.'
    : 'A lot of this session leans on grip strength.'
}

export function equipmentReason(missing: readonly EquipmentId[], locationName: string): string {
  return `Not available at ${locationName}: ${list(missing.map(equipmentLabel))}.`
}

export function stationReason(station: StationId, basis: 'superset' | 'queue', occupancy: number): string {
  const named = stationLabel(station)
  if (basis === 'superset') return `A superset cannot share one station: ${named}.`
  return `${countWord(occupancy)} exercises here need the same station: ${named}.`
}

/**
 * The superset rules whose sentence needs no vocabulary word. The two that DO —
 * competing demands and a shared joint — have their own functions below, so that
 * every label still comes from the catalogue and no caller has to look one up.
 */
export type SimpleSupersetRule = Exclude<SupersetRule, 'competing-demands' | 'shared-joint-stress'>

export function supersetReason(rule: SimpleSupersetRule): string {
  switch (rule) {
    case 'not-permitted':
      return 'Supersets are switched off in your settings.'
    case 'ineligible-exercise':
      return 'One of these is meant to be done on its own, not paired.'
    case 'both-grip-heavy':
      return 'Both of these run out of grip first, so the second one suffers.'
    case 'two-heavy-compounds':
      return 'Two heavy compound lifts back to back is more than a pairing can carry.'
    case 'station-hopping':
      return 'Pairing these means moving between two set-ups every round.'
  }
}

export function supersetCompetingDemandsReason(demands: readonly CompetingDemand[]): string {
  return `These two ask for the same thing at once: ${list(demands.map(competingDemandLabel))}.`
}

export function supersetSharedJointReason(joints: readonly JointStressTagId[]): string {
  return `Both of these load the same joint hard: ${list(joints.map(jointLabel))}.`
}

export function recoveryReason(group: MuscleGroupId, daysAgo: number): string {
  return `Trained ${whenWord(daysAgo)}: ${muscleGroupLabel(group)}.`
}

export function timeReason(overrunSeconds: number): string {
  const minutes = Math.max(1, Math.round(overrunSeconds / 60))
  const unit = minutes === 1 ? 'minute' : 'minutes'
  return `This session runs about ${minutes} ${unit} longer than the time set aside.`
}

export function limitationReason(flag: LimitationFlag, basis: 'contraindicated' | 'joint-stress'): string {
  const named = limitationFlagLabel(flag)
  return basis === 'contraindicated'
    ? `Ruled out by something you told us about: ${named}.`
    : `Heavy on something you told us about: ${named}.`
}

export function locationReason(trainingAt: LocationSuitability): string {
  return `Not a good fit for where you are training: ${locationSuitabilityLabel(trainingAt)}.`
}

export function progressionRoleReason(basis: 'slot' | 'family', role: TrainingRole): string {
  return basis === 'slot'
    ? `Two exercises are filling the same slot: ${trainingRoleLabel(role)}.`
    : 'Two exercises here progress as the same lift, so only one of them can carry it.'
}
