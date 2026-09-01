import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { SettingsScreen } from './SettingsScreen'
import { renderWithRouter } from '../../test/test-utils'

describe('SettingsScreen', () => {
  it('renders a single h1', () => {
    renderWithRouter(<SettingsScreen />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Settings')
  })

  it('renders its phase notice', () => {
    renderWithRouter(<SettingsScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'Editable settings' })).toBeInTheDocument()
    expect(screen.getByText('Phase 1')).toBeInTheDocument()
  })

  it('groups the preferences and leaves every row inert in Phase 0', () => {
    renderWithRouter(<SettingsScreen />)

    for (const group of ['Training', 'Environment', 'Data']) {
      expect(screen.getByRole('heading', { level: 2, name: group })).toBeInTheDocument()
    }

    const rows = screen.getAllByRole('button')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row).toBeDisabled()
      expect(row).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('shows the live build values, sourced from the build globals', () => {
    renderWithRouter(<SettingsScreen />)
    const card = within(screen.getByTestId('build-card'))

    expect(card.getByText('test-marker')).toBeInTheDocument()
    expect(card.getByText('Phase 0 - Repository, Live Pages, and Scaffold')).toBeInTheDocument()
    expect(card.getByText('abcdef1234567890')).toBeInTheDocument()
    expect(card.getByText('2026-09-01T14:22:00.000Z')).toHaveAttribute('datetime', '2026-09-01T14:22:00.000Z')
  })

  it('links to the public repository and says the link opens a new tab', () => {
    renderWithRouter(<SettingsScreen />)
    const link = screen.getByRole('link', { name: /github repository/i })

    expect(link).toHaveAttribute('href', 'https://github.com/Bill6006/Workout-Conductor-Rebuild-v3')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    expect(link).toHaveAccessibleName('GitHub repository (opens in a new tab)')
  })
})
