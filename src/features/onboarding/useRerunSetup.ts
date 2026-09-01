import { useCallback } from 'react'
import { useProfile } from '../../core/state'
import { clearDraft } from './draft'

/**
 * Settings' "Re-run setup" button, owned here because the draft is ours.
 *
 * Clearing the completion stamp is what re-opens the flow; clearing the draft is
 * what stops a months-old half-finished setup from being restored over the saved
 * profile. The existing profile is never wiped — it becomes the starting values.
 */
export function useRerunSetup(): () => void {
  const { updateProfile } = useProfile()

  return useCallback(() => {
    clearDraft()
    void updateProfile({ onboardingCompletedAt: null })
  }, [updateProfile])
}
