import { DayPicker } from '../../components/DayPicker'
import { FormField } from '../../components/FormField'
import { NumberStepper } from '../../components/NumberStepper'
import { WEEKDAYS } from '../../core/validation'
import { issueFor, type StepBodyProps } from './steps'
import styles from './OnboardingSteps.module.css'

const MIN_SESSIONS = 1
const MAX_SESSIONS = 7
const MIN_DURATION = 15
const MAX_DURATION = 180
const DURATION_STEP = 5

/** Sessions per week, typical length, and the days that are actually free. */
export function ScheduleStep({ answers, onChange, issues }: StepBodyProps) {
  const { sessionsPerWeek, typicalDurationMin, availableDays } = answers.schedule

  function setDays(selected: string[]) {
    // Store in calendar order regardless of tap order, and drop anything that is
    // not a weekday id the schema recognises.
    const days = WEEKDAYS.filter((day) => selected.includes(day))
    onChange({ schedule: { ...answers.schedule, availableDays: days } })
  }

  const short = availableDays.length > 0 && availableDays.length < sessionsPerWeek
  const daysHint = short
    ? `You picked ${sessionsPerWeek} sessions and ${availableDays.length} days. That is fine — some days would hold two.`
    : 'Pick the days that usually work. You can change this any time.'

  return (
    <div className={styles.stack}>
      <FormField as="group" label="Sessions per week" hint="How many you realistically get done.">
        {(field) => (
          <NumberStepper
            label="sessions per week"
            aria-labelledby={field.labelId}
            aria-describedby={field.describedBy}
            value={sessionsPerWeek}
            min={MIN_SESSIONS}
            max={MAX_SESSIONS}
            onChange={(value) => onChange({ schedule: { ...answers.schedule, sessionsPerWeek: value } })}
          />
        )}
      </FormField>

      <FormField as="group" label="Typical session length" hint="Door to door, in minutes.">
        {(field) => (
          <NumberStepper
            label="typical session length"
            unit="min"
            aria-labelledby={field.labelId}
            aria-describedby={field.describedBy}
            value={typicalDurationMin}
            min={MIN_DURATION}
            max={MAX_DURATION}
            step={DURATION_STEP}
            onChange={(value) => onChange({ schedule: { ...answers.schedule, typicalDurationMin: value } })}
          />
        )}
      </FormField>

      <FormField
        as="group"
        label="Days you can train"
        hint={daysHint}
        error={issueFor(issues, 'schedule.availableDays')}
      >
        {(field) => (
          /*
           * KNOWN GAP, and not this file's to close: the hint carries the real
           * information on this field — it is the line that says "you picked 4
           * sessions and 2 days" — and no screen reader ever hears it.
           *
           * `DayPicker` accepts `aria-label` and `aria-labelledby` and nothing
           * else (components/DayPicker/DayPicker.tsx destructures its props; it
           * has no rest spread), so `aria-describedby` cannot be passed. The
           * ids exist and are correct — `field.describedBy` already names the
           * hint and the error — so the fix here is one line, the moment the
           * component puts `aria-describedby` on its `role="group"` element:
           *
           *     aria-describedby={field.describedBy}
           *
           * Folding the hint into `aria-labelledby` instead was tried and
           * rejected: it turns the group's accessible name into a sentence,
           * and tests/e2e/setupFlow.ts matches that name exactly.
           */
          <DayPicker aria-labelledby={field.labelId} selected={[...availableDays]} onChange={setDays} />
        )}
      </FormField>
    </div>
  )
}
