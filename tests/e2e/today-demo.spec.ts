import { expect, test, type Locator, type Page } from '@playwright/test'
import { SEED_DURATION_MIN, SEED_LOCATION_NAME, startWithProfile } from './appState'
import { ROUTES } from './routes'

/**
 * Today, and the two things Phase 1 promised about it: the demo session must be
 * unmistakably a demo, and the locked product decision must hold in the shipped
 * bundle, not only in a unit test's render tree.
 *
 * `src/app/App.test.tsx` counts the same controls in jsdom. This file is the
 * version that can fail for a reason jsdom cannot see — a control that only
 * exists after the real CSS, the real router, and the real profile are in play.
 */

const COMPETING_MODE = /^(full|lazy|short|density|recovery)\b/i
const START_WORKOUT = /start workout/i

test.beforeEach(async ({ page }) => {
  await startWithProfile(page)
})

/** The card the demo fixture renders into, found by its own heading. */
function demoCard(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Upper body — strength and size' }) })
}

/**
 * Every interactive control on the page, with the accessible name a person
 * would hear. Buttons and links are not enough here: the app builds radios,
 * switches and checkboxes out of `<button>` elements, and a rival mode switch
 * would be just as real wearing one of those roles.
 */
async function controlNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const name = (element: Element): string => {
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim()
        if (text) return text
      }
      const label = element.getAttribute('aria-label')?.trim()
      if (label) return label
      return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    }

    const selector = 'button, a[href], [role="button"], [role="radio"], [role="switch"], [role="checkbox"]'
    return Array.from(document.querySelectorAll(selector))
      .filter((element) => element.closest('[aria-hidden="true"]') === null)
      .map(name)
  })
}

test('Today shows the demo session and says four times over that it is a demo', async ({ page }) => {
  await page.goto('./')

  const card = demoCard(page)
  await expect(card).toBeVisible()

  await expect(card).toContainText('Sample session')
  await expect(card).toContainText('Demo')
  await expect(card).toContainText(
    'This is a sample session, not your plan. Real workouts are built for you in Phase 3.',
  )
  await expect(card).toContainText('Nothing here is saved to this device, and none of it counts as training.')

  // The fixture's own content, so a silently emptied card fails here.
  await expect(
    card.getByRole('list', { name: 'Sample session exercises' }).getByRole('listitem'),
  ).toHaveCount(6)
  await expect(card).toContainText('Barbell Bench Press')
})

test('the demo card is completely inert', async ({ page }) => {
  await page.goto('./')

  const card = demoCard(page)
  await expect(card.locator('button, a[href], input, select, textarea')).toHaveCount(0)
})

test('the demo is never confused with the profile', async ({ page }) => {
  await page.goto('./')

  // The card above it is the real one, and it reads from the saved profile.
  const facts = page.getByTestId('today-facts')
  await expect(facts).toContainText(SEED_LOCATION_NAME)
  await expect(facts).toContainText(`${SEED_DURATION_MIN} min`)

  // And the demo appears on Today alone.
  for (const route of ROUTES.filter((entry) => entry.hash !== '#/')) {
    await page.goto(`./${route.hash}`)
    await expect(page.getByRole('heading', { level: 1, name: route.heading, exact: true })).toBeVisible()
    await expect(demoCard(page)).toHaveCount(0)
  }
})

test('the workout-length control is present exactly once and does nothing yet', async ({ page }) => {
  await page.goto('./')

  const length = page.getByRole('button', { name: /workout length/i })
  await expect(length).toHaveCount(1)
  await expect(length).toBeVisible()
  await expect(length).toBeDisabled()
  await expect(length).toHaveAttribute('aria-disabled', 'true')
  await expect(length).toContainText(`Default · ${SEED_DURATION_MIN} min`)

  await expect(page.getByText('One duration control — 15 / 30 / 45 / Default.')).toBeVisible()
})

test('the whole app holds one start control and no rival workout-mode control', async ({ page }) => {
  let starts = 0

  for (const route of ROUTES) {
    await page.goto(`./${route.hash}`)
    await expect(page.getByRole('heading', { level: 1, name: route.heading, exact: true })).toBeVisible()

    const names = await controlNames(page)

    const modes = names.filter((name) => COMPETING_MODE.test(name))
    expect(modes, `${route.tab} must not hold a workout-mode control`).toEqual([])

    const onThisRoute = names.filter((name) => START_WORKOUT.test(name))
    expect(onThisRoute.length, `${route.tab} must not hold a competing start button`).toBeLessThanOrEqual(1)

    starts += onThisRoute.length
    if (route.hash !== '#/') {
      expect(onThisRoute, `${route.tab} must not start a workout`).toEqual([])
    }

    const lengthControls = names.filter((name) => /workout length/i.test(name))
    expect(lengthControls.length, `${route.tab} must not add a second length control`).toBeLessThanOrEqual(1)
  }

  expect(starts, 'the app owns exactly one Start Workout control, on Today').toBe(1)

  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Start Workout', exact: true })).toBeDisabled()
})
