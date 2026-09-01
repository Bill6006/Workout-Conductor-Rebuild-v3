import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from './App'
import { NAV_ITEMS } from './navigation'

/**
 * Regression guard for the LOCKED product decision.
 *
 * Workout length is exactly ONE control (15 / 30 / 45 / Default time) and the
 * app has exactly ONE start control, both on Today. There is no second
 * workout-mode button and no competing start button anywhere.
 *
 * Screen-level tests can only prove a screen is clean in isolation; the defect
 * this guards against — a second "Start Workout" appearing on a different tab —
 * is invisible to them. So this file mounts the WHOLE app (real router, real
 * shell, real bottom nav) at every route and counts across the entire rendered
 * tree:
 *
 *   - at most ONE control named /start workout/i on any single route, and
 *     exactly one in the whole app across all routes;
 *   - ZERO controls whose name begins with a competing workout-mode word
 *     (full / lazy / short / density / recovery).
 *
 * If a future phase adds a second start button or a rival mode switch, this
 * fails. Do not relax it — remove the extra control instead.
 */

const START_WORKOUT = /start workout/i
const COMPETING_MODE = /^(full|lazy|short|density|recovery)\b/i

/** Every routed path, read from the single navigation source of truth. */
const ROUTES = NAV_ITEMS.map((item) => item.path)

/** The app routes on the hash, so the entry point is `location.hash`. */
function renderAppAt(path: string) {
  window.location.hash = `#${path}`
  render(<App />)
}

/** Counts every interactive control in the document whose name matches. */
function countControlsNamed(pattern: RegExp): number {
  const buttons = screen.queryAllByRole('button', { name: pattern })
  const links = screen.queryAllByRole('link', { name: pattern })
  return buttons.length + links.length
}

describe('App — locked product decision', () => {
  it('exposes exactly one Start Workout control in the whole app', () => {
    let total = 0

    for (const path of ROUTES) {
      renderAppAt(path)
      const onThisRoute = countControlsNamed(START_WORKOUT)

      expect(onThisRoute, `route ${path} must not hold a competing start button`).toBeLessThanOrEqual(1)

      total += onThisRoute
      cleanup()
    }

    expect(total, 'the app must own exactly one Start Workout control, on Today').toBe(1)
  })

  it('has no competing workout-mode control on any route', () => {
    for (const path of ROUTES) {
      renderAppAt(path)

      expect(countControlsNamed(COMPETING_MODE), `route ${path} must not hold a mode switch`).toBe(0)

      cleanup()
    }
  })

  it('keeps the single start control on Today and off Workout', () => {
    renderAppAt('/')
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeInTheDocument()
    cleanup()

    renderAppAt('/workout')
    expect(screen.queryByRole('button', { name: START_WORKOUT })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Today' })).toBeInTheDocument()
  })

  it('shows exactly one workout-length control, and only on Today', () => {
    let total = 0

    for (const path of ROUTES) {
      renderAppAt(path)
      const lengthControls = screen.queryAllByRole('button', { name: /workout length/i })

      expect(lengthControls.length, `route ${path} must not add a second length control`).toBeLessThanOrEqual(
        1,
      )

      total += lengthControls.length
      cleanup()
    }

    expect(total, 'workout length is one control, on Today').toBe(1)
  })
})
