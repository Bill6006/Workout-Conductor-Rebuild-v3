import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayPicker } from './DayPicker'
import { WEEK_DAYS } from './week'

describe('DayPicker', () => {
  it('renders seven named toggles inside one group', () => {
    render(<DayPicker selected={[]} onChange={() => {}} aria-label="Training days" />)

    expect(screen.getByRole('group', { name: 'Training days' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(7)
  })

  it('announces the full day name while showing the short one', () => {
    render(<DayPicker selected={[]} onChange={() => {}} aria-label="Training days" />)

    expect(screen.getByRole('checkbox', { name: 'Wednesday' })).toHaveTextContent('We')
  })

  it('keeps every short label a prefix of its full name, so voice control can reach it', () => {
    for (const day of WEEK_DAYS) {
      expect(day.label.startsWith(day.short)).toBe(true)
    }
  })

  it('starts the week on Monday and uses stable ids', () => {
    expect(WEEK_DAYS.map((day) => day.id)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  })

  it('reports checked state per day', () => {
    render(<DayPicker selected={['mon', 'thu']} onChange={() => {}} aria-label="Training days" />)

    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).not.toBeChecked()
  })

  it('adds a day when an unselected one is tapped', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DayPicker selected={['mon']} onChange={onChange} aria-label="Training days" />)
    await user.click(screen.getByRole('checkbox', { name: 'Friday' }))

    expect(onChange).toHaveBeenCalledWith(['mon', 'fri'])
  })

  it('removes a day when a selected one is tapped', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DayPicker selected={['mon', 'fri']} onChange={onChange} aria-label="Training days" />)
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }))

    expect(onChange).toHaveBeenCalledWith(['fri'])
  })

  it('toggles from the keyboard', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DayPicker selected={[]} onChange={onChange} aria-label="Training days" />)
    await user.tab()
    await user.keyboard(' ')

    expect(onChange).toHaveBeenCalledWith(['mon'])
  })

  it('carries a field hint on the group, so it is announced with it', () => {
    render(
      <>
        <span id="days-label">Training days</span>
        <p id="days-hint">Monday, Wednesday, Friday</p>
        <DayPicker
          selected={['mon']}
          onChange={() => {}}
          aria-labelledby="days-label"
          aria-describedby="days-hint"
        />
      </>,
    )

    expect(screen.getByRole('group', { name: 'Training days' })).toHaveAccessibleDescription(
      'Monday, Wednesday, Friday',
    )
  })

  it('marks the disabled state for both audiences and fires nothing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DayPicker selected={[]} onChange={onChange} disabled aria-label="Training days" />)
    const days = screen.getAllByRole('checkbox')
    await user.click(days[0])

    for (const day of days) {
      expect(day).toBeDisabled()
      expect(day).toHaveAttribute('aria-disabled', 'true')
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts a caller-supplied week', () => {
    render(
      <DayPicker
        days={[{ id: 'sat', label: 'Saturday', short: 'Sa' }]}
        selected={[]}
        onChange={() => {}}
        aria-label="Weekend"
      />,
    )

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('can take its name from a FormField label instead', () => {
    render(
      <>
        <span id="days-label">Training days</span>
        <DayPicker selected={[]} onChange={() => {}} aria-labelledby="days-label" />
      </>,
    )

    expect(screen.getByRole('group', { name: 'Training days' })).toBeInTheDocument()
  })
})
