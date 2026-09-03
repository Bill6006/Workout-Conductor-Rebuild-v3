/**
 * A focused picker for ONE value.
 *
 * Deliberately not a keypad and not a grid of increments. It shows a short
 * column of plausible options centred on the current one, so the common
 * adjustment is a flick and a tap, and a large jump costs the same as a small
 * one. Typing is available behind a single control for the case the list cannot
 * reach — but it is the fallback, not the path.
 *
 * It sits at the bottom of the screen because that is where a thumb is.
 */
import { useEffect, useRef, useState } from 'react'
import styles from './ValueWheel.module.css'

export interface ValueWheelProps {
  readonly title: string
  readonly unit?: string
  readonly value: number
  readonly options: readonly number[]
  /** Offers a numeric field for a value the list cannot reach. */
  readonly allowTyping?: boolean
  readonly onSelect: (value: number) => void
  readonly onClose: () => void
}

export function ValueWheel({
  title,
  unit,
  value,
  options,
  allowTyping = false,
  onSelect,
  onClose,
}: ValueWheelProps) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const list = useRef<HTMLUListElement>(null)
  const selected = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Open centred on the current value, so the first thing under the thumb is
  // what is already set rather than the top of an arbitrary list.
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'center' })
    panel.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const commitTyped = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed) && parsed >= 0) onSelect(Number(parsed.toFixed(2)))
    else onClose()
  }

  return (
    <div className={styles.scrim} onClick={onClose} role="presentation">
      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={styles.title}>{title}</span>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </div>

        {typing ? (
          <div className={styles.typing}>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTyped()
              }}
              aria-label={`${title} value`}
            />
            <button type="button" className={styles.confirm} onClick={commitTyped}>
              Set
            </button>
          </div>
        ) : (
          <ul className={styles.list} ref={list} role="list" aria-label={title}>
            {options.map((option) => {
              const current = option === value
              return (
                <li key={option}>
                  <button
                    ref={current ? selected : undefined}
                    type="button"
                    className={current ? `${styles.option} ${styles.current}` : styles.option}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => onSelect(option)}
                  >
                    {option}
                    {unit ? <span className={styles.optionUnit}>{unit}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {allowTyping && !typing && (
          <button type="button" className={styles.type} onClick={() => setTyping(true)}>
            Type a number
          </button>
        )}
      </div>
    </div>
  )
}
