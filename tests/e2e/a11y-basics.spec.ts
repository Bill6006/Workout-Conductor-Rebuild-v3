import { expect, test, type Page } from '@playwright/test'
import { startFresh, startWithProfile } from './appState'
import { ROUTES, SETUP_STEPS } from './routes'
import { walkSetup } from './setupFlow'

/**
 * Hand-rolled structural accessibility checks — no axe, no new dependency.
 * These cover the failures that a five-tab shell can actually commit: a
 * missing or duplicated h1, an unnamed landmark, a control nobody can hear,
 * or decorative artwork left in the accessibility tree.
 *
 * Phase 1 added a setup flow that swaps the whole main region eight times
 * without a navigation, which is exactly where a second `h1` or an unnamed
 * control tends to appear, so it gets the same sweep — step by step.
 */

interface Structure {
  h1: string[]
  mains: number
  navs: { name: string }[]
  unnamedControls: string[]
  unlabelledGraphics: string[]
}

/**
 * A deliberately small accessible-name approximation: aria-labelledby, then
 * aria-label, then text content, then title. It is not the full W3C algorithm,
 * but every control in Phase 0 is named by one of those four routes, so a
 * blank result here is a real defect rather than a gap in the approximation.
 */
async function readStructure(page: Page): Promise<Structure> {
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

      const text = element.textContent?.trim()
      if (text) return text

      return element.getAttribute('title')?.trim() ?? ''
    }

    const describe = (element: Element): string => {
      const id = element.id ? `#${element.id}` : ''
      const cls = typeof element.className === 'string' && element.className ? `.${element.className}` : ''
      return `${element.tagName.toLowerCase()}${id}${cls}`
    }

    /**
     * A landmark may only be named by an author-supplied label — its own text
     * content does not count, so `name()` would give a false pass here.
     */
    const landmarkName = (element: Element): string => {
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim()
        if (text) return text
      }
      return element.getAttribute('aria-label')?.trim() ?? ''
    }

    const hidden = (element: Element): boolean => element.closest('[aria-hidden="true"]') !== null

    const controls = Array.from(document.querySelectorAll('button, a[href], [role="button"]')).filter(
      (element) => !hidden(element),
    )

    const graphics = Array.from(document.querySelectorAll('svg, img'))

    return {
      h1: Array.from(document.querySelectorAll('h1')).map((heading) => heading.textContent?.trim() ?? ''),
      mains: document.querySelectorAll('main').length,
      navs: Array.from(document.querySelectorAll('nav')).map((nav) => ({ name: landmarkName(nav) })),
      unnamedControls: controls.filter((element) => name(element) === '').map(describe),
      unlabelledGraphics: graphics
        .filter((element) => {
          if (element.getAttribute('aria-hidden') === 'true' || hidden(element)) return false
          if (element.tagName.toLowerCase() === 'img') return !element.getAttribute('alt')?.trim()
          return name(element) === '' && !element.querySelector('title')
        })
        .map(describe),
    }
  })
}

/**
 * The assertions every screen in the app has to satisfy, whatever it renders.
 *
 * `nav` is the one thing a screen is allowed to differ on. Ordinary screens
 * must carry the primary navigation; the setup flow must NOT, because while
 * setup is being forced every tab bounces straight back to it, and five
 * focusable controls that do nothing are worse than none. Either way, any nav
 * landmark that IS present still has to be named.
 */
function expectSound(
  structure: Structure,
  heading: string,
  context: string,
  options: { nav?: 'required' | 'none' } = {},
) {
  expect(structure.h1, `${context}: exactly one h1 per screen`).toEqual([heading])
  expect(structure.mains, `${context}: exactly one main landmark`).toBe(1)

  if (options.nav === 'none') {
    expect(structure.navs.length, `${context}: setup must not paint a nav the gate will bounce`).toBe(0)
  } else {
    expect(structure.navs.length, `${context}: no nav landmark`).toBeGreaterThan(0)
  }
  for (const nav of structure.navs) {
    expect(nav.name, `${context}: every nav landmark needs an accessible name`).not.toBe('')
  }

  expect(
    structure.unnamedControls,
    `${context}: controls with no accessible name: ${structure.unnamedControls.join(', ')}`,
  ).toEqual([])

  expect(
    structure.unlabelledGraphics,
    `${context}: graphics that are neither labelled nor hidden: ${structure.unlabelledGraphics.join(', ')}`,
  ).toEqual([])
}

test.describe('the app, on a device that has finished setup', () => {
  test.beforeEach(async ({ page }) => {
    await startWithProfile(page)
  })

  for (const route of ROUTES) {
    test(`${route.tab} is structurally accessible`, async ({ page }) => {
      await page.goto(`./${route.hash}`)
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()

      expectSound(await readStructure(page), route.heading, route.tab)
    })
  }

  test('an open settings sheet is still structurally sound', async ({ page }) => {
    await page.goto('./#/settings')
    await page.getByRole('button', { name: 'Injuries and movements to avoid' }).click()
    await expect(page.getByRole('dialog', { name: 'Limitations' })).toBeVisible()

    // A modal is where an unnamed close button or a second h1 usually appears.
    expectSound(await readStructure(page), 'Settings', 'Settings · Limitations sheet')
  })
})

test.describe('setup, on a first visit', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('every setup step is structurally accessible', async ({ page }) => {
    await page.goto('./')

    await walkSetup(page, async (index) => {
      expectSound(await readStructure(page), SETUP_STEPS[index].heading, `setup step ${index + 1}`, {
        nav: 'none',
      })
    })

    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  })
})
