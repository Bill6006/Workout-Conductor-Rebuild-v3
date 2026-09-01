import { expect, test, type Page } from '@playwright/test'
import { startWithProfile } from './appState'
import { ROUTES } from './routes'

/**
 * The deploy gate. Every assertion here has to hold before a build is allowed
 * onto GitHub Pages, so it stays small, fast, and free of timing guesses.
 *
 * Phase 1 put an onboarding gate in front of every route, so these tests now
 * declare the state they run in: a device that has already finished setup. A
 * first visit is a different journey and lives in onboarding.spec.ts.
 */

test.beforeEach(async ({ page }) => {
  await startWithProfile(page)
})

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

function tabLink(page: Page, name: string) {
  return primaryNav(page).getByRole('link', { name, exact: true })
}

test('loads at the deployed base path and lands on Today', async ({ page }) => {
  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  // A bare entry URL keeps no hash at all until the first navigation — the
  // router reads an empty hash as "/". Both spellings are the Today route.
  await expect(page).toHaveURL(/\/Workout-Conductor-Rebuild-v3\/(#\/)?$/)
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Today', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
})

test('serves the app under its own title', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Workout Conductor')
})

test('exposes all five tabs in the bottom navigation', async ({ page }) => {
  await page.goto('./')

  const links = primaryNav(page).getByRole('link')
  await expect(links).toHaveCount(ROUTES.length)
  await expect(links).toHaveText(ROUTES.map((route) => route.tab))
})

test('tapping each tab navigates and marks itself current', async ({ page }) => {
  await page.goto('./')

  for (const route of ROUTES) {
    await tabLink(page, route.tab).click()

    // '#' and '/' are literals in a regular expression, so the hash needs no escaping.
    await expect(page).toHaveURL(new RegExp(`${route.hash}$`))
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    await expect(tabLink(page, route.tab)).toHaveAttribute('aria-current', 'page')
    await expect(primaryNav(page).locator('[aria-current="page"]')).toHaveCount(1)
  }
})

test('shows a non-empty build marker', async ({ page }) => {
  await page.goto('./')
  const marker = page.getByTestId('build-marker')

  await expect(marker).toHaveCount(1)
  await expect(marker).toBeVisible()
  await expect(marker).not.toBeEmpty()
  expect((await marker.innerText()).trim().length).toBeGreaterThan(0)
})

test('the browser back button returns to the previous tab', async ({ page }) => {
  await page.goto('./')

  await tabLink(page, 'Progress').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible()

  await tabLink(page, 'Plan').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/#\/progress$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible()
})

test('a hard reload on a deep link stays on that tab', async ({ page }) => {
  await page.goto('./#/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(tabLink(page, 'Settings')).toHaveAttribute('aria-current', 'page')
})

test('an unknown route redirects to Today rather than showing a blank shell', async ({ page }) => {
  await page.goto('./#/not-a-real-route')

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
})

/**
 * The console-error tour used to live here. It moved to service-worker.spec.ts:
 * blocking service workers makes workbox log a registration failure, so the one
 * place that can honestly assert "no console errors" is the one place that lets
 * the worker register. There is exactly one such tour, and that is it.
 */
