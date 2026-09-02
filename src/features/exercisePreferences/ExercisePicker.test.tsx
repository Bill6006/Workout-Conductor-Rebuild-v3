import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ExercisePreferenceList } from '../../core/validation'
import { ExercisePicker } from './ExercisePicker'
import { resetExerciseCatalogCache } from './useExerciseCatalog'

/**
 * The picker is the only place a preference is chosen, so these tests are written
 * from the two things it must never do: lose what somebody typed, and guess an
 * exercise on their behalf.
 */

function Harness({ initial }: { initial?: ExercisePreferenceList }) {
  const [value, setValue] = useState<ExercisePreferenceList>(initial ?? { exerciseIds: [], freeText: [] })
  return (
    <>
      <ExercisePicker noun="preferred exercise" value={value} onChange={setValue} />
      {/* Not an <output>: that carries an implicit `status` role and would
          collide with the picker's own live region in a byRole query. */}
      <span data-testid="state">{JSON.stringify(value)}</span>
    </>
  )
}

function stored(): ExercisePreferenceList {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}') as ExercisePreferenceList
}

/** Waits for the lazily imported catalog to arrive. */
async function search() {
  return screen.findByRole('searchbox', { name: 'Search exercises' })
}

async function readyPicker(initial?: ExercisePreferenceList) {
  const user = userEvent.setup()
  render(<Harness initial={initial} />)
  await search()
  // The muscle filter only renders once the catalog is in hand.
  await screen.findByRole('checkbox', { name: 'Chest' })
  return user
}

beforeEach(() => {
  resetExerciseCatalogCache()
})

describe('ExercisePicker', () => {
  it('says it is loading, then shows the catalog without blocking the sheet', async () => {
    render(<Harness />)

    // The search field is usable before the catalog lands — nothing about it
    // needs the data, so nothing about it waits for the data.
    expect(screen.getByRole('searchbox', { name: 'Search exercises' })).toBeInTheDocument()
    expect(screen.getByText('Loading the exercise list…')).toBeInTheDocument()

    expect(await screen.findByRole('button', { name: /^Barbell bench press/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading the exercise list…')).not.toBeInTheDocument())
  })

  it('finds an exercise by name and by alias', async () => {
    const user = await readyPicker()

    await user.type(await search(), 'bench press')
    expect(screen.getByRole('button', { name: /^Barbell bench press/ })).toBeInTheDocument()

    await user.clear(await search())
    await user.type(await search(), 'chin up')
    expect(await screen.findByRole('button', { name: /^Chin-up/ })).toBeInTheDocument()
  })

  it('shows enough to tell two similar exercises apart', async () => {
    await readyPicker()

    // Name, the muscle group it trains, and what it needs — the three facts that
    // separate a barbell bench press from a machine chest press in a long list.
    const row = await screen.findByRole('button', { name: /^Barbell bench press/ })
    expect(row).toHaveTextContent('Chest')
    expect(row).toHaveTextContent('Barbell')
  })

  it('filters by muscle group', async () => {
    const user = await readyPicker()

    await user.click(screen.getByRole('checkbox', { name: 'Calves' }))

    expect(await screen.findByRole('button', { name: /^Standing calf raise/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Barbell bench press/ })).not.toBeInTheDocument()
  })

  it('adds and removes a catalog exercise, and reports its state', async () => {
    const user = await readyPicker()

    const pushUp = await screen.findByRole('button', { name: /^Push-up/ })
    expect(pushUp).toHaveAttribute('aria-pressed', 'false')

    await user.click(pushUp)
    expect(stored()).toEqual({ exerciseIds: ['push-up'], freeText: [] })
    expect(screen.getByRole('button', { name: /^Push-up/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: /^Push-up/ }))
    expect(stored()).toEqual({ exerciseIds: [], freeText: [] })
  })

  it('offers to keep words the catalog cannot match', async () => {
    const user = await readyPicker()

    await user.type(await search(), 'crab thing')
    await user.click(await screen.findByRole('button', { name: /Keep .* in your own words/ }))

    expect(stored()).toEqual({ exerciseIds: [], freeText: ['crab thing'] })
  })

  it('does not offer to keep words that name a real exercise', async () => {
    // Keeping "Barbell row" as free text when `barbell-row` exists would throw
    // away the match on the person's behalf.
    const user = await readyPicker()

    await user.type(await search(), 'barbell row')

    expect(await screen.findByRole('button', { name: /^Barbell row/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /in your own words/ })).not.toBeInTheDocument()
  })

  it('keeps carried-over free text visible and removable', async () => {
    const user = await readyPicker({ exerciseIds: [], freeText: ['whatever my coach calls it'] })

    expect(screen.getByText('whatever my coach calls it')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove whatever my coach calls it' }))
    expect(stored()).toEqual({ exerciseIds: [], freeText: [] })
  })

  it('swaps one free-text entry for a catalog exercise and leaves the others alone', async () => {
    const user = await readyPicker({
      exerciseIds: [],
      freeText: ['Front squat', 'whatever my coach calls it'],
    })

    await user.click(screen.getByRole('button', { name: 'Find a match for Front squat' }))
    // The search is pre-filled with their words, so the match is one tap away.
    expect(await search()).toHaveValue('Front squat')

    await user.click(await screen.findByRole('button', { name: /^Barbell front squat/ }))

    expect(stored()).toEqual({
      exerciseIds: ['barbell-front-squat'],
      freeText: ['whatever my coach calls it'],
    })
  })

  it('abandons a replacement without touching the entry', async () => {
    const user = await readyPicker({ exerciseIds: [], freeText: ['Front squat'] })

    await user.click(screen.getByRole('button', { name: 'Find a match for Front squat' }))
    await user.click(screen.getByRole('button', { name: 'Keep my words' }))

    expect(stored()).toEqual({ exerciseIds: [], freeText: ['Front squat'] })
    expect(await search()).toHaveValue('')
  })

  it('refuses to grow past the limit, and says why', async () => {
    const many = Array.from({ length: 40 }, (_, index) => `entry ${index}`)
    const user = await readyPicker({ exerciseIds: [], freeText: many })

    await user.click(await screen.findByRole('button', { name: /^Push-up/ }))

    expect(stored().exerciseIds).toEqual([])
    expect(screen.getByRole('status')).toHaveTextContent('That is the limit of 40.')
  })

  it('still replaces a free-text entry when the list is already full', async () => {
    // A swap does not grow the list, so blocking it would strand the very entry
    // the person is trying to tidy up.
    const many = Array.from({ length: 39 }, (_, index) => `entry ${index}`)
    const user = await readyPicker({ exerciseIds: [], freeText: [...many, 'Front squat'] })

    await user.click(screen.getByRole('button', { name: 'Find a match for Front squat' }))
    await user.click(await screen.findByRole('button', { name: /^Barbell front squat/ }))

    expect(stored().exerciseIds).toEqual(['barbell-front-squat'])
    expect(stored().freeText).toEqual(many)
  })

  it('renders a stored id the catalog does not ship, rather than dropping it', async () => {
    await readyPicker({ exerciseIds: ['custom:my-machine'], freeText: [] })

    expect(await screen.findByRole('checkbox', { name: 'My machine' })).toBeInTheDocument()
  })

  it('marks every list it renders as a list', async () => {
    await readyPicker({ exerciseIds: [], freeText: ['Front squat'] })

    for (const list of await screen.findAllByRole('list')) {
      expect(list.tagName).toBe('UL')
    }
  })
})
