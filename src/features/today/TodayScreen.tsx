import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SectionHeading } from '../../components/SectionHeading'
import { StatTile } from '../../components/StatTile'
import styles from './TodayScreen.module.css'

const LENGTH_LABEL_ID = 'today-length-label'
const LENGTH_VALUE_ID = 'today-length-value'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function ChevronDown() {
  return (
    <svg
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
      <path d="M6 9.5 12 15.5 18 9.5" />
    </svg>
  )
}

export function TodayScreen() {
  return (
    <div className={styles.screen}>
      <ScreenHeader
        eyebrow={dateFormatter.format(new Date())}
        title="Today"
        subtitle="Nothing is scheduled yet. Your session will be built here."
      />

      <Card tone="accent" eyebrow="Up next" title="No session planned">
        <p className={styles.copy}>
          Once your profile exists, this card holds the session for today and the one control that shapes it.
        </p>

        {/*
          The product has exactly ONE workout-length control — this row. There
          are deliberately no competing "quick / full / express" mode buttons
          anywhere in the app. Phase 3 turns it into a working 15 / 30 / 45 /
          Default dropdown; until then it is a static, disabled display.
        */}
        <div className={styles.lengthRow}>
          <span className={styles.lengthLabel} id={LENGTH_LABEL_ID}>
            Workout length
          </span>
          <button
            type="button"
            className={styles.lengthControl}
            disabled
            aria-disabled="true"
            aria-labelledby={`${LENGTH_LABEL_ID} ${LENGTH_VALUE_ID}`}
          >
            <span id={LENGTH_VALUE_ID}>Default time</span>
            <ChevronDown />
          </button>
        </div>
        <p className={styles.caption}>One duration control — 15 / 30 / 45 / Default. Arrives in Phase 3.</p>

        <PrimaryAction disabled>Start Workout</PrimaryAction>
      </Card>

      <section className={styles.group}>
        <SectionHeading title="At a glance" />
        <ul className={styles.stats} role="list">
          <li>
            <StatTile label="Readiness" value="—" />
          </li>
          <li>
            <StatTile label="Muscle focus" value="—" />
          </li>
          <li>
            <StatTile label="Planned duration" value="—" />
          </li>
        </ul>
      </section>

      <PhaseNotice phase="Phase 1" heading="Profile and session preview">
        Phase 1 adds onboarding, your training profile, and a clearly labelled synthetic demo workout preview.
      </PhaseNotice>
    </div>
  )
}
