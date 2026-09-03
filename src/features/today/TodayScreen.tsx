import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SectionHeading } from '../../components/SectionHeading'
import { StatTile } from '../../components/StatTile'
import { Suspense, lazy } from 'react'
import { CalibrationOverlay } from '../../components/CalibrationOverlay'
import { useProfile } from '../../core/state'
import { nowIso } from '../../core/time/clock'
import { WEEKDAYS, activeLocation, type Profile, type TrainingStyle } from '../../core/validation/schemas'
import type { DurationChoice } from '../../core/validation/workoutSchema'
import { DurationControl } from './DurationControl'
// The generated-session cards read the workout schema's helpers, which pull in
// the Zod model. They only render once a session exists, so they load with it
// rather than on the boot chunk.
const GeneratedSessionCard = lazy(() =>
  import('./SessionCard').then((module) => ({ default: module.SessionCard })),
)
const WhyCard = lazy(() => import('./SessionCard').then((module) => ({ default: module.WhyCard })))
import { useGeneratedWorkout, type WorkoutStatus } from './useGeneratedWorkout'
import styles from './TodayScreen.module.css'

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

function StartAction() {
  return (
    <>
      <PrimaryAction disabled>Start Workout</PrimaryAction>
      <p className={styles.caption}>Logging a session arrives in Phase 5, so this cannot start one yet.</p>
    </>
  )
}

interface SessionCardProps {
  profile: Profile
  trainingToday: boolean
  /** Why there is no session to show: still loading, or nothing could be built. */
  status: Exclude<WorkoutStatus, 'ready'>
  message: string | null
  choice: DurationChoice
  onChoose: (choice: DurationChoice) => void
}

function SessionCard({ profile, trainingToday, status, message, choice, onChoose }: SessionCardProps) {
  const place = activeLocation(profile)

  return (
    <Card tone="accent" eyebrow="Today" title={trainingToday ? 'Training day' : 'Rest day'}>
      <p className={styles.copy}>
        {status === 'loading'
          ? 'Building your session…'
          : (message ??
            (trainingToday
              ? 'Today is one of your training days.'
              : 'Today is not one of your training days, but you can still train.'))}
      </p>

      <dl className={styles.facts} data-testid="today-facts">
        <Fact label="Location" value={place.name} />
        <Fact label="Planned length" value={`${profile.schedule.typicalDurationMin} min`} />
        <Fact label="Training style" value={TRAINING_STYLE_LABEL[profile.trainingStyle]} />
      </dl>

      <DurationControl
        value={choice}
        onChange={onChoose}
        defaultMinutes={profile.schedule.typicalDurationMin}
        disabled={status === 'loading'}
      />
      <p className={styles.caption}>
        Choosing a length rebuilds the session for that time — it does not cut the end off a longer one.
      </p>
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

      <DurationControl value="default" onChange={() => {}} defaultMinutes={null} disabled />
      <StartAction />
    </Card>
  )
}

export function TodayScreen() {
  const { profile, status } = useProfile()
  const session = useGeneratedWorkout(profile)

  const today = new Date(nowIso())
  const trainingToday = profile ? profile.schedule.availableDays.includes(weekdayKey(today)) : false
  const place = profile ? activeLocation(profile) : null

  const waitingCard = profile ? (
    <SessionCard
      profile={profile}
      trainingToday={trainingToday}
      status={session.status === 'ready' ? 'loading' : session.status}
      message={session.message}
      choice={session.choice}
      onChoose={session.setChoice}
    />
  ) : null

  return (
    <div className={styles.screen}>
      <ScreenHeader
        eyebrow={dateFormatter.format(today)}
        title="Today"
        subtitle={
          profile
            ? 'Built for your goals, your equipment, and the time you have.'
            : 'Your session will be built here once your profile exists.'
        }
      />

      {!profile ? (
        <EmptySessionCard unavailable={status === 'error'} />
      ) : session.status === 'ready' && session.workout ? (
        /*
         * The waiting card IS the suspense fallback, not `null`. The one
         * workout-length control must never blink out of existence while the
         * session card's chunk loads — CI caught exactly that, and a control
         * that vanishes for a frame is a control a thumb can miss.
         */
        <Suspense fallback={waitingCard}>
          <GeneratedSessionCard
            workout={session.workout}
            choice={session.choice}
            onChoose={session.setChoice}
            rebuilding={session.rebuilding}
            nameOf={session.nameOf}
            lastChange={session.lastChange}
            locationName={activeLocation(profile).name}
            trainingStyleLabel={TRAINING_STYLE_LABEL[profile.trainingStyle]}
          />
        </Suspense>
      ) : (
        waitingCard
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

      <CalibrationOverlay
        open={session.rebuilding || session.recalibrationError !== null}
        trigger="duration-changed"
        error={session.recalibrationError}
        onDismiss={session.dismissError}
      />

      {session.status === 'ready' && session.workout && (
        <Suspense fallback={null}>
          <WhyCard workout={session.workout} />
        </Suspense>
      )}

      <PhaseNotice phase="Phase 5" heading="Running the session">
        The engine builds your session and the length dropdown rebuilds it. Logging it — the set logger, the
        rest timer, and swapping an exercise mid-session — arrives in Phase 5.
      </PhaseNotice>
    </div>
  )
}
