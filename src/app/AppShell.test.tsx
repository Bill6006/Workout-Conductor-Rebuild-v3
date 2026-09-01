import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { SetupStateContext, type SetupState } from './setupGate'

function renderShell(path = '/', setup?: SetupState) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<h1>Screen under test</h1>} />
          <Route path="/settings" element={<h1>Settings</h1>} />
          <Route path="/onboarding" element={<h1>Set up Workout Conductor</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )

  if (!setup) return render(tree)
  return render(<SetupStateContext.Provider value={setup}>{tree}</SetupStateContext.Provider>)
}

describe('AppShell', () => {
  it('renders the wordmark and the subtitle', () => {
    renderShell()
    expect(screen.getByText('Workout Conductor')).toBeInTheDocument()
    expect(screen.getByText('Adaptive Strength + Hypertrophy')).toBeInTheDocument()
  })

  it('renders the routed screen inside a main landmark', () => {
    renderShell()
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(main).toContainElement(screen.getByRole('heading', { level: 1, name: 'Screen under test' }))
  })

  it('renders the build marker exactly once, with real content', () => {
    renderShell()
    const markers = screen.getAllByTestId('build-marker')

    expect(markers).toHaveLength(1)
    expect(markers[0].textContent?.trim()).not.toBe('')
    expect(markers[0]).toHaveTextContent('test-marker')
    expect(markers[0]).toHaveTextContent('build abcdef1')
  })

  it('shows the current phase as a pill in the header', () => {
    renderShell()
    expect(screen.getByText('Phase 0')).toBeInTheDocument()
  })

  it('mounts the persistent bottom navigation alongside the screen', () => {
    renderShell()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  /**
   * The shell renders around the gate, so it cannot ask the gate what it
   * decided — it reads the same published verdict instead. Both branches are
   * pinned here because this is the only place either one is a decision rather
   * than a consequence.
   *
   * Forced setup means every tab bounces straight back, so the nav would be
   * five focusable controls that do nothing. Being on the setup route is NOT
   * on its own a reason to take the nav away.
   */
  it('takes the bottom navigation away while setup is being forced', () => {
    renderShell('/onboarding', { forcingSetup: true, onSetup: true })

    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('keeps the bottom navigation on the setup route when setup is not being forced', () => {
    renderShell('/onboarding', { forcingSetup: false, onSetup: true })

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  it('keeps the bottom navigation on an ordinary route while setup is unfinished elsewhere', () => {
    renderShell('/', { forcingSetup: true, onSetup: false })

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  it('hides the decorative brand mark and ambient backdrop from assistive technology', () => {
    const { container } = renderShell()
    const backdrop = container.querySelector('.wc-aurora')

    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    for (const svg of container.querySelectorAll('header svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('renders nothing for the service worker prompt while no update is pending', () => {
    renderShell()
    expect(screen.queryByText(/new version available/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ready to work offline/i)).not.toBeInTheDocument()
  })
})
