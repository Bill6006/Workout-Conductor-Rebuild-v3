import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './SheetDialog.module.css'

export interface SheetDialogProps {
  open: boolean
  /** Called by Escape, the backdrop, and the close button. */
  onClose: () => void
  title: string
  description?: string
  /** Actions row pinned under the content — confirm, cancel, import. */
  footer?: ReactNode
  /** Focused when the sheet opens. Defaults to the sheet itself. */
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
  className?: string
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/**
 * Bottom sheet for confirmations and the import preview.
 *
 * Owns the four things a modal has to get right: focus moves in on open,
 * Tab cannot leave, Escape and the backdrop close it, and focus returns to
 * whatever opened it. Background scrolling is locked while it is up, because
 * a sheet that lets the page slide behind it reads as broken on a phone.
 */
export function SheetDialog({
  open,
  onClose,
  title,
  description,
  footer,
  initialFocusRef,
  children,
  className,
}: SheetDialogProps) {
  const generated = useId()
  const titleId = `${generated}-title`
  const descriptionId = `${generated}-description`
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const opener = document.activeElement as HTMLElement | null
    const body = document.body
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    ;(initialFocusRef?.current ?? sheetRef.current)?.focus()

    return () => {
      body.style.overflow = previousOverflow
      // Restore focus even when the whole sheet unmounts, not just on close.
      opener?.focus?.()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const stops = focusableIn(sheetRef.current)
    // Nothing focusable inside: keep focus on the sheet rather than let Tab out.
    if (stops.length === 0) {
      event.preventDefault()
      sheetRef.current?.focus()
      return
    }

    const first = stops[0]
    const last = stops[stops.length - 1]
    const active = document.activeElement

    if (event.shiftKey && (active === first || active === sheetRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className={styles.layer}>
      <div className={styles.backdrop} data-testid="sheet-backdrop" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={[styles.sheet, className].filter(Boolean).join(' ')}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        {description && (
          <p className={styles.description} id={descriptionId}>
            {description}
          </p>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
