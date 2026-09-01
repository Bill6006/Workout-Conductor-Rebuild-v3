import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider, useProfile } from '../../core/state'
import { createMemoryStore, type MemoryStore } from '../../core/storage/memoryStore'
import { createProfileRepository, setProfileRepository } from '../../core/storage/profileRepository'
import { SETTING_NAMES, readSetting } from '../../core/storage/settings'
import { setClock, steppingClock } from '../../core/time/clock'
import { PROFILE_ID, createDefaultProfile, parseProfile, profileValidator } from '../../core/validation'
import type { Profile } from '../../core/validation'
import { OnboardingScreen } from './OnboardingScreen'
import { ONBOARDING_DRAFT_SETTING, saveDraft } from './draft'
import { answersFromProfile } from './answers'
import { useRerunSetup } from './useRerunSetup'

/**
 * The two routed entry points the onboarding feature exports: the screen the app
 * shell is meant to mount at `/onboarding`, and the hook Settings' "Re-run setup"
 * is meant to call.
 *
 * They are covered here because nothing else covers them. `OnboardingFlow` has
 * its own suite, but these two wrappers own behaviour the flow does not: which
 * mode a routed setup runs in, where a finished setup navigates to, and what a
 * re-run leaves behind. Every assertion below is about a decision one of these
 * two files makes on its own.
 */

const START = '2026-09-01T09:00:00.000Z'
const DONE_MARK = 'landed on Today'

function completedProfile(): Profile {
  return { ...createDefaultProfile(START), onboardingCompletedAt: START }
}

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

  return { store, Wrapper }
}

function savedProfile(store: MemoryStore<Profile>): Profile {
  const parsed = parseProfile(store.records.get(PROFILE_ID))
  if (!parsed.ok) throw new Error(`Saved record is not a valid profile: ${JSON.stringify(parsed.issues)}`)
  return parsed.value
}

/**
 * The app mounts setup behind a gate that renders nothing until the profile has
 * hydrated (`App.tsx`'s `ProfileGate`). `OnboardingScreen` freezes its mode on
 * its own first render, so it only sees a stored profile when a host honours
 * that. This is the smallest possible stand-in for it.
 */
function Hydrated({ children }: { children: ReactNode }) {
  const { status } = useProfile()
  if (status === 'loading') return <p>Loading</p>
  return <>{children}</>
}

const user = () => userEvent.setup()

beforeEach(() => {
  localStorage.clear()
  setClock(steppingClock(START, 1000))
})

afterEach(() => {
  setProfileRepository(null)
  setClock(null)
  localStorage.clear()
})

describe('OnboardingScreen — the routed setup screen', () => {
  it('runs the first-run flow on a device with no profile', async () => {
    const { Wrapper } = harness()

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <Hydrated>
            <OnboardingScreen />
          </Hydrated>
        </Wrapper>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Set up Workout Conductor')
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeInTheDocument()
  })

  it('drops the welcome step and the skip action when a profile already exists', async () => {
    const { Wrapper } = harness(completedProfile())

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <Hydrated>
            <OnboardingScreen />
          </Hydrated>
        </Wrapper>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What are you training for?')
    expect(screen.queryByRole('button', { name: 'Skip setup' })).not.toBeInTheDocument()
  })

  /**
   * The mode is frozen on the screen's own first render, which is BEFORE the
   * store has read anything. A host that mounts it without waiting for
   * hydration therefore always gets the first-run flow — welcome step and all —
   * even for someone re-running setup. Pinned here so the requirement on the
   * host is visible rather than folklore.
   */
  it('falls back to the first-run flow when mounted before the profile has hydrated', async () => {
    const { Wrapper } = harness(completedProfile())

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <OnboardingScreen />
        </Wrapper>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeInTheDocument()
  })

  /**
   * A re-run is entered by clearing `onboardingCompletedAt`, which is exactly
   * what the app's gate forces setup on — so the app takes the bottom nav away
   * while it runs, and there is no "Skip setup" in a re-run either. Without a
   * way out, someone who opened setup to change one answer and thought better
   * of it would have to walk all seven steps to reach their app again.
   */
  it('offers a re-run a way out, and putting the stamp back is all it writes', async () => {
    const u = user()
    const seeded = { ...completedProfile(), onboardingCompletedAt: null }
    const { store, Wrapper } = harness(seeded)

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <Routes>
            <Route
              path="/onboarding"
              element={
                <Hydrated>
                  <OnboardingScreen />
                </Hydrated>
              }
            />
            <Route path="/" element={<h1>{DONE_MARK}</h1>} />
          </Routes>
        </Wrapper>
      </MemoryRouter>,
    )

    await u.click(await screen.findByRole('button', { name: 'Exit setup' }))

    expect(await screen.findByRole('heading', { level: 1, name: DONE_MARK })).toBeInTheDocument()

    const after = savedProfile(store)
    // The one thing it writes is the stamp the re-run cleared.
    expect(after.onboardingCompletedAt).not.toBeNull()
    expect(after.goals).toEqual(seeded.goals)
    expect(after.schedule).toEqual(seeded.schedule)
    expect(after.locations).toEqual(seeded.locations)
    expect(after.createdAt).toBe(seeded.createdAt)
  })

  it('offers no way out of a first run, where there is nothing to go back to', async () => {
    const { Wrapper } = harness()

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <Hydrated>
            <OnboardingScreen />
          </Hydrated>
        </Wrapper>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exit setup' })).not.toBeInTheDocument()
    // "Skip setup" is already the one-tap way past a first run.
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeInTheDocument()
  })

  it('navigates to `doneTo` and reports the outcome once a skip is written', async () => {
    const u = user()
    const { store, Wrapper } = harness()
    const outcomes: string[] = []

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <Routes>
            <Route
              path="/onboarding"
              element={
                <Hydrated>
                  <OnboardingScreen onDone={(outcome) => outcomes.push(outcome)} />
                </Hydrated>
              }
            />
            <Route path="/" element={<h1>{DONE_MARK}</h1>} />
          </Routes>
        </Wrapper>
      </MemoryRouter>,
    )

    await u.click(await screen.findByRole('button', { name: 'Skip setup' }))

    expect(await screen.findByRole('heading', { level: 1, name: DONE_MARK })).toBeInTheDocument()
    expect(outcomes).toEqual(['skipped'])
    // Skipping is a real completion: the gate's one condition is now satisfied.
    expect(savedProfile(store).onboardingCompletedAt).not.toBeNull()
  })

  it('honours a custom destination', async () => {
    const u = user()
    const { Wrapper } = harness()

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Wrapper>
          <Routes>
            <Route
              path="/onboarding"
              element={
                <Hydrated>
                  <OnboardingScreen doneTo="/plan" />
                </Hydrated>
              }
            />
            <Route path="/plan" element={<h1>Plan</h1>} />
            <Route path="/" element={<h1>{DONE_MARK}</h1>} />
          </Routes>
        </Wrapper>
      </MemoryRouter>,
    )

    await u.click(await screen.findByRole('button', { name: 'Skip setup' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
  })
})

describe('useRerunSetup — the re-entry point Settings is meant to call', () => {
  function Probe() {
    const rerun = useRerunSetup()
    return (
      <button type="button" onClick={rerun}>
        Re-run setup
      </button>
    )
  }

  it('clears the completion stamp without touching anything else', async () => {
    const u = user()
    const seeded = completedProfile()
    const { store, Wrapper } = harness(seeded)

    render(
      <Wrapper>
        <Hydrated>
          <Probe />
        </Hydrated>
      </Wrapper>,
    )

    await u.click(await screen.findByRole('button', { name: 'Re-run setup' }))

    await waitFor(() => expect(savedProfile(store).onboardingCompletedAt).toBeNull())

    const after = savedProfile(store)
    expect(after.locations).toEqual(seeded.locations)
    expect(after.schedule).toEqual(seeded.schedule)
    expect(after.goals).toEqual(seeded.goals)
    expect(after.createdAt).toBe(seeded.createdAt)
  })

  it('drops a stale half-finished draft so setup reopens on the saved answers', async () => {
    const u = user()
    const seeded = completedProfile()
    const { Wrapper } = harness(seeded)

    saveDraft('schedule', answersFromProfile(seeded))
    expect(readSetting<unknown>(ONBOARDING_DRAFT_SETTING, null)).not.toBeNull()

    render(
      <Wrapper>
        <Hydrated>
          <Probe />
        </Hydrated>
      </Wrapper>,
    )

    await u.click(await screen.findByRole('button', { name: 'Re-run setup' }))

    await waitFor(() => {
      expect(readSetting<unknown>(ONBOARDING_DRAFT_SETTING, null)).toBeNull()
      expect(readSetting<unknown>(SETTING_NAMES.onboardingStep, null)).toBeNull()
    })
  })
})
