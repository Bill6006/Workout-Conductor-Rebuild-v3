import { useState, type ReactNode } from 'react'
import { PrimaryAction } from '../../components/PrimaryAction'
import { SheetDialog } from '../../components/SheetDialog'
import { describeSaveFailure, type SaveResult } from '../../core/storage/verifiedSave'
import type { Profile } from '../../core/validation/schemas'
import styles from './EditSheet.module.css'

export interface EditSheetProps {
  title: string
  description?: string
  /** Runs the write. Must be the store's update path, so the result is verified. */
  onSave: () => Promise<SaveResult<Profile>>
  /** Called only after the write has been read back and verified. */
  onSaved: () => void
  onClose: () => void
  /** Confirm-button text. Becomes "Try again" after a failed attempt. */
  saveLabel?: string
  /** Blocks the confirm button — e.g. a required field is empty. */
  canSave?: boolean
  /** Why the confirm button is blocked. Rendered next to it. */
  blockedReason?: string
  tone?: 'default' | 'danger'
  children: ReactNode
}

/**
 * The other half of the editing pattern: every settings change is drafted in a
 * sheet and committed by one button.
 *
 * SAVE FEEDBACK IS TRUTHFUL. The write underneath is write → read-back →
 * verify, so this closes and reports success only when the store says the value
 * came back out of storage intact. A failure keeps the sheet open with the draft
 * still in it, shows what went wrong in plain language, and turns the button
 * into "Try again" — the user never sees a tick over an unverified write.
 */
export function EditSheet({
  title,
  description,
  onSave,
  onSaved,
  onClose,
  saveLabel = 'Save',
  canSave = true,
  blockedReason,
  tone = 'default',
  children,
}: EditSheetProps) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      const result = await onSave()
      if (result.ok) {
        onSaved()
        onClose()
        return
      }
      // Verbatim, and never composed with. `SaveFailure` is the only thing that
      // knows whether the previous record was put back and whether that restore
      // was confirmed; a sentence written here would be guessing on the user's
      // behalf about their own data.
      setFailure(describeSaveFailure(result))
    } catch (error) {
      // A throw escaped the save path itself, so nothing here read storage and
      // nothing here may claim what is in it. This used to end "Nothing was
      // changed." — a promise the catch block had no way to keep.
      setFailure(
        `The change could not be saved: ${error instanceof Error ? error.message : String(error)}. What is stored on this device was not read, so close this and check the value on the row.`,
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmLabel = busy ? 'Saving…' : failure ? 'Try again' : saveLabel

  return (
    <SheetDialog
      open
      title={title}
      description={description}
      onClose={busy ? () => {} : onClose}
      footer={
        <div className={styles.footer}>
          {blockedReason && !canSave && (
            <p className={styles.blocked} role="status">
              {blockedReason}
            </p>
          )}
          <div className={styles.buttons}>
            <PrimaryAction variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </PrimaryAction>
            <PrimaryAction
              className={tone === 'danger' ? styles.danger : undefined}
              onClick={() => void save()}
              disabled={busy || !canSave}
            >
              {confirmLabel}
            </PrimaryAction>
          </div>
        </div>
      }
    >
      <div className={styles.body}>
        {children}
        {failure && (
          <p className={styles.failure} role="alert">
            {failure}
          </p>
        )}
      </div>
    </SheetDialog>
  )
}
