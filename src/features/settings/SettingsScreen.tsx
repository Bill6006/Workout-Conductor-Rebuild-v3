import { BUILD_INFO } from '../../app/buildInfo'
import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { Pill } from '../../components/Pill'
import { ScreenHeader } from '../../components/ScreenHeader'
import styles from './SettingsScreen.module.css'

const REPO_URL = 'https://github.com/Bill6006/Workout-Conductor-Rebuild-v3'

interface SettingsRow {
  label: string
  hint: string
}

interface SettingsGroup {
  title: string
  rows: SettingsRow[]
}

const GROUPS: SettingsGroup[] = [
  {
    title: 'Training',
    rows: [
      { label: 'Goals & programming', hint: 'Strength and hypertrophy balance' },
      { label: 'Advanced techniques', hint: 'Supersets, drop sets, circuits' },
      { label: 'Exercise preferences', hint: 'Favourites and exclusions' },
      { label: 'Limitations', hint: 'Injuries and movements to avoid' },
    ],
  },
  {
    title: 'Environment',
    rows: [
      { label: 'Equipment & locations', hint: 'Gym, home, travel' },
      { label: 'Units', hint: 'Kilograms or pounds' },
    ],
  },
  {
    title: 'Data',
    rows: [
      { label: 'Backup & restore', hint: 'Export and import a local file' },
      { label: 'Diagnostics', hint: 'Storage and service worker state' },
    ],
  },
]

function ChevronRight() {
  return (
    <svg
      className={styles.chevron}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.5 6 15.5 12 9.5 18" />
    </svg>
  )
}

export function SettingsScreen() {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="Settings" subtitle="Preferences, data, and build details." />

      {GROUPS.map((group) => (
        <Card key={group.title} title={group.title}>
          <ul className={styles.rows} role="list">
            {group.rows.map((row) => (
              <li key={row.label}>
                <button type="button" className={styles.row} disabled aria-disabled="true">
                  <span className={styles.rowText}>
                    <span className={styles.rowLabel}>{row.label}</span>
                    <span className={styles.rowHint}>{row.hint}</span>
                  </span>
                  <ChevronRight />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {/* The one card on this screen showing real, live values. */}
      <Card title="Build" eyebrow="This device" action={<Pill tone="accent">Live</Pill>}>
        <dl className={styles.build} data-testid="build-card">
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Marker</dt>
            <dd className={styles.buildValue}>{BUILD_INFO.marker}</dd>
          </div>
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Phase</dt>
            <dd className={styles.buildValue}>{BUILD_INFO.phase}</dd>
          </div>
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Commit</dt>
            <dd className={styles.buildValue}>{BUILD_INFO.commit}</dd>
          </div>
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Built</dt>
            <dd className={styles.buildValue}>
              <time dateTime={BUILD_INFO.time}>{BUILD_INFO.time}</time>
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="About" tone="muted">
        <div className={styles.about}>
          <p className={styles.aboutName}>Workout Conductor</p>
          <p className={styles.aboutLine}>Adaptive Strength + Hypertrophy</p>
        </div>
        <p className={styles.aboutLine}>Local-first. Your workout history never leaves this device.</p>
        <a className={styles.link} href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub repository
          <span className="wc-visually-hidden"> (opens in a new tab)</span>
        </a>
      </Card>

      <PhaseNotice phase="Phase 1" heading="Editable settings">
        Phase 1 makes every preference here editable and stores your choices locally on this device.
      </PhaseNotice>
    </div>
  )
}
