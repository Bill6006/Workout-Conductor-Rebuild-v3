/**
 * THE workout-length control. There is exactly one in the product.
 *
 * LOCKED DECISION: 15 / 30 / 45 / Default time, in one compact dropdown. There
 * are deliberately no Full / Lazy / Short / Density / Recovery modes, no context
 * flags, and no second start button. `src/app/App.test.tsx` fails the build if a
 * rival control ever appears.
 *
 * Choosing a length REBUILDS the session for that length — it does not lop the
 * last exercises off a longer one. That happens in the generator; this control's
 * only job is to say which length was asked for.
 *
 * Implemented as a native `<select>` on purpose: it is one tap on Android, it
 * gets the platform's own wheel picker, it is reachable by keyboard and screen
 * reader for free, and it cannot be scrolled off the edge of a small screen the
 * way a custom popover can.
 */
import type { DurationChoice } from '../../core/validation/workoutSchema'
import { CONTROL_CHOICES } from './durationChoices'
import styles from './DurationControl.module.css'

interface DurationControlProps {
  readonly value: DurationChoice
  readonly onChange: (choice: DurationChoice) => void
  /** The minutes "Default time" currently resolves to, when a session exists. */
  readonly defaultMinutes: number | null
  readonly disabled?: boolean
  readonly id?: string
}

function labelFor(choice: DurationChoice, defaultMinutes: number | null): string {
  if (choice !== 'default') return `${choice} min`
  return defaultMinutes === null ? 'Default time' : `Default · ${defaultMinutes} min`
}

export function DurationControl({
  value,
  onChange,
  defaultMinutes,
  disabled = false,
  id = 'workout-length',
}: DurationControlProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label} htmlFor={id}>
        Workout length
      </label>
      <div className={styles.control}>
        <select
          id={id}
          className={styles.select}
          value={String(value)}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value
            onChange(raw === 'default' ? 'default' : (Number(raw) as DurationChoice))
          }}
        >
          {CONTROL_CHOICES.map((choice) => (
            <option key={String(choice)} value={String(choice)}>
              {labelFor(choice, defaultMinutes)}
            </option>
          ))}
        </select>
        <svg
          className={styles.chevron}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 9.5 12 15.5 18 9.5" />
        </svg>
      </div>
    </div>
  )
}
