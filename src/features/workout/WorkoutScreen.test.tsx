import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { WorkoutScreen } from './WorkoutScreen'
import { renderWithRouter } from '../../test/test-utils'

describe('WorkoutScreen', () => {
  it('renders a single h1', () => {
    renderWithRouter(<WorkoutScreen />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Workout')
  })

  it('renders its phase notice', () => {
    renderWithRouter(<WorkoutScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'The live session screen' })).toBeInTheDocument()
    expect(screen.getByText('Phase 5')).toBeInTheDocument()
  })

  it('states plainly that no session is running', () => {
    renderWithRouter(<WorkoutScreen />)
    expect(screen.getByText('No active session.')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is running\./)).toBeInTheDocument()
  })

  it('points back to Today instead of offering a second start control', () => {
    renderWithRouter(<WorkoutScreen />)

    const link = screen.getByRole('link', { name: 'Go to Today' })
    expect(link).toHaveAttribute('href', '/')

    // Locked product decision: exactly one start control exists, on Today.
    expect(screen.queryByRole('button', { name: /start workout/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /start workout/i })).not.toBeInTheDocument()
  })
})
