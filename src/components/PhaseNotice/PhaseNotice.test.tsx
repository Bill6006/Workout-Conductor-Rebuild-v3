import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PhaseNotice } from './PhaseNotice'

describe('PhaseNotice', () => {
  it('renders the heading as an h2', () => {
    render(
      <PhaseNotice phase="Phase 5" heading="The live session screen">
        Copy about what arrives later.
      </PhaseNotice>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'The live session screen' })).toBeInTheDocument()
  })

  it('renders the phase tag and the explanatory copy', () => {
    render(
      <PhaseNotice phase="Phases 1 & 7" heading="Locations and targets">
        Phase 1 sets up locations.
      </PhaseNotice>,
    )

    expect(screen.getByText('Phases 1 & 7')).toBeInTheDocument()
    expect(screen.getByText('Phase 1 sets up locations.')).toBeInTheDocument()
  })

  it('keeps the copy in a paragraph so it is never mistaken for a control', () => {
    const { container } = render(
      <PhaseNotice phase="Phase 7" heading="Charts">
        Later.
      </PhaseNotice>,
    )

    expect(container.querySelector('p')).toHaveTextContent('Later.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
