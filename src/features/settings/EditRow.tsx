import type { ReactNode } from 'react'
import styles from './EditRow.module.css'

export interface EditRowProps {
  /** What the setting is called. Leads the accessible name. */
  label: string
  /** The value as it stands right now, read straight from the saved profile. */
  value: string
  /** Optional second line under the value — context, never a promise. */
  hint?: string
  /** Small trailing marker, e.g. an "Active" pill. */
  badge?: ReactNode
  onEdit: () => void
  disabled?: boolean
}

function ChevronRight() {
  return (
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
      <path d="M9.5 6 15.5 12 9.5 18" />
    </svg>
  )
}

/**
 * THE settings editing pattern: one row per stored value, showing what is
 * saved, opening a sheet to change it.
 *
 * The row is named from its own content — "Training days Mon, Tue, Thu, Sat" —
 * so a screen reader hears the setting and its current value before deciding
 * whether to open anything.
 */
export function EditRow({ label, value, hint, badge, onEdit, disabled = false }: EditRowProps) {
  return (
    <button
      type="button"
      className={styles.row}
      onClick={onEdit}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      {/* The single spaces are load-bearing: they keep the accessible name
          "Training days Mon, Tue" rather than one run-on word. Flex layout
          discards whitespace-only children, so nothing shifts on screen. */}
      <span className={styles.text}>
        <span className={styles.label}>{label}</span> <span className={styles.value}>{value}</span>
        {hint && <span className={styles.hint}>{` ${hint}`}</span>}
      </span>
      {badge && <span className={styles.badge}>{badge}</span>}
      <ChevronRight />
    </button>
  )
}
