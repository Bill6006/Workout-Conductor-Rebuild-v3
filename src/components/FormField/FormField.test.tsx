import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormField } from './FormField'

describe('FormField', () => {
  it('wires the label to the control through the render prop id', () => {
    render(<FormField label="Body weight">{(field) => <input id={field.id} type="text" />}</FormField>)

    expect(screen.getByLabelText('Body weight')).toHaveAttribute('type', 'text')
  })

  it('describes the control with the hint', () => {
    render(
      <FormField label="Body weight" hint="Used for load estimates">
        {(field) => <input id={field.id} aria-describedby={field.describedBy} />}
      </FormField>,
    )

    expect(screen.getByLabelText('Body weight')).toHaveAccessibleDescription('Used for load estimates')
  })

  it('describes the control with both the hint and the error, hint first', () => {
    render(
      <FormField label="Body weight" hint="Used for load estimates" error="Enter a number">
        {(field) => <input id={field.id} aria-describedby={field.describedBy} />}
      </FormField>,
    )

    expect(screen.getByLabelText('Body weight')).toHaveAccessibleDescription(
      'Used for load estimates Enter a number',
    )
  })

  it('leaves describedBy undefined when there is no hint and no error', () => {
    let seen: string | undefined = 'unset'
    render(
      <FormField label="Body weight">
        {(field) => {
          seen = field.describedBy
          return <input id={field.id} />
        }}
      </FormField>,
    )

    expect(seen).toBeUndefined()
    expect(screen.getByLabelText('Body weight')).not.toHaveAttribute('aria-describedby')
  })

  it('announces the error and flags the control invalid', () => {
    render(
      <FormField label="Body weight" error="Enter a number">
        {(field) => <input id={field.id} aria-invalid={field.invalid || undefined} />}
      </FormField>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number')
    expect(screen.getByLabelText('Body weight')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders no label element in group mode, so composite controls own their own role', () => {
    const { container } = render(
      <FormField label="Training days" as="group">
        {(field) => (
          <div role="group" aria-labelledby={field.labelId}>
            <button type="button">Mon</button>
          </div>
        )}
      </FormField>,
    )

    expect(container.querySelector('label')).toBeNull()
    expect(screen.getByRole('group', { name: 'Training days' })).toBeInTheDocument()
  })

  it('accepts plain children as well as a render function', () => {
    render(
      <FormField label="Notes">
        <p>Static content</p>
      </FormField>,
    )

    expect(screen.getByText('Static content')).toBeInTheDocument()
  })

  it('uses a caller-supplied id instead of a generated one', () => {
    render(
      <FormField label="Body weight" id="weight">
        {(field) => <input id={field.id} />}
      </FormField>,
    )

    expect(screen.getByLabelText('Body weight')).toHaveAttribute('id', 'weight')
  })
})
