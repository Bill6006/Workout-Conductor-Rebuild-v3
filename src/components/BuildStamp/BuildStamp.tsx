import { BUILD_INFO, formatBuildStamp } from '../../app/buildInfo'
import styles from './BuildStamp.module.css'

/**
 * The always-visible deployment marker. It sits at the foot of every screen's
 * scroll area so any screenshot can be traced back to an exact build.
 */
export function BuildStamp() {
  return (
    <p className={styles.stamp} data-testid="build-marker">
      {`${BUILD_INFO.marker} · ${formatBuildStamp(BUILD_INFO)}`}
    </p>
  )
}
