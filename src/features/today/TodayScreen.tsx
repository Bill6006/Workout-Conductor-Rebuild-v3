import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SectionHeading } from '../../components/SectionHeading'
import { StatTile } from '../../components/StatTile'
import { Suspense, lazy, useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ONBOARDING_PATH } from '../../app/setupGate'
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

/**
 * Start Workout while there is no session to start.
 *
 * The button works — it is disabled here because the session it would start does
 * not exist yet, and the caption says which of those it is rather than repeating
 * a phase number that has since shipped.
 */
function StartAction({ status }: { status: Exclude<WorkoutStatus, 'ready'> }) {
  return (
    <>
      <PrimaryAction disabled>Start Workout</PrimaryAction>
      <p className={styles.caption}>
        {status === 'loading'
          ? 'Ready as soon as your session finishes building.'
          : 'There is no session to start right now.'}
      </p>
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
      <StartAction status={status} />
    </Card>
  )
}

/**
 * No profile — either because setup has not happened, or because the saved one
 * could not be read.
 *
 * THE SECOND CASE MUST NOT DEAD-END. The profile store deliberately refuses to
 * write a fresh profile over one it could not read, which is the right call —
 * overwriting is how somebody loses months of history to a transient storage
 * error. But a refusal with no way forward strands the person, which is what
 * this card used to do: a generic sentence, two disabled controls, and nothing
 * to press.
 *
 * So it now says WHY, offers a retry, and — only after making the consequence
 * explicit — offers to start over.
 */
function EmptySessionCard({
  unavailable,
  onRetry,
  retrying,
}: {
  unavailable: boolean
  onRetry: () => void
  retrying: boolean
}) {
  if (!unavailable) {
    return (
      <Card tone="accent" eyebrow="Today" title="No profile yet">
        <p className={styles.copy}>
          Once your profile is set up, this card holds the session for today and the one control that shapes
          it.
        </p>
        <DurationControl value="default" onChange={() => {}} defaultMinutes={null} disabled />
      </Card>
    )
  }

  return (
    <Card tone="accent" eyebrow="Today" title="Your profile could not be read">
      {/*
        The app-level storage notice already carries the technical reason. Saying
        it twice on one screen reads as two problems, so this card does the other
        half of the job: what it means for you, and what to do about it.
      */}
      <p className={styles.copy}>
        Nothing has been deleted. The most common cause is another copy of this app still open in another tab
        or window — close those and try again.
      </p>

      <PrimaryAction onClick={onRetry} disabled={retrying}>
        {retrying ? 'Trying again…' : 'Try again'}
      </PrimaryAction>

      <p className={styles.caption}>
        Still stuck? <Link to={ONBOARDING_PATH}>Set up a new profile</Link> — this creates a fresh one and
        leaves the unreadable data where it is.
      </p>
    </Card>
  )
}

export function TodayScreen() {
  const navigate = useNavigate()
  const { profile, status, reload } = useProfile()
  const session = useGeneratedWorkout(profile)
  const [starting, setStarting] = useState(false)
  const [retrying, setRetrying] = useState(false)

  /**
   * Starting a session hands the generated workout to the active-session store,
   * which persists it before the Workout tab opens. If the save fails the person
   * stays on Today with the session unstarted, rather than arriving at a screen
   * backed by nothing.
   */
  const startSession = useCallback(() => {
    const workout = session.workout
    if (!workout) return
    setStarting(true)
    // Imported here rather than at the top: the session store pulls in the
    // workout schema, and Today is the landing route. A button nobody has
    // pressed yet should not cost first paint.
    void import('../workout/startSession')
      .then(({ startSession: begin }) => begin(workout))
      .then((started) => {
        if (started) navigate('/workout')
      })
      .finally(() => setStarting(false))
  }, [navigate, session.workout])

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
        <EmptySessionCard
          unavailable={status === 'error'}
          onRetry={() => {
            setRetrying(true)
            void reload().finally(() => setRetrying(false))
          }}
          retrying={retrying}
        />
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
            onStart={startSession}
            starting={starting}
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
