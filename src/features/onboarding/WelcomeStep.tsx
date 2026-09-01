import { Card } from '../../components/Card'
import styles from './OnboardingSteps.module.css'

const POINTS: readonly { title: string; body: string }[] = [
  {
    title: 'Everything stays on this device',
    body: 'No account, no sync, no analytics. Your answers are stored in this browser.',
  },
  {
    // Six, because that is how many question steps the flow has: goals,
    // experience, schedule, places, training, limits. The welcome and review
    // steps are not questions. `ONBOARDING_STEPS` is the source of truth for
    // that count, and `steps.test.ts` fails if the two ever disagree again.
    title: 'Six short questions',
    body: 'Goals, experience, your week, where you train, techniques, and anything to work around.',
  },
  {
    title: 'Nothing here is final',
    body: 'Every answer can be changed afterwards, and you can run setup again.',
  },
]

/** The honest opener: what the app will ask for, and where the answers go. */
export function WelcomeStep() {
  return (
    <div className={styles.stack}>
      <Card tone="accent" title="Before you start">
        <ul className={styles.points} role="list">
          {POINTS.map((point) => (
            <li key={point.title} className={styles.point}>
              <span className={styles.tick} aria-hidden="true">
                &#10003;
              </span>
              <span className={styles.pointText}>
                <span className={styles.pointTitle}>{point.title}</span>
                <span className={styles.pointBody}>{point.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className={styles.note}>
        In a hurry? Skip setup and the app starts with sensible defaults you can edit later.
      </p>
    </div>
  )
}
