import type { ReactNode } from 'react'
import { Card } from '../../components/Card'
import { equipmentLabel } from '../../catalog/equipment'
import {
  daysSummary,
  experienceLabel,
  goalLabel,
  locationKindLabel,
  restStyleLabel,
  trainingStyleLabel,
  weightUnitFor,
} from '../../catalog/labels'
import type { OnboardingAnswers } from './answers'
import type { OnboardingStepId } from './steps'
import styles from './OnboardingSteps.module.css'

export interface ReviewStepProps {
  answers: OnboardingAnswers
  /** Jumps back to the step that owns a section, keeping every other answer. */
  onEdit: (step: OnboardingStepId) => void
}

interface Entry {
  term: string
  value: string
  /** Renders in the faint tone — for "None" and other honest blanks. */
  empty?: boolean
}

function Section({
  title,
  step,
  entries,
  onEdit,
  children,
}: {
  title: string
  step: OnboardingStepId
  entries: Entry[]
  onEdit: (step: OnboardingStepId) => void
  children?: ReactNode
}) {
  return (
    <Card
      title={title}
      action={
        <button
          type="button"
          className={styles.small}
          aria-label={`Edit ${title}`}
          onClick={() => onEdit(step)}
        >
          Edit
        </button>
      }
    >
      <dl className={styles.summary}>
        {entries.map((entry) => (
          <div key={entry.term} className={styles.row}>
            <dt className={styles.term}>{entry.term}</dt>
            <dd className={entry.empty ? styles.faint : styles.value}>{entry.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </Card>
  )
}

function list(values: readonly string[], blank: string): Entry['value'] {
  return values.length === 0 ? blank : values.join(', ')
}

/** The last screen: every answer, each with a way back to the step that set it. */
export function ReviewStep({ answers, onEdit }: ReviewStepProps) {
  const { goals, schedule, techniques, limitations, exercisePreferences, locations } = answers

  const on = [
    techniques.supersets ? 'supersets' : null,
    techniques.dropSets ? 'drop sets' : null,
    techniques.circuits ? 'circuits' : null,
  ].filter((entry): entry is string => entry !== null)

  const flags = [
    limitations.shoulder ? 'shoulder' : null,
    limitations.knee ? 'knee' : null,
    limitations.lowerBack ? 'lower back' : null,
    limitations.avoidBarbellSquat ? 'no barbell squats' : null,
  ].filter((flag): flag is string => flag !== null)

  const active = locations.find((location) => location.id === answers.activeLocationId)

  return (
    <div className={styles.stack}>
      <Section
        title="Goals"
        step="goals"
        onEdit={onEdit}
        entries={[
          { term: 'Main', value: goalLabel(goals.primary) },
          {
            term: 'Second',
            value: goals.secondary ? goalLabel(goals.secondary) : 'None',
            empty: goals.secondary === null,
          },
        ]}
      />

      <Section
        title="How you train"
        step="experience"
        onEdit={onEdit}
        entries={[
          { term: 'Experience', value: experienceLabel(answers.experience) },
          { term: 'Style', value: trainingStyleLabel(answers.trainingStyle) },
        ]}
      />

      <Section
        title="Your week"
        step="schedule"
        onEdit={onEdit}
        entries={[
          { term: 'Sessions', value: `${schedule.sessionsPerWeek} per week` },
          { term: 'Length', value: `${schedule.typicalDurationMin} min` },
          {
            term: 'Days',
            value: daysSummary(schedule.availableDays),
            empty: schedule.availableDays.length === 0,
          },
        ]}
      />

      <Section
        title="Where you train"
        step="locations"
        onEdit={onEdit}
        entries={locations.map((location, index) => ({
          term: location.name.trim() || `Place ${index + 1}`,
          value: `${locationKindLabel(location.kind)} · ${
            location.equipment.length === 0
              ? 'no equipment listed'
              : location.equipment.map((id) => equipmentLabel(id)).join(', ')
          }`,
          empty: location.equipment.length === 0,
        }))}
      >
        <p className={styles.note}>{`Opens at ${active?.name.trim() || 'your first place'}.`}</p>
      </Section>

      <Section
        title="Techniques and rest"
        step="training"
        onEdit={onEdit}
        entries={[
          { term: 'Happy with', value: list(on, 'None of them'), empty: on.length === 0 },
          { term: 'Rest', value: restStyleLabel(answers.restStyle) },
          { term: 'Weights in', value: weightUnitFor(answers.units) },
          {
            term: 'Bodyweight',
            value: answers.bodyweight
              ? `${answers.bodyweight.value} ${answers.bodyweight.unit}`
              : 'Not recorded',
            empty: answers.bodyweight === null,
          },
        ]}
      />

      <Section
        title="Limits and preferences"
        step="limits"
        onEdit={onEdit}
        entries={[
          { term: 'Work around', value: list(flags, 'Nothing'), empty: flags.length === 0 },
          {
            term: 'Notes',
            value: limitations.notes.trim() || 'None',
            empty: limitations.notes.trim() === '',
          },
          {
            term: 'Likes',
            value: list(exercisePreferences.preferred, 'None listed'),
            empty: exercisePreferences.preferred.length === 0,
          },
          {
            term: 'Skips',
            value: list(exercisePreferences.disliked, 'None listed'),
            empty: exercisePreferences.disliked.length === 0,
          },
        ]}
      />

      <p className={styles.note}>
        Finishing saves this profile to this device. Nothing is sent anywhere, and you can change any of it
        later.
      </p>
    </div>
  )
}
