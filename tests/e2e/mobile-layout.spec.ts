import { expect, test, type Page } from '@playwright/test'
import { MOBILE_WIDTHS, ROUTES } from './routes'

/**
 * Layout geometry depends on viewport width, not on the device profile, so
 * this file sweeps the widths itself and runs under a single project — the two
 * secondary projects skip it via `testIgnore` in playwright.config.ts.
 */
test.describe.configure({ mode: 'parallel' })

/** One CSS pixel of slack absorbs sub-pixel rounding at fractional scales. */
const OVERFLOW_SLACK = 1

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    // The widest element that pokes past the viewport, if any — a failure
    // message naming the culprit is worth the extra query.
    widest: (() => {
      let worst = { selector: '', right: 0 }
      for (const element of document.querySelectorAll('body *')) {
        const right = element.getBoundingClientRect().right
        if (right > worst.right) {
          // SVG elements expose className as an SVGAnimatedString, not a string.
          const name = typeof element.className === 'string' ? element.className : ''
          worst = { selector: `${element.tagName.toLowerCase()}.${name || '(no class)'}`, right }
        }
      }
      return worst
    })(),
  }))
}

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const { scrollWidth, innerWidth, widest } = await horizontalOverflow(page)

  expect(
    scrollWidth,
    `${context}: document is ${scrollWidth}px wide in a ${innerWidth}px viewport; ` +
      `widest element ${widest.selector} reaches ${Math.round(widest.right)}px`,
  ).toBeLessThanOrEqual(innerWidth + OVERFLOW_SLACK)
}

for (const width of MOBILE_WIDTHS) {
  test(`no horizontal overflow at ${width}px on any tab`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })

    for (const route of ROUTES) {
      await page.goto(`./${route.hash}`)
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
      await expectNoHorizontalOverflow(page, `${width}px · ${route.tab}`)
    }
  })
}

/**
 * 150% browser zoom on a 360px handset leaves 240 CSS pixels of layout width.
 * Setting the viewport to the CSS-pixel equivalent reproduces that exactly and
 * keeps every measurement in the same unit — a `zoom: 1.5` style tag would put
 * the assertions and the layout in different coordinate spaces.
 */
test('survives 150% zoom (240 CSS px of layout width)', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 533 })

  for (const route of ROUTES) {
    await page.goto(`./${route.hash}`)
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    await expectNoHorizontalOverflow(page, `zoomed · ${route.tab}`)
  }

  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav).toBeVisible()

  const navBox = await nav.boundingBox()
  expect(navBox).not.toBeNull()
  expect(navBox!.x).toBeGreaterThanOrEqual(-OVERFLOW_SLACK)
  expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(240 + OVERFLOW_SLACK)
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(533 + OVERFLOW_SLACK)

  await expect(nav.getByRole('link')).toHaveCount(ROUTES.length)
  for (const route of ROUTES) {
    const link = nav.getByRole('link', { name: route.tab, exact: true })
    await expect(link).toBeVisible()

    // The label carries `text-overflow: ellipsis`, so a too-narrow tab would
    // still be "visible" while reading "Progr…". Measure the text instead.
    const truncated = await link
      .locator('span')
      .last()
      .evaluate((label) => {
        return label.scrollWidth > label.clientWidth + 1
      })
    expect(truncated, `${route.tab} tab label is truncated at 240px`).toBe(false)
  }
})

test('every bottom-nav target clears the 44px thumb-reach floor', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('./')

  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav).toBeVisible()

  for (const route of ROUTES) {
    const box = await nav.getByRole('link', { name: route.tab, exact: true }).boundingBox()

    expect(box, `${route.tab} tab has no box`).not.toBeNull()
    expect(box!.height, `${route.tab} tab is only ${box!.height}px tall`).toBeGreaterThanOrEqual(44)
    expect(box!.width, `${route.tab} tab is only ${box!.width}px wide`).toBeGreaterThanOrEqual(44)
  }
})
