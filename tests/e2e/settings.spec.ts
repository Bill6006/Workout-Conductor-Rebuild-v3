import { expect, test, type Page } from '@playwright/test'
import {
  SEED_DURATION_MIN,
  SEED_LOCATION_NAME,
  SEED_SECOND_LOCATION_NAME,
  prepareError,
  readStoredProfile,
  startWithProfile,
} from './appState'
import { SETUP_ROUTE } from './routes'
import { SETUP_STEP_COUNT, choice, stepHeading } from './setupFlow'

/**
 * The settings surface on a device that has already finished setup.
 *
 * The load-bearing test here is the reload: the save path is write → read-back →
 * verify against IndexedDB, and only a full page reload proves the value came
 * from storage rather than from React state that never left the tab.
 */

test.beforeEach(async ({ page }) => {
  await startWithProfile(page)
})

/** A settings row, named by its label followed by the value it currently shows. */
function row(page: Page, label: string) {
  return page.getByRole('button', { name: label })
}

test('the seeded profile is the one the app reads', async ({ page }) => {
  await page.goto('./#/settings')

  expect(await prepareError(page), 'the test seed itself failed').toBeNull()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible()
  await expect(row(page, 'Active location')).toContainText(SEED_LOCATION_NAME)
  await expect(row(page, 'Typical session length')).toContainText(`${SEED_DURATION_MIN} min`)
})

test('an edited value survives a full page reload', async ({ page }) => {
  await page.goto('./#/settings')

  await row(page, 'Typical session length').click()

  const sheet = page.getByRole('dialog', { name: 'Typical session length' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('spinbutton', { name: 'Typical session length' }).fill('75')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()

  // The sheet closes only once the store has read the value back and verified it.
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText('Typical session length saved.')).toBeVisible()
  await expect(row(page, 'Typical session length')).toContainText('75 min')

  await page.reload()

  await expect(row(page, 'Typical session length')).toContainText('75 min')
  expect((await readStoredProfile(page))?.schedule.typicalDurationMin).toBe(75)

  // And the rest of the app reads the same one profile.
  await page.goto('./#/')
  await expect(page.getByTestId('today-facts')).toContainText('75 min')
})

test('an exercise chosen from the picker survives a reload too', async ({ page }) => {
  await page.goto('./#/settings')

  await row(page, 'Preferred exercises').click()
  const sheet = page.getByRole('dialog', { name: 'Preferred exercises' })
  // The catalog is a lazy chunk. It arrives after the sheet is open, so the
  // search field is filled once the results it drives are actually there.
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('romanian deadlift')
  await sheet.getByRole('button', { name: /^Barbell Romanian deadlift/ }).click()
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Preferred exercises saved.')).toBeVisible()
  await page.reload()

  await expect(row(page, 'Preferred exercises')).toContainText('Barbell Romanian deadlift')
  expect((await readStoredProfile(page))?.exercisePreferences.preferred).toEqual({
    exerciseIds: ['barbell-romanian-deadlift'],
    freeText: [],
  })
})

test('free text the catalog could not match stays visible and replaceable', async ({ page }) => {
  await page.goto('./#/settings')

  await row(page, 'Preferred exercises').click()
  const sheet = page.getByRole('dialog', { name: 'Preferred exercises' })
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('the wobbly one')
  await sheet.getByRole('button', { name: /in your own words/ }).click()
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Preferred exercises saved.')).toBeVisible()
  expect((await readStoredProfile(page))?.exercisePreferences.preferred).toEqual({
    exerciseIds: [],
    freeText: ['the wobbly one'],
  })

  // Reopening shows the words back, verbatim, with a way to swap them for a
  // catalog exercise — never folded away into a count.
  await row(page, 'Preferred exercises').click()
  await expect(sheet.getByText('the wobbly one', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Find a match for the wobbly one' })).toBeVisible()
})

test('re-running setup reopens setup without wiping the profile', async ({ page }) => {
  await page.goto('./#/settings')
  const before = await readStoredProfile(page)

  await page.getByRole('button', { name: 'Re-run setup', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Re-run setup?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Re-run setup', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`${SETUP_ROUTE.hash}$`))

  // A re-run opens on the first QUESTION, not on the welcome step: this person
  // has already read the intro, and offering them "Skip setup" would be
  // offering to discard the answers they came back to change.
  await expect(stepHeading(page, 1)).toBeVisible()
  await expect(page.getByText(`Step 1 of ${SETUP_STEP_COUNT - 1}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip setup', exact: true })).toHaveCount(0)

  // Leaving setup again must land back in the app with everything intact. The
  // bottom nav is gone while the gate is forcing setup, so this is the way out.
  await page.getByRole('button', { name: 'Exit setup', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()

  const after = await readStoredProfile(page)
  expect(after?.locations).toEqual(before?.locations)
  expect(after?.schedule).toEqual(before?.schedule)
  expect(after?.goals).toEqual(before?.goals)
  expect(after?.exercisePreferences).toEqual(before?.exercisePreferences)
  expect(after?.createdAt).toBe(before?.createdAt)

  await page.goto('./#/settings')
  await expect(row(page, 'Active location')).toContainText(SEED_LOCATION_NAME)
})

test('re-opened setup starts from the saved answers', async ({ page }) => {
  await page.goto('./#/settings')

  // Change something first, so a pre-filled answer cannot be the default by luck.
  await row(page, 'Primary goal').click()
  const goalSheet = page.getByRole('dialog', { name: 'Primary goal' })
  await goalSheet.getByRole('radio', { name: 'Get stronger' }).click()
  await goalSheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Primary goal saved.')).toBeVisible()

  await page.getByRole('button', { name: 'Re-run setup', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Re-run setup?' })
    .getByRole('button', { name: 'Re-run setup', exact: true })
    .click()

  // Straight to the first question — the welcome step is not part of a re-run.
  await expect(stepHeading(page, 1)).toBeVisible()
  await expect(choice(page, 'Main goal', 'Get stronger')).toHaveAttribute('aria-checked', 'true')
})

test('the last remaining location cannot be deleted', async ({ page }) => {
  await page.goto('./#/settings')

  // Delete one of the two, which is allowed.
  await row(page, `Home location`).click()
  const edit = page.getByRole('dialog', { name: `Edit ${SEED_SECOND_LOCATION_NAME}` })
  await expect(edit).toBeVisible()
  await edit.getByRole('button', { name: 'Delete location', exact: true }).click()

  const confirm = page.getByRole('dialog', { name: `Delete ${SEED_SECOND_LOCATION_NAME}?` })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Delete location', exact: true }).click()
  await expect(page.getByText('Location deleted.')).toBeVisible()
  await expect(row(page, 'Home location')).toHaveCount(0)

  // The one that is left may not go: a profile with no location is unreadable.
  await row(page, 'Gym location').click()
  const last = page.getByRole('dialog', { name: `Edit ${SEED_LOCATION_NAME}` })
  await expect(last.getByRole('button', { name: 'Delete location', exact: true })).toBeDisabled()
  await expect(last).toContainText('This is your only location, so it cannot be deleted.')

  await last.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()

  const stored = await readStoredProfile(page)
  expect(stored?.locations).toHaveLength(1)
  expect(stored?.activeLocationId).toBe(stored?.locations[0].id)
})

test('a failed edit is never reported as saved', async ({ page }) => {
  await page.goto('./#/settings')

  await row(page, 'Training days').click()
  const sheet = page.getByRole('dialog', { name: 'Training days' })

  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await sheet.getByRole('checkbox', { name: day, exact: true }).click()
  }

  // A profile needs at least one training day, so the sheet blocks the write
  // rather than letting storage reject it afterwards.
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await expect(sheet).toContainText('Choose at least one training day.')

  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await expect(row(page, 'Training days')).toContainText('Mon')
})
