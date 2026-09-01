import { FormField } from '../../components/FormField'
import { TextListInput } from '../../components/TextListInput'
import { ToggleRow } from '../../components/ToggleRow'
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

/** Injury flags, free notes, and the exercises a person likes or would rather skip. */
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

      <FormField as="group" label="Exercises you like" hint="Type them however you say them.">
        {(field) => (
          <TextListInput
            label="a liked exercise"
            aria-labelledby={field.labelId}
            aria-describedby={field.describedBy}
            placeholder="Incline dumbbell press"
            emptyHint="Nothing added yet."
            value={exercisePreferences.preferred}
            onChange={(preferred) => onChange({ exercisePreferences: { ...exercisePreferences, preferred } })}
          />
        )}
      </FormField>

      <FormField as="group" label="Exercises you would rather skip" hint="Same idea, the other way round.">
        {(field) => (
          <TextListInput
            label="a disliked exercise"
            aria-labelledby={field.labelId}
            aria-describedby={field.describedBy}
            placeholder="Barbell row"
            emptyHint="Nothing added yet."
            value={exercisePreferences.disliked}
            onChange={(disliked) => onChange({ exercisePreferences: { ...exercisePreferences, disliked } })}
          />
        )}
      </FormField>
    </div>
  )
}
