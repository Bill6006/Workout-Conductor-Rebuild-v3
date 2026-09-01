import { Card } from '../../components/Card'
import { Pill } from '../../components/Pill'
import {
  DEMO_WORKOUT,
  DEMO_WORKOUT_DISCLAIMER,
  EMPHASIS_LABEL,
  describeRest,
  describeSets,
  formatRest,
  formatSets,
} from './demoWorkout'
import styles from './DemoWorkoutCard.module.css'

/**
 * Read-only preview of the hand-written demo fixture.
 *
 * Deliberately inert: no buttons, no links, no handlers. Tapping it starts
 * nothing, logs nothing, and saves nothing. The "Demo" pill and the disclaimer
 * sentence are not decoration — they are the reason this card is allowed to
 * exist before the engine does, so neither may be removed.
 */
export function DemoWorkoutCard() {
  const workout = DEMO_WORKOUT

  return (
    <Card eyebrow="Sample session" title={workout.title} action={<Pill tone="neutral">Demo</Pill>}>
      <p className={styles.disclaimer}>{DEMO_WORKOUT_DISCLAIMER}</p>

      <p className={styles.meta}>
        {workout.focus} · {workout.styleLabel} · about {workout.estimatedMinutes} min
      </p>

      <ul className={styles.list} role="list" aria-label="Sample session exercises">
        {workout.exercises.map((exercise) => (
          <li key={exercise.id} className={styles.item}>
            <p className={styles.name}>{exercise.name}</p>
            <p className={styles.detail}>
              <span className={styles.figure}>
                <span aria-hidden="true">{formatSets(exercise)}</span>
                <span className="wc-visually-hidden">{describeSets(exercise)}</span>
              </span>
              <span className={styles.divider} aria-hidden="true">
                ·
              </span>
              <span className={styles.figure}>
                <span aria-hidden="true">Rest {formatRest(exercise.restSeconds)}</span>
                <span className="wc-visually-hidden">{describeRest(exercise.restSeconds)}</span>
              </span>
              <span className={styles.divider} aria-hidden="true">
                ·
              </span>
              <span className={styles.emphasis}>{EMPHASIS_LABEL[exercise.emphasis]}</span>
            </p>
          </li>
        ))}
      </ul>

      <p className={styles.footnote}>
        Nothing here is saved to this device, and none of it counts as training.
      </p>
    </Card>
  )
}
