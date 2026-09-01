import type { ReactNode } from 'react'
import styles from './Pill.module.css'

export type PillTone = 'neutral' | 'accent' | 'muted'

export interface PillProps {
  tone?: PillTone
  children: ReactNode
}

/** Small rounded label used for phase tags and status markers. */
export function Pill({ tone = 'neutral', children }: PillProps) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>
}
