import { useId, type ReactNode } from 'react'
import styles from './FormField.module.css'

export interface FormFieldRenderProps {
  /** Put this on the single control the visible `<label>` points at. */
  id: string
  /** Id of the visible label — composite controls use it for `aria-labelledby`. */
  labelId: string
  /** Ids of the hint and error text, or undefined when there is neither. */
  describedBy: string | undefined
  invalid: boolean
}

export interface FormFieldProps {
  label: string
  hint?: string
  error?: string
  /**
   * `label` wires a real `<label for>` and suits one focusable control.
   * `group` renders the label as plain text for composite controls
   * (ChipGroup, DayPicker, SegmentedControl) that own their own grouping role.
   */
  as?: 'label' | 'group'
  /** Override the generated control id when the caller already owns one. */
  id?: string
  children: ReactNode | ((field: FormFieldRenderProps) => ReactNode)
  className?: string
}

/**
 * The label + hint + error wrapper every form control composes with. It owns
 * the id wiring so no screen ever hand-rolls an `aria-describedby` again.
 */
export function FormField({ label, hint, error, as = 'label', id, children, className }: FormFieldProps) {
  const generated = useId()
  const fieldId = id ?? `${generated}-control`
  const labelId = `${generated}-label`
  const hintId = `${generated}-hint`
  const errorId = `${generated}-error`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  const field: FormFieldRenderProps = { id: fieldId, labelId, describedBy, invalid: Boolean(error) }
  const content = typeof children === 'function' ? children(field) : children

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      {as === 'label' ? (
        <label className={styles.label} id={labelId} htmlFor={fieldId}>
          {label}
        </label>
      ) : (
        <span className={styles.label} id={labelId}>
          {label}
        </span>
      )}
      {hint && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      <div className={styles.control}>{content}</div>
      {error && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
