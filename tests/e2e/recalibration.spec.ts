import { expect, test, type Page } from '@playwright/test'
import { startWithProfile } from './appState'

/**
 * Recalibration, as a person actually meets it: change the length, see the
 * session change, and be told what changed.
 */

const LENGTH = /workout length/i

async function openToday(page: Page) {
  await startWithProfile(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  await expect(page.getByLabel(LENGTH)).toBeEnabled({ timeout: 20_000 })
}

const rowsOf = (page: Page) =>
  page
    .getByRole('list')
    .first()
    .getByRole('listitem')
    .allTextContents()
    .then((rows) => rows.map((row) => row.replace(/\s+/g, ' ').trim()))

test('changing the length rebuilds the session and says what changed', async ({ page }) => {
  await openToday(page)
  const before = await rowsOf(page)

  await page.getByLabel(LENGTH).selectOption('30')

  const summary = page.getByTestId('change-summary')
  await expect(summary).toBeVisible()
  await expect(summary).toContainText(/Rebuilt for 30 min/)

  const after = await rowsOf(page)
  expect(after).not.toEqual(before)
})

test('the summary counts what moved rather than just saying something did', async ({ page }) => {
  await openToday(page)
  await page.getByLabel(LENGTH).selectOption('15')

  // The plan's example shape: "Recalibrated to 30 min: 2 exercises removed, 1
  // superset added." A summary that only said "updated" would be useless.
  await expect(page.getByTestId('change-summary')).toContainText(
    /(exercise|exercises|superset|sets|targets)/i,
  )
})

test('no summary is shown before anything has been changed', async ({ page }) => {
  await openToday(page)
  await expect(page.getByTestId('change-summary')).toHaveCount(0)
})

test('the estimate follows the chosen length', async ({ page }) => {
  await openToday(page)

  await page.getByLabel(LENGTH).selectOption('15')
  const short = await page.getByText(/About \d+ min/).textContent()
  await page.getByLabel(LENGTH).selectOption('45')
  const long = await page.getByText(/About \d+ min/).textContent()

  const minutes = (text: string | null) => Number(/About (\d+) min/.exec(text ?? '')?.[1] ?? '0')
  expect(minutes(short)).toBeLessThan(minutes(long))
})

test('a rebuild leaves the page where it was', async ({ page }) => {
  await openToday(page)
  await page.evaluate(() => window.scrollTo(0, 200))
  const before = await page.evaluate(() => window.scrollY)

  await page.getByLabel(LENGTH).selectOption('30')
  await expect(page.getByTestId('change-summary')).toBeVisible()

  // The plan asks for the screen position to be preserved: a recalculation that
  // scrolls the page loses the row somebody was reading.
  const after = await page.evaluate(() => window.scrollY)
  expect(Math.abs(after - before)).toBeLessThan(80)
})

test('going back to Default restores a full-length session', async ({ page }) => {
  await openToday(page)
  const full = await rowsOf(page)

  await page.getByLabel(LENGTH).selectOption('15')
  const short = await rowsOf(page)
  expect(short.length).toBeLessThan(full.length)

  await page.getByLabel(LENGTH).selectOption('default')
  const back = await rowsOf(page)
  expect(back.length).toBeGreaterThan(short.length)
})
