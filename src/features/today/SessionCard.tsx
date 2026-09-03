/**
 * Today's generated session.
 *
 * This replaces the Phase 1 demo fixture entirely — `demoWorkout.ts` documented
 * its own deletion for exactly this moment, so there is no labelled sample left
 * anywhere and nothing that could be mistaken for one.
 *
 * Start Workout is still disabled. The engine can build a session but nothing
 * can yet run one: the active workout screen, the set logger, and the rest timer
 * are Phase 5, and a button that pretended otherwise would be the dishonest kind
 * of progress.
 */
import { Card } from '../../components/Card'
import { Pill } from '../../components/Pill'
import { PrimaryAction } from '../../components/PrimaryAction'
import {
  isSupersetBlock,
  workoutListRows,
  type DurationChoice,
  type Workout,
} from '../../core/validation/workoutSchema'
import { DurationControl } from './DurationControl'
import styles from './SessionCard.module.css'

interface SessionCardProps {
  readonly workout: Workout
  readonly choice: DurationChoice
  readonly onChoose: (choice: DurationChoice) => void
  readonly rebuilding: boolean
  readonly nameOf: (exerciseId: string) => string | null
  /** Where they are training and how they train — carried over from the profile card. */
  readonly locationName: string
  readonly trainingStyleLabel: string
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}

export function SessionCard({
  workout,
  choice,
  onChoose,
  rebuilding,
  nameOf,
  locationName,
  trainingStyleLabel,
}: SessionCardProps) {
  const rows = workoutListRows(workout, nameOf)
  const overruns = workout.estimatedMinutes > workout.plannedMinutes

  return (
    <Card tone="accent" eyebrow="Today" title={workout.title}>
      <p className={styles.headline}>{workout.explanation.headline}</p>

      <dl className={styles.facts} data-testid="today-facts">
        <Fact label="Location" value={locationName} />
        <Fact label="Planned length" value={`${workout.plannedMinutes} min`} />
        <Fact label="Training style" value={trainingStyleLabel} />
      </dl>

      <DurationControl
        value={choice}
        onChange={onChoose}
        defaultMinutes={choice === 'default' ? workout.estimatedMinutes : null}
      />
      <p className={styles.caption} aria-live="polite">
        {rebuilding
          ? 'Rebuilding your session…'
          : `About ${workout.estimatedMinutes} min${overruns ? ' — a few minutes over' : ''}. Changing the length rebuilds the session, it does not cut the end off.`}
      </p>

      <ol className={styles.list} role="list">
        {rows.map((row) => (
          <li key={row.rowId} className={styles.item}>
            <div className={styles.itemHead}>
              <span className={styles.itemTitle}>{row.title}</span>
              {row.kind === 'superset' && <Pill tone="accent">Superset</Pill>}
            </div>
            <span className={styles.itemDetail}>{row.detail}</span>
          </li>
        ))}
      </ol>

      <PrimaryAction disabled>Start Workout</PrimaryAction>
      <p className={styles.caption}>Logging a session arrives in Phase 5, so this cannot start one yet.</p>
    </Card>
  )
}

interface WhyCardProps {
  readonly workout: Workout
}

/** Why the session looks the way it does — the generator's own reasons, not a guess. */
export function WhyCard({ workout }: WhyCardProps) {
  const supersets = workout.blocks.filter(isSupersetBlock).length

  return (
    <Card title="Why this session">
      <ul className={styles.points} role="list">
        {workout.explanation.points.map((point, index) => (
          <li key={`${point.code}-${index}`} className={styles.point}>
            {point.text}
          </li>
        ))}
      </ul>

      {workout.knownCompromises.length > 0 && (
        <>
          <p className={styles.subhead}>What it gave up</p>
          <ul className={styles.points} role="list">
            {workout.knownCompromises.map((compromise, index) => (
              <li key={`${compromise.code}-${index}`} className={styles.point}>
                {compromise.text}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className={styles.confidence}>
        Confidence: {workout.confidence.level}
        {workout.confidence.limiters.includes('no-workout-history')
          ? ' — this is a first guess until you have logged some sessions.'
          : '.'}
        {supersets > 0 ? ` ${supersets === 1 ? 'One pairing' : `${supersets} pairings`} used.` : ''}
      </p>
    </Card>
  )
}
