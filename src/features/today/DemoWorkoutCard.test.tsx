import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DemoWorkoutCard } from './DemoWorkoutCard'
import { DEMO_WORKOUT, DEMO_WORKOUT_DISCLAIMER } from './demoWorkout'

/**
 * The demo card is the easiest thing in Phase 1 to get ethically wrong: a
 * synthetic session that a user mistakes for their programme. These tests hold
 * the labelling in place, not the styling.
 */
describe('DemoWorkoutCard', () => {
  it('carries a Demo pill', () => {
    render(<DemoWorkoutCard />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })

  it('says in one plain sentence that this is not the user’s plan', () => {
    render(<DemoWorkoutCard />)
    expect(screen.getByText(DEMO_WORKOUT_DISCLAIMER)).toBeInTheDocument()
  })

  it('states that nothing here is stored or counted as training', () => {
    render(<DemoWorkoutCard />)
    expect(screen.getByText(/nothing here is saved to this device/i)).toBeInTheDocument()
    expect(screen.getByText(/none of it counts as training/i)).toBeInTheDocument()
  })

  it('lists every exercise with its sets, reps, and rest', () => {
    render(<DemoWorkoutCard />)
    const list = screen.getByRole('list', { name: 'Sample session exercises' })
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(DEMO_WORKOUT.exercises.length)
    expect(within(list).getByText('Barbell Bench Press')).toBeInTheDocument()
    expect(within(list).getByText('4 × 5')).toBeInTheDocument()
    expect(within(list).getByText('Rest 3:00')).toBeInTheDocument()
  })

  it('reads set and rest figures aloud in words', () => {
    render(<DemoWorkoutCard />)
    expect(screen.getByText('4 sets of 5 reps')).toBeInTheDocument()
    expect(screen.getByText('Rest 3 minutes')).toBeInTheDocument()
  })

  it('is completely inert — tapping it can start nothing', () => {
    const { container } = render(<DemoWorkoutCard />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0)
  })

  it('marks its list with role="list" so the flat styling keeps its semantics', () => {
    const { container } = render(<DemoWorkoutCard />)
    for (const list of container.querySelectorAll('ul, ol')) {
      expect(list).toHaveAttribute('role', 'list')
    }
  })
})
