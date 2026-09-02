import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileProvider } from '../../core/state'
import { createMemoryStore, type MemoryStoreFaults } from '../../core/storage/memoryStore'
import { createProfileRepository } from '../../core/storage/profileRepository'
import { fixedClock } from '../../core/time/clock'
import { profileValidator } from '../../core/validation/validate'
import { PROFILE_ID, createDefaultProfile, createLocation, type Profile } from '../../core/validation/schemas'
import { defaultEquipmentFor } from '../../catalog/equipment'
import { PlanScreen } from './PlanScreen'

/**
 * The seeded item counts come from the equipment catalogue rather than a number
 * typed here. The catalogue grows as the exercise catalog needs more kit, and a
 * hand-written total would then fail on the growth instead of on the screen;
 * what the catalogue holds is pinned exactly in `catalog/equipment/equipment.test.ts`.
 */
const GYM_ITEMS = defaultEquipmentFor('gym').length
const HOME_ITEMS = defaultEquipmentFor('home').length

const NOW = '2026-09-01T12:00:00.000Z'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return { ...createDefaultProfile(NOW), onboardingCompletedAt: NOW, ...overrides }
}

function renderPlan(profile: Profile | null = makeProfile(), faults: MemoryStoreFaults = {}) {
  const store = createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed: profile ? { [PROFILE_ID]: profile } : {},
    faults,
  })

  return render(
    <MemoryRouter initialEntries={['/plan']}>
      <ProfileProvider repository={createProfileRepository(store)} clock={fixedClock(NOW)}>
        <PlanScreen />
      </ProfileProvider>
    </MemoryRouter>,
  )
}

describe('PlanScreen', () => {
  it('renders a single h1', async () => {
    renderPlan()
    const headings = await screen.findAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Plan')
  })

  it('marks the saved training days across the week', async () => {
    renderPlan()
    const week = within(await screen.findByRole('list', { name: 'Training week' }))

    expect(week.getByText('Monday: training day')).toBeInTheDocument()
    expect(week.getByText('Tuesday: training day')).toBeInTheDocument()
    expect(week.getByText('Wednesday: rest day')).toBeInTheDocument()
    expect(week.getByText('Thursday: training day')).toBeInTheDocument()
    expect(week.getByText('Friday: rest day')).toBeInTheDocument()
    expect(week.getByText('Saturday: training day')).toBeInTheDocument()
    expect(week.getByText('Sunday: rest day')).toBeInTheDocument()
  })

  it('shows the schedule figures from the profile, not placeholders', async () => {
    renderPlan(
      makeProfile({ schedule: { sessionsPerWeek: 3, typicalDurationMin: 45, availableDays: ['wed'] } }),
    )

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('45 min')).toBeInTheDocument()
    expect(screen.getByText('Sessions per week')).toBeInTheDocument()
    expect(screen.getByText(/not scheduled sessions/)).toBeInTheDocument()
  })

  it('lists the saved locations with catalogue equipment and marks the active one', async () => {
    renderPlan()

    const gym = await screen.findByRole('heading', { level: 3, name: 'Gym' })
    const home = screen.getByRole('heading', { level: 3, name: 'Home' })
    expect(gym).toBeInTheDocument()
    expect(home).toBeInTheDocument()

    expect(screen.getByText(`Gym · ${GYM_ITEMS} items`)).toBeInTheDocument()
    expect(screen.getByText(`Home · ${HOME_ITEMS} items`)).toBeInTheDocument()
    expect(screen.getAllByText('Adjustable dumbbells')).toHaveLength(2)
    expect(screen.getAllByText('Selectorised machines')).toHaveLength(1)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('says plainly when a location has no equipment rather than inventing some', async () => {
    renderPlan(
      makeProfile({
        locations: [createLocation('custom', 'Empty room', 'loc-empty')],
        activeLocationId: 'loc-empty',
      }),
    )

    expect(await screen.findByText('No equipment listed for this location.')).toBeInTheDocument()
    expect(screen.getByText('Custom · 0 items')).toBeInTheDocument()
  })

  it('leaves the Phase 7 sections empty and names the phase', async () => {
    renderPlan()
    await screen.findByRole('heading', { level: 3, name: 'Gym' })

    expect(screen.getByText('No targets yet.')).toBeInTheDocument()
    expect(screen.getByText('Nothing scheduled.')).toBeInTheDocument()
    expect(screen.getByText('No saved workouts.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Weekly planning' })).toBeInTheDocument()
    expect(screen.getByText('Phase 7')).toBeInTheDocument()
  })

  it('sends a user with no profile to setup instead of showing an empty week', async () => {
    renderPlan(null)

    expect(await screen.findByText(/Setup has not run on this device yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Settings' })).toHaveAttribute('href', '/settings')
  })

  it('reports unreadable storage rather than a blank plan', async () => {
    renderPlan(undefined, { failRead: new Error('storage is blocked') })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Your plan is unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/storage is blocked/)).toBeInTheDocument()
  })

  it('marks every list as a list so screen readers keep the item count', async () => {
    const { container } = renderPlan()
    await screen.findByRole('heading', { level: 3, name: 'Gym' })

    for (const list of container.querySelectorAll('ul, ol')) {
      expect(list).toHaveAttribute('role', 'list')
    }
  })
})
