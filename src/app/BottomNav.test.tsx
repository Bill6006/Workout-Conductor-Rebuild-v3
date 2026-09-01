import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { NAV_ITEMS } from './navigation'
import { BottomNav } from './BottomNav'
import { renderWithRouter } from '../test/test-utils'

describe('BottomNav', () => {
  it('exposes a named navigation landmark', () => {
    renderWithRouter(<BottomNav />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  it('renders one link per nav item, in order', () => {
    renderWithRouter(<BottomNav />)
    const links = within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link')

    expect(links).toHaveLength(NAV_ITEMS.length)
    expect(links.map((link) => link.textContent)).toEqual(NAV_ITEMS.map((item) => item.label))
  })

  it.each(NAV_ITEMS.map((item) => [item.label, item.path] as const))(
    'marks only %s as the current page at %s',
    (label, path) => {
      renderWithRouter(<BottomNav />, path)

      for (const item of NAV_ITEMS) {
        const link = screen.getByRole('link', { name: item.label })
        if (item.label === label) {
          expect(link).toHaveAttribute('aria-current', 'page')
        } else {
          expect(link).not.toHaveAttribute('aria-current')
        }
      }
    },
  )

  it('does not mark any tab current on an unmatched route', () => {
    renderWithRouter(<BottomNav />, '/nowhere')
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).not.toHaveAttribute('aria-current')
    }
  })

  it('hides the decorative tab icons from assistive technology', () => {
    const { container } = renderWithRouter(<BottomNav />)
    const icons = container.querySelectorAll('svg')

    expect(icons).toHaveLength(NAV_ITEMS.length)
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
