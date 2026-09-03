/**
 * The calibration loading state.
 *
 * The product plan is unusually specific about this one, and every requirement
 * it names is here: it shows immediately, blocks the taps that could corrupt a
 * recalculation, keeps the screen where it was, names the trigger, lists what
 * the engine is weighing, shows a readable error on failure, and never leaves
 * the session looking half-changed.
 *
 * IT DOES NOT ADD AN ARTIFICIAL DELAY. A recalibration is a few milliseconds;
 * the plan says to use a brief transition so the change registers, not to make
 * the app slow to look busy. The caller decides how long this is mounted — this
 * component only decides what it says.
 */
import { useEffect, useRef } from 'react'
import type { RecalibrationTrigger } from '../../engine/recalibration/types'
import styles from './CalibrationOverlay.module.css'

/** What the engine is actually weighing, per trigger. Not decoration — these are the real steps. */
const EVALUATING: Readonly<Record<RecalibrationTrigger, readonly string[]>> = {
  'duration-changed': [
    'Protecting your completed sets',
    'Re-ranking what matters most',
    'Fitting the session to the time',
    'Checking exercise conflicts',
  ],
  'available-time-changed': ['Protecting your completed sets', 'Refitting the remaining work'],
  'location-changed': ['Checking what is available here', 'Re-ranking alternatives'],
  'equipment-profile-changed': ['Checking what is available here', 'Re-ranking alternatives'],
  'equipment-unavailable': ['Finding the closest match', 'Checking it does not clash'],
  'station-unavailable': ['Finding the closest match', 'Checking it does not clash'],
  'exercise-replaced': ['Ranking alternatives', 'Keeping your progression'],
  'exercise-skipped': ['Rebalancing the remaining work'],
  'exercise-uncomfortable': ['Finding something kinder', 'Checking joint stress'],
  'pain-reported': ['Avoiding what hurts', 'Rebalancing the remaining work'],
  'over-performed': ['Reading your last sets', 'Adjusting the remaining targets'],
  'under-performed': ['Reading your last sets', 'Adjusting the remaining targets'],
  'target-weight-changed': ['Adjusting the remaining targets'],
  'supersets-toggled': ['Re-pairing the session', 'Checking exercise conflicts'],
  'drop-sets-toggled': ['Reconsidering intensity techniques'],
  'circuits-toggled': ['Reconsidering the session shape'],
  'readiness-changed': ['Weighing how recovered you are', 'Adjusting volume and intensity'],
  'resumed-after-interruption': ['Picking up where you left off', 'Refitting the remaining time'],
  'completed-work-changed-priorities': ['Reading what you have done', 'Rebalancing what is left'],
  'finished-early': ['Rebalancing what is left'],
  'harder-remaining': ['Raising the remaining targets'],
  'easier-remaining': ['Easing the remaining targets'],
}

const TRIGGER_TITLE: Readonly<Record<RecalibrationTrigger, string>> = {
  'duration-changed': 'Rebuilding your workout',
  'available-time-changed': 'Fitting the session to your time',
  'location-changed': 'Rebuilding for where you are',
  'equipment-profile-changed': 'Rebuilding for your equipment',
  'equipment-unavailable': 'Working around the equipment in use',
  'station-unavailable': 'Working around the station in use',
  'exercise-replaced': 'Swapping that exercise',
  'exercise-skipped': 'Updating the remaining workout',
  'exercise-uncomfortable': 'Finding something that suits better',
  'pain-reported': 'Adjusting around what hurts',
  'over-performed': 'Updating your targets',
  'under-performed': 'Updating your targets',
  'target-weight-changed': 'Updating your targets',
  'supersets-toggled': 'Re-pairing your session',
  'drop-sets-toggled': 'Updating intensity techniques',
  'circuits-toggled': 'Updating the session shape',
  'readiness-changed': 'Adjusting for how you feel',
  'resumed-after-interruption': 'Picking your session back up',
  'completed-work-changed-priorities': 'Updating the remaining workout',
  'finished-early': 'Updating the remaining workout',
  'harder-remaining': 'Making the rest harder',
  'easier-remaining': 'Making the rest easier',
}

export interface CalibrationOverlayProps {
  readonly open: boolean
  readonly trigger: RecalibrationTrigger
  /** Set when the recalibration failed. The overlay then explains rather than spins. */
  readonly error?: string | null
  /** Offered only when it is safe — a cancel that could corrupt state is no cancel at all. */
  readonly onCancel?: () => void
  /** Dismisses an error. Required whenever `error` is set. */
  readonly onDismiss?: () => void
}

export function CalibrationOverlay({
  open,
  trigger,
  error = null,
  onCancel,
  onDismiss,
}: CalibrationOverlayProps) {
  const panel = useRef<HTMLDivElement>(null)

  // Keep the page exactly where it was. A recalculation that scrolls the screen
  // loses the row somebody was looking at.
  useEffect(() => {
    if (!open) return
    const { body } = document
    const previous = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open || !error) return
    panel.current?.focus()
  }, [open, error])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (error && onDismiss) onDismiss()
      else if (onCancel) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, error, onCancel, onDismiss])

  if (!open) return null

  const steps = EVALUATING[trigger]

  return (
    /*
     * The scrim is the part that blocks accidental taps. Everything underneath
     * is mid-recalculation, and a tap that lands on a stale row is how a session
     * ends up in a state nobody asked for.
     */
    <div className={styles.scrim} data-testid="calibration-overlay">
      <div
        ref={panel}
        className={styles.panel}
        role={error ? 'alertdialog' : 'status'}
        aria-live={error ? 'assertive' : 'polite'}
        aria-busy={error ? undefined : true}
        aria-labelledby="calibration-title"
        tabIndex={-1}
      >
        {error ? (
          <>
            <p className={styles.title} id="calibration-title">
              That did not work
            </p>
            <p className={styles.error}>{error}</p>
            <p className={styles.reassurance}>Your session is exactly as it was.</p>
            {onDismiss && (
              <button type="button" className={styles.action} onClick={onDismiss}>
                Close
              </button>
            )}
          </>
        ) : (
          <>
            <p className={styles.title} id="calibration-title">
              {TRIGGER_TITLE[trigger]}
            </p>
            <ul className={styles.steps} role="list">
              {steps.map((step) => (
                <li key={step} className={styles.step}>
                  {step}
                </li>
              ))}
            </ul>
            {onCancel && (
              <button type="button" className={styles.cancel} onClick={onCancel}>
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
