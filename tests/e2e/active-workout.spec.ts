import { expect, test, type Page } from '@playwright/test'
import { startWithProfile } from './appState'

/**
 * Running a session: the thing you actually do in a gym.
 *
 * The assertions that matter most here are about work not being lost — a logged
 * set surviving a reload is the whole reason the session persists after every
 * write rather than at the end.
 */

async function startSession(page: Page) {
  await startWithProfile(page)
  await page.goto('./')
  await expect(page.getByLabel(/workout length/i)).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: /^Start Workout$/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()
  await expect(page.getByTestId('log-set')).toBeVisible({ timeout: 20_000 })
}

const completedSets = (page: Page) =>
  page.getByRole('list', { name: 'Completed sets' }).first().getByRole('listitem')

test('starting a session moves you to the workout, on the first set', async ({ page }) => {
  await startSession(page)
  await expect(page.getByTestId('log-set')).toHaveText(/Log set 1/)
})

test('logging a set is one tap, and the set appears as done', async ({ page }) => {
  await startSession(page)

  // THE measurement the plan asks for: the common case must be one tap. The
  // target and the previous set already fill the values in.
  await page.getByTestId('log-set').click()

  await expect(completedSets(page)).toHaveCount(1)
  await expect(page.getByTestId('log-set')).toHaveText(/Log set 2/)
})

test('a logged set survives a reload', async ({ page }) => {
  await startSession(page)
  await page.getByTestId('log-set').click()
  await page.getByTestId('log-set').click()
  await expect(completedSets(page)).toHaveCount(2)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()

  // Closing the app mid-session and coming back is simply loading what is there.
  await expect(completedSets(page)).toHaveCount(2, { timeout: 20_000 })
})

test('undo takes the last set back', async ({ page }) => {
  await startSession(page)
  await page.getByTestId('log-set').click()
  await expect(completedSets(page)).toHaveCount(1)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(completedSets(page)).toHaveCount(0)
  await expect(page.getByTestId('log-set')).toHaveText(/Log set 1/)
})

test('a completed set is tappable for correction, with no separate edit page', async ({ page }) => {
  await startSession(page)
  await page.getByTestId('log-set').click()

  const done = completedSets(page).first().getByRole('button')
  await expect(done).toBeVisible()
  await expect(done).toHaveAttribute('aria-label', /Tap to correct/i)
  // The affordance is the completed chip itself; tapping must not navigate away.
  await done.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()
})

test('the session list shows one row per block, naming both moves of a superset', async ({ page }) => {
  await startSession(page)

  const list = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'This session' }) })
    .getByRole('listitem')

  await expect(list.first()).toBeVisible()
  const rows = await list.allTextContents()
  // A superset is ONE row naming both moves — never one member shown as if
  // another required exercise were still outstanding.
  for (const row of rows) {
    if (row.includes('superset')) expect(row).toContain('+')
  }
})

test('the workout tab explains itself when nothing is running', async ({ page }) => {
  await startWithProfile(page)
  await page.goto('./#/workout')

  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to Today' })).toBeVisible()
})

test('fits the narrowest viewport while logging', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 800 })
  await startSession(page)
  await page.getByTestId('log-set').click()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
