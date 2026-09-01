import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../../core/state'
import { OnboardingFlow, type OnboardingOutcome } from './OnboardingFlow'
import type { OnboardingMode } from './steps'

export interface OnboardingScreenProps {
  /** Where to go once setup is written. Defaults to Today. */
  doneTo?: string
  /** Called after the profile is saved, in addition to the navigation. */
  onDone?: (outcome: OnboardingOutcome) => void
}

/**
 * The routed setup screen — what the app shell mounts at `/onboarding`.
 *
 * It picks the mode once, on the first render after hydration: a stored profile
 * means the person is running setup again from Settings, so the welcome step and
 * the skip action are dropped and their saved answers are already filled in.
 *
 * Both finishing and skipping stamp `onboardingCompletedAt`, which is the one
 * condition the app's gate lets past.
 */
export function OnboardingScreen({ doneTo = '/', onDone }: OnboardingScreenProps) {
  const { profile, completeOnboarding } = useProfile()
  const navigate = useNavigate()

  // Frozen on mount: creating the default profile part-way through a first run
  // must not turn the flow into a re-run underneath the person using it.
  const [mode] = useState<OnboardingMode>(() => (profile ? 'rerun' : 'first-run'))

  const handleFinish = useCallback(
    (outcome: OnboardingOutcome) => {
      onDone?.(outcome)
      navigate(doneTo, { replace: true })
    },
    [onDone, navigate, doneTo],
  )

  /**
   * The way out of a re-run.
   *
   * A re-run is entered by clearing `onboardingCompletedAt`, which is exactly
   * the condition the gate forces setup on — so until this screen writes the
   * stamp back, every other route bounces here and the shell takes the bottom
   * nav away rather than paint five controls that do nothing. Someone who
   * opened setup to change one answer and thought better of it would otherwise
   * have to walk all seven steps to get back to their app.
   *
   * So leaving puts the stamp back exactly as it was found. Their answers are
   * untouched — nothing is written but the stamp — and the draft is kept, so
   * re-opening setup resumes where they stopped.
   *
   * A first run gets no exit: there is nothing to go back to, and "Skip setup"
   * on the welcome step is already the one-tap way past it.
   *
   * If the write fails there is nowhere useful to go, so the person stays in
   * setup; finishing normally reports the same failure through the flow's own
   * save-error line, which is the surface built for it.
   */
  const handleExit = useCallback(() => {
    void completeOnboarding().then((result) => {
      if (result.ok) navigate(doneTo, { replace: true })
    })
  }, [completeOnboarding, navigate, doneTo])

  return (
    <OnboardingFlow mode={mode} onFinish={handleFinish} onExit={mode === 'rerun' ? handleExit : undefined} />
  )
}
