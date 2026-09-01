import { Suspense, lazy, useMemo, type CSSProperties, type ReactNode } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Card } from '../components/Card'
import { ScreenHeader } from '../components/ScreenHeader'
import { ProfileProvider, useProfile } from '../core/state'
import type { ProfileRepository } from '../core/storage'
import type { Clock } from '../core/time/clock'
/**
 * The setup flow is a one-time surface: most launches are by someone who has
 * already finished it, and it is the largest feature in the app. Loading it
 * eagerly put the whole flow in front of every launch, so it gets its own
 * chunk. Imported from the module rather than the barrel, because the barrel
 * re-exports the flow and would defeat the split.
 */
const OnboardingScreen = lazy(() =>
  import('../features/onboarding/OnboardingScreen').then((module) => ({
    default: module.OnboardingScreen,
  })),
)
const PlanScreen = lazy(() =>
  import('../features/plan/PlanScreen').then((module) => ({ default: module.PlanScreen })),
)
const ProgressScreen = lazy(() =>
  import('../features/progress/ProgressScreen').then((module) => ({ default: module.ProgressScreen })),
)
const SettingsScreen = lazy(() =>
  import('../features/settings/SettingsScreen').then((module) => ({ default: module.SettingsScreen })),
)
import { TodayScreen } from '../features/today/TodayScreen'
const WorkoutScreen = lazy(() =>
  import('../features/workout/WorkoutScreen').then((module) => ({ default: module.WorkoutScreen })),
)
import { AppShell } from './AppShell'
import {
  ONBOARDING_PATH,
  SetupStateContext,
  isSetupForced,
  useSetupState,
  type SetupState,
} from './setupGate'

export { ONBOARDING_PATH }

/** Where the gate sends a user whose setup is finished. */
const HOME_PATH = '/'

/**
 * Calm hydration state.
 *
 * Reading the profile out of IndexedDB is fast but not instant, and the two
 * wrong answers are a flash of an empty Today and a spinner that outlives the
 * read. This is a line of text inside the real shell, so nothing moves when the
 * profile arrives — it is simply replaced.
 */
function BootScreen() {
  return (
    <div aria-busy="true">
      <ScreenHeader
        eyebrow="Workout Conductor"
        title="Loading"
        subtitle="Reading your profile from this device."
      />
    </div>
  )
}

/**
 * Storage is unavailable — private browsing, blocked site data, or a browser
 * with no IndexedDB. The app still runs; it just cannot remember anything. Said
 * plainly and without alarm, because for most people this is a browser setting
 * rather than a fault.
 */
function StorageNotice({ message }: { message: string | null }) {
  return (
    <Card tone="muted" title="Saving is off on this device">
      <p>{message ?? 'This browser is not letting the app store data on this device.'}</p>
      <p>You can still look around. Anything you change will not be kept after you close the app.</p>
    </Card>
  )
}

/**
 * Setup runs inside the shell, so the flow's sticky action dock has to clear
 * whatever the shell keeps on screen below it. `OnboardingFlow` exposes that as
 * a variable for exactly this — the host that keeps a nav sets the offset, the
 * host that hides it sets the shorter one.
 */
const DOCK_ABOVE_NAV = {
  '--wc-onboarding-dock-offset': 'calc(var(--wc-nav-h) + var(--wc-safe-bottom))',
} as CSSProperties

const DOCK_NO_NAV = {
  '--wc-onboarding-dock-offset': 'var(--wc-safe-bottom)',
} as CSSProperties

/**
 * The setup route.
 *
 * `OnboardingScreen` rather than `OnboardingFlow` directly: it is the piece that
 * freezes the mode on its first render after hydration, so someone re-running
 * setup from Settings gets the re-run flow — their saved answers, no welcome
 * step, and no "Skip setup" — instead of being greeted as a new install. The
 * gate below never renders this route until the profile has hydrated, which is
 * the condition that choice depends on.
 *
 * The screen navigates home once the profile is written, and so does the gate
 * the moment `onboardingCompletedAt` lands. Both agree on the destination, and
 * the gate remains the only thing that decides who is *allowed* here.
 */
/**
 * Today is the landing route and loads with the shell. The other four tabs are
 * only reachable by a deliberate tap, so they are split out and wait behind one
 * boundary — the fallback is the same in-shell line of text the boot screen
 * uses, so nothing jumps when the chunk lands.
 */
function LazyTab({ children }: { children: ReactNode }) {
  return <Suspense fallback={<BootScreen />}>{children}</Suspense>
}

function SetupRoute() {
  const { forcingSetup } = useSetupState()

  return (
    <div style={forcingSetup ? DOCK_NO_NAV : DOCK_ABOVE_NAV}>
      <Suspense fallback={<BootScreen />}>
        <OnboardingScreen />
      </Suspense>
    </div>
  )
}

/**
 * Publishes the gate's verdict to the shell that renders around it.
 *
 * It sits above the router's `Routes` so `AppShell` — which is an ancestor of
 * the gate, not a descendant — can read the same decision instead of guessing
 * at it a second time.
 */
function SetupStateProvider({ children }: { children: ReactNode }) {
  const { status, hasCompletedOnboarding } = useProfile()
  const { pathname } = useLocation()

  const value = useMemo<SetupState>(
    () => ({
      forcingSetup: isSetupForced(status, hasCompletedOnboarding),
      onSetup: pathname === ONBOARDING_PATH,
    }),
    [status, hasCompletedOnboarding, pathname],
  )

  return <SetupStateContext.Provider value={value}>{children}</SetupStateContext.Provider>
}

/**
 * The onboarding gate.
 *
 * One rule, evaluated on every navigation:
 *
 *   loading                        → the boot screen, and nothing else renders
 *   setup unfinished (empty/ready) → forced to onboarding
 *   setup finished, on onboarding  → sent to Today, so completion is never a dead end
 *   storage unreadable             → the app renders anyway, with a notice
 *
 * The error branch deliberately does NOT force onboarding: setup that cannot
 * save is a trap, so a device without storage lands in the app instead.
 *
 * CONTRACT WITH `OnboardingFlow`: the only way past this gate is a profile with
 * `onboardingCompletedAt` set. The flow satisfies that on both exits — finishing
 * and "Skip setup" each run `ensureProfile()` then `completeOnboarding()` — so
 * setup is never a room without a door. A future setup screen must keep that, or
 * a user who skips will be sent straight back.
 */
function ProfileGate() {
  const { status, hasCompletedOnboarding, error } = useProfile()
  const { forcingSetup, onSetup } = useSetupState()

  if (status === 'loading') return <BootScreen />

  if (forcingSetup && !onSetup) return <Navigate to={ONBOARDING_PATH} replace />
  if (hasCompletedOnboarding && onSetup) return <Navigate to={HOME_PATH} replace />

  return (
    <>
      {status === 'error' && <StorageNotice message={error} />}
      <Outlet />
    </>
  )
}

interface AppProps {
  /** Test seam. Defaults to the app-wide IndexedDB repository. */
  repository?: ProfileRepository
  /** Test seam. Defaults to the app clock. */
  clock?: Clock
}

/**
 * Hash routing is deliberate.
 *
 * The app is served from a GitHub Pages repository subpath and sits behind a
 * service worker. A hash URL never asks the static host for a path it cannot
 * serve, which removes the entire class of 404 / wrong-base / SW navigation
 * fallback failures — including deep links and hard refreshes — in one choice.
 *
 * `ProfileProvider` sits above the router so every screen reads one profile
 * from one store, and the gate below it decides what a given state is allowed
 * to see.
 */
export function App({ repository, clock }: AppProps) {
  return (
    <ProfileProvider repository={repository} clock={clock}>
      <HashRouter>
        <SetupStateProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route element={<ProfileGate />}>
                <Route path={HOME_PATH} element={<TodayScreen />} />
                <Route
                  path="/workout"
                  element={
                    <LazyTab>
                      <WorkoutScreen />
                    </LazyTab>
                  }
                />
                <Route
                  path="/progress"
                  element={
                    <LazyTab>
                      <ProgressScreen />
                    </LazyTab>
                  }
                />
                <Route
                  path="/plan"
                  element={
                    <LazyTab>
                      <PlanScreen />
                    </LazyTab>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <LazyTab>
                      <SettingsScreen />
                    </LazyTab>
                  }
                />
                <Route path={ONBOARDING_PATH} element={<SetupRoute />} />
                <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
              </Route>
            </Route>
          </Routes>
        </SetupStateProvider>
      </HashRouter>
    </ProfileProvider>
  )
}
