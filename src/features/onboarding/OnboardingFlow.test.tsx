import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { ProfileProvider } from '../../core/state'
import { createMemoryStore, type MemoryStore } from '../../core/storage/memoryStore'
import { createProfileRepository, setProfileRepository } from '../../core/storage/profileRepository'
import { SETTING_NAMES } from '../../core/storage/settings'
import { setClock, steppingClock } from '../../core/time/clock'
import {
  PROFILE_ID,
  createDefaultProfile,
  parseProfile,
  profileValidator,
  type Profile,
} from '../../core/validation'
import { OnboardingFlow, type OnboardingOutcome } from './OnboardingFlow'
import { ONBOARDING_DRAFT_SETTING } from './draft'
import { stepsForMode } from './steps'

const START = '2026-09-01T09:00:00.000Z'

function harness(seed?: Profile) {
  const store: MemoryStore<Profile> = createMemoryStore<Profile>({
    name: 'profile',
    keyOf: () => PROFILE_ID,
    validator: profileValidator,
    seed: seed ? { [PROFILE_ID]: seed } : {},
  })
  const repository = createProfileRepository(store)
  const clock = steppingClock(START, 1000)

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ProfileProvider repository={repository} clock={clock}>
        {children}
      </ProfileProvider>
    )
  }

  return { store, repository, Wrapper }
}

function savedProfile(store: MemoryStore<Profile>): Profile {
  const raw = store.records.get(PROFILE_ID)
  const parsed = parseProfile(raw)
  if (!parsed.ok) throw new Error(`Saved record is not a valid profile: ${JSON.stringify(parsed.issues)}`)
  return parsed.value
}

const user = () => userEvent.setup()

/** The one primary action, whatever it currently says. */
function forwardButton() {
  return screen.getByRole('button', { name: /^(Start setup|Continue|Done|Finish setup|Saving)/ })
}

function heading() {
  return screen.getByRole('heading', { level: 1 })
}

/** Both goal pickers offer the same titles, so queries scope to the labelled group. */
function mainGoal(name: RegExp) {
  return within(screen.getByRole('radiogroup', { name: 'Main goal' })).getByRole('radio', { name })
}

beforeEach(() => {
  localStorage.clear()
  setClock(steppingClock(START, 1000))
})

afterEach(() => {
  setProfileRepository(null)
  setClock(null)
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('the shape of the flow', () => {
  it('opens on the welcome step with a single h1 and honest copy', async () => {
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(heading()).toHaveTextContent('Set up Workout Conductor')
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText(/Everything stays on this device/i)).toBeInTheDocument()
  })

  /**
   * The welcome card used to promise seven questions and then list six topics
   * on the very next line. `steps.test.ts` pins the flow to six question steps;
   * this pins the sentence that quotes that number to the same six.
   */
  it('promises the number of questions the flow actually asks', () => {
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    const questions = stepsForMode('first-run').filter(
      (step) => step.id !== 'welcome' && step.id !== 'review',
    )

    expect(questions).toHaveLength(6)
    expect(screen.getByText('Six short questions')).toBeInTheDocument()
    expect(screen.queryByText(/seven short questions/i)).not.toBeInTheDocument()
  })

  it('keeps exactly one h1 on a step that also renders section headings', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow step="locations" />, { wrapper: Wrapper })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
    await u.click(screen.getAllByRole('checkbox', { name: 'Barbell' })[0])
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('walks welcome to review in eight steps', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    const seen: string[] = []
    for (let index = 0; index < 7; index += 1) {
      seen.push(heading().textContent ?? '')
      await u.click(forwardButton())
    }
    seen.push(heading().textContent ?? '')

    expect(seen).toHaveLength(8)
    expect(seen[7]).toBe('Check your answers')
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '8')
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
  })
})

describe('moving between steps', () => {
  it('keeps entered values when going forward and back', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    await u.click(forwardButton())
    await u.click(mainGoal(/Get stronger/))
    await u.click(forwardButton())

    expect(heading()).toHaveTextContent('How you train')
    await u.click(screen.getByRole('radio', { name: /^Advanced/ }))
    await u.click(screen.getByRole('button', { name: 'Back' }))

    expect(heading()).toHaveTextContent('What are you training for?')
    expect(mainGoal(/Get stronger/)).toHaveAttribute('aria-checked', 'true')

    await u.click(forwardButton())
    expect(screen.getByRole('radio', { name: /^Advanced/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('moves focus to the new step heading', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    expect(document.activeElement).not.toBe(heading())
    await u.click(forwardButton())

    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(heading()).toHaveTextContent('What are you training for?')
  })

  it('has no Back control on the first step', () => {
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('reports the step to a host that drives it from a route', async () => {
    const u = user()
    const onStepChange = vi.fn()
    const { Wrapper } = harness()
    render(<OnboardingFlow step="goals" onStepChange={onStepChange} />, { wrapper: Wrapper })

    await u.click(forwardButton())
    expect(onStepChange).toHaveBeenCalledWith('experience')
    // Controlled: the host decides what renders next, so the heading has not moved.
    expect(heading()).toHaveTextContent('What are you training for?')
  })
})

describe('a step that needs an answer', () => {
  async function emptyTheWeek(u: ReturnType<typeof user>) {
    for (const day of ['Monday', 'Tuesday', 'Thursday', 'Saturday']) {
      await u.click(screen.getByRole('checkbox', { name: day }))
    }
  }

  it('blocks forward with an inline message, not an alert', async () => {
    const u = user()
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    for (let index = 0; index < 3; index += 1) await u.click(forwardButton())
    expect(heading()).toHaveTextContent('Your training week')

    await emptyTheWeek(u)
    await u.click(forwardButton())

    expect(heading()).toHaveTextContent('Your training week')
    expect(alert).not.toHaveBeenCalled()

    // Inline, on the field that can fix it, and announced from there.
    const announced = screen.getByRole('alert')
    expect(announced).toHaveTextContent('Pick at least one day you can train.')

    // The live region is still in the DOM and still polite, ready for a
    // failed save — the one message with no field of its own.
    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
  })

  it('announces a blocking message exactly once', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    for (let index = 0; index < 3; index += 1) await u.click(forwardButton())
    await emptyTheWeek(u)
    await u.click(forwardButton())

    const message = 'Pick at least one day you can train.'

    // Twice on screen: once in the summary above the actions, once under the
    // field. Only one of the two is in something assistive tech will speak,
    // or a blocked step says the same sentence twice.
    expect(screen.getAllByText(message)).toHaveLength(2)

    const spoken = screen
      .getAllByText(message)
      .filter((node) => node.closest('[role="alert"], [role="status"], [aria-live]') !== null)

    expect(spoken).toHaveLength(1)
    expect(spoken[0].closest('[role="alert"]')).not.toBeNull()
    expect(within(screen.getByRole('status')).queryByText(message)).not.toBeInTheDocument()
  })

  it('names the field that is blocking as well as announcing it', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    for (let index = 0; index < 3; index += 1) await u.click(forwardButton())
    await emptyTheWeek(u)
    await u.click(forwardButton())

    // Once in the live region, once as the field's own error.
    expect(screen.getAllByText('Pick at least one day you can train.')).toHaveLength(2)
  })

  it('lets go as soon as the answer is given', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    for (let index = 0; index < 3; index += 1) await u.click(forwardButton())
    await emptyTheWeek(u)
    await u.click(forwardButton())
    await u.click(screen.getByRole('checkbox', { name: 'Wednesday' }))
    await u.click(forwardButton())

    expect(heading()).toHaveTextContent('Where you train')
  })

  it('never blocks going back', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    for (let index = 0; index < 3; index += 1) await u.click(forwardButton())
    await emptyTheWeek(u)
    await u.click(screen.getByRole('button', { name: 'Back' }))

    expect(heading()).toHaveTextContent('How you train')
  })
})

describe('the draft', () => {
  it('is written to localStorage as answers change', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    expect(localStorage.getItem(`wc:${ONBOARDING_DRAFT_SETTING}`)).toBeNull()

    await u.click(forwardButton())
    await u.click(mainGoal(/Bigger arms/))

    const raw = localStorage.getItem(`wc:${ONBOARDING_DRAFT_SETTING}`)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).answers.goals.primary).toBe('bigger-arms')
    expect(JSON.parse(localStorage.getItem(`wc:${SETTING_NAMES.onboardingStep}`) as string)).toBe('goals')
  })

  it('resumes on the step it was left on, with the answers intact', async () => {
    const u = user()
    const { Wrapper } = harness()
    const first = render(<OnboardingFlow />, { wrapper: Wrapper })

    await u.click(forwardButton())
    await u.click(mainGoal(/Stay consistent/))
    await u.click(forwardButton())
    expect(heading()).toHaveTextContent('How you train')

    first.unmount()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    expect(heading()).toHaveTextContent('How you train')
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(mainGoal(/Stay consistent/)).toHaveAttribute('aria-checked', 'true')
  })

  it('is cleared once the profile is written', async () => {
    const u = user()
    const onFinish = vi.fn()
    const { Wrapper } = harness()
    render(<OnboardingFlow step="review" onFinish={onFinish} />, { wrapper: Wrapper })

    await u.click(screen.getByRole('button', { name: 'Finish setup' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('completed'))

    expect(localStorage.getItem(`wc:${ONBOARDING_DRAFT_SETTING}`)).toBeNull()
    expect(localStorage.getItem(`wc:${SETTING_NAMES.onboardingStep}`)).toBeNull()
  })

  it('says so when the browser will not keep site data', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    expect(screen.getByText(/not keeping site data/i)).toBeInTheDocument()
  })
})

describe('finishing', () => {
  it('writes a profile that validates against the schema', async () => {
    const u = user()
    const onFinish = vi.fn<(outcome: OnboardingOutcome) => void>()
    const { store, Wrapper } = harness()
    render(<OnboardingFlow onFinish={onFinish} />, { wrapper: Wrapper })

    await u.click(forwardButton())
    await u.click(mainGoal(/Get stronger/))
    await u.click(forwardButton())
    await u.click(screen.getByRole('radio', { name: /^Beginner/ }))
    await u.click(forwardButton())
    await u.click(screen.getByRole('checkbox', { name: 'Friday' }))
    await u.click(forwardButton())
    await u.click(forwardButton())
    await u.click(screen.getByRole('radio', { name: 'Longer' }))
    await u.click(forwardButton())
    await u.click(screen.getByRole('switch', { name: 'Knee trouble' }))
    await u.click(forwardButton())

    expect(heading()).toHaveTextContent('Check your answers')
    await u.click(screen.getByRole('button', { name: 'Finish setup' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('completed'))

    const profile = savedProfile(store)
    expect(profile.goals.primary).toBe('get-stronger')
    expect(profile.experience).toBe('beginner')
    expect(profile.schedule.availableDays).toEqual(['mon', 'tue', 'thu', 'fri', 'sat'])
    expect(profile.restStyle).toBe('long')
    expect(profile.limitations.knee).toBe(true)
    expect(profile.onboardingCompletedAt).not.toBeNull()
    expect(profile.id).toBe('primary')
    expect(profile.schemaVersion).toBe(1)
  })

  it('surfaces the failure message from the store, and does not call back', async () => {
    const u = user()
    const onFinish = vi.fn()
    const { store, Wrapper } = harness()
    render(<OnboardingFlow step="review" onFinish={onFinish} />, { wrapper: Wrapper })

    store.faults.failWrite = new Error('quota exceeded')
    await u.click(screen.getByRole('button', { name: 'Finish setup' }))

    await waitFor(() => expect(screen.getByText(/quota exceeded/i)).toBeInTheDocument())
    expect(onFinish).not.toHaveBeenCalled()
    expect(store.records.get(PROFILE_ID)).toBeUndefined()
  })
})

describe('skipping setup', () => {
  it('writes the default profile and marks setup done', async () => {
    const u = user()
    const onFinish = vi.fn()
    const { store, Wrapper } = harness()
    render(<OnboardingFlow onFinish={onFinish} />, { wrapper: Wrapper })

    await u.click(screen.getByRole('button', { name: 'Skip setup' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('skipped'))

    const profile = savedProfile(store)
    expect(profile.goals.primary).toBe('build-muscle')
    expect(profile.schedule.typicalDurationMin).toBe(60)
    expect(profile.locations).toHaveLength(2)
    expect(profile.onboardingCompletedAt).not.toBeNull()
  })

  it('is offered only on the welcome step of a first run', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeInTheDocument()
    await u.click(forwardButton())
    expect(screen.queryByRole('button', { name: 'Skip setup' })).not.toBeInTheDocument()
  })
})

describe('running setup again from Settings', () => {
  const existing: Profile = {
    ...createDefaultProfile('2026-08-01T08:00:00.000Z'),
    goals: { primary: 'bigger-chest', secondary: 'get-stronger' },
    experience: 'advanced',
    schedule: { sessionsPerWeek: 6, typicalDurationMin: 75, availableDays: ['mon', 'wed', 'fri'] },
    onboardingCompletedAt: null,
  }

  it('starts from the saved answers and skips the welcome step', async () => {
    const { Wrapper } = harness(existing)
    render(<OnboardingFlow mode="rerun" />, { wrapper: Wrapper })

    expect(heading()).toHaveTextContent('What are you training for?')
    // The profile arrives after the first render, so the seeded answer does too.
    await waitFor(() => expect(mainGoal(/Bigger chest/)).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuemax', '7')
    expect(screen.queryByRole('button', { name: 'Skip setup' })).not.toBeInTheDocument()
  })

  it('keeps the fields it never asked about', async () => {
    const u = user()
    const onFinish = vi.fn()
    const { store, Wrapper } = harness(existing)
    render(<OnboardingFlow mode="rerun" step="review" onFinish={onFinish} />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText('Bigger chest')).toBeInTheDocument())
    await u.click(screen.getByRole('button', { name: 'Finish setup' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('completed'))

    const profile = savedProfile(store)
    expect(profile.createdAt).toBe('2026-08-01T08:00:00.000Z')
    expect(profile.goals.primary).toBe('bigger-chest')
    expect(profile.schedule.sessionsPerWeek).toBe(6)
    expect(profile.onboardingCompletedAt).not.toBeNull()
  })

  it('offers a way out when the host provides one', async () => {
    const u = user()
    const onExit = vi.fn()
    const { Wrapper } = harness(existing)
    render(<OnboardingFlow mode="rerun" onExit={onExit} />, { wrapper: Wrapper })

    await u.click(screen.getByRole('button', { name: 'Exit setup' }))
    expect(onExit).toHaveBeenCalled()
  })
})

describe('the review step', () => {
  it('summarises the answers', async () => {
    const { Wrapper } = harness()
    render(<OnboardingFlow step="review" />, { wrapper: Wrapper })

    expect(screen.getByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument()
    expect(screen.getByText('Build muscle')).toBeInTheDocument()
    expect(screen.getByText('4 per week')).toBeInTheDocument()
    expect(screen.getByText('60 min')).toBeInTheDocument()
  })

  it('sends an edit back to the step that owns the answer, then returns', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow />, { wrapper: Wrapper })

    for (let index = 0; index < 7; index += 1) await u.click(forwardButton())
    expect(heading()).toHaveTextContent('Check your answers')

    await u.click(screen.getByRole('button', { name: 'Edit Goals' }))
    expect(heading()).toHaveTextContent('What are you training for?')

    await u.click(mainGoal(/Overall size/))
    await u.click(screen.getByRole('button', { name: 'Done' }))

    expect(heading()).toHaveTextContent('Check your answers')
    expect(screen.getByText('Overall size')).toBeInTheDocument()
  })
})

describe('locations', () => {
  it('adds and removes places, and never strands the active one', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow step="locations" />, { wrapper: Wrapper })

    expect(screen.getByRole('heading', { level: 2, name: 'Gym' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Add a place' }))
    expect(screen.getByRole('heading', { level: 2, name: 'New place' })).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Remove New place' }))
    expect(screen.queryByRole('heading', { level: 2, name: 'New place' })).not.toBeInTheDocument()
  })

  /**
   * Every control on this step is rendered once per place, so with the two
   * default locations a screen reader's list of controls used to be pairs of
   * identical names with nothing to choose between them. Each one now says
   * which place it belongs to, and the visible text is still the start of the
   * accessible name, so "click Remove" still works for voice control.
   */
  it('tells the two default places apart in every control name', async () => {
    const { Wrapper } = harness()
    render(<OnboardingFlow step="locations" />, { wrapper: Wrapper })

    for (const place of ['Gym', 'Home']) {
      expect(screen.getByRole('button', { name: `Remove ${place}` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Clear equipment at ${place}` })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: `Name ${place}` })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: `Equipment here ${place}` })).toBeInTheDocument()
    }

    // The kit button carries the kind AND the place, so two gyms would differ.
    expect(screen.getByRole('button', { name: 'Use typical gym kit for Gym' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use typical home kit for Home' })).toBeInTheDocument()

    // Nothing ambiguous is left over.
    expect(screen.queryAllByRole('button', { name: 'Remove' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Clear equipment' })).toHaveLength(0)
  })

  it('keeps the place name on a control the visible label alone would not place', async () => {
    const u = user()
    const { Wrapper } = harness()
    render(<OnboardingFlow step="locations" />, { wrapper: Wrapper })

    const name = screen.getByRole('textbox', { name: 'Name Gym' })
    await u.clear(name)
    await u.type(name, 'Barn')

    expect(screen.getByRole('button', { name: 'Remove Barn' })).toBeInTheDocument()
  })

  it('will not let the last place be removed', async () => {
    const { Wrapper } = harness({
      ...createDefaultProfile(START),
      locations: [createDefaultProfile(START).locations[0]],
      activeLocationId: 'loc-gym',
      onboardingCompletedAt: null,
    })
    render(<OnboardingFlow mode="rerun" step="locations" />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Remove Gym' })).toBeDisabled()
  })
})
