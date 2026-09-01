import { Link } from 'react-router-dom'
import { BrandMark } from '../../components/BrandMark'
import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { ScreenHeader } from '../../components/ScreenHeader'
import styles from './WorkoutScreen.module.css'

/**
 * Locked product decision: the app has exactly ONE start control and it lives
 * on Today, next to the single workout-length control. This screen must never
 * grow a second or competing start button — when nothing is running it says so
 * and points back to Today. `src/app/App.test.tsx` guards that app-wide.
 */
export function WorkoutScreen() {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="Workout" subtitle="No active session." />

      <Card>
        <div className={styles.empty}>
          <BrandMark size={44} className={styles.mark} />
          <p className={styles.copy}>
            Nothing is running. A session started from Today will play out here, set by set.
          </p>
          <Link to="/" className={styles.todayLink}>
            Go to Today
          </Link>
        </div>
      </Card>

      <PhaseNotice phase="Phase 5" heading="The live session screen">
        Phase 5 brings the active workout screen, set logger, rest timer, supersets, and exercise
        demonstrations.
      </PhaseNotice>
    </div>
  )
}
