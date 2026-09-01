import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SectionHeading } from '../../components/SectionHeading'
import { StatTile } from '../../components/StatTile'
import { useProfile } from '../../core/state'
import { nowIso } from '../../core/time/clock'
import { WEEKDAYS, activeLocation, type Profile, type TrainingStyle } from '../../core/validation/schemas'
import { DemoWorkoutCard } from './DemoWorkoutCard'
import styles from './TodayScreen.module.css'

const LENGTH_LABEL_ID = 'today-length-label'
const LENGTH_VALUE_ID = 'today-length-value'

const EM_DASH = '—'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const TRAINING_STYLE_LABEL: Record<TrainingStyle, string> = {
  hybrid: 'Strength + hypertrophy',
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
}

/** Monday-first weekday key for a date, matching `WEEKDAYS` in the schema. */
function weekdayKey(date: Date) {
  return WEEKDAYS[(date.getDay() + 6) % 7]
}

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

interface FactProps {
  label: string
  value: string
}

function Fact({ label, value }: FactProps) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}

/**
 * The one workout-length control in the product.
 *
 * LOCKED DECISION: exactly one control — 15 / 30 / 45 / Default — and in Phase 1
 * it is a static display of the profile's default duration. It becomes a working
 * dropdown in Phase 3. There is no second start button and no Full / Lazy /
 * Short / Density / Recovery mode anywhere in the app. `src/app/App.test.tsx`
 * enforces this across every route.
 */
function WorkoutLength({ minutes }: { minutes: number | null }) {
  return (
    <>
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
          <span id={LENGTH_VALUE_ID}>{minutes === null ? 'Default time' : `Default · ${minutes} min`}</span>
          <ChevronDown />
        </button>
      </div>
      <p className={styles.caption}>
        One duration control — 15 / 30 / 45 / Default. It becomes a working dropdown in Phase 3.
      </p>
    </>
  )
}

function StartAction() {
  return (
    <>
      <PrimaryAction disabled>Start Workout</PrimaryAction>
      <p className={styles.caption}>
        There is no workout engine yet, so this cannot start a session. It turns on in Phase 3.
      </p>
    </>
  )
}

interface SessionCardProps {
  profile: Profile
  trainingToday: boolean
}

function SessionCard({ profile, trainingToday }: SessionCardProps) {
  const place = activeLocation(profile)

  return (
    <Card tone="accent" eyebrow="Today" title={trainingToday ? 'Training day' : 'Rest day'}>
      <p className={styles.copy}>
        {trainingToday
          ? 'Today is one of your training days. Your session is not built yet — the workout engine arrives in Phase 3.'
          : 'Today is not one of your training days. You can still train; the engine that builds sessions arrives in Phase 3.'}
      </p>

      <dl className={styles.facts} data-testid="today-facts">
        <Fact label="Location" value={place.name} />
        <Fact label="Planned length" value={`${profile.schedule.typicalDurationMin} min`} />
        <Fact label="Training style" value={TRAINING_STYLE_LABEL[profile.trainingStyle]} />
      </dl>

      <WorkoutLength minutes={profile.schedule.typicalDurationMin} />
      <StartAction />
    </Card>
  )
}

function EmptySessionCard({ unavailable }: { unavailable: boolean }) {
  return (
    <Card tone="accent" eyebrow="Today" title="No profile yet">
      <p className={styles.copy}>
        {unavailable
          ? 'Your saved profile could not be read on this device, so there is nothing to show here yet.'
          : 'Once your profile is set up, this card holds the session for today and the one control that shapes it.'}
      </p>

      <WorkoutLength minutes={null} />
      <StartAction />
    </Card>
  )
}

export function TodayScreen() {
  const { profile, status } = useProfile()

  const today = new Date(nowIso())
  const trainingToday = profile ? profile.schedule.availableDays.includes(weekdayKey(today)) : false
  const place = profile ? activeLocation(profile) : null

  return (
    <div className={styles.screen}>
      <ScreenHeader
        eyebrow={dateFormatter.format(today)}
        title="Today"
        subtitle={
          profile
            ? 'Your training profile, and a sample of what a session looks like.'
            : 'Your session will be built here once your profile exists.'
        }
      />

      {profile ? (
        <SessionCard profile={profile} trainingToday={trainingToday} />
      ) : (
        <EmptySessionCard unavailable={status === 'error'} />
      )}

      <section className={styles.group}>
        <SectionHeading title="At a glance" />
        <ul className={styles.stats} role="list" aria-label="At a glance">
          <li>
            <StatTile
              label="Planned time"
              value={profile ? String(profile.schedule.typicalDurationMin) : EM_DASH}
              footnote={profile ? 'minutes' : undefined}
            />
          </li>
          <li>
            <StatTile
              label="Training days"
              value={profile ? String(profile.schedule.availableDays.length) : EM_DASH}
              footnote={profile ? 'in your week' : undefined}
            />
          </li>
          <li>
            <StatTile
              label="Location"
              value={place ? place.name : EM_DASH}
              footnote={place ? `${place.equipment.length} items` : undefined}
            />
          </li>
        </ul>
      </section>

      <DemoWorkoutCard />

      <PhaseNotice phase="Phase 3" heading="Your real sessions">
        Phase 3 builds the workout engine. It replaces the sample above with a session chosen for your goals,
        your equipment, and the time you have, and it turns on the length dropdown and the start button.
      </PhaseNotice>
    </div>
  )
}
