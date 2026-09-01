import { useId } from 'react'
import styles from './ToggleRow.module.css'

export interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * A full-width settings switch. The entire row is the target, so nothing here
 * asks for a precise tap on a 20px thumb.
 *
 * The switch is named from the label alone. Left to name-from-content it would
 * swallow the description too, and then repeat it as the description.
 */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  id,
  className,
}: ToggleRowProps) {
  const generated = useId()
  const labelId = `${generated}-label`
  const descriptionId = `${generated}-description`

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={[styles.row, checked ? styles.on : null, className].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.text}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        {description && (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        )}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  )
}
