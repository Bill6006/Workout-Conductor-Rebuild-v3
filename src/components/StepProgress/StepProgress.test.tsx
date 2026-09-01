import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StepProgress } from './StepProgress'

describe('StepProgress', () => {
  it('prints the counter as readable text', () => {
    render(<StepProgress current={3} total={7} />)
    expect(screen.getByText('Step 3 of 7')).toBeInTheDocument()
  })

  it('exposes a progressbar with matching values', () => {
    render(<StepProgress current={3} total={7} />)
    const bar = screen.getByRole('progressbar', { name: 'Setup progress' })

    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '7')
    expect(bar).toHaveAttribute('aria-valuetext', 'Step 3 of 7')
  })

  it('folds the step name into the spoken value', () => {
    render(<StepProgress current={2} total={5} stepName="Equipment" />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 5 — Equipment')
    expect(screen.getByText('Equipment')).toBeInTheDocument()
  })

  it('accepts a caller-supplied accessible name', () => {
    render(<StepProgress current={1} total={4} label="Import progress" />)
    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toBeInTheDocument()
  })

  it('clamps a current step below one', () => {
    render(<StepProgress current={0} total={7} />)

    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  it('clamps a current step past the end', () => {
    render(<StepProgress current={99} total={7} />)
    expect(screen.getByText('Step 7 of 7')).toBeInTheDocument()
  })

  it('never renders a zero-step total', () => {
    render(<StepProgress current={1} total={0} />)
    expect(screen.getByText('Step 1 of 1')).toBeInTheDocument()
  })
})
