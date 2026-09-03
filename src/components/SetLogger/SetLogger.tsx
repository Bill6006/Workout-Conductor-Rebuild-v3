/**
 * The Set Logger.
 *
 * WHY THIS DESIGN, AND NOT A BUTTON GRID
 *
 * The product plan rules out a specific set of answers: no cluster of tiny plus
 * and minus buttons, no calculator keypad, no giant row of equally weighted
 * buttons, no separate edit page. It also sets the bar: minimal taps, thumb
 * reachable, large readable values, obvious current set, easy undo, and any
 * completed value tappable to correct.
 *
 * A button grid fails on two counts at once. It gives every value the same
 * visual weight, so nothing tells you where you are; and it costs a tap per
 * increment, which is fine for reps and hopeless for weight — going from 60 to
 * 82.5 kg is nine taps on a +2.5 button.
 *
 * So the logger is built around a different observation: **the target is almost
 * always right**. A session prescribes 4 sets of 8-12 at a weight you used last
 * time, and the common case is doing exactly that. The design makes that case
 * ONE TAP, and makes departing from it cheap:
 *
 *   - One large primary action logs the set at the shown values.
 *   - The three values (weight, reps, RIR) are large, tappable fields. Tapping
 *     one opens a focused wheel for that value alone — a short list of the
 *     plausible options centred on the current one, so 82.5 kg is a scroll and a
 *     tap rather than nine increments.
 *   - Nothing is typed unless the person chooses to type it. The keyboard is a
 *     fallback behind the wheel, not the primary path.
 *
 * Measured tap counts are in the phase report; the common case is 1.
 *
 * ACCIDENTAL LOGGING is guarded by making the log action the only large control
 * on the row and keeping it away from the edit affordances, and by making undo
 * immediate and obvious rather than hidden behind a confirm dialog — a confirm
 * on every set would cost more taps than it ever saves.
 */
import { useEffect, useRef, useState } from 'react'
import type { SetTarget, WeightUnit } from '../../core/validation/workoutSchema'
import type { LoadMeasure } from '../../catalog/taxonomy/taxonomy'
import { ValueWheel } from './ValueWheel'
import styles from './SetLogger.module.css'

export interface SetLoggerValues {
  /** Null when the exercise carries no external load (bodyweight). */
  readonly weight: number | null
  readonly reps: number
  readonly rir: number | null
}

export interface SetLoggerProps {
  readonly target: SetTarget
  /** Set number and count, for "Set 2 of 4". */
  readonly setNumber: number
  readonly setCount: number
  readonly unit: WeightUnit
  readonly measure: LoadMeasure
  /** What the same exercise did last time, when known. Shown, never auto-applied. */
  readonly previous?: string | null
  /** Prefilled values. The caller seeds these from the target and any history. */
  readonly values: SetLoggerValues
  readonly onChange: (values: SetLoggerValues) => void
  readonly onLog: () => void
  /** Present only when there is something to undo. */
  readonly onUndo?: () => void
  readonly busy?: boolean
}

/** Plausible loads around the current one. Gyms move in 2.5 kg / 5 lb steps. */
function weightOptions(current: number, unit: WeightUnit): number[] {
  const step = unit === 'kg' ? 2.5 : 5
  const options: number[] = []
  const start = Math.max(0, Math.round((current - step * 12) / step) * step)
  for (let index = 0; index < 25; index += 1) options.push(Number((start + index * step).toFixed(2)))
  return options
}

function repOptions(current: number): number[] {
  const options: number[] = []
  for (let value = Math.max(1, current - 10); value <= current + 12; value += 1) options.push(value)
  return options
}

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5]

export function SetLogger({
  target,
  setNumber,
  setCount,
  unit,
  measure,
  previous = null,
  values,
  onChange,
  onLog,
  onUndo,
  busy = false,
}: SetLoggerProps) {
  const [editing, setEditing] = useState<'weight' | 'reps' | 'rir' | null>(null)
  const logButton = useRef<HTMLButtonElement>(null)

  // After correcting a value, focus returns to the log action — the plan asks
  // that editing returns you to the same position rather than stranding you.
  useEffect(() => {
    if (editing === null) logButton.current?.focus({ preventScroll: true })
  }, [editing])

  const repLabel = target.reps.unit === 'seconds' ? 'sec' : 'reps'
  const targetText =
    target.reps.min === target.reps.max
      ? `${target.reps.min} ${repLabel}`
      : `${target.reps.min}-${target.reps.max} ${repLabel}`

  return (
    <div className={styles.logger}>
      <div className={styles.head}>
        <span className={styles.setNumber}>
          Set {setNumber} <span className={styles.of}>of {setCount}</span>
        </span>
        <span className={styles.targetText}>
          Target {targetText}
          {target.rirTarget !== null ? ` · ${target.rirTarget} RIR` : ''}
        </span>
      </div>

      {previous && <p className={styles.previous}>Last time: {previous}</p>}

      <div className={styles.values}>
        {measure !== 'none' && (
          <button
            type="button"
            className={styles.value}
            onClick={() => setEditing('weight')}
            aria-label={`Weight, ${values.weight ?? 'not set'} ${unit}${measure === 'per-hand' ? ' per hand' : ''}. Tap to change.`}
          >
            <span className={styles.valueNumber}>{values.weight ?? '—'}</span>
            <span className={styles.valueLabel}>
              {unit}
              {measure === 'per-hand' ? ' each' : ''}
            </span>
          </button>
        )}

        <button
          type="button"
          className={styles.value}
          onClick={() => setEditing('reps')}
          aria-label={`${repLabel}, ${values.reps}. Tap to change.`}
        >
          <span className={styles.valueNumber}>{values.reps}</span>
          <span className={styles.valueLabel}>{repLabel}</span>
        </button>

        <button
          type="button"
          className={styles.value}
          onClick={() => setEditing('rir')}
          aria-label={`Reps in reserve, ${values.rir ?? 'not set'}. Tap to change.`}
        >
          <span className={styles.valueNumber}>{values.rir ?? '—'}</span>
          <span className={styles.valueLabel}>RIR</span>
        </button>
      </div>

      <div className={styles.actions}>
        <button
          ref={logButton}
          type="button"
          className={styles.log}
          onClick={onLog}
          disabled={busy}
          data-testid="log-set"
        >
          Log set {setNumber}
        </button>
        {onUndo && (
          <button type="button" className={styles.undo} onClick={onUndo} disabled={busy}>
            Undo
          </button>
        )}
      </div>

      {editing === 'weight' && (
        <ValueWheel
          title={`Weight${measure === 'per-hand' ? ' per hand' : ''}`}
          unit={unit}
          value={values.weight ?? 0}
          options={weightOptions(values.weight ?? 0, unit)}
          allowTyping
          onSelect={(weight) => {
            onChange({ ...values, weight })
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'reps' && (
        <ValueWheel
          title={repLabel === 'sec' ? 'Seconds' : 'Reps'}
          value={values.reps}
          options={repOptions(values.reps)}
          allowTyping
          onSelect={(reps) => {
            onChange({ ...values, reps })
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'rir' && (
        <ValueWheel
          title="Reps in reserve"
          value={values.rir ?? 2}
          options={RIR_OPTIONS}
          onSelect={(rir) => {
            onChange({ ...values, rir })
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
