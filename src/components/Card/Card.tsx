import type { ReactNode } from 'react'
import styles from './Card.module.css'

export type CardTone = 'default' | 'accent' | 'muted'

export interface CardProps {
  title?: string
  eyebrow?: string
  action?: ReactNode
  tone?: CardTone
  children: ReactNode
}

/** The large rounded surface every screen is built from. */
export function Card({ title, eyebrow, action, tone = 'default', children }: CardProps) {
  const hasHeader = Boolean(title || eyebrow || action)

  return (
    <section className={`${styles.card} ${styles[tone]}`}>
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.headings}>
            {eyebrow && <p className="wc-eyebrow">{eyebrow}</p>}
            {title && <h2 className={styles.title}>{title}</h2>}
          </div>
          {action && <div className={styles.action}>{action}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  )
}
