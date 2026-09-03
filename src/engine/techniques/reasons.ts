import { muscleGroupLabel, stationLabel } from '../../catalog/labels/catalogLabels'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import type { TechniqueKind, TechniqueReason, TechniqueReasonCode } from './types'

/**
 * THE TECHNIQUE COPY, IN ONE FILE.
 *
 * Same contract as the conflict engine's `conflictReasons`: a `text` is finished
 * writing, rendered verbatim, one sentence, no template to fill and no app-as-
 * subject promise about what happens next.
 *
 * IT NAMES NOTHING ITSELF. Muscle groups and stations are named by the catalog's
 * label catalogue, which is the single owner of value-to-display-string in this
 * product. No exercise is ever named: a proposal carries `slotId`s, and the
 * surface showing it has the catalog and can render whatever name it likes.
 *
 * MINUTES, NOT SECONDS. Every saving is quoted to the nearest half minute, because
 * "saves 97 seconds" is a precision this estimate does not have and reads as one
 * it does. The exact seconds are on `TimeEffect` for the generator to budget with.
 */

/**
 * A bare quantity of time, to the nearest half minute — '2 minutes', 'half a
 * minute', 'a few seconds'. It carries no hedge of its own so that a caller can
 * put one in front of it ('Saves about ...') or not ('Saving under ...').
 */
export function minutesPhrase(seconds: number): string {
  const halves = Math.max(0, Math.round(Math.abs(seconds) / 30))
  if (halves === 0) return 'a few seconds'
  if (halves === 1) return 'half a minute'
  const minutes = halves / 2
  const rendered = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1)
  return `${rendered} ${minutes === 1 ? 'minute' : 'minutes'}`
}

function reason(code: TechniqueReasonCode, text: string): TechniqueReason {
  return { code, text }
}

/* ------------------------------------------------------------------ *
 * Why a technique is worth it
 * ------------------------------------------------------------------ */

export function savesTimeReason(seconds: number): TechniqueReason {
  return reason('saves-time', `Saves about ${minutesPhrase(seconds)} without dropping any work.`)
}

export function timePressureReason(): TechniqueReason {
  return reason('time-pressure', 'There is less time today than this session normally takes.')
}

export function antagonistPairingReason(): TechniqueReason {
  return reason('antagonist-pairing', 'One pushes and one pulls, so each rests while the other works.')
}

export function noMuscleOverlapReason(): TechniqueReason {
  return reason('no-muscle-overlap', 'These two train different muscles, so neither tires the other.')
}

export function accessoryWorkReason(): TechniqueReason {
  return reason('accessory-work', 'Both are accessory work, where pairing costs the least.')
}

export function quickTransitionReason(): TechniqueReason {
  return reason('quick-transition', 'Moving between the two set-ups takes almost no time.')
}

export function separateStationsReason(stations: readonly StationId[]): TechniqueReason {
  if (stations.length === 0) {
    return reason('separate-stations', 'Neither of these ties up a station.')
  }
  return reason('separate-stations', `Each has its own place to work: ${list(stations.map(stationLabel))}.`)
}

export function gripUnaffectedReason(): TechniqueReason {
  return reason('grip-unaffected', 'Neither of these runs out of grip first.')
}

export function volumeStillOwedReason(groups: readonly MuscleGroupId[]): TechniqueReason {
  return reason(
    'volume-still-owed',
    `Still short of this week's sets: ${list(groups.map(muscleGroupLabel))}.`,
  )
}

export function hypertrophyFocusReason(): TechniqueReason {
  return reason('hypertrophy-focus', 'This slot is here to build size, which is what a drop set is for.')
}

export function simpleToStripReason(): TechniqueReason {
  return reason('simple-to-strip', 'The load comes off in a couple of seconds on this one.')
}

export function goalSuitsCircuitReason(): TechniqueReason {
  return reason('goal-suits-circuit', 'A circuit fits what you are training for.')
}

export function recoveredEnoughReason(): TechniqueReason {
  return reason('recovered-enough', 'You are fresh enough for the pace a circuit asks for.')
}

/* ------------------------------------------------------------------ *
 * Why a technique was left alone
 * ------------------------------------------------------------------ */

const TECHNIQUE_WORDS: Readonly<Record<TechniqueKind, string>> = {
  superset: 'Supersets',
  'drop-set': 'Drop sets',
  circuit: 'Circuits',
}

export function techniqueDisabledText(technique: TechniqueKind): string {
  return `${TECHNIQUE_WORDS[technique]} are switched off in your settings.`
}

export function notEnoughCandidatesText(technique: TechniqueKind): string {
  if (technique === 'superset') return 'There is nothing here that could be paired.'
  if (technique === 'drop-set') return 'There is nothing here to hang one off.'
  return 'There is not enough in this session to run as a circuit.'
}

export function protectsPriorityLiftText(): string {
  return 'The main lift of the session is done on its own, at full effort.'
}

export function compromisesLaterPriorityText(groups: readonly MuscleGroupId[]): string {
  return `This would tire something a later main lift needs: ${list(groups.map(muscleGroupLabel))}.`
}

export function beyondExperienceText(): string {
  return 'One of these is a big enough ask on its own for now.'
}

export function tooManyCompoundsText(allowed: number): string {
  const word = allowed === 1 ? 'one big lift' : `${allowed} big lifts`
  return `A pairing at your level holds at most ${word}.`
}

export function tooFarApartText(): string {
  return 'These two sit too far apart in the session to be run together.'
}

export function tooFewRoundsText(minimum: number): string {
  return `Pairing is only worth setting up for ${minimum} rounds or more.`
}

export function sharesMuscleWithMemberText(groups: readonly MuscleGroupId[]): string {
  return `Two stations here would train the same thing: ${list(groups.map(muscleGroupLabel))}.`
}

export function sameStationText(station: StationId): string {
  return `These cannot take turns on one station: ${stationLabel(station)}.`
}

export function scarceStationText(station: StationId): string {
  return `A circuit would hold on to a station other people need: ${stationLabel(station)}.`
}

export function transitionTooCostlyText(): string {
  return 'Getting set up again each round would cost more than the circuit saves.'
}

export function equipmentUnavailableText(): string {
  return 'The kit for this is not at the place you are training.'
}

export function tooFewMembersText(minimum: number): string {
  return `A circuit needs at least ${minimum} stations that suit it.`
}

export function circuitAlreadyFullText(limit: number): string {
  return `A circuit runs to ${limit} stations, and they are taken.`
}

export function unsafeForDropSetText(): string {
  return 'Dropping the load mid-set is not safe on this one.'
}

export function noLoadToDropText(): string {
  return 'There is no load on this one to drop.'
}

export function notHypertrophyContextText(basis: 'session' | 'slot'): string {
  return basis === 'session'
    ? 'A drop set is a size tool, and this session is built around getting stronger.'
    : 'A drop set is a size tool, and this slot is not here to build size.'
}

export function strengthPrioritySlotText(): string {
  return 'This slot is a main strength lift, and it is left as straight sets.'
}

export function noTimePressureText(): string {
  return 'There is time for another straight set, which is the better buy today.'
}

export function volumeAlreadyMetText(groups: readonly MuscleGroupId[]): string {
  return `This week's sets are already covered here: ${list(groups.map(muscleGroupLabel))}.`
}

export function setupTooComplexText(): string {
  return 'Taking weight off this one mid-set is too slow to be worth it.'
}

export function enoughDropSetsText(limit: number): string {
  const word = limit === 1 ? 'One drop set' : `${limit} drop sets`
  return `${word} is as much as one session gets.`
}

export function strengthSessionText(): string {
  return 'This session is built around getting stronger, which a circuit works against.'
}

export function goalDoesNotSuitCircuitsText(): string {
  return 'A circuit does not serve what you are training for.'
}

export function fatigueTooHighText(): string {
  return 'You are too worn down today for the pace a circuit asks for.'
}

export function savesTooLittleTimeText(required: number): string {
  return `Saving under ${minutesPhrase(required)} is not enough to be worth doing.`
}

/* ------------------------------------------------------------------ *
 * Summaries
 * ------------------------------------------------------------------ */

/**
 * The leading reason and the saving in one line, for a compact row. The saving is
 * appended only when the leading reason has not already quoted it, so a row never
 * says the same number twice.
 */
export function proposalSummary(leading: TechniqueReason, savedSeconds: number): string {
  if (savedSeconds <= 0 || leading.code === 'saves-time') return leading.text
  return `${leading.text} Saves about ${minutesPhrase(savedSeconds)}.`
}

function list(labels: readonly string[]): string {
  return labels.join(', ')
}
