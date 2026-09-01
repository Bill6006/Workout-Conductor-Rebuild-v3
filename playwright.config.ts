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
 * Layout geometry is driven by viewport width, and mobile-layout.spec.ts sweeps
 * the widths itself. Running it under all three projects would repeat identical
 * work three times, so the two secondary projects skip that file.
 */
const LAYOUT_SPEC = /mobile-layout\.spec\.ts/

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
      testIgnore: LAYOUT_SPEC,
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
      testIgnore: LAYOUT_SPEC,
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
