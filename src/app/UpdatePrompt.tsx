import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PrimaryAction } from '../components/PrimaryAction'
import styles from './UpdatePrompt.module.css'

const OFFLINE_TOAST_MS = 4000

/**
 * Service worker lifecycle surface.
 *
 * The worker is registered with `skipWaiting: false` and `clientsClaim: false`
 * (see vite.config.ts), so a deployment can never take over a live tab: it
 * waits until the user chooses to update. That is what keeps a deploy from
 * refreshing the page mid-session or disturbing local IndexedDB data.
 *
 * PHASE NOTE: once workouts can be active (Phase 5), this prompt must be
 * suppressed while a session is running and re-offered when it ends. Losing a
 * half-logged session to an update is not acceptable.
 */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.error('Service worker registration failed', error)
    },
  })

  useEffect(() => {
    if (!offlineReady) return

    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <div className={styles.layer}>
        <div className={styles.toast} role="status" aria-live="polite">
          <p className={styles.title}>New version available</p>
          <p className={styles.copy}>Updating reloads the app. Everything saved on this device is kept.</p>
          <div className={styles.actions}>
            <PrimaryAction onClick={() => void updateServiceWorker(true)}>Update</PrimaryAction>
            <PrimaryAction variant="ghost" onClick={() => setNeedRefresh(false)}>
              Later
            </PrimaryAction>
          </div>
        </div>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className={styles.layer}>
        <div className={`${styles.toast} ${styles.compact}`} role="status" aria-live="polite">
          <p className={styles.title}>Ready to work offline</p>
        </div>
      </div>
    )
  }

  return null
}
