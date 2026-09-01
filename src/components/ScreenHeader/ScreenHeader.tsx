import styles from './ScreenHeader.module.css'

export interface ScreenHeaderProps {
  eyebrow?: string
  /** Renders the screen's single `h1`. */
  title: string
  subtitle?: string
}

export function ScreenHeader({ eyebrow, title, subtitle }: ScreenHeaderProps) {
  return (
    <div className={styles.head}>
      {eyebrow && <p className="wc-eyebrow">{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  )
}
