import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChipGroup, type ChipItem } from './ChipGroup'

const EQUIPMENT: ChipItem[] = [
  { id: 'dumbbell', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'bands', label: 'Bands' },
]

describe('ChipGroup', () => {
  it('renders a named group of checkboxes', () => {
    render(<ChipGroup items={EQUIPMENT} selected={[]} onChange={() => {}} aria-label="Equipment" />)

    expect(screen.getByRole('group', { name: 'Equipment' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('reports checked state per chip', () => {
    render(<ChipGroup items={EQUIPMENT} selected={['barbell']} onChange={() => {}} aria-label="Equipment" />)

    expect(screen.getByRole('checkbox', { name: 'Barbell' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).not.toBeChecked()
  })

  it('adds an id when an unselected chip is tapped', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ChipGroup items={EQUIPMENT} selected={['barbell']} onChange={onChange} aria-label="Equipment" />)
    await user.click(screen.getByRole('checkbox', { name: 'Bands' }))

    expect(onChange).toHaveBeenCalledWith(['barbell', 'bands'])
  })

  it('removes an id when a selected chip is tapped', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ChipGroup
        items={EQUIPMENT}
        selected={['barbell', 'bands']}
        onChange={onChange}
        aria-label="Equipment"
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Barbell' }))

    expect(onChange).toHaveBeenCalledWith(['bands'])
  })

  it('toggles from the keyboard', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ChipGroup items={EQUIPMENT} selected={[]} onChange={onChange} aria-label="Equipment" />)
    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(['dumbbell'])
  })

  it('disables every chip and fires nothing while disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ChipGroup items={EQUIPMENT} selected={[]} onChange={onChange} disabled aria-label="Equipment" />)
    const chips = screen.getAllByRole('checkbox')
    await user.click(chips[0])

    for (const chip of chips) {
      expect(chip).toBeDisabled()
      expect(chip).toHaveAttribute('aria-disabled', 'true')
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('can take its name from a FormField label instead', () => {
    render(
      <>
        <span id="equipment-label">Equipment</span>
        <ChipGroup items={EQUIPMENT} selected={[]} onChange={() => {}} aria-labelledby="equipment-label" />
      </>,
    )

    expect(screen.getByRole('group', { name: 'Equipment' })).toBeInTheDocument()
  })
})
