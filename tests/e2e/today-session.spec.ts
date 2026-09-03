import { expect, test, type Page } from '@playwright/test'
import { startWithProfile } from './appState'

/**
 * Today, once the engine builds a real session.
 *
 * This replaces the Phase 1/2 demo-fixture spec. `demoWorkout.ts` documented its
 * own deletion for Phase 3, and the assertions that guarded it are now the
 * assertions that guard against it coming back.
 */

const LENGTH = /workout length/i

async function openToday(page: Page) {
  // `startWithProfile` seeds the device; it does not navigate.
  await startWithProfile(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  // The catalog and the engine are lazy chunks, so the session arrives a moment
  // after the shell does.
  await expect(page.getByLabel(LENGTH)).toBeEnabled({ timeout: 20_000 })
}

test('builds a real session, with no labelled demo left anywhere', async ({ page }) => {
  await openToday(page)

  await expect(page.getByText('Demo')).toHaveCount(0)
  await expect(page.getByText(/sample session, not your plan/i)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 2, name: 'Why this session' })).toBeVisible()
})

test('the workout-length control is present exactly once and now works', async ({ page }) => {
  await openToday(page)

  // THE locked decision: one control, four lengths, no rival mode buttons.
  await expect(page.getByRole('combobox', { name: LENGTH })).toHaveCount(1)
  const options = await page.getByRole('combobox', { name: LENGTH }).locator('option').allTextContents()
  expect(options).toHaveLength(4)
  expect(options.slice(0, 3)).toEqual(['15 min', '30 min', '45 min'])
  expect(options[3]).toMatch(/^Default/)

  for (const name of [/^full\b/i, /^lazy\b/i, /^short\b/i, /^density\b/i, /^recovery\b/i]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
})

test('choosing a shorter length rebuilds the session rather than cutting the end off', async ({ page }) => {
  await openToday(page)

  const rows = () => page.getByRole('list').first().getByRole('listitem')
  const titlesAt = async () => (await rows().allTextContents()).map((text) => text.trim())

  const full = await titlesAt()
  await page.getByLabel(LENGTH).selectOption('15')
  await expect(page.getByText(/About \d+ min/)).toBeVisible()
  const short = await titlesAt()

  expect(short.length).toBeGreaterThan(0)
  // A rebuilt session is allowed to share exercises with the longer one, but it
  // must not simply be its opening rows — that would be truncation.
  const isPrefix = short.every((row, index) => full[index] === row)
  expect(isPrefix, 'the 15-minute session is the long one with the end cut off').toBe(false)
})

test('the length choice is remembered for this session only, not persisted', async ({ page }) => {
  await openToday(page)

  await page.getByLabel(LENGTH).selectOption('30')
  await expect(page.getByLabel(LENGTH)).toHaveValue('30')

  // The plan is explicit: the choice lasts for the current workout unless the
  // default is changed in Settings. A reload is a new workout.
  await page.reload()
  await expect(page.getByLabel(LENGTH)).toBeEnabled({ timeout: 20_000 })
  await expect(page.getByLabel(LENGTH)).toHaveValue('default')
})

test('says how long the session is expected to take', async ({ page }) => {
  await openToday(page)
  await expect(page.getByText(/About \d+ min/)).toBeVisible()
})

test('the one start control is present and now starts a session', async ({ page }) => {
  await openToday(page)

  // Phase 5 turned this on. It is still the ONLY start control in the app —
  // src/app/App.test.tsx fails the build if a second one appears.
  const start = page.getByRole('button', { name: 'Start Workout' })
  await expect(start).toHaveCount(1)
  await expect(start).toBeEnabled()

  await start.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()
  await expect(page.getByTestId('log-set')).toBeVisible({ timeout: 20_000 })
})

test('explains the session in terms of the profile it was built from', async ({ page }) => {
  await openToday(page)

  const why = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Why this session' }) })
  await expect(why).toBeVisible()
  await expect(why.getByRole('listitem').first()).toBeVisible()
  // With no logged sessions the app should say so rather than imply it knows more.
  await expect(why.getByText(/first guess until you have logged/i)).toBeVisible()
})

test('fits the narrowest viewport', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 800 })
  await openToday(page)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
