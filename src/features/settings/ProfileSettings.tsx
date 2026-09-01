import { useState } from 'react'
import { Card } from '../../components/Card'
import { ChoiceCard, ChoiceCardGroup } from '../../components/ChoiceCard'
import { DayPicker } from '../../components/DayPicker'
import { FormField } from '../../components/FormField'
import { NumberStepper } from '../../components/NumberStepper'
import { TextListInput } from '../../components/TextListInput'
import { ToggleRow } from '../../components/ToggleRow'
import {
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  REST_STYLE_LABELS,
  TRAINING_STYLE_LABELS,
  UNITS_LABELS,
  bodyweightSummary,
  daysSummary,
  experienceLabel,
  goalLabel,
  limitationsSummary,
  listSummary,
  restStyleLabel,
  sortWeekdays,
  techniquesSummary,
  trainingStyleLabel,
  unitsLabel,
  weightUnitFor,
  type LabelEntry,
} from '../../catalog/labels'
import { useProfile } from '../../core/state'
import type { SaveResult } from '../../core/storage/verifiedSave'
import type { Goal, Profile, Weekday } from '../../core/validation/schemas'
import { EditRow } from './EditRow'
import { EditSheet } from './EditSheet'
import styles from './ProfileSettings.module.css'

/**
 * Every stored profile value except locations, grouped the way the profile is
 * grouped. One row per value; one sheet per row; one save path underneath.
 */

type Dialog =
  | 'none'
  | 'primary-goal'
  | 'secondary-goal'
  | 'experience'
  | 'training-style'
  | 'sessions'
  | 'days'
  | 'duration'
  | 'techniques'
  | 'rest-style'
  | 'preferred'
  | 'disliked'
  | 'limitations'
  | 'units'
  | 'bodyweight'

export interface ProfileSettingsProps {
  profile: Profile
  /** Announces a verified save on the screen's status line. */
  onSaved: (message: string) => void
}

interface SheetShellProps {
  title: string
  description?: string
  onSaved: () => void
  onClose: () => void
}

/** A single-select enum sheet. Used for every enum on the profile. */
function ChoiceSheet<T extends string>({
  choices,
  current,
  onPick,
  ...shell
}: SheetShellProps & {
  choices: readonly LabelEntry<T>[]
  current: T
  onPick: (value: T) => Promise<SaveResult<Profile>>
}) {
  const [value, setValue] = useState<T>(current)

  return (
    <EditSheet {...shell} onSave={() => onPick(value)}>
      <ChoiceCardGroup label={shell.title}>
        {choices.map((choice) => (
          <ChoiceCard
            key={choice.value}
            title={choice.label}
            description={choice.description}
            selected={choice.value === value}
            onSelect={() => setValue(choice.value)}
          />
        ))}
      </ChoiceCardGroup>
    </EditSheet>
  )
}

function NumberSheet({
  label,
  hint,
  unit,
  min,
  max,
  step,
  current,
  onPick,
  ...shell
}: SheetShellProps & {
  label: string
  hint?: string
  unit?: string
  min: number
  max: number
  step?: number
  current: number
  onPick: (value: number) => Promise<SaveResult<Profile>>
}) {
  const [value, setValue] = useState(current)

  return (
    <EditSheet {...shell} onSave={() => onPick(value)}>
      <FormField label={label} hint={hint} as="group">
        {(field) => (
          <NumberStepper
            value={value}
            onChange={setValue}
            min={min}
            max={max}
            step={step}
            unit={unit}
            label={label}
            aria-labelledby={field.labelId}
            aria-describedby={field.describedBy}
          />
        )}
      </FormField>
    </EditSheet>
  )
}

export function ProfileSettings({ profile, onSaved }: ProfileSettingsProps) {
  const { updateProfile } = useProfile()
  const [dialog, setDialog] = useState<Dialog>('none')
  const close = () => setDialog('none')

  const bodyweightUnit = profile.bodyweight?.unit ?? weightUnitFor(profile.units)

  return (
    <>
      <Card title="Goals and programming">
        <div className={styles.rows}>
          <EditRow
            label="Primary goal"
            value={goalLabel(profile.goals.primary)}
            onEdit={() => setDialog('primary-goal')}
          />
          <EditRow
            label="Second goal"
            value={profile.goals.secondary ? goalLabel(profile.goals.secondary) : 'None'}
            onEdit={() => setDialog('secondary-goal')}
          />
          <EditRow
            label="Experience"
            value={experienceLabel(profile.experience)}
            onEdit={() => setDialog('experience')}
          />
          <EditRow
            label="Training style"
            value={trainingStyleLabel(profile.trainingStyle)}
            onEdit={() => setDialog('training-style')}
          />
        </div>
      </Card>

      <Card title="Schedule">
        <div className={styles.rows}>
          <EditRow
            label="Sessions per week"
            value={
              profile.schedule.sessionsPerWeek === 1
                ? '1 session'
                : `${profile.schedule.sessionsPerWeek} sessions`
            }
            onEdit={() => setDialog('sessions')}
          />
          <EditRow
            label="Training days"
            value={daysSummary(profile.schedule.availableDays)}
            onEdit={() => setDialog('days')}
          />
          <EditRow
            label="Typical session length"
            value={`${profile.schedule.typicalDurationMin} min`}
            hint="The default length shown on Today."
            onEdit={() => setDialog('duration')}
          />
        </div>
      </Card>

      <Card title="Training preferences">
        <div className={styles.rows}>
          <EditRow
            label="Advanced techniques"
            value={techniquesSummary(profile.techniques)}
            onEdit={() => setDialog('techniques')}
          />
          <EditRow
            label="Rest style"
            value={restStyleLabel(profile.restStyle)}
            onEdit={() => setDialog('rest-style')}
          />
        </div>
      </Card>

      <Card title="Exercise preferences">
        <div className={styles.rows}>
          <EditRow
            label="Preferred exercises"
            value={listSummary(profile.exercisePreferences.preferred, 'None listed')}
            onEdit={() => setDialog('preferred')}
          />
          <EditRow
            label="Exercises to avoid"
            value={listSummary(profile.exercisePreferences.disliked, 'None listed')}
            onEdit={() => setDialog('disliked')}
          />
        </div>
      </Card>

      <Card title="Limitations">
        <div className={styles.rows}>
          <EditRow
            label="Injuries and movements to avoid"
            value={limitationsSummary(profile.limitations)}
            onEdit={() => setDialog('limitations')}
          />
        </div>
      </Card>

      <Card title="Units and bodyweight">
        <div className={styles.rows}>
          <EditRow label="Units" value={unitsLabel(profile.units)} onEdit={() => setDialog('units')} />
          <EditRow
            label="Bodyweight"
            value={bodyweightSummary(profile.bodyweight)}
            hint="Used to size bodyweight-loaded exercises."
            onEdit={() => setDialog('bodyweight')}
          />
        </div>
      </Card>

      {dialog === 'primary-goal' && (
        <ChoiceSheet
          title="Primary goal"
          description="What the plan optimises for first."
          choices={GOAL_LABELS}
          current={profile.goals.primary}
          onPick={(value) => updateProfile({ goals: { primary: value } })}
          onSaved={() => onSaved('Primary goal saved.')}
          onClose={close}
        />
      )}

      {dialog === 'secondary-goal' && (
        <SecondaryGoalSheet
          current={profile.goals.secondary}
          onPick={(value) => updateProfile({ goals: { secondary: value } })}
          onSaved={() => onSaved('Second goal saved.')}
          onClose={close}
        />
      )}

      {dialog === 'experience' && (
        <ChoiceSheet
          title="Experience"
          description="How much lifting is already behind you."
          choices={EXPERIENCE_LABELS}
          current={profile.experience}
          onPick={(value) => updateProfile({ experience: value })}
          onSaved={() => onSaved('Experience saved.')}
          onClose={close}
        />
      )}

      {dialog === 'training-style' && (
        <ChoiceSheet
          title="Training style"
          description="The balance between heavy work and volume."
          choices={TRAINING_STYLE_LABELS}
          current={profile.trainingStyle}
          onPick={(value) => updateProfile({ trainingStyle: value })}
          onSaved={() => onSaved('Training style saved.')}
          onClose={close}
        />
      )}

      {dialog === 'rest-style' && (
        <ChoiceSheet
          title="Rest style"
          description="How long you usually rest between sets."
          choices={REST_STYLE_LABELS}
          current={profile.restStyle}
          onPick={(value) => updateProfile({ restStyle: value })}
          onSaved={() => onSaved('Rest style saved.')}
          onClose={close}
        />
      )}

      {dialog === 'units' && (
        <ChoiceSheet
          title="Units"
          description="Applies to loads and bodyweight."
          choices={UNITS_LABELS}
          current={profile.units}
          onPick={(value) => updateProfile({ units: value })}
          onSaved={() => onSaved('Units saved.')}
          onClose={close}
        />
      )}

      {dialog === 'sessions' && (
        <NumberSheet
          title="Sessions per week"
          description="How many times you aim to train in a week."
          label="Sessions per week"
          min={1}
          max={7}
          current={profile.schedule.sessionsPerWeek}
          onPick={(value) => updateProfile({ schedule: { sessionsPerWeek: value } })}
          onSaved={() => onSaved('Sessions per week saved.')}
          onClose={close}
        />
      )}

      {dialog === 'duration' && (
        <NumberSheet
          title="Typical session length"
          description="The default length shown on Today."
          label="Typical session length"
          unit="min"
          min={15}
          max={180}
          step={5}
          current={profile.schedule.typicalDurationMin}
          onPick={(value) => updateProfile({ schedule: { typicalDurationMin: value } })}
          onSaved={() => onSaved('Typical session length saved.')}
          onClose={close}
        />
      )}

      {dialog === 'days' && (
        <DaysSheet
          current={profile.schedule.availableDays}
          onPick={(days) => updateProfile({ schedule: { availableDays: days } })}
          onSaved={() => onSaved('Training days saved.')}
          onClose={close}
        />
      )}

      {dialog === 'techniques' && (
        <TechniquesSheet
          current={profile.techniques}
          onPick={(techniques) => updateProfile({ techniques })}
          onSaved={() => onSaved('Advanced techniques saved.')}
          onClose={close}
        />
      )}

      {dialog === 'preferred' && (
        <ListSheet
          title="Preferred exercises"
          description="Movements you want to see more often. Free text for now — Phase 2 replaces this with the exercise catalogue."
          label="Preferred exercise"
          placeholder="e.g. Incline dumbbell press"
          current={profile.exercisePreferences.preferred}
          onPick={(preferred) => updateProfile({ exercisePreferences: { preferred } })}
          onSaved={() => onSaved('Preferred exercises saved.')}
          onClose={close}
        />
      )}

      {dialog === 'disliked' && (
        <ListSheet
          title="Exercises to avoid"
          description="Movements to keep out of your sessions. Free text for now — Phase 2 replaces this with the exercise catalogue."
          label="Exercise to avoid"
          placeholder="e.g. Barbell back squat"
          current={profile.exercisePreferences.disliked}
          onPick={(disliked) => updateProfile({ exercisePreferences: { disliked } })}
          onSaved={() => onSaved('Exercises to avoid saved.')}
          onClose={close}
        />
      )}

      {dialog === 'limitations' && (
        <LimitationsSheet
          current={profile.limitations}
          onPick={(limitations) => updateProfile({ limitations })}
          onSaved={() => onSaved('Limitations saved.')}
          onClose={close}
        />
      )}

      {dialog === 'bodyweight' && (
        <BodyweightSheet
          current={profile.bodyweight}
          unit={bodyweightUnit}
          onPick={(bodyweight) => updateProfile({ bodyweight })}
          onSaved={() => onSaved('Bodyweight saved.')}
          onClose={close}
        />
      )}
    </>
  )
}

const NO_SECOND_GOAL = 'none'

function SecondaryGoalSheet({
  current,
  onPick,
  onSaved,
  onClose,
}: {
  current: Goal | null
  onPick: (value: Goal | null) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState<string>(current ?? NO_SECOND_GOAL)

  return (
    <EditSheet
      title="Second goal"
      description="An optional secondary emphasis. Pick None to drop it."
      onSave={() => onPick(value === NO_SECOND_GOAL ? null : (value as Goal))}
      onSaved={onSaved}
      onClose={onClose}
    >
      <ChoiceCardGroup label="Second goal">
        <ChoiceCard
          title="None"
          description="Focus on the primary goal alone."
          selected={value === NO_SECOND_GOAL}
          onSelect={() => setValue(NO_SECOND_GOAL)}
        />
        {GOAL_LABELS.map((choice) => (
          <ChoiceCard
            key={choice.value}
            title={choice.label}
            description={choice.description}
            selected={choice.value === value}
            onSelect={() => setValue(choice.value)}
          />
        ))}
      </ChoiceCardGroup>
    </EditSheet>
  )
}

function DaysSheet({
  current,
  onPick,
  onSaved,
  onClose,
}: {
  current: readonly Weekday[]
  onPick: (days: Weekday[]) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [days, setDays] = useState<Weekday[]>(sortWeekdays(current))

  return (
    <EditSheet
      title="Training days"
      description="The days you can usually train."
      onSave={() => onPick(days)}
      onSaved={onSaved}
      onClose={onClose}
      canSave={days.length > 0}
      blockedReason="Choose at least one training day."
    >
      <FormField label="Training days" hint={daysSummary(days)} as="group">
        {(field) => (
          <DayPicker
            selected={days}
            onChange={(next) => setDays(sortWeekdays(next as Weekday[]))}
            aria-labelledby={field.labelId}
            aria-describedby={field.describedBy}
          />
        )}
      </FormField>
    </EditSheet>
  )
}

function TechniquesSheet({
  current,
  onPick,
  onSaved,
  onClose,
}: {
  current: Profile['techniques']
  onPick: (techniques: Profile['techniques']) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(current)

  return (
    <EditSheet
      title="Advanced techniques"
      description="Which intensity techniques your sessions may use."
      onSave={() => onPick(draft)}
      onSaved={onSaved}
      onClose={onClose}
    >
      <div className={styles.stack}>
        <ToggleRow
          label="Supersets"
          description="Two exercises back to back."
          checked={draft.supersets}
          onChange={(supersets) => setDraft({ ...draft, supersets })}
        />
        <ToggleRow
          label="Drop sets"
          description="Reduce the load and keep going."
          checked={draft.dropSets}
          onChange={(dropSets) => setDraft({ ...draft, dropSets })}
        />
        <ToggleRow
          label="Circuits"
          description="Three or more exercises in rotation."
          checked={draft.circuits}
          onChange={(circuits) => setDraft({ ...draft, circuits })}
        />
      </div>
    </EditSheet>
  )
}

function ListSheet({
  title,
  description,
  label,
  placeholder,
  current,
  onPick,
  onSaved,
  onClose,
}: {
  title: string
  description: string
  label: string
  placeholder: string
  current: readonly string[]
  onPick: (entries: string[]) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [entries, setEntries] = useState<string[]>([...current])

  return (
    <EditSheet
      title={title}
      description={description}
      onSave={() => onPick(entries)}
      onSaved={onSaved}
      onClose={onClose}
    >
      <FormField label={label} as="group">
        {(field) => (
          <TextListInput
            label={label}
            value={entries}
            onChange={setEntries}
            placeholder={placeholder}
            aria-labelledby={field.labelId}
          />
        )}
      </FormField>
    </EditSheet>
  )
}

function LimitationsSheet({
  current,
  onPick,
  onSaved,
  onClose,
}: {
  current: Profile['limitations']
  onPick: (limitations: Profile['limitations']) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(current)

  return (
    <EditSheet
      title="Limitations"
      description="Anything the plan should work around."
      onSave={() => onPick(draft)}
      onSaved={onSaved}
      onClose={onClose}
    >
      <div className={styles.stack}>
        <ToggleRow
          label="Shoulder issue"
          checked={draft.shoulder}
          onChange={(shoulder) => setDraft({ ...draft, shoulder })}
        />
        <ToggleRow
          label="Knee issue"
          checked={draft.knee}
          onChange={(knee) => setDraft({ ...draft, knee })}
        />
        <ToggleRow
          label="Lower back issue"
          checked={draft.lowerBack}
          onChange={(lowerBack) => setDraft({ ...draft, lowerBack })}
        />
        <ToggleRow
          label="Avoid barbell squat"
          checked={draft.avoidBarbellSquat}
          onChange={(avoidBarbellSquat) => setDraft({ ...draft, avoidBarbellSquat })}
        />
      </div>
      <FormField label="Notes" hint="Up to 500 characters. Stored on this device only.">
        {(field) => (
          <textarea
            id={field.id}
            className={styles.textarea}
            rows={4}
            maxLength={500}
            value={draft.notes}
            aria-describedby={field.describedBy}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        )}
      </FormField>
    </EditSheet>
  )
}

function BodyweightSheet({
  current,
  unit,
  onPick,
  onSaved,
  onClose,
}: {
  current: Profile['bodyweight']
  unit: 'kg' | 'lb'
  onPick: (bodyweight: Profile['bodyweight']) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [recorded, setRecorded] = useState(current !== null)
  const [value, setValue] = useState(current?.value ?? (unit === 'kg' ? 75 : 165))

  return (
    <EditSheet
      title="Bodyweight"
      description="Optional. Used to size press-ups, dips, and other bodyweight-loaded work."
      onSave={() => onPick(recorded ? { value, unit } : null)}
      onSaved={onSaved}
      onClose={onClose}
    >
      <ToggleRow
        label="Record my bodyweight"
        description="Turn this off to leave it out entirely."
        checked={recorded}
        onChange={setRecorded}
      />
      {/*
        Bodyweight is the one profile number that is not a whole one — the schema
        stores any finite value up to 1000 — so this is the one stepper that asks
        for the keypad with a decimal separator, and the one that steps in halves
        rather than whole units.
      */}
      {recorded && (
        <FormField label={`Bodyweight in ${unit}`} as="group">
          {(field) => (
            <NumberStepper
              value={value}
              onChange={setValue}
              min={20}
              max={1000}
              step={0.5}
              precision="decimal"
              unit={unit}
              label={`Bodyweight in ${unit}`}
              aria-labelledby={field.labelId}
            />
          )}
        </FormField>
      )}
    </EditSheet>
  )
}
