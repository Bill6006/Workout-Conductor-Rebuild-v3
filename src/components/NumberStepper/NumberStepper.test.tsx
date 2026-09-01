import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberStepper } from './NumberStepper'

function Controlled({ start = 30, min = 5, max = 90, step = 5 }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <NumberStepper
        value={value}
        onChange={setValue}
        min={min}
        max={max}
        step={step}
        unit="min"
        label="Session length"
      />
      <p data-testid="echo">{value}</p>
    </>
  )
}

describe('NumberStepper', () => {
  it('exposes a spinbutton carrying the full numeric contract', () => {
    render(
      <NumberStepper
        value={30}
        onChange={() => {}}
        min={5}
        max={90}
        step={5}
        unit="min"
        label="Session length"
      />,
    )
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    expect(field).toHaveAttribute('aria-valuenow', '30')
    expect(field).toHaveAttribute('aria-valuemin', '5')
    expect(field).toHaveAttribute('aria-valuemax', '90')
    expect(field).toHaveAttribute('aria-valuetext', '30 min')
    expect(field).toHaveValue('30')
  })

  it('raises the Android number keypad rather than the full keyboard', () => {
    render(<NumberStepper value={30} onChange={() => {}} min={5} max={90} label="Session length" />)

    expect(screen.getByRole('spinbutton')).toHaveAttribute('inputmode', 'numeric')
  })

  it('raises the keypad with a decimal separator when the quantity has fractions', () => {
    render(
      <NumberStepper
        value={82}
        onChange={() => {}}
        min={20}
        max={1000}
        precision="decimal"
        label="Bodyweight in kg"
      />,
    )

    expect(screen.getByRole('spinbutton')).toHaveAttribute('inputmode', 'decimal')
  })

  it('accepts, clamps, and round-trips a decimal value', async () => {
    const user = userEvent.setup()
    render(<Controlled start={82} min={20} max={200} step={1} />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    await user.clear(field)
    await user.type(field, '82.5')
    await user.tab()

    expect(field).toHaveValue('82.5')
    expect(screen.getByTestId('echo')).toHaveTextContent('82.5')

    await user.clear(field)
    await user.type(field, '999.9')
    await user.tab()

    expect(screen.getByTestId('echo')).toHaveTextContent('200')
  })

  it('reads a comma as the decimal separator on the decimal keypad', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <NumberStepper
        value={82}
        onChange={onChange}
        min={20}
        max={1000}
        precision="decimal"
        label="Bodyweight in kg"
      />,
    )
    const field = screen.getByRole('spinbutton')
    await user.clear(field)
    await user.type(field, '82,5')
    await user.tab()

    expect(onChange).toHaveBeenLastCalledWith(82.5)
  })

  it('leaves a comma unparseable on the integer keypad, where it cannot be typed', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    await user.clear(field)
    await user.type(field, '4,5')
    await user.tab()

    expect(field).toHaveValue('30')
  })

  it('makes the whole field a target rather than the text alone', () => {
    render(
      <NumberStepper
        value={30}
        onChange={() => {}}
        min={5}
        max={90}
        unit="min"
        id="length-field"
        label="Session length"
      />,
    )
    const field = screen.getByRole('spinbutton', { name: 'Session length' })
    const wrapper = field.closest('label')

    // The padding around the number belongs to the input, not to dead space
    // between two 56px buttons: the wrapper is a label that points at it.
    expect(wrapper).not.toBeNull()
    expect(wrapper).toHaveAttribute('for', 'length-field')
    expect(wrapper).toContainElement(screen.getByText('min'))
  })

  it('names both step buttons after the field', () => {
    render(<NumberStepper value={30} onChange={() => {}} min={5} max={90} label="Session length" />)

    expect(screen.getByRole('button', { name: 'Decrease Session length' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase Session length' })).toBeInTheDocument()
  })

  it('steps up and down by the step size', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('button', { name: 'Increase Session length' }))
    expect(screen.getByTestId('echo')).toHaveTextContent('35')

    await user.click(screen.getByRole('button', { name: 'Decrease Session length' }))
    expect(screen.getByTestId('echo')).toHaveTextContent('30')
  })

  it('disables the step button that would leave the range', () => {
    render(<NumberStepper value={5} onChange={() => {}} min={5} max={90} label="Session length" />)
    const decrease = screen.getByRole('button', { name: 'Decrease Session length' })

    expect(decrease).toBeDisabled()
    expect(decrease).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Increase Session length' })).toBeEnabled()
  })

  it('clamps a step that would overshoot the maximum', async () => {
    const user = userEvent.setup()
    render(<Controlled start={88} />)

    await user.click(screen.getByRole('button', { name: 'Increase Session length' }))
    expect(screen.getByTestId('echo')).toHaveTextContent('90')
  })

  it('accepts a typed value', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    await user.clear(field)
    await user.type(field, '45')

    expect(screen.getByTestId('echo')).toHaveTextContent('45')
  })

  it('does not report a value while the field is momentarily empty', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<NumberStepper value={30} onChange={onChange} min={5} max={90} label="Session length" />)
    await user.clear(screen.getByRole('spinbutton'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('recovers the last good value when the field is left empty', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    await user.clear(field)
    await user.tab()

    expect(field).toHaveValue('30')
    expect(screen.getByTestId('echo')).toHaveTextContent('30')
  })

  it('recovers from unparseable text instead of trapping the user', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    await user.clear(field)
    await user.type(field, 'abc')
    await user.tab()

    expect(field).toHaveValue('30')
  })

  it('clamps an out-of-range typed value on blur', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    await user.clear(field)
    await user.type(field, '900')
    await user.tab()

    expect(field).toHaveValue('90')
    expect(screen.getByTestId('echo')).toHaveTextContent('90')
  })

  it('steps from the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('spinbutton', { name: 'Session length' })

    field.focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByTestId('echo')).toHaveTextContent('35')

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByTestId('echo')).toHaveTextContent('25')
  })

  it('marks the disabled state across the whole control', () => {
    render(<NumberStepper value={30} onChange={() => {}} min={5} max={90} disabled label="Session length" />)

    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease Session length' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase Session length' })).toBeDisabled()
  })

  it('can take its name from a FormField label instead', () => {
    render(
      <>
        <span id="length-label">Session length</span>
        <NumberStepper
          value={30}
          onChange={() => {}}
          min={5}
          max={90}
          label="Session length"
          aria-labelledby="length-label"
        />
      </>,
    )

    expect(screen.getByRole('spinbutton', { name: 'Session length' })).not.toHaveAttribute('aria-label')
  })
})
