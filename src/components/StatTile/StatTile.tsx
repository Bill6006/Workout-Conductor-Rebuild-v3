import styles from './StatTile.module.css'

export interface StatTileProps {
  label: string
  /** The headline figure. Phase 0 has nothing to report, so it renders an em dash. */
  value: string
  footnote?: string
}

export function StatTile({ label, value, footnote }: StatTileProps) {
  return (
    <div className={styles.tile}>
      <p className={styles.value}>{value}</p>
      <p className={styles.label}>{label}</p>
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </div>
  )
}
