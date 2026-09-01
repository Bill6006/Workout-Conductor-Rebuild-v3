import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TodayScreen } from './TodayScreen'
import { accessibleName } from '../../test/test-utils'
import { ProfileProvider } from '../../core/state'
import { createMemoryStore } from '../../core/storage/memoryStore'
import { createProfileRepository, type ProfileRepository } from '../../core/storage/profileRepository'
import { fixedClock, setClock } from '../../core/time/clock'
import { profileValidator } from '../../core/validation/validate'
import { PROFILE_ID, createDefaultProfile, type Profile } from '../../core/validation/schemas'

/**
 * Names that would signal a second, competing "how long / how hard" control.
 * The product has exactly one duration control and no workout-mode buttons.
 */
const FORBIDDEN_MODE_NAME = /^(full|lazy|short|density|recovery)\b/i

/** A Wednesday — deliberately NOT one of the default training days. */
const REST_DAY = '2026-03-04T12:00:00.000Z'
/** The Thursday after it, which the default profile does train on. */
const TRAINING_DAY = '2026-03-05T12:00:00.000Z'

function seededRepository(profile: Profile | null): ProfileRepository {
  return createProfileRepository(
    createMemoryStore<Profile>({
      name: 'profile',
      keyOf: () => PROFILE_ID,
      validator: profileValidator,
      seed: profile ? { [PROFILE_ID]: profile } : {},
    }),
  )
}

function unavailableRepository(): ProfileRepository {
  return {
    load: async () => ({
      status: 'unavailable',
      message: 'This browser is blocking offline storage.',
      code: 'denied',
    }),
    save: async () => {
      throw new Error('not reachable in this test')
    },
    clear: async () => {},
  }
}

function completedProfile(overrides: Partial<Profile> = {}): Profile {
  const base = createDefaultProfile(REST_DAY)
  return { ...base, onboardingCompletedAt: REST_DAY, ...overrides }
}

function renderToday(repository: ProfileRepository) {
  return render(
    <MemoryRouter>
      <ProfileProvider repository={repository}>
        <TodayScreen />
      </ProfileProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setClock(fixedClock(REST_DAY))
})

afterEach(() => {
  setClock(null)
})

describe('TodayScreen', () => {
  it('renders a single h1', async () => {
    renderToday(seededRepository(completedProfile()))
    const headings = await screen.findAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Today')
  })

  it('shows the clock’s date in its header, not the wall clock', () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(REST_DAY))

    renderToday(seededRepository(completedProfile()))
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('points forward to the phase that builds real sessions', async () => {
    renderToday(seededRepository(completedProfile()))

    expect(await screen.findByRole('heading', { level: 2, name: 'Your real sessions' })).toBeInTheDocument()
    expect(screen.getByText('Phase 3')).toBeInTheDocument()
  })

  describe('with a real profile', () => {
    it('reads the location, planned length, and training style from it', async () => {
      renderToday(seededRepository(completedProfile()))

      expect(await screen.findByText('Rest day')).toBeInTheDocument()

      const facts = within(screen.getByTestId('today-facts'))
      expect(facts.getByText('Gym')).toBeInTheDocument()
      expect(facts.getByText('60 min')).toBeInTheDocument()
      expect(facts.getByText('Strength + hypertrophy')).toBeInTheDocument()
    })

    it('calls today a training day when the profile trains on it', async () => {
      setClock(fixedClock(TRAINING_DAY))
      renderToday(seededRepository(completedProfile()))

      expect(await screen.findByText('Training day')).toBeInTheDocument()
      expect(screen.queryByText('Rest day')).not.toBeInTheDocument()
    })

    it('follows an edited profile rather than the defaults', async () => {
      const profile = completedProfile()
      const edited: Profile = {
        ...profile,
        trainingStyle: 'strength',
        schedule: { sessionsPerWeek: 3, typicalDurationMin: 45, availableDays: ['mon', 'wed', 'fri'] },
        activeLocationId: 'loc-home',
      }
      renderToday(seededRepository(edited))

      expect(await screen.findByText('Training day')).toBeInTheDocument()

      const facts = within(screen.getByTestId('today-facts'))
      expect(facts.getByText('45 min')).toBeInTheDocument()
      expect(facts.getByText('Strength')).toBeInTheDocument()
      expect(facts.getByText('Home')).toBeInTheDocument()
    })

    it('fills the glance tiles from real profile values', async () => {
      renderToday(seededRepository(completedProfile()))
      await screen.findByText('Rest day')

      const tiles = within(screen.getByRole('list', { name: 'At a glance' }))
      expect(tiles.getByText('60')).toBeInTheDocument()
      expect(tiles.getByText('minutes')).toBeInTheDocument()
      expect(tiles.getByText('4')).toBeInTheDocument()
      expect(tiles.getByText('in your week')).toBeInTheDocument()
      expect(tiles.getByText('Gym')).toBeInTheDocument()
      expect(tiles.getByText('16 items')).toBeInTheDocument()
      expect(screen.queryByText('—')).not.toBeInTheDocument()
    })
  })

  describe('without a profile', () => {
    it('keeps honest em dashes rather than inventing numbers', async () => {
      renderToday(seededRepository(null))

      expect(await screen.findByText('No profile yet')).toBeInTheDocument()
      expect(screen.getAllByText('—')).toHaveLength(3)
    })

    it('explains itself calmly when storage cannot be read', async () => {
      renderToday(unavailableRepository())

      await waitFor(() => expect(screen.getByText(/could not be read on this device/i)).toBeInTheDocument())
      expect(screen.getAllByText('—')).toHaveLength(3)
    })
  })

  describe('the demo workout preview', () => {
    it('is labelled as a demo on the screen itself', async () => {
      renderToday(seededRepository(completedProfile()))

      expect(await screen.findByText('Demo')).toBeInTheDocument()
      expect(screen.getByText(/sample session, not your plan/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: /Upper body/ })).toBeInTheDocument()
    })

    it('adds no way to start, log, or time anything', async () => {
      renderToday(seededRepository(completedProfile()))
      await screen.findByText('Demo')

      // The only controls on Today are the two disabled placeholders.
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(2)
      for (const button of buttons) expect(button).toBeDisabled()
    })
  })

  describe('the locked workout-length decision', () => {
    it('exposes exactly one workout-length control', async () => {
      renderToday(seededRepository(completedProfile()))
      await screen.findByText('Rest day')

      expect(screen.getAllByRole('button', { name: /workout length/i })).toHaveLength(1)
      expect(screen.getAllByText(/workout length/i)).toHaveLength(1)
    })

    it('displays the profile default and stays inert until Phase 3', async () => {
      renderToday(seededRepository(completedProfile()))
      await screen.findByText('Rest day')
      const control = screen.getByRole('button', { name: /workout length/i })

      expect(control).toBeDisabled()
      expect(control).toHaveAttribute('aria-disabled', 'true')
      expect(control).toHaveTextContent('Default · 60 min')
      expect(screen.getByText(/15 \/ 30 \/ 45 \/ Default/)).toBeInTheDocument()
    })

    it('falls back to a neutral display when there is no profile to read', async () => {
      renderToday(seededRepository(null))
      await screen.findByText('No profile yet')

      expect(screen.getByRole('button', { name: /workout length/i })).toHaveTextContent('Default time')
    })

    it('keeps Start Workout disabled and says why', async () => {
      renderToday(seededRepository(completedProfile()))
      const start = await screen.findByRole('button', { name: 'Start Workout' })

      expect(start).toBeDisabled()
      expect(start).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByText(/no workout engine yet/i)).toBeInTheDocument()
    })

    it('has no second workout-mode control', async () => {
      const { container } = renderToday(seededRepository(completedProfile()))
      await screen.findByText('Rest day')

      // Role-based sweep: nothing focusable is named like a mode switch.
      for (const role of ['button', 'link', 'radio', 'combobox', 'menuitem', 'switch', 'tab'] as const) {
        expect(screen.queryAllByRole(role, { name: FORBIDDEN_MODE_NAME })).toHaveLength(0)
      }

      // Belt and braces: sweep the raw DOM too, in case a future control is
      // added without a role the query above covers.
      for (const element of container.querySelectorAll('button, a, select, [role]')) {
        expect(accessibleName(element)).not.toMatch(FORBIDDEN_MODE_NAME)
      }
    })
  })
})
