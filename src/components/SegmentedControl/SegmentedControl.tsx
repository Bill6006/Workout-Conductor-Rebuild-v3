import { useEffect, useRef, type KeyboardEvent } from 'react'
import styles from './SegmentedControl.module.css'

export interface SegmentedOption<T extends string> {
  value: T
  /** Keep these short — the control is sized for two to four of them. */
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label'?: string
  /** Point at a FormField label instead of naming the group inline. */
  'aria-labelledby'?: string
  disabled?: boolean
  className?: string
}

/**
 * Two to four mutually exclusive choices — units, rest style, training style.
 * Real radiogroup semantics: one tab stop, arrows move and select.
 *
 * Segments share the width evenly and wrap their own text rather than
 * truncating, so four options still read at 240 CSS px (360px at 150% zoom).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = options.findIndex((option) => option.value === value)
  // With no match yet, the first segment holds the group's single tab stop.
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0

  useEffect(() => {
    buttons.current.length = options.length
  }, [options.length])

  function move(to: number) {
    const next = ((to % options.length) + options.length) % options.length
    buttons.current[next]?.focus()
    onChange(options[next].value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (disabled) return

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(options.length - 1)
    else return

    event.preventDefault()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={[styles.group, className].filter(Boolean).join(' ')}
    >
      {options.map((option, index) => {
        const isOn = option.value === value

        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={isOn}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            className={[styles.segment, isOn ? styles.on : null].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
