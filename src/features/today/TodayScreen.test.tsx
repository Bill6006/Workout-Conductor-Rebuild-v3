import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { TodayScreen } from './TodayScreen'
import { accessibleName, renderWithRouter } from '../../test/test-utils'

/**
 * Names that would signal a second, competing "how long / how hard" control.
 * The product has exactly one duration control and no workout-mode buttons.
 */
const FORBIDDEN_MODE_NAME = /^(full|lazy|short|density|recovery)\b/i

describe('TodayScreen', () => {
  it('renders a single h1', () => {
    renderWithRouter(<TodayScreen />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Today')
  })

  it('renders its phase notice', () => {
    renderWithRouter(<TodayScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'Profile and session preview' })).toBeInTheDocument()
    expect(screen.getByText('Phase 1')).toBeInTheDocument()
  })

  it('shows honest empty stats rather than invented numbers', () => {
    renderWithRouter(<TodayScreen />)
    for (const label of ['Readiness', 'Muscle focus', 'Planned duration']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  describe('the locked workout-length decision', () => {
    it('exposes exactly one workout-length control', () => {
      renderWithRouter(<TodayScreen />)

      expect(screen.getAllByRole('button', { name: /workout length/i })).toHaveLength(1)
      expect(screen.getAllByText(/workout length/i)).toHaveLength(1)
    })

    it('leaves the length control inert in Phase 0', () => {
      renderWithRouter(<TodayScreen />)
      const control = screen.getByRole('button', { name: /workout length/i })

      expect(control).toBeDisabled()
      expect(control).toHaveAttribute('aria-disabled', 'true')
      expect(control).toHaveTextContent('Default time')
    })

    it('disables Start Workout in Phase 0', () => {
      renderWithRouter(<TodayScreen />)
      const start = screen.getByRole('button', { name: 'Start Workout' })

      expect(start).toBeDisabled()
      expect(start).toHaveAttribute('aria-disabled', 'true')
    })

    it('has no second workout-mode control', () => {
      const { container } = renderWithRouter(<TodayScreen />)

      // Role-based sweep: nothing focusable is named like a mode switch.
      for (const role of ['button', 'link', 'radio', 'combobox', 'menuitem', 'switch', 'tab'] as const) {
        expect(screen.queryAllByRole(role, { name: FORBIDDEN_MODE_NAME })).toHaveLength(0)
      }

      // Belt and braces: sweep the raw DOM too, in case a future control is
      // added without a role the query above covers.
      for (const element of container.querySelectorAll('button, a, select, [role]')) {
        expect(accessibleName(element)).not.toMatch(FORBIDDEN_MODE_NAME)
      }
    })
  })
})
