import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { PlanScreen } from './PlanScreen'
import { renderWithRouter } from '../../test/test-utils'

describe('PlanScreen', () => {
  it('renders a single h1', () => {
    renderWithRouter(<PlanScreen />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Plan')
  })

  it('renders its phase notice', () => {
    renderWithRouter(<PlanScreen />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Locations, targets, and the weekly view' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Phases 1 & 7')).toBeInTheDocument()
  })

  it('lays out seven empty days and six muscle groups', () => {
    renderWithRouter(<PlanScreen />)

    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeInTheDocument()
    }
    for (const group of ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
    expect(screen.getAllByText('—')).toHaveLength(13)
  })

  it('offers the location action but keeps it inert in Phase 0', () => {
    renderWithRouter(<PlanScreen />)
    const add = screen.getByRole('button', { name: 'Add a location' })

    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('No locations yet.')).toBeInTheDocument()
  })
})
