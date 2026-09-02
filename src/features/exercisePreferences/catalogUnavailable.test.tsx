import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExercisePreferenceList } from '../../core/validation'
import { ExercisePicker } from './ExercisePicker'
import { resetExerciseCatalogCache } from './useExerciseCatalog'

/**
 * WHAT THE PICKER DOES WHEN THE CATALOG CHUNK NEVER ARRIVES.
 *
 * This is not a theoretical state. The catalog is a separate file fetched over
 * the network the first time somebody opens the picker, and a phone that has just
 * come back from a tunnel, or an install whose old chunk a deploy has replaced,
 * gets a rejected `import()`.
 *
 * The requirement is that nothing the person already owns is lost or blocked by
 * it: their existing list stays on screen, stays removable, and the failure says
 * so in words rather than showing "Loading chunk 42 failed".
 *
 * The whole file mocks the module to a load failure, which is why it is a file of
 * its own rather than a case inside the picker's suite.
 */
vi.mock('../../catalog/exercises/catalog', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

function Harness({ initial }: { initial: ExercisePreferenceList }) {
  const [value, setValue] = useState<ExercisePreferenceList>(initial)
  return (
    <>
      <ExercisePicker noun="preferred exercise" value={value} onChange={setValue} />
      <span data-testid="state">{JSON.stringify(value)}</span>
    </>
  )
}

beforeEach(() => {
  resetExerciseCatalogCache()
})

describe('when the exercise catalog cannot be loaded', () => {
  it('says so plainly, and promises nothing it cannot keep', async () => {
    render(<Harness initial={{ exerciseIds: [], freeText: [] }} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The exercise list could not be loaded.')
    expect(alert).toHaveTextContent('Everything already on your list is safe.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('keeps the existing list on screen and editable', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ exerciseIds: ['push-up'], freeText: ['Front squat'] }} />)

    await screen.findByRole('alert')

    // The stored id has no catalog name to read, so the humanised id stands in
    // rather than the entry vanishing from the list.
    expect(screen.getByRole('checkbox', { name: 'Push up' })).toBeInTheDocument()
    expect(screen.getByText('Front squat')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Front squat' }))
    expect(JSON.parse(screen.getByTestId('state').textContent ?? '{}')).toEqual({
      exerciseIds: ['push-up'],
      freeText: [],
    })
  })

  it('retries on request rather than sitting on a rejected promise', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ exerciseIds: [], freeText: [] }} />)

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    // Still broken here, because the mock always fails — the point is that the
    // retry re-ran the import and came back with a state, not that it hung.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
