import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { readStoredProfile, startWithProfile, type SeedProfile } from './appState'

/**
 * Export and import, driven the way a person drives them: a real download, a
 * real file chooser, and a preview that has to describe the file before anything
 * on the device is replaced.
 */

const IMPORT_INPUT = '[data-testid="import-file-input"]'

test.beforeEach(async ({ page }) => {
  await startWithProfile(page)
})

/** Clicks Export and returns the downloaded file's contents. */
async function exportBackup(page: Page): Promise<{ filename: string; text: string }> {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup', exact: true }).click()
  const download = await downloading

  const path = await download.path()
  if (!path) throw new Error(`the export produced no file on disk: ${await download.failure()}`)

  return { filename: download.suggestedFilename(), text: readFileSync(path, 'utf8') }
}

/** Sets the profile's session length through the settings UI, so the store really changes. */
async function setDuration(page: Page, minutes: number): Promise<void> {
  await page.getByRole('button', { name: 'Typical session length' }).click()
  const sheet = page.getByRole('dialog', { name: 'Typical session length' })
  await sheet.getByRole('spinbutton', { name: 'Typical session length' }).fill(String(minutes))
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Typical session length saved.')).toBeVisible()
}

test('export writes a JSON envelope that matches the stored profile', async ({ page }) => {
  await page.goto('./#/settings')

  const { filename, text } = await exportBackup(page)

  expect(filename).toMatch(/^workout-conductor-backup-\d{4}-\d{2}-\d{2}\.json$/)

  const envelope = JSON.parse(text) as {
    app: string
    schemaVersion: number
    exportedAt: string
    data: { profile: SeedProfile | null }
  }

  expect(envelope.app).toBe('workout-conductor')
  expect(envelope.schemaVersion).toBe(1)
  expect(Number.isNaN(Date.parse(envelope.exportedAt))).toBe(false)
  // Not "looks like a profile" — the same profile, field for field.
  expect(envelope.data.profile).toEqual(await readStoredProfile(page))

  await expect(page.getByText(`Export started: ${filename}`)).toBeVisible()
})

test('importing a backup previews it before anything is replaced', async ({ page }) => {
  await page.goto('./#/settings')

  const { filename, text } = await exportBackup(page)
  const file = test.info().outputPath(filename)
  writeFileSync(file, text)

  // Move the live profile away from the backup, so applying it is observable.
  await setDuration(page, 90)
  expect((await readStoredProfile(page))?.schedule.typicalDurationMin).toBe(90)

  await page.locator(IMPORT_INPUT).setInputFiles(file)

  const sheet = page.getByRole('dialog', { name: 'Import this backup?' })
  await expect(sheet).toBeVisible()

  const preview = page.getByTestId('backup-preview')
  await expect(preview).toContainText(filename)
  await expect(preview).toContainText('workout-conductor')
  await expect(preview).toContainText('1 profile')

  // Still only a preview: the device is untouched while the sheet is open.
  expect((await readStoredProfile(page))?.schedule.typicalDurationMin).toBe(90)

  await sheet.getByRole('button', { name: 'Replace my profile', exact: true }).click()

  await expect(page.getByText('Backup imported.')).toBeVisible()
  expect((await readStoredProfile(page))?.schedule.typicalDurationMin).toBe(60)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Typical session length' })).toContainText('60 min')
})

test('a backup from another app is refused with a readable reason', async ({ page }) => {
  await page.goto('./#/settings')
  const before = await readStoredProfile(page)

  const file = test.info().outputPath('other-app.json')
  writeFileSync(
    file,
    JSON.stringify({
      app: 'some-other-tracker',
      schemaVersion: 1,
      exportedAt: '2026-03-04T09:00:00.000Z',
      data: { profile: null },
    }),
  )

  await page.locator(IMPORT_INPUT).setInputFiles(file)

  const sheet = page.getByRole('dialog', { name: 'This file cannot be imported' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('was written by "some-other-tracker", not Workout Conductor')
  await expect(sheet).toContainText('Nothing on this device has been changed.')
  // No way to apply it, not merely a disabled one.
  await expect(sheet.getByRole('button', { name: 'Replace my profile' })).toHaveCount(0)

  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(sheet).toHaveCount(0)
  expect(await readStoredProfile(page)).toEqual(before)
})

test('a backup from a future version is refused and names the versions', async ({ page }) => {
  await page.goto('./#/settings')
  const before = await readStoredProfile(page)

  const file = test.info().outputPath('future.json')
  writeFileSync(
    file,
    JSON.stringify({
      app: 'workout-conductor',
      schemaVersion: 99,
      exportedAt: '2026-03-04T09:00:00.000Z',
      data: { profile: before },
    }),
  )

  await page.locator(IMPORT_INPUT).setInputFiles(file)

  const sheet = page.getByRole('dialog', { name: 'This file cannot be imported' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('version 99')
  await expect(sheet).toContainText('understands version 1')
  await expect(sheet.getByRole('button', { name: 'Replace my profile' })).toHaveCount(0)

  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click()
  await page.reload()
  expect(await readStoredProfile(page)).toEqual(before)
})

test('a file that is not JSON at all is refused without a stack trace', async ({ page }) => {
  await page.goto('./#/settings')
  const before = await readStoredProfile(page)

  const file = test.info().outputPath('not-json.json')
  writeFileSync(file, 'this is not a backup, it is a shopping list\n')

  await page.locator(IMPORT_INPUT).setInputFiles(file)

  const sheet = page.getByRole('dialog', { name: 'This file cannot be imported' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('not valid JSON')
  await expect(sheet).not.toContainText('SyntaxError')

  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click()
  expect(await readStoredProfile(page)).toEqual(before)
})
