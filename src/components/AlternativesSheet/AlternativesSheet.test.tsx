import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlternativesSheet, type AlternativePosterRef } from './AlternativesSheet'
import { equipmentSummary, formatDuration, posterUrl, progressionFlag, supersetFlag } from './copy'
import { defineExercise } from '../../catalog/exercises/exerciseSchema'
import type { NoAlternatives, RankedAlternative, RankedAlternatives } from '../../engine/alternatives'

/*
 * The fixtures are typed as the ENGINE's own types, so this suite fails to
 * compile the day the ranker adds or renames a field the sheet is supposed to
 * render — which is the point: this component's contract is "show what the
 * ranker returned", and a test built from a hand-rolled shape could not tell.
 *
 * They are written here rather than imported from `engine/alternatives/testFixtures`,
 * which says in its own header that nothing outside that module's tests may use it.
 */

const CURRENT = defineExercise({
  id: 'barbell-bench-press',
  name: 'Barbell bench press',
  primaryMuscles: ['mid-chest'],
  movementPattern: 'horizontal-push',
  trainingRole: 'primary-strength',
  strengthSuitability: 'excellent',
  hypertrophySuitability: 'good',
  equipment: ['barbell', 'flat-bench'],
  locationSuitability: ['gym'],
  setupTimeSeconds: 90,
  transitionCost: 'high',
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
  instructionSteps: ['Set up under the bar.', 'Press to lockout.'],
  difficulty: 'intermediate',
  mediaId: 'barbell-bench-press',
  progressionFamily: 'horizontal-press-barbell',
  load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
  warmUpSuitability: 'specific-ramp',
})

function alternative(overrides: Partial<RankedAlternative> = {}): RankedAlternative {
  return {
    exerciseId: 'dumbbell-bench-press',
    name: 'Dumbbell bench press',
    matchScore: 92,
    matchQuality: 'excellent',
    primaryReason: {
      code: 'same-primary-muscle',
      text: 'Trains the same chest muscles as the bench press.',
      factor: 'primary-muscle',
      strength: 0.94,
    },
    supportingReasons: [],
    keyDifference: {
      code: 'different-equipment',
      text: 'Two dumbbells instead of a bar, so the load is per hand.',
      magnitude: 'notable',
    },
    differences: [],
    equipment: ['dumbbells', 'flat-bench'],
    optionalEquipment: [],
    setupTimeSeconds: 45,
    estimatedSlotSeconds: 380,
    progression: {
      preservesHistory: true,
      currentFamily: 'horizontal-press-barbell',
      candidateFamily: 'horizontal-press-barbell',
      text: 'Your working load and streak carry across.',
    },
    superset: {
      effect: 'not-in-superset',
      partnerSlotId: null,
      partnerExerciseId: null,
      stationClash: false,
      sharedDemands: [],
      text: 'This slot is not part of a superset.',
    },
    warnings: [],
    factors: [],
    summary: 'Same chest muscles; two dumbbells instead of a bar.',
    ...overrides,
  }
}

const SECOND = alternative({
  exerciseId: 'machine-chest-press',
  name: 'Machine chest press',
  matchScore: 74,
  matchQuality: 'strong',
  primaryReason: {
    code: 'quicker-setup',
    text: 'Nothing to load, so you are pressing sooner.',
    factor: 'setup-time',
    strength: 0.6,
  },
  keyDifference: {
    code: 'stability-change',
    text: 'The machine holds the path for you.',
    magnitude: 'major',
  },
  equipment: ['selectorised-machines'],
  setupTimeSeconds: 20,
  estimatedSlotSeconds: 300,
  progression: {
    preservesHistory: false,
    currentFamily: 'horizontal-press-barbell',
    candidateFamily: 'chest-press-machine',
    text: 'This is a different progression family, so the load starts fresh.',
  },
  superset: {
    effect: 'broken',
    partnerSlotId: 'b',
    partnerExerciseId: 'barbell-row',
    stationClash: true,
    sharedDemands: ['grip'],
    text: 'You cannot hold the row station and the press station at once.',
  },
  warnings: ['Shoulder flag: keep the seat high.'],
})

function ranked(
  alternatives: readonly [RankedAlternative, ...RankedAlternative[]] = [alternative(), SECOND],
): RankedAlternatives {
  return {
    outcome: 'ranked',
    currentExerciseId: CURRENT.id,
    currentExerciseName: CURRENT.name,
    considered: 127,
    excluded: [],
    conflictSource: 'engine',
    alternatives,
  }
}

const NONE: NoAlternatives = {
  outcome: 'none',
  currentExerciseId: CURRENT.id,
  currentExerciseName: CURRENT.name,
  considered: 127,
  excluded: [
    {
      exerciseId: 'dumbbell-bench-press',
      name: 'Dumbbell bench press',
      code: 'equipment-unavailable',
      text: 'Needs dumbbells, which this location does not have.',
      missingEquipment: ['dumbbells'],
      availableAt: [],
      conflictKind: null,
    },
    {
      exerciseId: 'push-up',
      name: 'Push-up',
      code: 'limitation-contraindicated',
      text: 'Ruled out by your wrist limitation.',
      missingEquipment: [],
      availableAt: [],
      conflictKind: null,
    },
    {
      exerciseId: 'cable-fly',
      name: 'Cable fly',
      code: 'equipment-unavailable',
      text: 'Needs a cable machine, which this location does not have.',
      missingEquipment: ['cable-machine'],
      availableAt: [],
      conflictKind: null,
    },
    {
      exerciseId: 'machine-chest-press',
      name: 'Machine chest press',
      code: 'equipment-unavailable',
      text: 'Needs a chest press machine, which this location does not have.',
      missingEquipment: ['selectorised-machines'],
      availableAt: [],
      conflictKind: null,
    },
    {
      exerciseId: 'incline-dumbbell-press',
      name: 'Incline dumbbell press',
      code: 'equipment-unavailable',
      text: 'Needs dumbbells, which this location does not have.',
      missingEquipment: ['dumbbells'],
      availableAt: [],
      conflictKind: null,
    },
  ],
  conflictSource: 'engine',
  reason: 'equipment-unavailable',
  message: 'Every option needs equipment this location does not have.',
  alternatives: [],
}

function renderSheet(props: Partial<Parameters<typeof AlternativesSheet>[0]> = {}) {
  const onChoose = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup()

  render(
    <AlternativesSheet
      open
      onClose={onClose}
      currentExercise={CURRENT}
      result={ranked()}
      onChoose={onChoose}
      {...props}
    />,
  )

  return { onChoose, onClose, user }
}

/** Every row that offers a swap — the best one and the list rows alike. */
function optionRows(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /percent match/ })
}

describe('AlternativesSheet — dialog semantics', () => {
  it('renders nothing while closed', () => {
    renderSheet({ open: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named after the exercise being swapped', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Swap Barbell bench press' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/2 options, best first\. Tap one to swap it in\./)
  })

  it('closes without choosing anything', async () => {
    const { onChoose, onClose, user } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Keep this exercise' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onChoose).not.toHaveBeenCalled()
  })
})

describe('AlternativesSheet — a ranked alternative', () => {
  it('shows every field the plan requires of an alternative', () => {
    renderSheet()
    const row = screen.getByRole('button', { name: /Dumbbell bench press/ })

    // Name and score are the row's accessible name; the rest is its description,
    // so the whole case for a swap is announced without flattening into one blur.
    expect(row).toHaveAccessibleName(/Dumbbell bench press/)
    expect(row).toHaveAccessibleName(/92 percent match/)
    expect(within(row).getByText('92')).toBeInTheDocument()
    expect(within(row).getByText('% match')).toBeInTheDocument()
    expect(within(row).getByText('Excellent match')).toBeInTheDocument()
    expect(within(row).getByText('Trains the same chest muscles as the bench press.')).toBeInTheDocument()
    expect(
      within(row).getByText('Difference: Two dumbbells instead of a bar, so the load is per hand.'),
    ).toBeInTheDocument()
    expect(within(row).getByText('Dumbbells, Flat bench')).toBeInTheDocument()
    expect(within(row).getByText(/Setup 45s/)).toBeInTheDocument()
    expect(within(row).getByText(/about 6 min 20s in the session/)).toBeInTheDocument()
    expect(row).toHaveAccessibleDescription(/Trains the same chest muscles/)
  })

  it('leads a major difference with its magnitude', () => {
    renderSheet()
    const row = screen.getByRole('button', { name: /Machine chest press/ })

    expect(within(row).getByText('Big difference: The machine holds the path for you.')).toBeInTheDocument()
  })

  it('says so plainly when nothing material differs', () => {
    renderSheet({ result: ranked([alternative({ keyDifference: null })]) })

    expect(screen.getByText('Nothing material feels different.')).toBeInTheDocument()
  })

  it('shows the progression and superset flags', () => {
    renderSheet()
    const keeps = screen.getByRole('button', { name: /Dumbbell bench press/ })
    const breaks = screen.getByRole('button', { name: /Machine chest press/ })

    expect(within(keeps).getByText('Keeps your progression')).toBeInTheDocument()
    // Not in a superset: there is no pairing to report on, so no chip is invented.
    expect(within(keeps).queryByText(/superset/i)).not.toBeInTheDocument()

    expect(within(breaks).getByText('Progression starts over')).toBeInTheDocument()
    expect(within(breaks).getByText('Breaks the superset')).toBeInTheDocument()
    // A broken pairing gets the engine's own sentence, not just a chip.
    expect(
      within(breaks).getByText('You cannot hold the row station and the press station at once.'),
    ).toBeInTheDocument()
  })

  it('shows the ranker warnings rather than hiding them', () => {
    renderSheet()
    const row = screen.getByRole('button', { name: /Machine chest press/ })

    expect(within(row).getByText('Shoulder flag: keep the seat high.')).toBeInTheDocument()
  })
})

describe('AlternativesSheet — the strongest match', () => {
  it('badges the top alternative rather than only listing it first', () => {
    renderSheet()
    const rows = optionRows()

    expect(rows[0]).toHaveAccessibleName(/Best match/)
    expect(rows[0]).toHaveAccessibleName(/Dumbbell bench press/)
    expect(rows[1]).not.toHaveAccessibleName(/Best match/)
    expect(screen.getByRole('heading', { name: 'Best match' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other options' })).toBeInTheDocument()
  })

  it('drops the "other options" group when the ranker returned only one', () => {
    renderSheet({ result: ranked([alternative()]) })

    expect(screen.queryByRole('heading', { name: 'Other options' })).not.toBeInTheDocument()
    expect(optionRows()).toHaveLength(1)
  })
})

describe('AlternativesSheet — one tap chooses', () => {
  it('fires onChoose with the id of the row that was tapped', async () => {
    const { onChoose, user } = renderSheet()
    await user.click(screen.getByRole('button', { name: /Machine chest press/ }))

    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose).toHaveBeenCalledWith('machine-chest-press')
  })

  it('fires onChoose for the best match too', async () => {
    const { onChoose, user } = renderSheet()
    await user.click(optionRows()[0])

    expect(onChoose).toHaveBeenCalledWith('dumbbell-bench-press')
  })

  it('leaves the sheet alone: choosing is not closing', async () => {
    const { onClose, user } = renderSheet()
    await user.click(optionRows()[0])

    expect(onClose).not.toHaveBeenCalled()
  })

  it('puts no second button inside a row — the row is the target', () => {
    renderSheet()

    for (const row of optionRows()) {
      expect(within(row).queryAllByRole('button')).toHaveLength(0)
    }
  })

  it('stops taking taps while a swap is being applied', async () => {
    const { onChoose, user } = renderSheet({ busy: true })
    const row = optionRows()[0]

    expect(row).toBeDisabled()
    await user.click(row)
    expect(onChoose).not.toHaveBeenCalled()
  })
})

describe('AlternativesSheet — posters', () => {
  const placeholder: AlternativePosterRef = {
    path: 'media/posters/horizontal-push.png',
    isPlaceholder: true,
  }

  it('labels a placeholder as a diagram and never as a demonstration', () => {
    renderSheet({ posterFor: () => placeholder, posterBase: '/Workout-Conductor-Rebuild-v3/' })

    const image = screen.getAllByRole('img', {
      name: 'Placeholder diagram, not a demonstration of Dumbbell bench press',
    })[0]
    expect(image).toHaveAttribute('src', '/Workout-Conductor-Rebuild-v3/media/posters/horizontal-push.png')
    expect(
      screen.getByText(
        'Thumbnails are generated diagrams of the movement, not demonstrations of the exercise.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps the poster out of the row name, so one tap still reads as one choice', () => {
    renderSheet({ posterFor: () => placeholder })

    expect(optionRows()[0]).not.toHaveAccessibleName(/Placeholder/)
  })

  it('drops the placeholder note when the posters are real', () => {
    renderSheet({ posterFor: () => ({ path: 'media/real/db-press.png', isPlaceholder: false }) })

    expect(screen.queryByText(/not demonstrations of the exercise/)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Dumbbell bench press poster' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Machine chest press poster' })).toBeInTheDocument()
  })

  it('renders rows without a poster lookup at all', () => {
    renderSheet()

    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(optionRows()).toHaveLength(2)
  })
})

describe('AlternativesSheet — nothing suitable', () => {
  it('explains why instead of rendering an empty list', () => {
    renderSheet({ result: NONE })

    expect(screen.getByRole('heading', { name: 'Nothing here matches your equipment' })).toBeInTheDocument()
    // The ranker's own message, rendered as given.
    expect(screen.getByText('Every option needs equipment this location does not have.')).toBeInTheDocument()
    expect(screen.getByText('127 exercises checked · 5 were ruled out')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /percent match/ })).toHaveLength(0)
  })

  it('names what was ruled out and counts the rest', () => {
    renderSheet({ result: NONE })
    const ruledOut = screen.getByRole('list', { name: 'Why they were ruled out' })

    expect(within(ruledOut).getAllByRole('listitem')).toHaveLength(4)
    expect(within(ruledOut).getByText('Ruled out by your wrist limitation.')).toBeInTheDocument()
    expect(screen.getByText('and 1 other.')).toBeInTheDocument()
  })

  it('still offers a way out', async () => {
    const { onClose, user } = renderSheet({ result: NONE })
    await user.click(screen.getByRole('button', { name: 'Keep this exercise' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AlternativesSheet copy', () => {
  it('formats setup and slot durations the way a tired reader parses them', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(150)).toBe('2 min 30s')
  })

  it('names equipment from the canonical catalogue, in canonical order', () => {
    expect(equipmentSummary(['flat-bench', 'dumbbells'])).toBe('Dumbbells, Flat bench')
    expect(equipmentSummary([])).toBe('No equipment')
    expect(equipmentSummary(['barbell'], ['flat-bench'])).toBe('Barbell (optional: Flat bench)')
  })

  it('reports progression and superset facts without inventing any', () => {
    const preserved = progressionFlag({
      preservesHistory: true,
      currentFamily: 'a',
      candidateFamily: 'a',
      text: '',
    })
    expect(preserved).toMatchObject({ label: 'Keeps your progression', tone: 'good' })

    const notInSuperset = supersetFlag({
      effect: 'not-in-superset',
      partnerSlotId: null,
      partnerExerciseId: null,
      stationClash: false,
      sharedDemands: [],
      text: '',
    })
    expect(notInSuperset).toBeNull()
  })

  it('joins a poster path to the app base exactly once', () => {
    expect(posterUrl('media/posters/squat.png', '/')).toBe('/media/posters/squat.png')
    expect(posterUrl('/media/posters/squat.png', '/app/')).toBe('/app/media/posters/squat.png')
    expect(posterUrl('media/posters/squat.png', '/app')).toBe('/app/media/posters/squat.png')
  })
})
