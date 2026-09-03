/**
 * The rest timer.
 *
 * A compact bar, never a modal. It sits in the flow of the active workout
 * screen and nothing behind it becomes unusable while it runs — no scrim, no
 * focus trap, no fixed overlay. The caller decides where to put it.
 *
 * The one design decision that matters here: this component owns NO countdown.
 * It is driven entirely by a target end timestamp the caller supplies, and it
 * derives the remaining time from the clock on every render. A decrementing
 * counter loses time the moment the tab is backgrounded, the screen locks, or
 * React remounts the tree — all three of which happen constantly on a phone in
 * a gym. Reading `endsAt - now()` cannot lose time, so re-mounting mid-rest
 * picks up exactly where the clock is, and a two-minute detour into another
 * app comes back to a timer that is two minutes further along.
 *
 * The interval only asks for a re-render; it never accumulates. `visibilitychange`,
 * `focus`, and `pageshow` ask for the same re-render, so a throttled or fully
 * suspended background timer costs nothing but a stale pixel until the person
 * looks again.
 */
import { useEffect, useReducer, useRef } from 'react'
import { adjustAccessibleName, formatAdjustLabel, formatRestClock, formatRestSpoken } from './restTimerFormat'
import styles from './RestTimer.module.css'

export interface RestTimerProps {
  /**
   * Epoch milliseconds at which rest ends — normally `loggedAt + restTargetSeconds * 1000`.
   * `null` means no rest is running and the bar renders nothing at all.
   *
   * This is the whole persistence story: it is a plain number, so the caller can
   * keep it in a store and rehydrate it, and the timer re-derives itself from the
   * clock rather than from anything it accumulated while mounted.
   */
  endsAt: number | null
  /** What the person is resting *for*, e.g. `Set 3 of 4 — 8 reps @ 60 kg`. */
  nextSetSummary?: string
  /** Overline above the summary. Defaults to `Next set`. */
  nextSetLabel?: string
  /**
   * Ends the rest. Fired by the skip button while counting down, and by the same
   * button after completion, where it reads `Done` — dismissing a finished rest
   * and skipping an unfinished one are the same state change for the caller.
   */
  onSkip: () => void
  /**
   * A signed delta in seconds — the caller moves `endsAt` by this much. Negative
   * subtracts. The timer does not clamp: whether 15 seconds can come off a rest
   * with 4 seconds left is the session's decision, not this bar's.
   */
  onAdjust: (seconds: number) => void
  /**
   * Fired once when the remaining time reaches zero, and once more only if
   * `endsAt` moves to a new target afterwards (an adjust after completion).
   */
  onComplete: () => void
  /**
   * Opt in to a haptic buzz on completion. Off by default: a phone that buzzes
   * without being asked is a phone someone turns notifications off for. Where
   * `navigator.vibrate` is missing or refuses, completion is still visible and
   * still announced — nothing throws.
   */
  vibrate?: boolean
  /**
   * Signed second deltas for the quick-adjust buttons. Defaults to `[-15, 30]`.
   * Keep it to two: the plan warns against a cluster of tiny buttons, and these
   * share one row with Skip at 44px minimum, so a third crowds the bar at 240 CSS px.
   */
  adjustments?: readonly number[]
  /** Injected clock, for deterministic tests. Defaults to `Date.now`. */
  now?: () => number
  className?: string
}

/**
 * Four re-renders a second. Fast enough that a tap on +30s reads as instant and
 * the second boundary never visibly lags; cheap enough to be irrelevant, since a
 * tick only reads the clock and formats two short strings.
 */
const TICK_MS = 250

const DEFAULT_ADJUSTMENTS: readonly number[] = [-15, 30]

/** Buzz, gap, buzz — distinguishable from a notification through a pocket. */
const VIBRATE_PATTERN: readonly number[] = [140, 70, 140]

/**
 * Haptics are a courtesy, not a contract. Absent on desktop, absent on iOS
 * Safari, and refused outright by a browser that has not seen a user gesture —
 * every one of those has to be a no-op rather than a thrown error inside an
 * effect, which would take the whole workout screen down.
 */
function pulse(pattern: readonly number[]): void {
  if (typeof navigator === 'undefined') return
  const vibrate = navigator.vibrate
  if (typeof vibrate !== 'function') return
  try {
    vibrate.call(navigator, [...pattern])
  } catch {
    // Unsupported or blocked. The visible state change already did the job.
  }
}

export function RestTimer({
  endsAt,
  nextSetSummary,
  nextSetLabel = 'Next set',
  onSkip,
  onAdjust,
  onComplete,
  vibrate = false,
  adjustments = DEFAULT_ADJUSTMENTS,
  now = Date.now,
  className,
}: RestTimerProps) {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  /** The target we have already reported. Keyed by value, so an adjust re-arms it. */
  const completedFor = useRef<number | null>(null)

  // Derived at render time, never accumulated. This is the line that makes
  // backgrounding, remounting, and a locked screen all harmless.
  const remainingMs = endsAt === null ? 0 : Math.max(0, endsAt - now())
  const isComplete = endsAt !== null && remainingMs <= 0

  useEffect(() => {
    if (endsAt === null) {
      // Idle re-arms the next rest even if the caller reuses the same timestamp.
      completedFor.current = null
      return
    }
    if (remainingMs > 0 || completedFor.current === endsAt) return

    completedFor.current = endsAt
    onComplete()
    if (vibrate) pulse(VIBRATE_PATTERN)
  }, [endsAt, remainingMs, onComplete, vibrate])

  useEffect(() => {
    // Nothing left to recompute once it has landed on zero, so stop asking.
    if (endsAt === null || isComplete) return

    const id = window.setInterval(tick, TICK_MS)
    // Recompute from the clock rather than trusting whatever the interval
    // managed to fire while the tab was throttled or frozen.
    const resync = () => tick()
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    window.addEventListener('pageshow', resync)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
      window.removeEventListener('pageshow', resync)
    }
  }, [endsAt, isComplete, tick])

  if (endsAt === null) return null

  const spoken = isComplete ? 'Rest complete' : `${formatRestSpoken(remainingMs)} remaining`
  const announcement = isComplete
    ? nextSetSummary
      ? `Rest complete. Next set: ${nextSetSummary}`
      : 'Rest complete.'
    : ''

  return (
    <div
      role="group"
      aria-label="Rest timer"
      data-state={isComplete ? 'complete' : 'running'}
      className={[styles.bar, className].filter(Boolean).join(' ')}
    >
      <p className={styles.readout}>
        <span className={styles.eyebrow} aria-hidden="true">
          Rest
        </span>
        {/* `timer` is live-off by default: navigating here reads the words, but
            nothing is announced on the tick. */}
        <span role="timer" aria-live="off" className={styles.clock}>
          <span className={styles.digits} aria-hidden="true">
            {isComplete ? 'Go' : formatRestClock(remainingMs)}
          </span>
          <span className="wc-visually-hidden">{spoken}</span>
        </span>
      </p>

      {nextSetSummary && (
        <p className={styles.next}>
          <span className={styles.nextLabel}>{nextSetLabel}</span>
          <span className={styles.nextText}>{nextSetSummary}</span>
        </p>
      )}

      <div className={styles.controls}>
        {adjustments.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={styles.control}
            aria-label={adjustAccessibleName(seconds)}
            onClick={() => onAdjust(seconds)}
          >
            {formatAdjustLabel(seconds)}
          </button>
        ))}
        <button
          type="button"
          className={[styles.control, styles.skip].join(' ')}
          aria-label={isComplete ? 'Dismiss rest timer' : 'Skip rest'}
          onClick={onSkip}
        >
          {isComplete ? 'Done' : 'Skip'}
        </button>
      </div>

      {/* Polite, and written to exactly once per rest — the countdown never
          touches this node. */}
      <p role="status" className="wc-visually-hidden">
        {announcement}
      </p>
    </div>
  )
}
