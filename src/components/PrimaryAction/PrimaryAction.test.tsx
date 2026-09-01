import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrimaryAction } from './PrimaryAction'

describe('PrimaryAction', () => {
  it('renders a type="button" so it never submits a surrounding form by accident', () => {
    render(<PrimaryAction>Start Workout</PrimaryAction>)
    expect(screen.getByRole('button', { name: 'Start Workout' })).toHaveAttribute('type', 'button')
  })

  it('honours an explicit type', () => {
    render(<PrimaryAction type="submit">Save</PrimaryAction>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit')
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<PrimaryAction onClick={onClick}>Update</PrimaryAction>)
    await user.click(screen.getByRole('button', { name: 'Update' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is enabled and free of aria-disabled by default', () => {
    render(<PrimaryAction>Update</PrimaryAction>)
    const button = screen.getByRole('button', { name: 'Update' })

    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('marks the disabled state for both sighted users and assistive technology', () => {
    render(<PrimaryAction disabled>Start Workout</PrimaryAction>)
    const button = screen.getByRole('button', { name: 'Start Workout' })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(
      <PrimaryAction disabled onClick={onClick}>
        Start Workout
      </PrimaryAction>,
    )
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies a different class per variant and keeps a caller class', () => {
    const { container: primary } = render(<PrimaryAction>Go</PrimaryAction>)
    const { container: ghost } = render(<PrimaryAction variant="ghost">Go</PrimaryAction>)

    const classOf = (root: HTMLElement) => root.querySelector('button')?.className ?? ''
    expect(classOf(primary)).not.toBe(classOf(ghost))

    render(<PrimaryAction className="caller-class">Go</PrimaryAction>)
    expect(screen.getAllByRole('button', { name: 'Go' }).at(-1)).toHaveClass('caller-class')
  })

  it('forwards arbitrary button attributes', () => {
    render(
      <PrimaryAction id="cta" aria-label="Start today's workout">
        Start
      </PrimaryAction>,
    )
    const button = screen.getByRole('button', { name: "Start today's workout" })

    expect(button).toHaveAttribute('id', 'cta')
  })
})
