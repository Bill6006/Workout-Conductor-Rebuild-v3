import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { NAV_ITEMS } from './navigation'
import { createMemoryStore } from '../core/storage/memoryStore'
import { createProfileRepository, type ProfileRepository } from '../core/storage/profileRepository'
import { fixedClock, setClock } from '../core/time/clock'
import { profileValidator } from '../core/validation/validate'
import { PROFILE_ID, createDefaultProfile, type Profile } from '../core/validation/schemas'

/**
 * Regression guard for the LOCKED product decision, plus the onboarding gate.
 *
 * Workout length is exactly ONE control (15 / 30 / 45 / Default time) and the
 * app has exactly ONE start control, both on Today. There is no second
 * workout-mode button and no competing start button anywhere.
 *
 * Screen-level tests can only prove a screen is clean in isolation; the defect
 * this guards against — a second "Start Workout" appearing on a different tab —
 * is invisible to them. So this file mounts the WHOLE app (real router, real
 * shell, real bottom nav, real profile store) at every route and counts across
 * the entire rendered tree:
 *
 *   - at most ONE control named /start workout/i on any single route, and
 *     exactly one in the whole app across all routes;
 *   - ZERO controls whose name begins with a competing workout-mode word
 *     (full / lazy / short / density / recovery).
 *
 * Phase 1 added a real profile, so the sweep now runs with one present — an
 * empty app could hide a second control behind a state that never rendered.
 *
 * If a future phase adds a second start button or a rival mode switch, this
 * fails. Do not relax it — remove the extra control instead.
 */

const START_WORKOUT = /start workout/i
const COMPETING_MODE = /^(full|lazy|short|density|recovery)\b/i

const NOW = '2026-03-04T12:00:00.000Z'
const ONBOARDING_HASH = '#/onboarding'

/** Every routed tab, read from the single navigation source of truth. */
const ROUTES = NAV_ITEMS.map((item) => item.path)

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

/** Storage that cannot be read at all — a private window, or no IndexedDB. */
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

/** Storage that never answers, so the app stays in its hydrating state. */
function pendingRepository(): ProfileRepository {
  return {
    load: () => new Promise(() => {}),
    save: async () => {
      throw new Error('not reachable in this test')
    },
    clear: async () => {},
  }
}

function setUpProfile(): Profile {
  return { ...createDefaultProfile(NOW), onboardingCompletedAt: NOW }
}

function unfinishedProfile(): Profile {
  return createDefaultProfile(NOW)
}

/** The app routes on the hash, so the entry point is `location.hash`. */
function mountAppAt(path: string, repository: ProfileRepository) {
  window.location.hash = `#${path}`
  render(<App repository={repository} />)
}

/** Mounts and waits for the profile to finish hydrating. */
async function renderAppAt(path: string, repository: ProfileRepository) {
  mountAppAt(path, repository)
  await waitFor(() =>
    expect(screen.queryByRole('heading', { level: 1, name: 'Loading' })).not.toBeInTheDocument(),
  )
}

/**
 * The gate redirects by rendering `<Navigate>`, which writes the hash from an
 * effect. Waiting for the boot screen to disappear only proves the redirect has
 * been RENDERED — `window.location` catches up a tick later, so reading it
 * synchronously here was a race that failed roughly one full-suite run in four
 * on a loaded machine. Waiting for the value is strictly stronger than reading
 * it: a redirect that never happens still fails, with the same message.
 */
async function expectHash(hash: string, note?: string) {
  await waitFor(() => expect(window.location.hash, note).toBe(hash))
}

/** Counts every interactive control in the document whose name matches. */
function countControlsNamed(pattern: RegExp): number {
  const buttons = screen.queryAllByRole('button', { name: pattern })
  const links = screen.queryAllByRole('link', { name: pattern })
  return buttons.length + links.length
}

beforeEach(() => {
  setClock(fixedClock(NOW))
})

afterEach(() => {
  setClock(null)
  window.location.hash = ''
})

describe('App — locked product decision', () => {
  it('exposes exactly one Start Workout control in the whole app', async () => {
    let total = 0

    for (const path of ROUTES) {
      await renderAppAt(path, seededRepository(setUpProfile()))
      const onThisRoute = countControlsNamed(START_WORKOUT)

      expect(onThisRoute, `route ${path} must not hold a competing start button`).toBeLessThanOrEqual(1)

      total += onThisRoute
      cleanup()
    }

    expect(total, 'the app must own exactly one Start Workout control, on Today').toBe(1)
  })

  it('has no competing workout-mode control on any route', async () => {
    for (const path of ROUTES) {
      await renderAppAt(path, seededRepository(setUpProfile()))

      expect(countControlsNamed(COMPETING_MODE), `route ${path} must not hold a mode switch`).toBe(0)

      cleanup()
    }
  })

  it('keeps the single start control on Today and off Workout', async () => {
    await renderAppAt('/', seededRepository(setUpProfile()))
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeInTheDocument()
    cleanup()

    await renderAppAt('/workout', seededRepository(setUpProfile()))
    expect(screen.queryByRole('button', { name: START_WORKOUT })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Today' })).toBeInTheDocument()
  })

  it('shows exactly one workout-length control, and only on Today', async () => {
    let total = 0

    for (const path of ROUTES) {
      await renderAppAt(path, seededRepository(setUpProfile()))
      // Phase 3 turned this from a disabled button into a real dropdown, so both
      // roles are counted: the invariant is "exactly one workout-length control
      // in the whole app", not "one button".
      const lengthControls = [
        ...screen.queryAllByRole('combobox', { name: /workout length/i }),
        ...screen.queryAllByRole('button', { name: /workout length/i }),
      ]

      expect(lengthControls.length, `route ${path} must not add a second length control`).toBeLessThanOrEqual(
        1,
      )

      total += lengthControls.length
      cleanup()
    }

    expect(total, 'workout length is one control, on Today').toBe(1)
  })
})

/**
 * The bottom navigation while setup is being forced.
 *
 * The gate bounces every route other than onboarding straight back, so a nav
 * painted over setup is five focusable controls that do nothing — a dead end in
 * the middle of the one task the person has been given. The shell reads the
 * gate's verdict rather than guessing at it, so the two can never disagree.
 */
describe('App — the bottom navigation during setup', () => {
  function nav() {
    return screen.queryByRole('navigation', { name: 'Primary' })
  }

  it('is not rendered, focusable, or in the tab order during first-run setup', async () => {
    await renderAppAt('/', seededRepository(null))
    await expectHash(ONBOARDING_HASH)

    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument()
    expect(nav()).not.toBeInTheDocument()
    for (const item of NAV_ITEMS) {
      expect(screen.queryByRole('link', { name: item.label })).not.toBeInTheDocument()
    }
  })

  /**
   * A re-run re-enters the same forced state — Settings clears
   * `onboardingCompletedAt`, which is the one condition the gate reads — so the
   * nav would bounce for a re-run exactly as it does for a first run, and it is
   * hidden there too. See the note in `setupGate.ts`: giving a re-run its nav
   * back needs the re-run to stop looking, to the gate, like setup that was
   * never finished. Pinned so a future change to that is a deliberate one.
   */
  it('is not rendered during a re-run either, because the gate is still forcing setup', async () => {
    const user = userEvent.setup()
    await renderAppAt('/settings', seededRepository(setUpProfile()))
    expect(nav()).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Re-run setup' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Re-run setup?' }))
    await user.click(sheet.getByRole('button', { name: 'Re-run setup' }))

    await expectHash(ONBOARDING_HASH)
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument()
    await waitFor(() => expect(nav()).not.toBeInTheDocument())
  })

  it('comes back the moment setup is finished', async () => {
    const user = userEvent.setup()
    await renderAppAt('/', seededRepository(null))

    await expectHash(ONBOARDING_HASH)
    await user.click(await screen.findByRole('button', { name: 'Skip setup' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    expect(nav()).toBeInTheDocument()
  })

  it('is present on every ordinary route', async () => {
    for (const path of ROUTES) {
      await renderAppAt(path, seededRepository(setUpProfile()))
      expect(nav(), `route ${path} must keep the primary navigation`).toBeInTheDocument()
      cleanup()
    }
  })
})

describe('App — the onboarding gate', () => {
  it('shows a calm loading state while the profile hydrates', () => {
    mountAppAt('/', pendingRepository())

    expect(screen.getByRole('heading', { level: 1, name: 'Loading' })).toBeInTheDocument()
    expect(screen.getByText(/reading your profile from this device/i)).toBeInTheDocument()
    // Not a flash of an empty Today underneath it.
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).not.toBeInTheDocument()
  })

  it('lands a device with no profile on onboarding', async () => {
    await renderAppAt('/', seededRepository(null))

    await expectHash(ONBOARDING_HASH)
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).not.toBeInTheDocument()
  })

  it('sends every tab to onboarding until setup is finished', async () => {
    for (const path of ROUTES) {
      await renderAppAt(path, seededRepository(null))

      await expectHash(ONBOARDING_HASH, `route ${path} must not skip setup`)
      expect(countControlsNamed(START_WORKOUT)).toBe(0)

      cleanup()
    }
  })

  it('still routes to onboarding when a profile exists but setup was never completed', async () => {
    await renderAppAt('/', seededRepository(unfinishedProfile()))

    await expectHash(ONBOARDING_HASH)
  })

  it('lands a set-up device on Today', async () => {
    await renderAppAt('/', seededRepository(setUpProfile()))

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    await expectHash('#/')
  })

  it('never traps a finished user on the onboarding route', async () => {
    await renderAppAt('/onboarding', seededRepository(setUpProfile()))

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    await expectHash('#/')
  })

  it('renders the app with an explanation when storage is unavailable', async () => {
    await renderAppAt('/', unavailableRepository())

    // No white screen, and no forced setup that could not be saved anyway.
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    await expectHash('#/')

    expect(
      screen.getByRole('heading', { level: 2, name: 'Saving is off on this device' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/blocking offline storage/i)).toBeInTheDocument()
    expect(screen.getByText(/will not be kept/i)).toBeInTheDocument()
  })

  /**
   * The route used to mount `OnboardingFlow` directly, which defaults to
   * `mode="first-run"` — so someone re-running setup from Settings was greeted
   * as a new install: a welcome step they had already read, "Step 1 of 8", and
   * a "Skip setup" button that would have thrown away the answers they came
   * back to change. `OnboardingScreen` is the piece that picks the mode, and
   * this is the path Settings actually takes to get here.
   */
  it('re-runs setup in re-run mode, from the button Settings offers', async () => {
    const user = userEvent.setup()
    await renderAppAt('/settings', seededRepository(setUpProfile()))

    await user.click(await screen.findByRole('button', { name: 'Re-run setup' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Re-run setup?' }))
    await user.click(sheet.getByRole('button', { name: 'Re-run setup' }))

    await expectHash(ONBOARDING_HASH)

    // Step 1 of 7: the welcome step is gone, because they have already read it.
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What are you training for?')
    expect(screen.queryByRole('button', { name: 'Skip setup' })).not.toBeInTheDocument()
  })

  it('runs first-run setup in first-run mode, welcome step and all', async () => {
    await renderAppAt('/', seededRepository(null))

    await expectHash(ONBOARDING_HASH)
    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Set up Workout Conductor')
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeInTheDocument()
  })

  it('sends an unknown route to Today rather than a blank shell', async () => {
    await renderAppAt('/does-not-exist', seededRepository(setUpProfile()))

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
  })
})
