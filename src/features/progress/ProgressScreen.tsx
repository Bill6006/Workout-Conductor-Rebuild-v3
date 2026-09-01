import { Link } from 'react-router-dom'
import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SectionHeading } from '../../components/SectionHeading'
import { StatTile } from '../../components/StatTile'
import styles from './ProgressScreen.module.css'

const OVERVIEW = [
  { label: 'Sessions this week', footnote: 'No data yet' },
  { label: 'Weekly volume', footnote: 'No data yet' },
  { label: 'Est. strength', footnote: 'No data yet' },
  { label: 'Personal records', footnote: 'No data yet' },
]

export function ProgressScreen() {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="Progress" subtitle="Trends appear once sessions are logged on this device." />

      <section className={styles.group}>
        <SectionHeading title="Overview" action={<Link to="/plan">Weekly plan</Link>} />
        <ul className={styles.stats} role="list">
          {OVERVIEW.map((stat) => (
            <li key={stat.label}>
              <StatTile label={stat.label} value="—" footnote={stat.footnote} />
            </li>
          ))}
        </ul>
      </section>

      <Card title="Muscle volume" eyebrow="Last 8 weeks">
        {/* Empty baseline grid only — no bars are drawn until real sets exist. */}
        <div className={styles.chart} aria-hidden="true" />
        <p className={styles.chartCaption}>No sessions logged yet.</p>
      </Card>

      <PhaseNotice phase="Phase 7" heading="Charts and personal records">
        Phase 7 turns logged sessions into volume, strength, and record tracking across muscle groups.
      </PhaseNotice>
    </div>
  )
}
