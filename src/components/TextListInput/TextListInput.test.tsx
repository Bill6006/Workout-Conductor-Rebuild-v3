import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextListInput } from './TextListInput'

function Controlled({ start = [] as string[], maxEntries = 20 }) {
  const [value, setValue] = useState(start)
  return (
    <TextListInput label="Preferred exercises" value={value} onChange={setValue} maxEntries={maxEntries} />
  )
}

describe('TextListInput', () => {
  it('adds an entry from the Add button', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.type(screen.getByRole('textbox', { name: 'Preferred exercises' }), 'Goblet squat')
    await user.click(screen.getByRole('button', { name: 'Add Preferred exercises' }))

    expect(screen.getByRole('listitem')).toHaveTextContent('Goblet squat')
  })

  it('adds an entry from the Enter key and clears the field', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('textbox', { name: 'Preferred exercises' })

    await user.type(field, 'Row{Enter}')

    expect(screen.getByRole('listitem')).toHaveTextContent('Row')
    expect(field).toHaveValue('')
  })

  it('renders the entries as a list that keeps its semantics', () => {
    render(<TextListInput label="Preferred exercises" value={['Row', 'Press']} onChange={() => {}} />)

    expect(screen.getByRole('list')).toHaveAttribute('role', 'list')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('names every remove button after its own entry', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TextListInput label="Preferred exercises" value={['Row', 'Press']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Remove Press' }))

    expect(onChange).toHaveBeenCalledWith(['Row'])
  })

  it('moves focus to the next entry when one is removed', async () => {
    const user = userEvent.setup()
    render(<Controlled start={['Row', 'Press', 'Curl']} />)

    await user.click(screen.getByRole('button', { name: 'Remove Press' }))

    // Not `<body>`: a keyboard user keeps their place in the list.
    expect(screen.getByRole('button', { name: 'Remove Curl' })).toHaveFocus()
  })

  it('falls back to the entry above when the last one is removed', async () => {
    const user = userEvent.setup()
    render(<Controlled start={['Row', 'Press']} />)

    await user.click(screen.getByRole('button', { name: 'Remove Press' }))

    expect(screen.getByRole('button', { name: 'Remove Row' })).toHaveFocus()
  })

  it('returns focus to the field when the list empties', async () => {
    const user = userEvent.setup()
    render(<Controlled start={['Row']} />)

    await user.click(screen.getByRole('button', { name: 'Remove Row' }))

    expect(screen.getByRole('textbox', { name: 'Preferred exercises' })).toHaveFocus()
  })

  it('announces a removal politely', async () => {
    const user = userEvent.setup()
    render(<Controlled start={['Row', 'Press']} />)

    await user.click(screen.getByRole('button', { name: 'Remove Press' }))

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Press removed.')
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('rejects an empty entry', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.type(screen.getByRole('textbox', { name: 'Preferred exercises' }), '   {Enter}')

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Type something to add.')
  })

  it('rejects a duplicate regardless of case', async () => {
    const user = userEvent.setup()
    render(<Controlled start={['Row']} />)

    await user.type(screen.getByRole('textbox', { name: 'Preferred exercises' }), 'row{Enter}')

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('row is already on the list.')
  })

  it('collapses stray whitespace so " Back  squat " is one tidy entry', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.type(screen.getByRole('textbox', { name: 'Preferred exercises' }), '  Back  squat  {Enter}')

    expect(screen.getByRole('listitem')).toHaveTextContent('Back squat')
  })

  it('stops at the entry cap and says why', async () => {
    const user = userEvent.setup()
    render(<Controlled start={['Row']} maxEntries={1} />)

    await user.type(screen.getByRole('textbox', { name: 'Preferred exercises' }), 'Press{Enter}')

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('That is the limit of 1. Remove one first.')
  })

  it('caps the length of a single entry', () => {
    render(<TextListInput label="Preferred exercises" value={[]} onChange={() => {}} maxLength={12} />)

    expect(screen.getByRole('textbox', { name: 'Preferred exercises' })).toHaveAttribute('maxlength', '12')
  })

  it('shows the empty hint until there is something on the list', () => {
    const { rerender } = render(
      <TextListInput label="Preferred exercises" value={[]} onChange={() => {}} emptyHint="Nothing yet." />,
    )
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()

    rerender(
      <TextListInput
        label="Preferred exercises"
        value={['Row']}
        onChange={() => {}}
        emptyHint="Nothing yet."
      />,
    )
    expect(screen.queryByText('Nothing yet.')).not.toBeInTheDocument()
  })

  it('marks the disabled state across the whole control and fires nothing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TextListInput label="Preferred exercises" value={['Row']} onChange={onChange} disabled />)
    const remove = screen.getByRole('button', { name: 'Remove Row' })
    await user.click(remove)

    expect(screen.getByRole('textbox', { name: 'Preferred exercises' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Preferred exercises' })).toBeDisabled()
    expect(remove).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('can take its name from a FormField label instead', () => {
    render(
      <>
        <span id="likes-label">Preferred exercises</span>
        <TextListInput
          label="Preferred exercises"
          value={[]}
          onChange={() => {}}
          aria-labelledby="likes-label"
        />
      </>,
    )

    expect(screen.getByRole('textbox', { name: 'Preferred exercises' })).not.toHaveAttribute('aria-label')
  })
})
