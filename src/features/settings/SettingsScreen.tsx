import { useCallback, useEffect, useRef, useState } from 'react'
import { BUILD_INFO, formatBuildStamp } from '../../app/buildInfo'
import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { Pill } from '../../components/Pill'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useProfile } from '../../core/state'
import { DataSettings } from './DataSettings'
import { LocationSettings } from './LocationSettings'
import { ProfileSettings } from './ProfileSettings'
import styles from './SettingsScreen.module.css'

const REPO_URL = 'https://github.com/Bill6006/Workout-Conductor-Rebuild-v3'

/**
 * The same build time, in the same words, as the footer stamp on this screen.
 *
 * `formatBuildStamp` is the one formatter for it, and it publishes the composed
 * string rather than its halves, so the stamp's own time half is what this reads
 * back. Two spellings of one value on one screen is a bug the reviewer caught —
 * the raw ISO string was showing here while the footer read `2026-09-01 21:32
 * UTC`. A build with no readable time has no time half, and the raw value (which
 * is then `unknown`) stands in.
 */
function buildTimeText(): string | null {
  return formatBuildStamp(BUILD_INFO).split(' · ')[1] ?? null
}

export interface SettingsScreenProps {
  /**
   * Onboarding's re-entry point. The onboarding feature owns it and the app
   * shell wires it in; Settings only calls it.
   */
  onRerunSetup?: () => void
}

/**
 * THE settings surface. There is exactly one, and every change on it writes
 * through the profile store's verified save path.
 *
 * EDITING PATTERN: one compact row per stored value showing what is saved, and
 * a sheet to change it. The sheet holds a draft, so nothing on screen claims a
 * new value until the store has written it, read it back, and verified it.
 */
export function SettingsScreen({ onRerunSetup }: SettingsScreenProps) {
  const { status, profile, error, saving, reload, ensureProfile } = useProfile()
  const [saved, setSaved] = useState({ text: '', seq: 0 })
  const [starting, setStarting] = useState(false)
  const builtAt = buildTimeText()
  const busy = saving || starting

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // The sequence number keys the live region, so saving the same field twice
  // remounts the node and gets announced twice rather than falling silent.
  const announce = useCallback((message: string) => {
    setSaved((current) => ({ text: message, seq: current.seq + 1 }))
  }, [])

  async function startSetup() {
    if (busy) return
    setStarting(true)
    try {
      // Onboarding's re-entry point when the shell wired one in; creating the
      // default record is the fallback, and it is the branch that writes.
      if (onRerunSetup) onRerunSetup()
      else await ensureProfile()
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  return (
    <div className={styles.screen}>
      <ScreenHeader title="Settings" subtitle="Your profile, your equipment, and your data." />

      <p key={saved.seq} className={styles.saved} role="status">
        {saved.text}
      </p>

      {status === 'loading' && (
        <Card title="Settings">
          <p className={styles.state}>Reading your profile from this device…</p>
        </Card>
      )}

      {status === 'error' && (
        <Card title="Settings are unavailable">
          <p className={styles.stateError}>{error ?? 'Your profile could not be read from this device.'}</p>
          <p className={styles.state}>
            Nothing has been changed or lost. Private browsing and blocked site storage are the usual causes.
          </p>
          <PrimaryAction variant="ghost" onClick={() => void reload()}>
            Try again
          </PrimaryAction>
        </Card>
      )}

      {status === 'empty' && (
        <Card title="No profile yet">
          <p className={styles.state}>
            Setup has not run on this device, so there is nothing to edit. It takes about a minute.
          </p>
          {/*
            Disabled in flight, like every other control that writes. The store's
            own `saving` flag is not enough on its own: `ensureProfile` re-reads
            storage before it writes anything, and `saving` only goes true once
            that read has come back — so a second tap inside that window would
            start a second create. `starting` closes it from the first tap.
          */}
          <PrimaryAction disabled={busy} onClick={() => void startSetup()}>
            {busy ? 'Setting up…' : 'Set up now'}
          </PrimaryAction>
        </Card>
      )}

      {status === 'ready' && profile && (
        <>
          <ProfileSettings profile={profile} onSaved={announce} />
          <LocationSettings profile={profile} onSaved={announce} />
          <DataSettings profile={profile} onSaved={announce} onRerunSetup={onRerunSetup} />
        </>
      )}

      {/* Live values straight from the build globals — never edited, never faked. */}
      <Card title="Build" eyebrow="This device" action={<Pill tone="accent">Live</Pill>}>
        <dl className={styles.build} data-testid="build-card">
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Marker</dt>
            <dd className={styles.buildValue}>{BUILD_INFO.marker}</dd>
          </div>
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Phase</dt>
            <dd className={styles.buildValue}>{BUILD_INFO.phase}</dd>
          </div>
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Commit</dt>
            <dd className={styles.buildValue}>{BUILD_INFO.commit}</dd>
          </div>
          <div className={styles.buildRow}>
            <dt className={styles.buildLabel}>Built</dt>
            <dd className={styles.buildValue}>
              {builtAt ? <time dateTime={BUILD_INFO.time}>{builtAt}</time> : BUILD_INFO.time}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="About" tone="muted">
        <div className={styles.about}>
          <p className={styles.aboutName}>Workout Conductor</p>
          <p className={styles.aboutLine}>Adaptive Strength + Hypertrophy</p>
        </div>
        <p className={styles.aboutLine}>
          Local-first. Your profile is stored in this browser on this device — no account, no server, no
          analytics. Nothing you enter is sent anywhere.
        </p>
        <p className={styles.aboutLine}>
          Clearing this site&rsquo;s data removes it, so export a backup before you switch devices or
          browsers.
        </p>
        <a className={styles.link} href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub repository
          <span className="wc-visually-hidden"> (opens in a new tab)</span>
        </a>
      </Card>

      <PhaseNotice phase="Phase 8" heading="Backups grow with the app">
        The backup file holds your profile today, because that is all there is. Logged workouts and history
        join it in Phase 8, once there is history to save.
      </PhaseNotice>
    </div>
  )
}
