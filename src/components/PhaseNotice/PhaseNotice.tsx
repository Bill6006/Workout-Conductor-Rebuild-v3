import type { ReactNode } from 'react'
import { Pill } from '../Pill'
import styles from './PhaseNotice.module.css'

export interface PhaseNoticeProps {
  /** Short tag, e.g. `Phase 3`. */
  phase: string
  heading: string
  children: ReactNode
}

/**
 * The honest "not built yet" state. Every placeholder screen ends with one so
 * an empty area is never mistaken for a broken one.
 */
export function PhaseNotice({ phase, heading, children }: PhaseNoticeProps) {
  return (
    <div className={styles.notice}>
      <div className={styles.top}>
        <h2 className={styles.heading}>{heading}</h2>
        <Pill tone="accent">{phase}</Pill>
      </div>
      <p className={styles.copy}>{children}</p>
    </div>
  )
}
