import { WEEK_DAYS, type DayOption } from './week'
import styles from './DayPicker.module.css'

export interface DayPickerProps {
  /** Defaults to the shared Monday-first week. */
  days?: DayOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  'aria-label'?: string
  /** Point at a FormField label instead of naming the group inline. */
  'aria-labelledby'?: string
  /** Point at a FormField hint, so the hint is announced with the group. */
  'aria-describedby'?: string
  disabled?: boolean
  className?: string
}

/**
 * Seven independent toggles on one row. This is the tightest layout in the
 * app: at 240 CSS px (360px at 150% zoom) seven 44px targets cannot fit the
 * viewport at all, so the cells share the width evenly and keep their height
 * instead — the touch target stays 44px+ at every real phone width.
 */
export function DayPicker({
  days = WEEK_DAYS,
  selected,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  disabled = false,
  className,
}: DayPickerProps) {
  function toggle(id: string) {
    const isOn = selected.includes(id)
    onChange(isOn ? selected.filter((entry) => entry !== id) : [...selected, id])
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className={[styles.week, className].filter(Boolean).join(' ')}
    >
      {days.map((day) => {
        const isOn = selected.includes(day.id)

        return (
          <button
            key={day.id}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            aria-label={day.label}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            className={[styles.day, isOn ? styles.on : null].filter(Boolean).join(' ')}
            onClick={() => toggle(day.id)}
          >
            {day.short}
          </button>
        )
      })}
    </div>
  )
}
