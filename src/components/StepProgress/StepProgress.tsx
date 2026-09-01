import styles from './StepProgress.module.css'

export interface StepProgressProps {
  /** 1-based. Clamped into range so a caller off-by-one cannot render "Step 0". */
  current: number
  total: number
  /** Name of the current step, shown beside the counter. */
  stepName?: string
  /** Accessible name for the bar itself. */
  label?: string
  className?: string
}

/** "Step 3 of 7" plus the bar. Both read the same numbers. */
export function StepProgress({
  current,
  total,
  stepName,
  label = 'Setup progress',
  className,
}: StepProgressProps) {
  const steps = Math.max(1, Math.trunc(total))
  const step = Math.min(steps, Math.max(1, Math.trunc(current)))
  const counter = `Step ${step} of ${steps}`

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <div className={styles.row}>
        <p className={styles.counter}>{counter}</p>
        {stepName && <p className={styles.name}>{stepName}</p>}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={step}
        aria-valuetext={stepName ? `${counter} — ${stepName}` : counter}
      >
        <div className={styles.fill} style={{ inlineSize: `${(step / steps) * 100}%` }} />
      </div>
    </div>
  )
}
