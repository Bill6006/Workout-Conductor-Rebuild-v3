import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PlanScreen } from '../features/plan/PlanScreen'
import { ProgressScreen } from '../features/progress/ProgressScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { TodayScreen } from '../features/today/TodayScreen'
import { WorkoutScreen } from '../features/workout/WorkoutScreen'
import { AppShell } from './AppShell'

/**
 * Hash routing is deliberate.
 *
 * The app is served from a GitHub Pages repository subpath and sits behind a
 * service worker. A hash URL never asks the static host for a path it cannot
 * serve, which removes the entire class of 404 / wrong-base / SW navigation
 * fallback failures — including deep links and hard refreshes — in one choice.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/workout" element={<WorkoutScreen />} />
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
