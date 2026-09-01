import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import styles from './ChoiceCard.module.css'

export type ChoiceMode = 'single' | 'multi'

export interface ChoiceCardProps {
  title: string
  description?: string
  /** Small leading slot — an icon, a letter, a short badge. Decorative only. */
  icon?: ReactNode
  selected: boolean
  onSelect: () => void
  /** `single` renders a radio, `multi` a checkbox. Must match the wrapping group. */
  mode?: ChoiceMode
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * A large tappable option. Selection reads as a lime edge and wash across the
 * whole card rather than a pinhead radio dot, because these are pressed with a
 * thumb mid-session.
 */
export function ChoiceCard({
  title,
  description,
  icon,
  selected,
  onSelect,
  mode = 'single',
  disabled = false,
  id,
  className,
}: ChoiceCardProps) {
  const classes = [styles.card, selected ? styles.selected : null, className].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      id={id}
      role={mode === 'single' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={classes}
      onClick={onSelect}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      <span className={mode === 'single' ? styles.markRound : styles.markSquare} aria-hidden="true" />
    </button>
  )
}

export interface ChoiceCardGroupProps {
  /** Accessible name for the whole set of cards. */
  label: string
  mode?: ChoiceMode
  children: ReactNode
  /** Point at a FormField label instead of naming the group inline. */
  labelledBy?: string
  className?: string
}

function radiosIn(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]')).filter(
    (card) => !card.disabled,
  )
}

/**
 * Wraps ChoiceCards in the grouping role their `role` demands. Single-select
 * groups get the radiogroup keyboard contract: one tab stop, arrows move and
 * select inside it.
 */
export function ChoiceCardGroup({
  label,
  mode = 'single',
  children,
  labelledBy,
  className,
}: ChoiceCardGroupProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Roving tab stop. Runs after every render so a selection change moves it.
  useEffect(() => {
    if (mode !== 'single') return
    const cards = radiosIn(ref.current)
    if (cards.length === 0) return

    const active = cards.find((card) => card.getAttribute('aria-checked') === 'true') ?? cards[0]
    for (const card of cards) card.tabIndex = card === active ? 0 : -1
  })

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (mode !== 'single') return

    const cards = radiosIn(ref.current)
    if (cards.length === 0) return

    const from = cards.indexOf(document.activeElement as HTMLButtonElement)
    let next = -1

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (Math.max(from, 0) + 1) % cards.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (Math.max(from, 0) - 1 + cards.length) % cards.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = cards.length - 1
    if (next < 0) return

    event.preventDefault()
    cards[next].focus()
    cards[next].click()
  }

  return (
    <div
      ref={ref}
      role={mode === 'single' ? 'radiogroup' : 'group'}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={[styles.group, className].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  )
}
