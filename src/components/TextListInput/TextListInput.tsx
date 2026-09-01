import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import styles from './TextListInput.module.css'

export interface TextListInputProps {
  /** Names the field and the Add button ("Add <label>"). */
  label: string
  value: string[]
  onChange: (entries: string[]) => void
  placeholder?: string
  /** Shown in place of the chip list while there is nothing in it. */
  emptyHint?: string
  maxEntries?: number
  maxLength?: number
  /** Point at a FormField label instead of naming the field inline. */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  id?: string
  disabled?: boolean
  className?: string
}

const DEFAULT_MAX_ENTRIES = 20
const DEFAULT_MAX_LENGTH = 40

/**
 * Add and remove free-text entries — preferred and disliked exercises.
 *
 * PHASE NOTE: Phase 2 replaces the free text with catalog-backed selection.
 * The stored shape stays a string list so the migration is a picker swap, not
 * a data change.
 */
export function TextListInput({
  label,
  value,
  onChange,
  placeholder,
  emptyHint = 'Nothing added yet.',
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxLength = DEFAULT_MAX_LENGTH,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  id,
  disabled = false,
  className,
}: TextListInputProps) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /** Index in the *new* list that should take focus after a removal. */
  const focusAfterRemoval = useRef<number | null>(null)

  const full = value.length >= maxEntries

  /**
   * Removing an entry unmounts the button that was just activated, and focus
   * falls to `<body>` — a keyboard or screen-reader user loses their place and
   * has to tab in from the top of the sheet. So the removal names its successor
   * and focus is placed there once the shorter list has rendered: the entry that
   * slid into the gap, the new last entry when the gap was at the end, or the
   * text field when nothing is left to remove.
   */
  useEffect(() => {
    const wanted = focusAfterRemoval.current
    if (wanted === null) return
    focusAfterRemoval.current = null

    // A data attribute rather than the CSS-module class: the hook has to find
    // the buttons in jsdom too, where module class names are not generated.
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-entry-remove]')
    const target = buttons?.length ? buttons[Math.min(wanted, buttons.length - 1)] : inputRef.current
    target?.focus()
  }, [value])

  function add() {
    const entry = text.trim().replace(/\s+/g, ' ')

    if (entry === '') {
      setMessage('Type something to add.')
      return
    }
    if (value.some((existing) => existing.toLowerCase() === entry.toLowerCase())) {
      setMessage(`${entry} is already on the list.`)
      return
    }
    if (full) {
      setMessage(`That is the limit of ${maxEntries}. Remove one first.`)
      return
    }

    onChange([...value, entry])
    setText('')
    setMessage(`${entry} added.`)
  }

  function remove(entry: string) {
    const index = value.indexOf(entry)
    focusAfterRemoval.current = index < 0 ? 0 : index
    onChange(value.filter((existing) => existing !== entry))
    setMessage(`${entry} removed.`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // Enter inside a wider form would submit it; adding an entry is the intent.
    event.preventDefault()
    add()
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <div className={styles.entry}>
        <input
          ref={inputRef}
          id={id}
          className={styles.input}
          type="text"
          value={text}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={ariaLabelledBy ? undefined : label}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.add}
          aria-label={`Add ${label}`}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          onClick={add}
        >
          Add
        </button>
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {message}
      </p>

      {value.length === 0 ? (
        <p className={styles.empty}>{emptyHint}</p>
      ) : (
        <ul ref={listRef} className={styles.list} role="list">
          {value.map((entry) => (
            <li key={entry} className={styles.chip}>
              <span className={styles.chipText}>{entry}</span>
              <button
                type="button"
                data-entry-remove=""
                className={styles.remove}
                aria-label={`Remove ${entry}`}
                disabled={disabled}
                aria-disabled={disabled || undefined}
                onClick={() => remove(entry)}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
