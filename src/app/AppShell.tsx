import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { BuildStamp } from '../components/BuildStamp'
import { Pill } from '../components/Pill'
import { BottomNav } from './BottomNav'
import { UpdatePrompt } from './UpdatePrompt'
import { BUILD_INFO, formatPhaseTag } from './buildInfo'
import { useSetupState } from './setupGate'
import styles from './AppShell.module.css'

export function AppShell() {
  const { pathname } = useLocation()
  const { forcingSetup, onSetup } = useSetupState()

  /*
   * While the gate is forcing setup, every tab bounces straight back here, so a
   * painted nav is five focusable controls that do nothing — a dead end in the
   * middle of the one task the person has been given. It is removed from the
   * page entirely rather than disabled, so it is out of the tab order too.
   *
   * The nav stays for every other visit to this route, which is what the shared
   * `SetupState` is for: the shell never re-derives the gate's rule.
   */
  const hideNav = forcingSetup && onSetup

  // Each tab is its own page, so it starts at the top rather than inheriting
  // the previous tab's scroll offset. Assigning scrollTop keeps this a no-op
  // under jsdom instead of a "not implemented" warning.
  useEffect(() => {
    document.documentElement.scrollTop = 0
  }, [pathname])

  return (
    <>
      <div className="wc-aurora" aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <BrandMark className={styles.mark} />
            <div className={styles.brand}>
              <span className={styles.wordmark}>Workout Conductor</span>
              <span className={styles.tagline}>Adaptive Strength + Hypertrophy</span>
            </div>
            <div className={styles.phase}>
              <Pill tone="accent">{formatPhaseTag(BUILD_INFO.phase)}</Pill>
            </div>
          </div>
        </header>

        <main className={[styles.main, hideNav ? styles.mainNoNav : null].filter(Boolean).join(' ')}>
          <Outlet />
          <BuildStamp />
        </main>

        {!hideNav && <BottomNav />}
        <UpdatePrompt />
      </div>
    </>
  )
}
