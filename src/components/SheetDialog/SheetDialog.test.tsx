import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SheetDialog } from './SheetDialog'

function Harness({ description }: { description?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <SheetDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Discard changes?"
        description={description}
      >
        <p>Nothing on this device is deleted.</p>
        <button type="button">Confirm</button>
      </SheetDialog>
    </>
  )
}

async function openSheet() {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open sheet' }))
  return user
}

describe('SheetDialog', () => {
  it('renders nothing while closed', () => {
    render(
      <SheetDialog open={false} onClose={() => {}} title="Discard changes?">
        <p>Body</p>
      </SheetDialog>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its own title', async () => {
    await openSheet()
    const dialog = screen.getByRole('dialog', { name: 'Discard changes?' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('describes itself with the optional description', async () => {
    const user = userEvent.setup()
    render(<Harness description="This cannot be undone." />)
    await user.click(screen.getByRole('button', { name: 'Open sheet' }))

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('This cannot be undone.')
  })

  it('moves focus into the sheet when it opens', async () => {
    await openSheet()

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('honours an initial focus target', async () => {
    function WithInitialFocus() {
      const confirm = useRef<HTMLButtonElement>(null)
      return (
        <SheetDialog open onClose={() => {}} title="Import backup?" initialFocusRef={confirm}>
          <button type="button" ref={confirm}>
            Import
          </button>
        </SheetDialog>
      )
    }

    render(<WithInitialFocus />)

    expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const user = await openSheet()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on a backdrop tap', async () => {
    const user = await openSheet()
    await user.click(screen.getByTestId('sheet-backdrop'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes from the close button', async () => {
    const user = await openSheet()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not close when the sheet body itself is tapped', async () => {
    const user = await openSheet()
    await user.click(screen.getByText('Nothing on this device is deleted.'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('traps Tab at the last control', async () => {
    const user = await openSheet()
    const close = screen.getByRole('button', { name: 'Close' })
    const confirm = screen.getByRole('button', { name: 'Confirm' })

    confirm.focus()
    await user.tab()

    expect(close).toHaveFocus()
  })

  it('traps Shift+Tab at the first control', async () => {
    const user = await openSheet()
    const close = screen.getByRole('button', { name: 'Close' })
    const confirm = screen.getByRole('button', { name: 'Confirm' })

    close.focus()
    await user.tab({ shift: true })

    expect(confirm).toHaveFocus()
  })

  it('keeps Shift+Tab from escaping when focus is still on the sheet itself', async () => {
    const user = await openSheet()
    await user.tab({ shift: true })

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  })

  it('keeps focus inside a sheet that has nothing focusable but its own close button', async () => {
    const user = userEvent.setup()
    render(
      <SheetDialog open onClose={() => {}} title="Working">
        <p>Reading the file.</p>
      </SheetDialog>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('restores focus to the opener when it closes', async () => {
    const user = await openSheet()
    const opener = screen.getByRole('button', { name: 'Open sheet' })

    await user.keyboard('{Escape}')

    expect(opener).toHaveFocus()
  })

  it('locks background scrolling while open and releases it on close', async () => {
    const user = await openSheet()
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })

  it('releases the scroll lock even if it unmounts while open', () => {
    const { unmount } = render(
      <SheetDialog open onClose={() => {}} title="Discard changes?">
        <p>Body</p>
      </SheetDialog>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('renders the footer actions', () => {
    const onClose = vi.fn()
    render(
      <SheetDialog
        open
        onClose={onClose}
        title="Import backup?"
        footer={
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        }
      >
        <p>Body</p>
      </SheetDialog>,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
