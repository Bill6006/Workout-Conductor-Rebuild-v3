import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleRow } from './ToggleRow'

describe('ToggleRow', () => {
  it('is a real switch that reports its state', () => {
    render(<ToggleRow label="Metric units" checked onChange={() => {}} />)

    const toggle = screen.getByRole('switch', { name: /Metric units/ })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle.tagName).toBe('BUTTON')
  })

  it('sends the opposite value when tapped', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ToggleRow label="Metric units" checked={false} onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Metric units' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('sends false when an on switch is tapped', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ToggleRow label="Metric units" checked onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Metric units' }))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('describes itself with the optional description rather than absorbing it into the name', () => {
    render(
      <ToggleRow label="Metric units" description="Kilograms and centimetres" checked onChange={() => {}} />,
    )

    const toggle = screen.getByRole('switch', { name: 'Metric units' })
    expect(toggle).toHaveAccessibleDescription('Kilograms and centimetres')
  })

  it('is operable from the keyboard', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ToggleRow label="Metric units" checked={false} onChange={onChange} />)
    await user.tab()
    await user.keyboard(' ')

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('marks the disabled state for both audiences and fires nothing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ToggleRow label="Metric units" checked={false} disabled onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: 'Metric units' })
    await user.click(toggle)

    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('makes the whole row the target, not a small thumb', () => {
    render(<ToggleRow label="Metric units" description="Kilograms" checked onChange={() => {}} />)
    const toggle = screen.getByRole('switch', { name: 'Metric units' })

    expect(toggle).toContainElement(screen.getByText('Kilograms'))
  })
})
