import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pill } from './Pill'

describe('Pill', () => {
  it('renders its children as inline text', () => {
    render(<Pill>Phase 0</Pill>)
    const pill = screen.getByText('Phase 0')

    expect(pill.tagName).toBe('SPAN')
  })

  it('applies a distinct class for every tone', () => {
    const { container: neutral } = render(<Pill>Tag</Pill>)
    const { container: accent } = render(<Pill tone="accent">Tag</Pill>)
    const { container: muted } = render(<Pill tone="muted">Tag</Pill>)

    const classOf = (root: HTMLElement) => root.querySelector('span')?.className ?? ''
    expect(new Set([classOf(neutral), classOf(accent), classOf(muted)]).size).toBe(3)
  })

  it('defaults to the neutral tone', () => {
    const { container: implicit } = render(<Pill>Tag</Pill>)
    const { container: explicit } = render(<Pill tone="neutral">Tag</Pill>)

    expect(implicit.querySelector('span')?.className).toBe(explicit.querySelector('span')?.className)
  })

  it('adds no role of its own — it is a label, not a control', () => {
    render(<Pill tone="accent">Live</Pill>)

    expect(screen.getByText('Live')).not.toHaveAttribute('role')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
