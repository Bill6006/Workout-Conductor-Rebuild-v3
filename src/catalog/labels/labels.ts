import { WEEK_DAYS } from '../../components/DayPicker'
import { equipmentLabel, sortEquipmentIds } from '../equipment'
import { humaniseExerciseId } from '../exercises/exerciseId'
import type { DurationChoice } from '../../core/validation/workoutSchema'
import {
  WEEKDAYS,
  type ExercisePreferenceList,
  type Experience,
  type Goal,
  type LocationKind,
  type LocationProfile,
  type Profile,
  type RestStyle,
  type TrainingStyle,
  type Units,
  type Weekday,
} from '../../core/validation/schemas'

/**
 * THE canonical display-copy catalogue.
 *
 * This file is the single owner of the value -> display-string mapping for every
 * stored enum on the profile: Goal, Experience, TrainingStyle, RestStyle, Units,
 * Weekday and LocationKind. Setup, the review screen and settings all read from
 * here, so the same saved profile can never read differently on two screens.
 *
 * It replaces two rival catalogues (`features/onboarding/labels.ts` and
 * `features/settings/labels.ts`) that had drifted apart — restStyle `standard`
 * rendered as both "Normal" and "Standard rests", `metric` as both "kg" and
 * "Metric", and locationKind `custom` as both "Other" and "Custom".
 *
 * A surface that needs a tighter form asks for `shortLabel`; it must never add a
 * second value -> string map of its own. Day names come from `WEEK_DAYS` and
 * equipment names from `equipmentLabel()`, so this file owns no rival list either.
 */

export interface LabelEntry<T extends string | number> {
  readonly value: T
  /** The name of this value in prose, in a row, and on a choice card. */
  readonly label: string
  /** A tighter form for a segmented control. Absent means `label` already fits. */
  readonly shortLabel?: string
  /** One line of help, shown under the label on a choice card. */
  readonly description?: string
}

export const GOAL_LABELS: readonly LabelEntry<Goal>[] = [
  { value: 'build-muscle', label: 'Build muscle', description: 'Size and strength together.' },
  { value: 'bigger-arms', label: 'Bigger arms', description: 'Extra volume for biceps and triceps.' },
  { value: 'bigger-chest', label: 'Bigger chest', description: 'Extra volume for pressing.' },
  { value: 'overall-size', label: 'Overall size', description: 'Add size across the whole body.' },
  { value: 'get-stronger', label: 'Get stronger', description: 'Heavier lifts, lower reps.' },
  {
    value: 'balanced-development',
    label: 'Balanced development',
    description: 'Even work across every muscle group.',
  },
  { value: 'stay-consistent', label: 'Stay consistent', description: 'Keep the habit without burning out.' },
]

export const EXPERIENCE_LABELS: readonly LabelEntry<Experience>[] = [
  { value: 'beginner', label: 'Beginner', description: 'Under a year of steady lifting.' },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'A year or more, and the lifts feel familiar.',
  },
  { value: 'advanced', label: 'Advanced', description: 'Several years, and progress comes slowly now.' },
]

export const TRAINING_STYLE_LABELS: readonly LabelEntry<TrainingStyle>[] = [
  { value: 'hybrid', label: 'Hybrid', description: 'Heavy work and volume work together.' },
  { value: 'hypertrophy', label: 'Hypertrophy', description: 'Moderate loads, more sets and reps.' },
  { value: 'strength', label: 'Strength', description: 'Heavier loads, lower reps, longer rests.' },
]

/**
 * Rest length. The labels name what they are ("Shorter rests"), never a bare
 * "Short": the app-wide product guard rejects any control whose accessible name
 * begins with a competing workout-mode word, and a lone "Short" on a segment
 * reads as a mode rather than as a rest length. `shortLabel` drops only the
 * noun, so the tight three-up segment stays clear of that word too.
 */
export const REST_STYLE_LABELS: readonly LabelEntry<RestStyle>[] = [
  {
    value: 'short',
    label: 'Shorter rests',
    shortLabel: 'Shorter',
    description: 'Around 60 seconds. Keeps the pace up.',
  },
  {
    value: 'standard',
    label: 'Standard rests',
    shortLabel: 'Standard',
    description: 'Around 2 minutes. The default.',
  },
  {
    value: 'long',
    label: 'Longer rests',
    shortLabel: 'Longer',
    description: 'Around 3 minutes. Best for heavy sets.',
  },
]

/**
 * The symbol a weight is written in. Kept beside the units labels rather than in
 * a function of its own, so the name of the system and the symbol it uses cannot
 * drift apart.
 */
const WEIGHT_UNITS = { metric: 'kg', imperial: 'lb' } as const

export type WeightUnit = (typeof WEIGHT_UNITS)[Units]

export const UNITS_LABELS: readonly LabelEntry<Units>[] = [
  { value: 'metric', label: 'Metric', shortLabel: WEIGHT_UNITS.metric, description: 'Kilograms.' },
  { value: 'imperial', label: 'Imperial', shortLabel: WEIGHT_UNITS.imperial, description: 'Pounds.' },
]

export const LOCATION_KIND_LABELS: readonly LabelEntry<LocationKind>[] = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'travel', label: 'Travel' },
  { value: 'custom', label: 'Other' },
]

/**
 * THE ONE workout-length control, in the order it is shown.
 *
 * This is the only place the four choices are named. There is no Full, Lazy,
 * Short, Density, or Recovery mode to label, and no second length control to
 * label either — `src/app/App.test.tsx` fails the build if one appears.
 *
 * `'default'` reads as "Default time" and NEVER as a number of minutes: it means
 * the complete duration the current plan generates, which changes as the plan
 * changes. The resolved figure is `Workout.plannedMinutes`, and
 * `durationSummary()` below is the one way to render it.
 *
 * The descriptions are written to stay clear of the competing-mode words the
 * product guard rejects, since a choice card may fold its description into the
 * control's accessible name.
 */
export const DURATION_CHOICE_LABELS: readonly LabelEntry<DurationChoice>[] = [
  {
    value: 15,
    label: '15 minutes',
    shortLabel: '15 min',
    description: 'A focused session when time is tight.',
  },
  {
    value: 30,
    label: '30 minutes',
    shortLabel: '30 min',
    description: 'Half an hour, with the main lifts intact.',
  },
  {
    value: 45,
    label: '45 minutes',
    shortLabel: '45 min',
    description: 'A longer session with more accessory work.',
  },
  {
    value: 'default',
    label: 'Default time',
    shortLabel: 'Default',
    description: 'The complete session your plan generates. Not a fixed number of minutes.',
  },
]

/**
 * Calendar order and coverage come from the schema; the names come from the
 * shared week, so no second day list exists. `shortLabel` is the three-letter
 * prose form ("Mon"), which is what a comma-separated summary needs — the two
 * letter form on a DayPicker button exists only to fit the button.
 */
export const WEEKDAY_LABELS: readonly LabelEntry<Weekday>[] = WEEKDAYS.map((value) => {
  const name = WEEK_DAYS.find((day) => day.id === value)?.label ?? value
  return { value, label: name, shortLabel: name.slice(0, 3) }
})

function entry<T extends string | number>(
  entries: readonly LabelEntry<T>[],
  value: T,
): LabelEntry<T> | undefined {
  return entries.find((candidate) => candidate.value === value)
}

function labelFrom<T extends string | number>(entries: readonly LabelEntry<T>[], value: T): string {
  return entry(entries, value)?.label ?? String(value)
}

function shortLabelFrom<T extends string | number>(entries: readonly LabelEntry<T>[], value: T): string {
  const found = entry(entries, value)
  return found ? (found.shortLabel ?? found.label) : String(value)
}

export const goalLabel = (value: Goal) => labelFrom(GOAL_LABELS, value)
export const experienceLabel = (value: Experience) => labelFrom(EXPERIENCE_LABELS, value)
export const trainingStyleLabel = (value: TrainingStyle) => labelFrom(TRAINING_STYLE_LABELS, value)
export const restStyleLabel = (value: RestStyle) => labelFrom(REST_STYLE_LABELS, value)
export const unitsLabel = (value: Units) => labelFrom(UNITS_LABELS, value)
export const locationKindLabel = (value: LocationKind) => labelFrom(LOCATION_KIND_LABELS, value)

/** `15` -> `15 minutes`, `'default'` -> `Default time`. The accessible name of a choice. */
export const durationChoiceLabel = (value: DurationChoice) => labelFrom(DURATION_CHOICE_LABELS, value)
/** `15` -> `15 min`, `'default'` -> `Default`. What fits on a segment. */
export const durationChoiceShortLabel = (value: DurationChoice) =>
  shortLabelFrom(DURATION_CHOICE_LABELS, value)

/** The four options a segmented length control renders, in order. */
export function durationChoiceOptions(): { value: DurationChoice; label: string }[] {
  return segmentOptions(DURATION_CHOICE_LABELS)
}

/**
 * How long the session in front of you actually is.
 *
 * For 15 / 30 / 45 the choice IS the answer. For `'default'` there is no answer
 * until a session has been generated, so pass `Workout.plannedMinutes`; passing
 * `null` yields "Default time", which is the honest thing to show beforehand.
 */
export function durationSummary(choice: DurationChoice, plannedMinutes: number | null = null): string {
  if (choice !== 'default') return durationChoiceShortLabel(choice)
  return plannedMinutes === null ? durationChoiceLabel('default') : `${plannedMinutes} min`
}

/** `mon` -> `Monday`. The accessible name a day is announced by. */
export const weekdayLabel = (value: Weekday) => labelFrom(WEEKDAY_LABELS, value)
/** `mon` -> `Mon`. Derived from the full name, so it cannot drift from it. */
export const weekdayShortLabel = (value: Weekday) => shortLabelFrom(WEEKDAY_LABELS, value)

/** `kg` or `lb` — the symbol a weight is written in, not the name of the system. */
export function weightUnitFor(units: Units): WeightUnit {
  return WEIGHT_UNITS[units]
}

/**
 * The options a segmented control renders. Segments are narrow, so each one
 * shows `shortLabel` where the catalogue defines one and `label` otherwise.
 */
export function segmentOptions<T extends string | number>(
  entries: readonly LabelEntry<T>[],
): { value: T; label: string }[] {
  return entries.map((option) => ({ value: option.value, label: option.shortLabel ?? option.label }))
}

/** Calendar order, unknown values dropped. */
export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day))
}

/** Day names in calendar order, whatever order they were tapped in. */
export function daysSummary(days: readonly Weekday[]): string {
  const sorted = sortWeekdays(days)
  return sorted.length === 0 ? 'No days chosen' : sorted.map(weekdayShortLabel).join(', ')
}

export function goalsSummary(goals: Profile['goals']): string {
  const primary = goalLabel(goals.primary)
  return goals.secondary ? `${primary} · then ${goalLabel(goals.secondary)}` : primary
}

export function techniquesSummary(techniques: Profile['techniques']): string {
  const on = [
    techniques.supersets ? 'Supersets' : null,
    techniques.dropSets ? 'Drop sets' : null,
    techniques.circuits ? 'Circuits' : null,
  ].filter(Boolean)
  return on.length === 0 ? 'None enabled' : on.join(' · ')
}

export function limitationsSummary(limitations: Profile['limitations']): string {
  const on = [
    limitations.shoulder ? 'Shoulder' : null,
    limitations.knee ? 'Knee' : null,
    limitations.lowerBack ? 'Lower back' : null,
    limitations.avoidBarbellSquat ? 'No barbell squat' : null,
  ].filter(Boolean)
  if (on.length === 0) return limitations.notes.trim() === '' ? 'None reported' : 'Notes only'
  return on.join(' · ')
}

export function bodyweightSummary(bodyweight: Profile['bodyweight']): string {
  return bodyweight ? `${bodyweight.value} ${bodyweight.unit}` : 'Not recorded'
}

export function listSummary(entries: readonly string[], empty: string): string {
  if (entries.length === 0) return empty
  if (entries.length <= 2) return entries.join(', ')
  return `${entries.slice(0, 2).join(', ')} +${entries.length - 2} more`
}

/**
 * One side of the exercise preferences as names a person reads: the resolved
 * exercises first, then the words they typed that nothing matched, verbatim.
 *
 * `nameOf` is how a screen that has the catalog loaded supplies real names. Every
 * screen that reads a profile today has NOT — the catalog is a lazy chunk — so the
 * fallback humanises the id (`incline-dumbbell-press` reads as
 * `Incline dumbbell press`). That is a display fallback and never a stored value:
 * the id is what is saved, whatever this renders.
 */
export function exercisePreferenceNames(
  list: ExercisePreferenceList,
  nameOf?: (id: string) => string | null,
): string[] {
  const named = list.exerciseIds.map((id) => nameOf?.(id) ?? humaniseExerciseId(id))
  return [...named, ...list.freeText]
}

/** Equipment names in canonical order, ready to render as chips or a sentence. */
export function equipmentNames(location: LocationProfile): string[] {
  return sortEquipmentIds(location.equipment).map(equipmentLabel)
}

export function equipmentSummary(location: LocationProfile): string {
  const count = sortEquipmentIds(location.equipment).length
  if (count === 0) return 'No equipment listed'
  return count === 1 ? '1 item' : `${count} items`
}
