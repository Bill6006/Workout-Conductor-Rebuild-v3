import { expect, test, type Page } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * The deploy gate. Every assertion here has to hold before a build is allowed
 * onto GitHub Pages, so it stays small, fast, and free of timing guesses.
 */

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

test('a full tour of the app logs no console errors and no page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('./')
  for (const route of ROUTES) {
    await tabLink(page, route.tab).click()
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([])
  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([])
})

test('the production service worker is served and registers', async ({ page, request }) => {
  /*
   * Two checks, because they fail for different reasons.
   *
   * 1. `sw.js` reachable over HTTP proves the build actually emitted a worker
   *    at the deployed scope. That is a build/config regression detector and it
   *    cannot flake.
   * 2. `navigator.serviceWorker.ready` proves the app registers it at runtime —
   *    `injectRegister` is null, so registration only happens if UpdatePrompt
   *    mounts and calls useRegisterSW. That is the check that would catch the
   *    app shipping without offline support at all.
   */
  const worker = await request.get('./sw.js')
  expect(worker.status()).toBe(200)
  expect(await worker.text()).toContain('precache')

  await page.goto('./')
  await expect(page.getByTestId('build-marker')).toBeVisible()

  const scope = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported'

    // A generous ceiling that still fails with a readable message instead of
    // hanging until the test timeout.
    const timeout = new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 20_000))
    const ready = navigator.serviceWorker.ready.then((registration) => registration.scope)

    return Promise.race([ready, timeout])
  })

  expect(scope).toContain('/Workout-Conductor-Rebuild-v3/')
})
