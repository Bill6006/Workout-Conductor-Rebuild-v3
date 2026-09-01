import { ChoiceCard, ChoiceCardGroup } from '../../components/ChoiceCard'
import { FormField } from '../../components/FormField'
import { EXPERIENCE_LABELS, TRAINING_STYLE_LABELS } from '../../catalog/labels'
import type { StepBodyProps } from './steps'
import styles from './OnboardingSteps.module.css'

/**
 * Experience and style. Both are cards rather than segments: "Hypertrophy" and
 * "Intermediate" cannot sit on one line in a third of a 240px viewport, and a
 * choice nobody can read is a choice nobody makes.
 */
export function ExperienceStep({ answers, onChange }: StepBodyProps) {
  return (
    <div className={styles.stack}>
      <FormField as="group" label="Experience" hint="Roughly how long you have been lifting.">
        {(field) => (
          <ChoiceCardGroup label="Experience" labelledBy={field.labelId}>
            {EXPERIENCE_LABELS.map((option) => (
              <ChoiceCard
                key={option.value}
                title={option.label}
                description={option.description}
                selected={answers.experience === option.value}
                onSelect={() => onChange({ experience: option.value })}
              />
            ))}
          </ChoiceCardGroup>
        )}
      </FormField>

      <FormField as="group" label="Training style" hint="Which way you would rather lean.">
        {(field) => (
          <ChoiceCardGroup label="Training style" labelledBy={field.labelId}>
            {TRAINING_STYLE_LABELS.map((option) => (
              <ChoiceCard
                key={option.value}
                title={option.label}
                description={option.description}
                selected={answers.trainingStyle === option.value}
                onSelect={() => onChange({ trainingStyle: option.value })}
              />
            ))}
          </ChoiceCardGroup>
        )}
      </FormField>
    </div>
  )
}
