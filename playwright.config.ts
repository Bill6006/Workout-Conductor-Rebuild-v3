import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * The deployed site lives at a repository sub-path and the built asset URLs
 * carry it, so the preview must be served from the same sub-path.
 *
 * `vite preview` resolves vite.config.ts with command "serve", where `base`
 * falls back to "/". Without the explicit `--base` below the server would hand
 * back index.html for every hashed asset request and the app would never boot.
 */
const BASE_PATH = '/Workout-Conductor-Rebuild-v3/'
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`

const IS_CI = !!process.env.CI

/** Serves whatever is already in dist/ — it never rebuilds. */
const PREVIEW = `npm run preview -- --port ${PORT} --strictPort --base ${BASE_PATH}`

/**
 * CI builds dist/ in its own workflow step, with the VITE_BUILD_* marker
 * environment set, and later steps verify and upload that exact directory.
 * Rebuilding here would silently replace it with an unmarked build, so the
 * artifact that gets verified and deployed would not be the one the gate
 * produced. Under CI we therefore only preview; locally we build first so
 * `npx playwright test` works from a clean tree.
 */
const WEB_SERVER_COMMAND = IS_CI ? PREVIEW : `npm run build && ${PREVIEW}`

/** Chrome on a modern Android handset — what the mobile-first layout targets. */
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'

/** CI installs chromium only, so every project is chromium-backed. */
const CHROMIUM = devices['Desktop Chrome']

/**
 * Files that answer a question no viewport can change, so the two secondary
 * projects skip them:
 *
 *  - mobile-layout.spec.ts sweeps the widths itself, and running it under all
 *    three projects would repeat identical work three times.
 *  - service-worker.spec.ts is the only file allowed to register a worker, and
 *    every registration means an install plus a fourteen-entry precache burst
 *    against a single-threaded static server. Three copies of that burst
 *    stalled unrelated navigations in other workers; one is plenty to prove
 *    offline support still ships.
 */
const SINGLE_PROJECT_SPECS = /(mobile-layout|service-worker)\.spec\.ts/

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  /*
   * Deliberately conservative. The scarce resource is not CPU but concurrent
   * Chromium launches: on a busy workstation Playwright's default (half the
   * cores — 7 here) starves the browsers and navigations fail with
   * net::ERR_ABORTED before the app is ever asked a question. A deploy gate
   * that flakes is worse than one that takes another minute.
   */
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    colorScheme: 'dark',
    /*
     * Every test gets a fresh context, and a fresh context installs the service
     * worker from scratch: register, install, precache fourteen entries, then
     * answer the next navigation out of a cache that may not be populated yet.
     * `navigateFallback` puts that half-warm worker in front of `page.reload()`,
     * which is how the suite proves persistence — and a navigation that races an
     * activating worker comes back as net::ERR_ABORTED.
     *
     * Blocking it here means these tests measure the app rather than cache
     * timing. Offline support is a real promise, so it is still asserted — by
     * service-worker.spec.ts, which re-enables workers for itself and is the
     * only file that does.
     */
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'android-360',
      use: {
        ...CHROMIUM,
        userAgent: ANDROID_USER_AGENT,
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'android-412',
      testIgnore: SINGLE_PROJECT_SPECS,
      use: {
        ...CHROMIUM,
        userAgent: ANDROID_USER_AGENT,
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop-chromium',
      testIgnore: SINGLE_PROJECT_SPECS,
      use: {
        ...CHROMIUM,
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
  ],

  webServer: {
    command: WEB_SERVER_COMMAND,
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
