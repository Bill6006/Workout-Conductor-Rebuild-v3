import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseDetail } from './ExerciseDetail'
import { resetExerciseMediaCache } from './useExerciseMedia'
import { defineExercise, type Exercise, type ExerciseInput } from '../../catalog/exercises/exerciseSchema'

/**
 * The sheet is read mid-set, so the things worth asserting are the things a
 * tired person would be misled by: content that is not this exercise's, a
 * section heading with nothing under it, a still image that reads as a
 * demonstration, and a note that does not come back.
 *
 * The media manifest is reached through a real dynamic `import()`, so every
 * media assertion awaits it rather than mocking the module — a mocked manifest
 * would happily agree with a wrong `isPlaceholder` reading.
 */

const BASE: ExerciseInput = {
  id: 'barbell-bench-press',
  name: 'Barbell bench press',
  primaryMuscles: ['mid-chest'],
  secondaryMuscles: ['front-delt', 'triceps-long-head'],
  movementPattern: 'horizontal-push',
  trainingRole: 'primary-strength',
  strengthSuitability: 'excellent',
  hypertrophySuitability: 'good',
  equipment: ['barbell', 'flat-bench'],
  locationSuitability: ['gym'],
  setupTimeSeconds: 90,
  transitionCost: 'moderate',
  typicalRepRange: { min: 5, max: 8 },
  safeForDropSet: false,
  supersetCompatibility: {
    eligible: true,
    stationId: 'bench-station',
    gripHeavy: false,
    competingDemands: [],
  },
  unilateral: false,
  compoundOrIsolation: 'compound',
  stabilityDemand: 'moderate',
  gripDemand: 'low',
  jointStressTags: [
    { joint: 'shoulder', intensity: 'high' },
    { joint: 'elbow', intensity: 'low' },
  ],
  shoulderConsiderations: 'Keep the elbows under the wrists rather than flared to ninety degrees.',
  lowerBackConsiderations: 'Keep the ribs down if the arch starts doing the work.',
  instructionSteps: [
    'Set the bench so your eyes sit under the bar.',
    'Unrack with straight arms and bring the bar over the lower chest.',
    'Press back to over the shoulders.',
  ],
  commonMistakes: ['Bouncing the bar off the chest.', 'Letting the elbows flare wide.'],
  difficulty: 'intermediate',
  mediaId: 'barbell-bench-press',
  progressionFamily: 'horizontal-press-barbell',
  load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
  warmUpSuitability: 'specific-ramp',
}

function makeExercise(overrides: Partial<ExerciseInput> = {}): Exercise {
  return defineExercise({ ...BASE, ...overrides })
}

function renderSheet(overrides: Partial<ExerciseInput> = {}, onClose = () => {}) {
  const user = userEvent.setup()
  render(
    <ExerciseDetail
      open
      exercise={makeExercise(overrides)}
      onClose={onClose}
      note=""
      onNoteChange={() => {}}
    />,
  )
  return user
}

/** The note lives in the caller, exactly as it will in the session store. */
function NoteHarness({ initial = '', maxLength }: { initial?: string; maxLength?: number }) {
  const [note, setNote] = useState(initial)
  return (
    <ExerciseDetail
      open
      exercise={makeExercise()}
      onClose={() => {}}
      note={note}
      onNoteChange={setNote}
      noteMaxLength={maxLength}
    />
  )
}

/**
 * The manifest module is cached for the life of the process, so without this a
 * test's first paint would show an image or an empty frame depending on which
 * test ran before it. Every test here starts from a cold manifest.
 */
beforeEach(() => {
  resetExerciseMediaCache()
})

describe('ExerciseDetail', () => {
  it('renders nothing at all while closed', () => {
    render(
      <ExerciseDetail
        open={false}
        exercise={makeExercise()}
        onClose={() => {}}
        note=""
        onNoteChange={() => {}}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Barbell bench press')).not.toBeInTheDocument()
  })

  it('is a modal dialog named after the exercise', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Barbell bench press' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Horizontal push')
  })

  it('names muscles, equipment and difficulty in words rather than ids', () => {
    renderSheet()

    expect(screen.getByText('Mid chest')).toBeInTheDocument()
    expect(screen.getByText('Front delt, Triceps long head')).toBeInTheDocument()
    expect(screen.getByText('Barbell, Flat bench')).toBeInTheDocument()
    expect(screen.getByText('Intermediate')).toBeInTheDocument()
    expect(screen.queryByText(/mid-chest|flat-bench/)).not.toBeInTheDocument()
  })

  it('says so plainly when an exercise needs no equipment', () => {
    renderSheet({ equipment: [] })

    expect(screen.getByText('Nothing needed')).toBeInTheDocument()
  })

  it('leaves out the secondary muscles row when there are none', () => {
    renderSheet({ secondaryMuscles: [] })

    expect(screen.queryByText('Also works')).not.toBeInTheDocument()
    expect(screen.getByText('Works')).toBeInTheDocument()
  })

  it('lists the instruction steps as an ordered list, in the catalog order', () => {
    renderSheet()

    const section = screen.getByRole('heading', { name: 'How to do it' }).closest('section')
    const items = within(section as HTMLElement).getAllByRole('listitem')

    expect(items.map((item) => item.textContent)).toEqual(BASE.instructionSteps)
    expect(within(section as HTMLElement).getByRole('list').tagName).toBe('OL')
  })

  it('keeps every list announced as a list', () => {
    renderSheet()

    for (const list of document.querySelectorAll('ul, ol')) {
      expect(list).toHaveAttribute('role', 'list')
    }
  })

  it('lists the common mistakes', () => {
    renderSheet()

    expect(screen.getByRole('heading', { name: 'Common mistakes' })).toBeInTheDocument()
    expect(screen.getByText('Bouncing the bar off the chest.')).toBeInTheDocument()
    expect(screen.getByText('Letting the elbows flare wide.')).toBeInTheDocument()
  })

  it('drops the common mistakes section rather than heading an empty list', () => {
    renderSheet({ commonMistakes: [] })

    expect(screen.queryByRole('heading', { name: 'Common mistakes' })).not.toBeInTheDocument()
  })
})

describe('ExerciseDetail joint information', () => {
  it('shows the joint stress tags and only the considerations that exist', () => {
    renderSheet()

    expect(screen.getByRole('heading', { name: 'Joints' })).toBeInTheDocument()
    // Once as a stress tag, once as the heading of the shoulder advice.
    expect(screen.getAllByText('Shoulder')).toHaveLength(2)
    expect(screen.getByText('Heavy load')).toBeInTheDocument()
    expect(screen.getByText('Elbow')).toBeInTheDocument()
    expect(screen.getByText('Light load')).toBeInTheDocument()

    expect(
      screen.getByText('Keep the elbows under the wrists rather than flared to ninety degrees.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Keep the ribs down if the arch starts doing the work.')).toBeInTheDocument()
    // No knee advice on this exercise, so no empty "Knee" row.
    expect(screen.queryByText('Knee')).not.toBeInTheDocument()
  })

  it('drops the joints section when the exercise carries neither tags nor advice', () => {
    renderSheet({
      jointStressTags: [],
      shoulderConsiderations: '',
      kneeConsiderations: '',
      lowerBackConsiderations: '',
    })

    expect(screen.queryByRole('heading', { name: 'Joints' })).not.toBeInTheDocument()
  })

  it('treats whitespace-only advice as no advice', () => {
    renderSheet({ jointStressTags: [], shoulderConsiderations: '   ', lowerBackConsiderations: '' })

    expect(screen.queryByRole('heading', { name: 'Joints' })).not.toBeInTheDocument()
  })
})

describe('ExerciseDetail media', () => {
  it('shows the poster with an alt that does not claim to be a demonstration', async () => {
    renderSheet()

    const poster = await screen.findByRole('img')
    expect(poster.getAttribute('src')).toContain('media/posters/horizontal-push.png')
    expect(poster).toHaveAttribute('loading', 'lazy')
    expect(poster.getAttribute('alt')).toContain('does not show Barbell bench press')
  })

  it('says in words that a full demonstration is still to come', async () => {
    renderSheet()
    await screen.findByRole('img')

    expect(
      screen.getByText(
        'A stand-in picture, not a demonstration. A full demonstration of this exercise is still to come.',
      ),
    ).toBeInTheDocument()
  })

  it('never renders a video or a play control for media that does not exist', async () => {
    renderSheet()
    await screen.findByRole('img')

    expect(document.querySelector('video')).toBeNull()
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument()
  })

  it('reserves the media box before the poster resolves', async () => {
    renderSheet()

    // The frame is in the tree on the first paint, with no image inside it yet,
    // so nothing below it moves when the manifest and then the file arrive.
    expect(document.querySelector('figure')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How to do it' })).toBeInTheDocument()

    // Settle the pending import so the state update lands inside the test.
    await screen.findByRole('img')
  })
})

describe('ExerciseDetail note', () => {
  it('round-trips what is typed through onNoteChange', async () => {
    const user = userEvent.setup()
    render(<NoteHarness />)

    const field = screen.getByLabelText('Your note')
    await user.type(field, 'Seat 4')

    expect(field).toHaveValue('Seat 4')
  })

  it('reports the whole next value on every keystroke and stores nothing itself', async () => {
    const onNoteChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ExerciseDetail
        open
        exercise={makeExercise()}
        onClose={() => {}}
        note="Pin"
        onNoteChange={onNoteChange}
      />,
    )

    const field = screen.getByLabelText('Your note')
    expect(field).toHaveValue('Pin')

    await user.type(field, '5')

    expect(onNoteChange).toHaveBeenCalledWith('Pin5')
    // Uncontrolled writing would have kept the character; the caller owns it.
    expect(field).toHaveValue('Pin')
  })

  it('shows an existing note and explains what the field is for', () => {
    render(<NoteHarness initial="Cable at the lowest pin." />)

    expect(screen.getByLabelText('Your note')).toHaveValue('Cable at the lowest pin.')
    expect(screen.getByLabelText('Your note')).toHaveAccessibleDescription(/seat height/i)
  })

  it('warns before it silently stops accepting characters', async () => {
    const user = userEvent.setup()
    render(<NoteHarness maxLength={10} />)

    expect(screen.getByText('10 characters left')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Your note'), 'Pin 5')
    expect(screen.getByText('5 characters left')).toBeInTheDocument()
  })
})

describe('ExerciseDetail closing', () => {
  it('closes from the sheet close button', async () => {
    const onClose = vi.fn()
    const user = renderSheet({}, onClose)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes from the thumb-height Done control', async () => {
    const onClose = vi.fn()
    const user = renderSheet({}, onClose)

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = renderSheet({}, onClose)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
