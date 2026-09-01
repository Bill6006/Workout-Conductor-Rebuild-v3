import { expect, test, type Page } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * Hand-rolled structural accessibility checks — no axe, no new dependency.
 * These cover the failures that a five-tab shell can actually commit: a
 * missing or duplicated h1, an unnamed landmark, a control nobody can hear,
 * or decorative artwork left in the accessibility tree.
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

for (const route of ROUTES) {
  test(`${route.tab} is structurally accessible`, async ({ page }) => {
    await page.goto(`./${route.hash}`)
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()

    const structure = await readStructure(page)

    expect(structure.h1, 'exactly one h1 per screen').toEqual([route.heading])
    expect(structure.mains, 'exactly one main landmark').toBe(1)

    expect(structure.navs.length).toBeGreaterThan(0)
    for (const nav of structure.navs) {
      expect(nav.name, 'every nav landmark needs an accessible name').not.toBe('')
    }

    expect(
      structure.unnamedControls,
      `controls with no accessible name: ${structure.unnamedControls.join(', ')}`,
    ).toEqual([])

    expect(
      structure.unlabelledGraphics,
      `graphics that are neither labelled nor hidden: ${structure.unlabelledGraphics.join(', ')}`,
    ).toEqual([])
  })
}
