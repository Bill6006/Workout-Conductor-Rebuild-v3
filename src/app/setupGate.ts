import { createContext, useContext } from 'react'
import type { ProfileStatus } from '../core/state'

/** The setup flow's route. Exported so screens can link to it by name. */
export const ONBOARDING_PATH = '/onboarding'

/**
 * What the onboarding gate has decided, published for the parts of the shell
 * that render *around* it.
 *
 * `AppShell` sits above the gate in the route tree, so it cannot read the gate's
 * verdict from a child. Both of them read it from here instead, which keeps one
 * rule in one place: the shell can never disagree with the gate about whether
 * setup is being forced.
 */
export interface SetupState {
  /**
   * The gate is forcing setup: every route other than onboarding is bounced
   * back to it, so anything that navigates elsewhere is a dead control.
   */
  readonly forcingSetup: boolean
  /** The setup flow is the screen currently rendered. */
  readonly onSetup: boolean
}

/**
 * The default is the answer for a shell mounted outside the gate (tests, and any
 * future host): nothing is being forced, so nothing is hidden.
 */
const NOT_FORCED: SetupState = { forcingSetup: false, onSetup: false }

export const SetupStateContext = createContext<SetupState>(NOT_FORCED)

export function useSetupState(): SetupState {
  return useContext(SetupStateContext)
}

/**
 * The gate's one rule, as a function so the shell and the gate share it.
 *
 * `error` is deliberately absent: setup that cannot be saved is a trap, so a
 * device without storage is let into the app instead of being forced here.
 */
export function isSetupForced(status: ProfileStatus, hasCompletedOnboarding: boolean): boolean {
  return (status === 'empty' || status === 'ready') && !hasCompletedOnboarding
}
