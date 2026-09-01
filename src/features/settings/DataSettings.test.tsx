import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBackupEnvelope, serializeBackup } from '../../core/backup'
import { makeProfile, renderSettings } from './settingsTestHarness'

/** jsdom has no blob URLs and no downloads, so both are stubbed and inspected. */
function captureDownload() {
  const blobs: Blob[] = []
  const names: string[] = []

  const create = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return 'blob:workout-conductor/1'
  })
  const revoke = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download)
  })

  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true })

  return { blobs, names, create, revoke, click }
}

/** jsdom's Blob has no `.text()`, so the test reads it the way the screen does. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function fileWith(text: string, name = 'backup.json') {
  return new File([text], name, { type: 'application/json' })
}

async function choose(file: File) {
  const user = userEvent.setup()
  await user.upload(await screen.findByTestId('import-file-input'), file)
  return user
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SettingsScreen — export', () => {
  it('hands the browser a JSON backup of the saved profile', async () => {
    const download = captureDownload()
    renderSettings()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Export backup' }))

    expect(download.create).toHaveBeenCalledTimes(1)
    expect(download.revoke).toHaveBeenCalledTimes(1)
    expect(download.names[0]).toMatch(/^workout-conductor-backup-\d{4}-\d{2}-\d{2}\.json$/)

    const written = JSON.parse(await readBlob(download.blobs[0]))
    expect(written.app).toBe('workout-conductor')
    expect(written.schemaVersion).toBe(1)
    expect(written.data.profile.goals.primary).toBe('build-muscle')
    expect(screen.getByText(/Export started/)).toBeInTheDocument()
  })

  it('says so plainly when the browser will not produce the file', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true, writable: true })
    renderSettings()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Export backup' }))

    expect(await screen.findByText(/could not be created/)).toBeInTheDocument()
  })
})

describe('SettingsScreen — import preview', () => {
  it('previews a valid backup and only writes after an explicit confirmation', async () => {
    const harness = renderSettings()
    const incoming = makeProfile({ experience: 'advanced', units: 'metric' })
    const text = serializeBackup(createBackupEnvelope(incoming, '2026-08-20T08:00:00.000Z'))

    const user = await choose(fileWith(text))

    const sheet = within(await screen.findByRole('dialog', { name: 'Import this backup?' }))
    expect(sheet.getByText(/Importing replaces your current profile/)).toBeInTheDocument()
    expect(sheet.getByTestId('backup-preview')).toHaveTextContent('1 profile')
    expect(sheet.getByText('workout-conductor')).toBeInTheDocument()
    expect(sheet.getByText('2026-08-20T08:00:00.000Z')).toBeInTheDocument()
    // Nothing has been written yet — the preview is a preview.
    expect(harness.stored()?.experience).toBe('intermediate')

    await user.click(sheet.getByRole('button', { name: 'Replace my profile' }))

    await waitFor(() => expect(harness.stored()?.experience).toBe('advanced'))
    expect(harness.stored()?.units).toBe('metric')
    expect(await screen.findByRole('button', { name: /Experience Advanced/ })).toBeInTheDocument()
  })

  it('rejects a backup written by another app and explains why', async () => {
    const harness = renderSettings()
    const text = JSON.stringify({ app: 'some-other-tracker', schemaVersion: 1, data: { profile: {} } })

    await choose(fileWith(text))

    const sheet = within(await screen.findByRole('dialog', { name: 'This file cannot be imported' }))
    expect(sheet.getByText(/was written by "some-other-tracker", not Workout Conductor/)).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Replace my profile' })).not.toBeInTheDocument()
    expect(harness.stored()?.experience).toBe('intermediate')
  })

  it('rejects a backup from a newer version of the app and says to update first', async () => {
    const harness = renderSettings()
    const text = JSON.stringify({
      app: 'workout-conductor',
      schemaVersion: 9,
      exportedAt: '2027-01-01T00:00:00.000Z',
      data: { profile: makeProfile() },
    })

    await choose(fileWith(text))

    const sheet = within(await screen.findByRole('dialog', { name: 'This file cannot be imported' }))
    expect(sheet.getByText(/version 9 and this build understands version 1/)).toBeInTheDocument()
    expect(sheet.getByText(/Update the app, then import it/)).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Replace my profile' })).not.toBeInTheDocument()
    expect(harness.stored()?.experience).toBe('intermediate')
  })

  it('rejects a file that is not JSON at all', async () => {
    renderSettings()
    await choose(fileWith('this is not a backup', 'notes.txt'))

    const sheet = within(await screen.findByRole('dialog', { name: 'This file cannot be imported' }))
    expect(sheet.getByText(/not valid JSON/)).toBeInTheDocument()
    expect(sheet.getByText('notes.txt')).toBeInTheDocument()
  })
})
