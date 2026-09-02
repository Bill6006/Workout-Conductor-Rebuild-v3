import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetExerciseCatalogCache } from '../exercisePreferences'
import { LimitsStep } from './LimitsStep'
import { createDefaultAnswers, type OnboardingAnswers } from './answers'

/**
 * Setup's preference step, driven the way the flow drives it: a controlled
 * `answers` object and a patching `onChange`.
 *
 * The step is where somebody first says what they like and what they would
 * rather skip, so what it must get right is that an id is only ever written by a
 * person tapping the exercise it names — never inferred from what they typed.
 */

const NOW = '2026-09-01T12:00:00.000Z'

function Harness({ initial }: { initial?: Partial<OnboardingAnswers> } = {}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>({ ...createDefaultAnswers(NOW), ...initial })
  return (
    <>
      <LimitsStep
        answers={answers}
        issues={[]}
        onChange={(patch) => setAnswers((current) => ({ ...current, ...patch }))}
      />
      <span data-testid="state">{JSON.stringify(answers.exercisePreferences)}</span>
    </>
  )
}

function preferences() {
  return JSON.parse(
    screen.getByTestId('state').textContent ?? '{}',
  ) as OnboardingAnswers['exercisePreferences']
}

beforeEach(() => {
  resetExerciseCatalogCache()
})

describe('LimitsStep', () => {
  it('shows both preference lists as empty without loading the catalog', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'Choose liked exercises' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose skipped exercises' })).toBeInTheDocument()
    // The step renders on arrival; the exercise list is not part of that render.
    expect(screen.queryByRole('searchbox', { name: 'Search exercises' })).not.toBeInTheDocument()
  })

  it('records a chosen exercise as an id, through the picker', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Choose liked exercises' }))
    const sheet = await screen.findByRole('dialog', { name: 'Exercises you like' })
    await user.type(await screen.findByRole('searchbox', { name: 'Search exercises' }), 'front squat')
    await user.click(await screen.findByRole('button', { name: /^Barbell front squat/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    expect(preferences().preferred).toEqual({ exerciseIds: ['barbell-front-squat'], freeText: [] })
    expect(preferences().disliked).toEqual({ exerciseIds: [], freeText: [] })
    // The summary names it rather than showing the raw id.
    expect(screen.getByText('Barbell front squat')).toBeInTheDocument()
  })

  it('keeps a person their own words when nothing matches, and marks them as such', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Choose skipped exercises' }))
    const sheet = await screen.findByRole('dialog', { name: 'Exercises you would rather skip' })
    await user.type(await screen.findByRole('searchbox', { name: 'Search exercises' }), 'the wobbly one')
    await user.click(await screen.findByRole('button', { name: /in your own words/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    expect(preferences().disliked).toEqual({ exerciseIds: [], freeText: ['the wobbly one'] })
    expect(screen.getByText('the wobbly one')).toBeInTheDocument()
    expect(screen.getAllByText('your words')).toHaveLength(1)
  })

  it('leaves the other side alone when one is edited', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={{
          exercisePreferences: {
            preferred: { exerciseIds: [], freeText: ['already here'] },
            disliked: { exerciseIds: [], freeText: [] },
          },
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Choose skipped exercises' }))
    await user.type(await screen.findByRole('searchbox', { name: 'Search exercises' }), 'push up')
    await user.click(await screen.findByRole('button', { name: /^Push-up/ }))

    expect(preferences().preferred).toEqual({ exerciseIds: [], freeText: ['already here'] })
    expect(preferences().disliked).toEqual({ exerciseIds: ['push-up'], freeText: [] })
  })

  it('still collects the injury flags and the note', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('switch', { name: /Knee trouble/ }))
    expect(screen.getByRole('switch', { name: /Knee trouble/ })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument()
  })
})
