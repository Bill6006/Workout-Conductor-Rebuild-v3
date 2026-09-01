import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import styles from './PlanScreen.module.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']

export function PlanScreen() {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="Plan" subtitle="Your week, your targets, and where you train." />

      <Card title="This week">
        <ul className={styles.week} role="list">
          {DAYS.map((day) => (
            <li key={day} className={styles.day}>
              <span className={styles.dayName}>{day}</span>
              <span className={styles.dayValue}>—</span>
            </li>
          ))}
        </ul>
        <p className={styles.caption}>No sessions scheduled.</p>
      </Card>

      <Card title="Weekly muscle targets">
        <dl className={styles.rows}>
          {MUSCLE_GROUPS.map((group) => (
            <div key={group} className={styles.row}>
              <dt className={styles.rowLabel}>{group}</dt>
              <dd className={styles.rowValue}>—</dd>
            </div>
          ))}
        </dl>
        <p className={styles.caption}>Weekly set targets are set in Phase 7.</p>
      </Card>

      <Card title="Locations & equipment">
        <p className={styles.empty}>No locations yet.</p>
        <PrimaryAction variant="ghost" disabled>
          Add a location
        </PrimaryAction>
      </Card>

      <PhaseNotice phase="Phases 1 & 7" heading="Locations, targets, and the weekly view">
        Phase 1 sets up locations and equipment; Phase 7 adds weekly planning and muscle volume targets.
      </PhaseNotice>
    </div>
  )
}
