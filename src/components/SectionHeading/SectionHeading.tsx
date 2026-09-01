import type { ReactNode } from 'react'
import styles from './SectionHeading.module.css'

export interface SectionHeadingProps {
  title: string
  /** Optional trailing link, e.g. a jump to a related tab. */
  action?: ReactNode
}

export function SectionHeading({ title, action }: SectionHeadingProps) {
  return (
    <div className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
