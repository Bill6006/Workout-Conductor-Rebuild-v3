import { expect, test, type Locator, type Page } from '@playwright/test'
import { startFresh } from './appState'

/**
 * Text that has to fit, in a face the runner may not be using.
 *
 * The app ships no web font, so `--wc-font` resolves to whatever the device
 * has: Roboto on Android, DejaVu Sans on the CI runner, Segoe UI on Windows.
 * The header tagline has now been clipped twice, and both times it was signed
 * off after being looked at in exactly one of those. So this file forces the
 * family and measures, rather than trusting the runner's default.
 *
 * WHAT IT ASSERTS, and why it is not `scrollWidth <= clientWidth` alone: an
 * element with `overflow: hidden` — an ellipsis or a line clamp — keeps
 * `scrollWidth === clientWidth` true while throwing the end of the string
 * away. So the check is that nothing is hidden in EITHER direction, and that
 * the last word is still painted inside the element's own box. A clamp
 * reintroduced as "the tidy fix" fails here.
 *
 * Geometry depends on the viewport, not the device profile, so the sweep runs
 * once. playwright.config.ts hard-codes which specs the two secondary projects
 * skip, so this file opts out itself.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'android-360', 'geometry sweep — one project is enough')
})

test.describe.configure({ mode: 'parallel' })

/** One CSS pixel of slack absorbs sub-pixel rounding at fractional scales. */
const SLACK = 1

/**
 * The four faces `--wc-font` really resolves to in the wild, plus a deliberate
 * over-wide control. Courier New is wider than any of them at the same size,
 * so a layout that survives it survives a face this runner cannot install:
 * Roboto and DejaVu Sans are absent on a stock Windows workstation and fall
 * back silently, which is exactly how this defect was signed off before.
 */
const FACES = ['Roboto', 'DejaVu Sans', 'Segoe UI', 'Verdana', 'Courier New']

/** Real handset widths, plus 240 CSS px — a 360px phone at 150% zoom. */
const WIDTHS = [360, 375, 412, 430, 240]

async function forceFace(page: Page, face: string) {
  await page.addStyleTag({ content: `:root { --wc-font: '${face}', sans-serif !important; }` })
}

interface Fit {
  readonly hiddenAcross: number
  readonly hiddenDown: number
  readonly textRight: number
  readonly textBottom: number
  readonly boxRight: number
  readonly boxBottom: number
  readonly text: string
  readonly lines: number
}

/** Measures an element against its own box, and its text against the element. */
async function fit(target: Locator): Promise<Fit> {
  return target.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()]

    return {
      hiddenAcross: node.scrollWidth - node.clientWidth,
      hiddenDown: node.scrollHeight - node.clientHeight,
      textRight: Math.max(0, ...rects.map((rect) => rect.right)),
      textBottom: Math.max(0, ...rects.map((rect) => rect.bottom)),
      boxRight: box.right,
      boxBottom: box.bottom,
      text: node.textContent ?? '',
      lines: rects.length,
    }
  })
}

function expectNothingCut(fitted: Fit, context: string) {
  expect(
    fitted.hiddenAcross,
    `${context}: ${fitted.hiddenAcross}px of it is hidden sideways`,
  ).toBeLessThanOrEqual(SLACK)
  expect(
    fitted.hiddenDown,
    `${context}: ${fitted.hiddenDown}px of it is hidden below the fold`,
  ).toBeLessThanOrEqual(SLACK)
  expect(
    fitted.textRight,
    `${context}: the text reaches ${Math.round(fitted.textRight)}px, past its box at ${Math.round(fitted.boxRight)}px`,
  ).toBeLessThanOrEqual(fitted.boxRight + SLACK)
  expect(
    fitted.textBottom,
    `${context}: the text ends ${Math.round(fitted.textBottom - fitted.boxBottom)}px below its box`,
  ).toBeLessThanOrEqual(fitted.boxBottom + SLACK)
}

async function expectNoSidewaysScroll(page: Page, context: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, `${context}: page is ${scrollWidth}px wide in ${innerWidth}px`).toBeLessThanOrEqual(
    innerWidth + SLACK,
  )
}

test.describe('the header tagline fits, in every face the app can be given', () => {
  for (const width of WIDTHS) {
    test(`is shown whole at ${width} CSS px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await startFresh(page)
      await page.goto('./')
      await expect(page.getByText('Adaptive Strength + Hypertrophy')).toBeVisible()

      const tagline = page.locator('header span', { hasText: /^Adaptive Strength \+ Hypertrophy$/ })

      for (const face of FACES) {
        await forceFace(page, face)
        const fitted = await fit(tagline)

        expect(fitted.text.trim(), `${face} at ${width}px: the string itself changed`).toBe(
          'Adaptive Strength + Hypertrophy',
        )
        expectNothingCut(fitted, `tagline in ${face} at ${width}px`)
        await expectNoSidewaysScroll(page, `tagline in ${face} at ${width}px`)
      }
    })
  }
})

/**
 * "Skip setup" is the widest label the secondary action ever carries, and it
 * sits on the welcome step — the first thing a new install shows. A percentage
 * flex basis made its box narrower than the label in every face, so it wrapped
 * or hyphenated there and nowhere else.
 */
test.describe('the setup dock fits its two actions', () => {
  for (const width of WIDTHS) {
    test(`keeps "Skip setup" on one line at ${width} CSS px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await startFresh(page)
      await page.goto('./')

      const skip = page.getByRole('button', { name: 'Skip setup', exact: true })
      await expect(skip).toBeVisible()

      for (const face of FACES) {
        await forceFace(page, face)
        const fitted = await fit(skip)
        expectNothingCut(fitted, `Skip setup in ${face} at ${width}px`)
        await expectNoSidewaysScroll(page, `Skip setup in ${face} at ${width}px`)

        // 240 CSS px is a 360px phone at 150% zoom: half a 204px row cannot
        // hold this label in the widest faces, and wrapping there is correct.
        // At every real handset width it has to be one line.
        if (width >= 360) {
          expect(fitted.lines, `Skip setup in ${face} at ${width}px wrapped onto ${fitted.lines} lines`).toBe(
            1,
          )
        }
      }
    })
  }
})
