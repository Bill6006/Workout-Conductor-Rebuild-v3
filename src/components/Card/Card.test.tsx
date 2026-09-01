import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders its children inside a section', () => {
    const { container } = render(<Card>Body copy</Card>)

    expect(container.querySelector('section')).toBeInTheDocument()
    expect(screen.getByText('Body copy')).toBeInTheDocument()
  })

  it('renders the title as an h2', () => {
    render(<Card title="This week">Body</Card>)
    expect(screen.getByRole('heading', { level: 2, name: 'This week' })).toBeInTheDocument()
  })

  it('renders the eyebrow above the title', () => {
    render(
      <Card eyebrow="Up next" title="No session planned">
        Body
      </Card>,
    )

    expect(screen.getByText('Up next')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'No session planned' })).toBeInTheDocument()
  })

  it('renders a trailing action node', () => {
    render(
      <Card title="Build" action={<span>Live</span>}>
        Body
      </Card>,
    )
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('omits the header entirely when there is nothing to put in it', () => {
    render(<Card>Body only</Card>)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders an eyebrow-only or action-only header without a heading', () => {
    render(<Card eyebrow="Last 8 weeks">Body</Card>)

    expect(screen.getByText('Last 8 weeks')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('applies a different class per tone', () => {
    const { container: base } = render(<Card>Body</Card>)
    const { container: accent } = render(<Card tone="accent">Body</Card>)
    const { container: muted } = render(<Card tone="muted">Body</Card>)

    const classOf = (root: HTMLElement) => root.querySelector('section')?.className ?? ''
    const tones = [classOf(base), classOf(accent), classOf(muted)]

    expect(new Set(tones).size).toBe(3)
  })
})
