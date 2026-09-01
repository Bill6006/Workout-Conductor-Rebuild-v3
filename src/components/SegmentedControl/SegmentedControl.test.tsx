import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

type Units = 'kg' | 'lb'

const UNITS: SegmentedOption<Units>[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
]

const FOUR: SegmentedOption<string>[] = [
  { value: 'short', label: 'Short' },
  { value: 'normal', label: 'Normal' },
  { value: 'long', label: 'Long' },
  { value: 'auto', label: 'Auto' },
]

describe('SegmentedControl', () => {
  it('renders a named radiogroup of radios', () => {
    render(<SegmentedControl options={UNITS} value="kg" onChange={() => {}} aria-label="Units" />)

    expect(screen.getByRole('radiogroup', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('checks exactly the selected option', () => {
    render(<SegmentedControl options={UNITS} value="lb" onChange={() => {}} aria-label="Units" />)

    expect(screen.getByRole('radio', { name: 'lb' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'kg' })).not.toBeChecked()
  })

  it('reports the tapped value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<SegmentedControl options={UNITS} value="kg" onChange={onChange} aria-label="Units" />)
    await user.click(screen.getByRole('radio', { name: 'lb' }))

    expect(onChange).toHaveBeenCalledWith('lb')
  })

  it('holds one tab stop on the selected segment', () => {
    render(<SegmentedControl options={FOUR} value="long" onChange={() => {}} aria-label="Rest" />)
    const radios = screen.getAllByRole('radio')

    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1'])
  })

  it('falls back to the first segment when the value matches nothing', () => {
    render(<SegmentedControl options={FOUR} value="unknown" onChange={() => {}} aria-label="Rest" />)

    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('tabindex', '0')
  })

  it('moves and selects with the arrow keys, wrapping past the last option', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<SegmentedControl options={FOUR} value="auto" onChange={onChange} aria-label="Rest" />)
    screen.getByRole('radio', { name: 'Auto' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('short')
    expect(screen.getByRole('radio', { name: 'Short' })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('auto')
  })

  it('jumps to the ends with Home and End', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<SegmentedControl options={FOUR} value="normal" onChange={onChange} aria-label="Rest" />)
    screen.getByRole('radio', { name: 'Normal' }).focus()

    await user.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('auto')

    await user.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('short')
  })

  it('marks the disabled state for both audiences and fires nothing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<SegmentedControl options={UNITS} value="kg" onChange={onChange} disabled aria-label="Units" />)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[1])

    for (const radio of radios) {
      expect(radio).toBeDisabled()
      expect(radio).toHaveAttribute('aria-disabled', 'true')
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('can take its name from a FormField label instead', () => {
    render(
      <>
        <span id="units-label">Units</span>
        <SegmentedControl options={UNITS} value="kg" onChange={() => {}} aria-labelledby="units-label" />
      </>,
    )

    expect(screen.getByRole('radiogroup', { name: 'Units' })).toBeInTheDocument()
  })
})
