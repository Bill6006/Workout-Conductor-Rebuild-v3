import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatTile } from './StatTile'

describe('StatTile', () => {
  it('renders the value and the label', () => {
    render(<StatTile label="Readiness" value="—" />)

    expect(screen.getByText('Readiness')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders the footnote when one is given', () => {
    render(<StatTile label="Weekly volume" value="—" footnote="No data yet" />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  it('renders no footnote element when the prop is omitted', () => {
    const { container } = render(<StatTile label="Weekly volume" value="—" />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('renders the value before the label so the figure reads first', () => {
    const { container } = render(<StatTile label="Est. strength" value="128 kg" />)
    const paragraphs = Array.from(container.querySelectorAll('p')).map((node) => node.textContent)

    expect(paragraphs).toEqual(['128 kg', 'Est. strength'])
  })
})
