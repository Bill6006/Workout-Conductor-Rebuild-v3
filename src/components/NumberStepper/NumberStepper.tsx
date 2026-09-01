import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import styles from './NumberStepper.module.css'

export interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Suffix shown beside the field, e.g. `min`, `kg`. Not part of the value. */
  unit?: string
  /**
   * `'integer'` (the default) raises the Android digits-only keypad; `'decimal'`
   * raises the one with a decimal separator. Set it for any quantity that can
   * carry a fraction — bodyweight — or the keypad has no way to type one.
   * It changes the keyboard only: parsing, clamping, and the value type are the
   * same either way.
   */
  precision?: 'integer' | 'decimal'
  /** Names the field and both buttons ("Decrease <label>" / "Increase <label>"). */
  label: string
  /** Point at a FormField label instead of naming the field inline. */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  id?: string
  disabled?: boolean
  className?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Value entry with two big targets and a directly editable field — typing 47
 * beats tapping plus eleven times, and neither route may trap the user.
 *
 * The field is `text` + an `inputMode` rather than `type="number"`: Android
 * still raises the number keypad, without the scroll-wheel and
 * silent-invalid-state behaviour of a native number input. `precision` picks
 * which keypad — digits only, or digits with a decimal separator.
 */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  precision = 'integer',
  label,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  id,
  disabled = false,
  className,
}: NumberStepperProps) {
  // Held only while the field is being edited, so a half-typed "1" of "15"
  // never round-trips through the parent as the value 1.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)

  const atMin = value <= min
  const atMax = value >= max

  function commit(next: number) {
    const clamped = clamp(next, min, max)
    if (clamped !== value) onChange(clamped)
    return clamped
  }

  /**
   * The Android decimal keypad emits the user's locale separator, which is a
   * comma across most of Europe. Reading "82,5" as unparseable would silently
   * revert the field to the old value on blur — a trap the digits-only keypad
   * cannot reach, so the tolerance is scoped to the keypad that creates it.
   */
  function parse(raw: string) {
    return Number(precision === 'decimal' ? raw.replace(',', '.') : raw)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    setDraft(raw)

    const parsed = parse(raw)
    // Emit only while the typed text is a real, in-range number. Anything else
    // waits for blur, so backspacing to empty does not fire a value of 0.
    if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      commit(parsed)
    }
  }

  function handleBlur() {
    if (draft === null) return

    const parsed = parse(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(null)
      return
    }

    commit(parsed)
    setDraft(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return

    if (event.key === 'ArrowUp') commit(value + step)
    else if (event.key === 'ArrowDown') commit(value - step)
    else if (event.key === 'Enter') handleBlur()
    else return

    if (event.key !== 'Enter') {
      setDraft(null)
      event.preventDefault()
    }
  }

  return (
    <div className={[styles.stepper, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.step}
        aria-label={`Decrease ${label}`}
        disabled={disabled || atMin}
        aria-disabled={disabled || atMin || undefined}
        onClick={() => commit(value - step)}
      >
        <span aria-hidden="true">&minus;</span>
      </button>

      {/*
        A `<label>`, so the padding around the number is part of the target
        rather than dead space between two buttons. `htmlFor` when the caller
        gave the input an id; the wrapping is the association otherwise.
      */}
      <label className={styles.fieldWrap} htmlFor={id}>
        <input
          id={id}
          className={styles.field}
          type="text"
          inputMode={precision === 'decimal' ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={shown}
          role="spinbutton"
          aria-label={ariaLabelledBy ? undefined : label}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={unit ? `${value} ${unit}` : undefined}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {unit && (
          <span className={styles.unit} aria-hidden="true">
            {unit}
          </span>
        )}
      </label>

      <button
        type="button"
        className={styles.step}
        aria-label={`Increase ${label}`}
        disabled={disabled || atMax}
        aria-disabled={disabled || atMax || undefined}
        onClick={() => commit(value + step)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
