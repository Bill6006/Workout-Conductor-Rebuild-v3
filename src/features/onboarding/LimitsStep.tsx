import { FormField } from '../../components/FormField'
import { ToggleRow } from '../../components/ToggleRow'
import { ExercisePreferenceField } from '../exercisePreferences'
import type { StepBodyProps } from './steps'
import styles from './OnboardingSteps.module.css'

const MAX_NOTES = 500

const FLAGS: readonly {
  key: 'shoulder' | 'knee' | 'lowerBack' | 'avoidBarbellSquat'
  label: string
  body: string
}[] = [
  { key: 'shoulder', label: 'Shoulder trouble', body: 'Overhead and heavy pressing need care.' },
  { key: 'knee', label: 'Knee trouble', body: 'Deep bending and jumping need care.' },
  { key: 'lowerBack', label: 'Lower-back trouble', body: 'Loaded bending and heavy hinging need care.' },
  { key: 'avoidBarbellSquat', label: 'Avoid barbell squats', body: 'Leave them out regardless of the rest.' },
]

/**
 * Injury flags, free notes, and the exercises a person likes or would rather skip.
 *
 * THE PREFERENCES ARE CATALOG-BACKED FROM HERE ON. Each side opens the one
 * picker, which writes an `exerciseIds` entry when a person chooses a real
 * exercise and a `freeText` entry when they keep their own wording. Nothing on
 * this step guesses: an id is only ever written by somebody tapping the exercise
 * it names.
 *
 * THE CATALOG STILL IS NOT ON THIS CHUNK. The summary each field renders needs
 * only the stored list, so setup loads as it always did; the catalog arrives on
 * the tap that opens the picker.
 */
export function LimitsStep({ answers, onChange }: StepBodyProps) {
  const { limitations, exercisePreferences } = answers

  return (
    <div className={styles.stack}>
      <FormField
        as="group"
        label="Anything to work around?"
        hint="Turn on what applies. Leave everything off if nothing does."
      >
        <div className={styles.toggles}>
          {FLAGS.map((flag) => (
            <ToggleRow
              key={flag.key}
              label={flag.label}
              description={flag.body}
              checked={limitations[flag.key]}
              onChange={(checked) => onChange({ limitations: { ...limitations, [flag.key]: checked } })}
            />
          ))}
        </div>
      </FormField>

      <FormField label="Notes" hint="Optional. Saved with your profile so it is all in one place.">
        {(field) => (
          <textarea
            id={field.id}
            className={styles.notes}
            rows={4}
            maxLength={MAX_NOTES}
            aria-describedby={field.describedBy}
            placeholder="Anything else worth writing down"
            value={limitations.notes}
            onChange={(event) => onChange({ limitations: { ...limitations, notes: event.target.value } })}
          />
        )}
      </FormField>

      <ExercisePreferenceField
        label="Exercises you like"
        hint="Search for them, or keep your own wording when nothing matches."
        noun="liked exercise"
        sheetTitle="Exercises you like"
        sheetDescription="Movements you want to see more often."
        value={exercisePreferences.preferred}
        onChange={(preferred) => onChange({ exercisePreferences: { ...exercisePreferences, preferred } })}
      />

      <ExercisePreferenceField
        label="Exercises you would rather skip"
        hint="Same idea, the other way round."
        noun="skipped exercise"
        sheetTitle="Exercises you would rather skip"
        sheetDescription="Movements to keep out of your sessions."
        value={exercisePreferences.disliked}
        onChange={(disliked) => onChange({ exercisePreferences: { ...exercisePreferences, disliked } })}
      />
    </div>
  )
}
