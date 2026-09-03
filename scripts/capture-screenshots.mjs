#!/usr/bin/env node
/**
 * Captures real device-sized screenshots of a running preview build.
 *
 * The preview must be served from the deployed sub-path, because the built
 * asset URLs carry it. `vite preview` resolves the config with command
 * "serve", where `base` falls back to "/", so pass it explicitly:
 *
 *   npm run build
 *   npx vite preview --port 4173 --base /Workout-Conductor-Rebuild-v3/
 *   node scripts/capture-screenshots.mjs
 *
 * Options:
 *   --base-url <url>  preview origin including the sub-path
 *   --out <dir>       output directory
 *   --full-page       capture the whole scroll height instead of one screen
 *   --viewport        capture one device screen (the default)
 *                     (full-page shots paint the fixed bottom navigation at
 *                     its viewport position, part way down a tall screen)
 *
 * Writes `<profile>-<tab>.png` for every profile/tab pair plus a combined
 * contact sheet, `preview-sheet.png`, built from the 360px Android shots.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const DEFAULT_BASE_URL = 'http://localhost:4173/Workout-Conductor-Rebuild-v3/'
const DEFAULT_OUT = 'docs/screenshots/phase-1'

const BUILD_MARKER = '[data-testid="build-marker"]'
const SETTLE_MS = 400

const PROFILES = [
  { name: 'android-360', width: 360, height: 800, deviceScaleFactor: 3, isMobile: true },
  { name: 'android-412', width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true },
  { name: 'desktop', width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false },
]

const TABS = [
  { name: 'today', hash: '#/', label: 'Today' },
  { name: 'workout', hash: '#/workout', label: 'Workout' },
  { name: 'progress', hash: '#/progress', label: 'Progress' },
  { name: 'plan', hash: '#/plan', label: 'Plan' },
  { name: 'settings', hash: '#/settings', label: 'Settings' },
]

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, out: DEFAULT_OUT, fullPage: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const separator = current.indexOf('=')
    const flag = separator === -1 ? current : current.slice(0, separator)
    const inline = separator === -1 ? undefined : current.slice(separator + 1)
    const takeValue = () => inline ?? argv[++index]

    if (flag === '--base-url') args.baseUrl = takeValue() ?? args.baseUrl
    else if (flag === '--out') args.out = takeValue() ?? args.out
    else if (flag === '--viewport') args.fullPage = false
    else if (flag === '--full-page') args.fullPage = true
    else if (flag === '--help' || flag === '-h') args.help = true
  }

  if (!args.baseUrl.endsWith('/')) args.baseUrl += '/'
  return args
}

function outPath(outDir, file) {
  const base = isAbsolute(outDir) ? outDir : join(ROOT, outDir)
  return join(base, file)
}

function display(absolute) {
  return relative(ROOT, absolute).replace(/\\/g, '/')
}

async function openTab(page, baseUrl, hash, problems) {
  const target = new URL(hash, baseUrl).toString()

  await page.goto(target, { waitUntil: 'domcontentloaded' })
  // A same-document hash change does not reload, so assert the route explicitly.
  await page.evaluate((value) => {
    if (window.location.hash !== value) window.location.hash = value
  }, hash)

  try {
    await page.waitForSelector(BUILD_MARKER, { state: 'visible', timeout: 20_000 })
  } catch {
    // The usual cause is a preview server mounted at "/" while the build's asset
    // URLs carry the Pages sub-path, which serves index.html in place of the
    // module scripts and leaves an empty shell behind.
    const detail = problems.length > 0 ? `\n  ${problems.slice(0, 6).join('\n  ')}` : ''
    throw new Error(
      `the app never rendered at ${target} — no ${BUILD_MARKER} appeared.` +
        `${detail}\n  Start the preview on the deployed sub-path: ` +
        `npx vite preview --base /Workout-Conductor-Rebuild-v3/`,
    )
  }

  await page.waitForLoadState('networkidle')

  // The service worker's "Ready to work offline" confirmation is a real part of
  // first-run UX, but it is position-fixed and would sit over the content in
  // every shot. It retires itself, so wait it out rather than suppressing it.
  await page
    .locator('[role="status"]')
    .first()
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => {})

  // From Phase 3 the landing card waits on two lazy chunks — the catalog and the
  // generator — before it has a session to show. Screenshotting the moment the
  // shell paints would capture "Building your session…" rather than the product.
  await page
    .locator('select')
    .first()
    .waitFor({ state: 'attached', timeout: 8_000 })
    .then(async () => {
      await page
        .waitForFunction(
          () => {
            const select = document.querySelector('select')
            return !select || !select.disabled
          },
          { timeout: 12_000 },
        )
        .catch(() => {})
    })
    .catch(() => {})

  await page.waitForTimeout(SETTLE_MS)
}

/**
 * From Phase 1 the app gates on setup, so a fresh browser lands on onboarding
 * rather than Today. Capturing only the tabs would miss the flow entirely, and
 * capturing only a fresh context would show onboarding five times. So each
 * profile does two passes in one context: walk the setup steps, then finish
 * setup and walk the tabs.
 */
async function captureSetup(page, baseUrl, out, profileName, fullPage, problems) {
  const written = []

  await openTab(page, baseUrl, '#/onboarding', problems)

  for (let step = 1; step <= 12; step += 1) {
    const file = outPath(out, `${profileName}-setup-${String(step).padStart(2, '0')}.png`)
    await page.screenshot({ path: file, fullPage, type: 'png', animations: 'disabled' })
    written.push(file)

    // The forward action is labelled by position: "Start setup" on welcome and
    // "Continue" through the questions. "Finish setup" ends the flow, so it is
    // deliberately excluded — leaving onboarding belongs to the tab pass.
    const next = page.getByRole('button', { name: /^(start setup|continue|done)$/i })
    if ((await next.count()) === 0 || !(await next.first().isEnabled())) break
    await next.first().click()
    await page.waitForTimeout(SETTLE_MS)
  }

  return written
}

/** Leave setup by the documented escape hatch so the tabs render a real profile. */
async function finishSetup(page, baseUrl, problems) {
  await openTab(page, baseUrl, '#/onboarding', problems)
  const skip = page.getByRole('button', { name: /skip setup/i })
  if ((await skip.count()) > 0) {
    await skip.first().click()
  } else {
    const finish = page.getByRole('button', { name: /finish setup/i })
    if ((await finish.count()) > 0) await finish.first().click()
  }
  await page.waitForTimeout(SETTLE_MS)
}

/** Start a session and photograph it with a set logged. */
async function captureActiveWorkout(page, baseUrl, out, profileName, fullPage, problems) {
  const written = []
  await openTab(page, baseUrl, '#/', problems)

  const start = page.getByRole('button', { name: /^Start Workout$/ })
  if ((await start.count()) === 0) return written
  await start.first().click()

  const logButton = page.getByTestId('log-set')
  await logButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  if ((await logButton.count()) === 0) return written

  const first = outPath(out, `${profileName}-workout-active.png`)
  await page.screenshot({ path: first, fullPage, type: 'png', animations: 'disabled' })
  written.push(first)

  await logButton.click()
  await page.waitForTimeout(SETTLE_MS)
  const logged = outPath(out, `${profileName}-workout-logged.png`)
  await page.screenshot({ path: logged, fullPage, type: 'png', animations: 'disabled' })
  written.push(logged)

  return written
}

async function captureProfile(browser, profile, { baseUrl, out, fullPage }) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })

  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
  page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`))

  const written = []

  try {
    written.push(...(await captureSetup(page, baseUrl, out, profile.name, fullPage, problems)))
    await finishSetup(page, baseUrl, problems)

    for (const tab of TABS) {
      await openTab(page, baseUrl, tab.hash, problems)

      const file = outPath(out, `${profile.name}-${tab.name}.png`)
      await page.screenshot({ path: file, fullPage, type: 'png', animations: 'disabled' })
      written.push(file)
    }

    // From Phase 5 the Workout tab only has something to show once a session is
    // running, and a screenshot of the empty state is not evidence the logger
    // works. Start one and photograph it mid-set.
    written.push(...(await captureActiveWorkout(page, baseUrl, out, profile.name, fullPage, problems)))
  } finally {
    await context.close()
  }

  return written
}

async function buildContactSheet(browser, { out }) {
  const source = PROFILES[0]
  const shotWidth = 220
  const shotHeight = Math.round((shotWidth * source.height) / source.width)
  const gap = 20
  const padding = 32

  const cells = []
  for (const tab of TABS) {
    const file = outPath(out, `${source.name}-${tab.name}.png`)
    const data = await readFile(file)
    cells.push({
      label: tab.label,
      src: `data:image/png;base64,${data.toString('base64')}`,
    })
  }

  const width = padding * 2 + TABS.length * shotWidth + (TABS.length - 1) * gap
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #0a0b0a; }
      body {
        padding: ${padding}px;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        color: #ffffff;
        width: ${width}px;
      }
      h1 { font-size: 20px; letter-spacing: -0.01em; margin: 0 0 4px; }
      p { margin: 0 0 24px; font-size: 12px; color: #8d938a; letter-spacing: 0.08em; text-transform: uppercase; }
      .row { display: flex; gap: ${gap}px; align-items: flex-start; }
      .cell { width: ${shotWidth}px; }
      .frame {
        height: ${shotHeight}px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        overflow: hidden;
        background: #161815;
      }
      /* Shots vary in length; crop each to one device screen so the row reads
         as five phones rather than five ragged strips. */
      img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; }
      .label { margin-top: 10px; font-size: 12px; color: #d5d8d2; text-align: center; }
    </style>
  </head>
  <body>
    <h1>Workout Conductor</h1>
    <p>Phase 0 &middot; Android ${source.width} &times; ${source.height}</p>
    <div class="row">
      ${cells
        .map(
          (cell) =>
            `<div class="cell"><div class="frame"><img src="${cell.src}" alt="${cell.label}" /></div>` +
            `<div class="label">${cell.label}</div></div>`,
        )
        .join('\n      ')}
    </div>
  </body>
</html>`

  // A short viewport lets the full-page capture shrink to the content height.
  const context = await browser.newContext({ viewport: { width, height: 200 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const file = outPath(out, 'preview-sheet.png')

  try {
    await page.setContent(html, { waitUntil: 'load' })
    await page.screenshot({ path: file, fullPage: true, type: 'png' })
  } finally {
    await context.close()
  }

  return file
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log('usage: node scripts/capture-screenshots.mjs [--base-url <url>] [--out <dir>] [--full-page]')
    console.log(`  --base-url  default ${DEFAULT_BASE_URL}`)
    console.log(`  --out       default ${DEFAULT_OUT}`)
    console.log('  --full-page  capture the whole scroll height instead of one device screen')
    return
  }

  const outDir = isAbsolute(args.out) ? args.out : resolve(ROOT, args.out)
  await mkdir(outDir, { recursive: true })

  console.log('capture-screenshots')
  console.log(`  base url: ${args.baseUrl}`)
  console.log(`  out dir:  ${display(outDir)}`)
  console.log(`  capture:  ${args.fullPage ? 'full page' : 'viewport'}`)

  const browser = await chromium.launch()
  const written = []

  try {
    for (const profile of PROFILES) {
      const options = { baseUrl: args.baseUrl, out: outDir, fullPage: args.fullPage }
      written.push(...(await captureProfile(browser, profile, options)))
    }
    written.push(await buildContactSheet(browser, { out: outDir }))
  } finally {
    await browser.close()
  }

  console.log('')
  for (const file of written) {
    console.log(`  wrote ${display(file)}`)
  }
  console.log(`\n${written.length} files written.`)
}

main().catch((error) => {
  console.error(`capture-screenshots failed: ${error.message ?? error}`)
  process.exit(1)
})
