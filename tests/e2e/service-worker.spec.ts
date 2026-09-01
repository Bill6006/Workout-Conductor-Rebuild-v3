import { expect, test } from '@playwright/test'
import { startWithProfile } from './appState'
import { ROUTES } from './routes'

/**
 * The offline layer, and the only place in the suite where a service worker is
 * allowed to register.
 *
 * WHY IT IS QUARANTINED. Registering the worker means installing it and
 * precaching fourteen entries — a burst of parallel requests against a
 * single-threaded static server, repeated for every fresh browser context. With
 * it switched on everywhere, an unrelated worker's `page.goto` would
 * occasionally never see a `load` event, or come back net::ERR_ABORTED. That is
 * a test-harness artefact, not a product fault, and the honest cure is to stop
 * manufacturing the burst rather than to retry through it. The rest of the suite
 * therefore runs with `serviceWorkers: 'block'` (playwright.config.ts).
 *
 * WHY ONE PROJECT. Neither assertion depends on viewport, user agent, or touch,
 * so — like mobile-layout.spec.ts — this file runs under the primary project
 * only and the other two skip it.
 */

test.use({ serviceWorkers: 'allow' })

test.beforeEach(async ({ page }) => {
  await startWithProfile(page)
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

test('a full tour of the real page logs no console errors and no page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('./')
  for (const route of ROUTES) {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: route.tab, exact: true })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

  // A worker that fails to install says so here, which is why this tour is the
  // one that runs with registration switched on.
  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([])
  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([])
})
