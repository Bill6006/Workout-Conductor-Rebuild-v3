import { ChoiceCard, ChoiceCardGroup } from '../../components/ChoiceCard'
import { FormField } from '../../components/FormField'
import type { Goal } from '../../core/validation'
import { GOAL_LABELS } from '../../catalog/labels'
import type { StepBodyProps } from './steps'
import styles from './OnboardingSteps.module.css'

/** Primary goal, plus an optional second one that cannot repeat the first. */
export function GoalsStep({ answers, onChange }: StepBodyProps) {
  const { primary, secondary } = answers.goals

  function setPrimary(next: Goal) {
    // A second goal identical to the first says nothing; drop it rather than
    // making the person notice and fix it.
    onChange({ goals: { ...answers.goals, primary: next, secondary: secondary === next ? null : secondary } })
  }

  function setSecondary(next: Goal | null) {
    onChange({ goals: { ...answers.goals, secondary: next } })
  }

  return (
    <div className={styles.stack}>
      <FormField as="group" label="Main goal" hint="The one thing you most want out of training.">
        {(field) => (
          <ChoiceCardGroup label="Main goal" labelledBy={field.labelId}>
            {GOAL_LABELS.map((option) => (
              <ChoiceCard
                key={option.value}
                title={option.label}
                description={option.description}
                selected={primary === option.value}
                onSelect={() => setPrimary(option.value)}
              />
            ))}
          </ChoiceCardGroup>
        )}
      </FormField>

      <FormField as="group" label="Second goal" hint="Optional. Pick None if one goal is enough.">
        {(field) => (
          <ChoiceCardGroup label="Second goal" labelledBy={field.labelId}>
            <ChoiceCard title="None" selected={secondary === null} onSelect={() => setSecondary(null)} />
            {GOAL_LABELS.filter((option) => option.value !== primary).map((option) => (
              <ChoiceCard
                key={option.value}
                title={option.label}
                selected={secondary === option.value}
                onSelect={() => setSecondary(option.value)}
              />
            ))}
          </ChoiceCardGroup>
        )}
      </FormField>
    </div>
  )
}
