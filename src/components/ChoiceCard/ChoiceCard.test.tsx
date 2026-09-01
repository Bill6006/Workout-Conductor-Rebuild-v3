import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChoiceCard, ChoiceCardGroup, type ChoiceMode } from './ChoiceCard'

describe('ChoiceCard', () => {
  it('is a radio in single-select mode and reports its checked state', () => {
    render(<ChoiceCard title="Build muscle" selected onSelect={() => {}} />)

    expect(screen.getByRole('radio', { name: /Build muscle/ })).toBeChecked()
  })

  it('is a checkbox in multi-select mode', () => {
    render(<ChoiceCard title="Dumbbells" mode="multi" selected={false} onSelect={() => {}} />)

    const card = screen.getByRole('checkbox', { name: /Dumbbells/ })
    expect(card).not.toBeChecked()
    expect(card).toHaveAttribute('aria-checked', 'false')
  })

  it('includes the description in the accessible name', () => {
    render(
      <ChoiceCard
        title="Build muscle"
        description="Hypertrophy focus"
        selected={false}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Build muscle Hypertrophy focus' })).toBeInTheDocument()
  })

  it('calls onSelect when tapped', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<ChoiceCard title="Build muscle" selected={false} onSelect={onSelect} />)
    await user.click(screen.getByRole('radio', { name: 'Build muscle' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('is operable from the keyboard', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<ChoiceCard title="Build muscle" selected={false} onSelect={onSelect} />)
    await user.tab()
    await user.keyboard(' ')

    expect(screen.getByRole('radio', { name: 'Build muscle' })).toHaveFocus()
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('marks the disabled state for both audiences and ignores taps', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<ChoiceCard title="Barbell" mode="multi" disabled selected={false} onSelect={onSelect} />)
    const card = screen.getByRole('checkbox', { name: 'Barbell' })
    await user.click(card)

    expect(card).toBeDisabled()
    expect(card).toHaveAttribute('aria-disabled', 'true')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders the icon slot as decoration, keeping it out of the accessible name', () => {
    render(<ChoiceCard title="Home" icon={<span>HM</span>} selected={false} onSelect={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Home' })).toBeInTheDocument()
  })
})

describe('ChoiceCardGroup', () => {
  interface GroupProps {
    mode?: ChoiceMode
    value?: string
    onSelect?: (id: string) => void
  }

  function Group({ mode = 'single', value = 'a', onSelect = () => {} }: GroupProps) {
    return (
      <ChoiceCardGroup label="Primary goal" mode={mode}>
        {['a', 'b', 'c'].map((id) => (
          <ChoiceCard
            key={id}
            title={`Option ${id}`}
            mode={mode}
            selected={value === id}
            onSelect={() => onSelect(id)}
          />
        ))}
      </ChoiceCardGroup>
    )
  }

  it('names a single-select set as a radiogroup', () => {
    render(<Group />)
    expect(screen.getByRole('radiogroup', { name: 'Primary goal' })).toBeInTheDocument()
  })

  it('names a multi-select set as a plain group', () => {
    render(<Group mode="multi" />)
    expect(screen.getByRole('group', { name: 'Primary goal' })).toBeInTheDocument()
  })

  it('keeps a single tab stop on the checked card', () => {
    render(<Group value="b" />)
    const [a, b, c] = screen.getAllByRole('radio')

    expect(a).toHaveAttribute('tabindex', '-1')
    expect(b).toHaveAttribute('tabindex', '0')
    expect(c).toHaveAttribute('tabindex', '-1')
  })

  it('falls back to the first card when nothing is checked yet', () => {
    render(<Group value="none" />)
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('tabindex', '0')
  })

  it('moves and selects with the arrow keys, wrapping at the end', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<Group value="c" onSelect={onSelect} />)
    const cards = screen.getAllByRole('radio')
    cards[2].focus()

    await user.keyboard('{ArrowRight}')
    expect(cards[0]).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith('a')

    await user.keyboard('{ArrowUp}')
    expect(cards[2]).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith('c')
  })

  it('jumps to the ends with Home and End', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<Group onSelect={onSelect} />)
    const cards = screen.getAllByRole('radio')
    cards[0].focus()

    await user.keyboard('{End}')
    expect(onSelect).toHaveBeenLastCalledWith('c')

    await user.keyboard('{Home}')
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })

  it('leaves multi-select groups on the normal tab order', async () => {
    const user = userEvent.setup()

    render(<Group mode="multi" value="none" />)
    await user.tab()
    expect(screen.getAllByRole('checkbox')[0]).toHaveFocus()

    await user.tab()
    expect(screen.getAllByRole('checkbox')[1]).toHaveFocus()
  })
})
