import { useRef, useState, type ChangeEvent } from 'react'
import { Card } from '../../components/Card'
import { PrimaryAction } from '../../components/PrimaryAction'
import { SheetDialog } from '../../components/SheetDialog'
import {
  backupFilename,
  createBackupEnvelope,
  inspectBackup,
  serializeBackup,
  type BackupPreview,
} from '../../core/backup'
import { useProfile } from '../../core/state'
import type { SaveResult } from '../../core/storage/verifiedSave'
import { nowIso } from '../../core/time/clock'
import type { Profile } from '../../core/validation/schemas'
// Imported from the module, not the barrel: the barrel re-exports the whole
// setup flow, which would pull it back out of its lazy chunk.
import { clearDraft } from '../onboarding/draft'
import { EditSheet } from './EditSheet'
import styles from './DataSettings.module.css'

/**
 * Backup, restore, and re-running setup.
 *
 * Import is previewable by contract: the file is inspected and described in
 * full — app, data version, export date, contents, and every problem found —
 * before anything is written. Applying it goes through the profile store's save
 * path like every other change, so the replacement is read back and verified
 * before it is reported as done.
 */

interface Loaded {
  fileName: string
  preview: BackupPreview
}

/**
 * `FileReader` rather than `Blob.text()`: it is the older, universally
 * implemented path, and it works in every browser the PWA targets.
 */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'))
    reader.readAsText(file)
  })
}

interface Notice {
  tone: 'ok' | 'error'
  message: string
}

export interface DataSettingsProps {
  profile: Profile
  onSaved: (message: string) => void
  /**
   * Onboarding's re-entry point, owned by the onboarding feature and wired in
   * by the app shell if it wants a different route into setup. Without it,
   * Re-run setup clears onboarding's draft and its completion stamp — the exact
   * condition the app's onboarding gate uses to send someone into setup.
   */
  onRerunSetup?: () => void
}

export function DataSettings({ profile, onSaved, onRerunSetup }: DataSettingsProps) {
  const { updateProfile, replaceProfile } = useProfile()
  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [confirmRerun, setConfirmRerun] = useState(false)

  function exportBackup() {
    const exportedAt = nowIso()
    const filename = backupFilename(exportedAt)
    const text = serializeBackup(createBackupEnvelope(profile, exportedAt))

    try {
      if (typeof URL.createObjectURL !== 'function') {
        throw new Error('this browser will not let a page hand you a file')
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.rel = 'noopener'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice({ tone: 'ok', message: `Export started: ${filename}. Your browser decides where it lands.` })
    } catch (error) {
      setNotice({
        tone: 'error',
        message: `The backup file could not be created: ${error instanceof Error ? error.message : String(error)}.`,
      })
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing lets the same file be chosen twice in a row.
    event.target.value = ''
    if (!file) return

    setNotice(null)
    try {
      const text = await readTextFile(file)
      setLoaded({ fileName: file.name, preview: inspectBackup(text) })
    } catch (error) {
      setNotice({
        tone: 'error',
        message: `That file could not be read: ${error instanceof Error ? error.message : String(error)}.`,
      })
    }
  }

  function applyLoaded(): Promise<SaveResult<Profile>> {
    const incoming = loaded?.preview.envelope?.data.profile
    if (!incoming) {
      return Promise.resolve({
        ok: false,
        reason: 'write-failed',
        message: 'This backup cannot be imported, so nothing was changed.',
        differences: [],
        issues: [],
        rollback: 'not-needed',
      })
    }
    return replaceProfile(incoming)
  }

  function rerunSetup(): Promise<SaveResult<Profile>> {
    if (onRerunSetup) {
      onRerunSetup()
      return Promise.resolve({ ok: true, value: profile })
    }
    // Onboarding's own helper drops any half-finished draft, so setup reopens
    // on the saved profile rather than on stale answers. Clearing the
    // completion stamp is the condition the app's onboarding gate watches, so
    // this re-enters setup without Settings knowing the route.
    clearDraft()
    return updateProfile({ onboardingCompletedAt: null })
  }

  return (
    <>
      <Card title="Setup">
        <p className={styles.copy}>
          Re-run setup walks you through the questions again with your saved answers already filled in.
          Nothing is deleted along the way.
        </p>
        <PrimaryAction variant="ghost" onClick={() => setConfirmRerun(true)}>
          Re-run setup
        </PrimaryAction>
      </Card>

      <Card title="Data">
        <p className={styles.copy}>
          Everything lives on this device. Export writes a JSON file you keep yourself; import reads one back
          after showing you what is in it.
        </p>

        <div className={styles.actions}>
          <PrimaryAction variant="ghost" onClick={exportBackup}>
            Export backup
          </PrimaryAction>
          <PrimaryAction variant="ghost" onClick={() => fileInput.current?.click()}>
            Import backup
          </PrimaryAction>
        </div>

        <input
          ref={fileInput}
          data-testid="import-file-input"
          className="wc-visually-hidden"
          type="file"
          accept="application/json,.json"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void readFile(event)}
        />

        <p className={notice?.tone === 'error' ? styles.error : styles.ok} role="status">
          {notice?.message ?? ''}
        </p>
      </Card>

      {loaded && loaded.preview.importable && (
        <EditSheet
          title="Import this backup?"
          description="Importing replaces the profile on this device."
          saveLabel="Replace my profile"
          tone="danger"
          onSave={applyLoaded}
          onSaved={() => onSaved('Backup imported.')}
          onClose={() => setLoaded(null)}
        >
          <BackupDetails fileName={loaded.fileName} preview={loaded.preview} />
        </EditSheet>
      )}

      {loaded && !loaded.preview.importable && (
        <SheetDialog
          open
          title="This file cannot be imported"
          description="Nothing on this device has been changed."
          onClose={() => setLoaded(null)}
          footer={
            <PrimaryAction variant="ghost" onClick={() => setLoaded(null)}>
              Close
            </PrimaryAction>
          }
        >
          <BackupDetails fileName={loaded.fileName} preview={loaded.preview} />
        </SheetDialog>
      )}

      {confirmRerun && (
        <EditSheet
          title="Re-run setup?"
          description="Your current answers become the starting values. Nothing is deleted."
          saveLabel="Re-run setup"
          onSave={rerunSetup}
          onSaved={() => onSaved('Setup reopened.')}
          onClose={() => setConfirmRerun(false)}
        >
          <p className={styles.copy}>
            You can leave setup at any point; your saved profile stays exactly as it is until you change an
            answer.
          </p>
        </EditSheet>
      )}
    </>
  )
}

function BackupDetails({ fileName, preview }: { fileName: string; preview: BackupPreview }) {
  return (
    <div className={styles.preview}>
      {/* For a rejected file the summary IS the first problem, so the problems
          list below carries it rather than saying it twice. */}
      {preview.problems.length === 0 && <p className={styles.summary}>{preview.summary}</p>}

      <dl className={styles.details} data-testid="backup-preview">
        <div className={styles.detail}>
          <dt className={styles.term}>File</dt>
          <dd className={styles.value}>{fileName}</dd>
        </div>
        <div className={styles.detail}>
          <dt className={styles.term}>Written by</dt>
          <dd className={styles.value}>{preview.app ?? 'Not stated'}</dd>
        </div>
        {/* A rejected file stops being read at the first problem, so these two
            are honestly "not read" rather than "not stated". */}
        <div className={styles.detail}>
          <dt className={styles.term}>Data version</dt>
          <dd className={styles.value}>{preview.schemaVersion ?? 'Not read'}</dd>
        </div>
        <div className={styles.detail}>
          <dt className={styles.term}>Exported</dt>
          <dd className={styles.value}>{preview.exportedAt ?? 'Not read'}</dd>
        </div>
        <div className={styles.detail}>
          <dt className={styles.term}>Contains</dt>
          <dd className={styles.value}>{preview.contains.profile ? '1 profile' : 'No profile'}</dd>
        </div>
      </dl>

      {preview.problems.length > 0 && (
        <ul className={styles.problems} role="list">
          {preview.problems.map((problem) => (
            <li key={problem.code} className={styles.problem}>
              {problem.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
