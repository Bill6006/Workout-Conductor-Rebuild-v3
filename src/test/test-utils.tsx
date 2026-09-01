import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Every screen sits under a router — Progress links to Plan, and the shell
 * reads the current location — so tests render through one.
 */
export function renderWithRouter(ui: ReactElement, initialPath = '/'): RenderResult {
  return render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>)
}

/**
 * A deliberately small accessible-name approximation: aria-labelledby, then
 * aria-label, then text, then title. Enough to prove a control is *not*
 * named something — which is what the Phase 0 product guards assert.
 */
export function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
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
