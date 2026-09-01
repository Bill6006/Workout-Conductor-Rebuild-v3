import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ProgressScreen } from './ProgressScreen'
import { renderWithRouter } from '../../test/test-utils'

describe('ProgressScreen', () => {
  it('renders a single h1', () => {
    renderWithRouter(<ProgressScreen />)
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Progress')
  })

  it('renders its phase notice', () => {
    renderWithRouter(<ProgressScreen />)
    expect(screen.getByRole('heading', { level: 2, name: 'Charts and personal records' })).toBeInTheDocument()
    expect(screen.getByText('Phase 7')).toBeInTheDocument()
  })

  it('shows four empty overview tiles, each admitting it has no data', () => {
    renderWithRouter(<ProgressScreen />)
    const labels = ['Sessions this week', 'Weekly volume', 'Est. strength', 'Personal records']

    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByText('No data yet')).toHaveLength(labels.length)
    expect(screen.getAllByText('—')).toHaveLength(labels.length)
  })

  it('links to the weekly plan', () => {
    renderWithRouter(<ProgressScreen />)
    expect(screen.getByRole('link', { name: 'Weekly plan' })).toHaveAttribute('href', '/plan')
  })

  it('hides the empty chart baseline from assistive technology and captions it', () => {
    const { container } = renderWithRouter(<ProgressScreen />)

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(screen.getByText('No sessions logged yet.')).toBeInTheDocument()
  })
})
