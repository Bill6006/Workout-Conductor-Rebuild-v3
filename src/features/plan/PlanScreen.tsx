import { Link } from 'react-router-dom'
import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { Pill } from '../../components/Pill'
import { PrimaryAction } from '../../components/PrimaryAction'
import { ScreenHeader } from '../../components/ScreenHeader'
import { StatTile } from '../../components/StatTile'
import { equipmentLabel, sortEquipmentIds } from '../../catalog/equipment'
import { useProfile } from '../../core/state'
import { WEEKDAYS, type LocationKind, type Weekday } from '../../core/validation/schemas'
import { WEEK_DAYS } from '../../components/DayPicker'
import styles from './PlanScreen.module.css'

/**
 * Plan shows only what Phase 1 can honestly fill: the saved locations with
 * their equipment, and the training days and session count from the schedule.
 *
 * Weekly muscle targets, upcoming sessions, and saved workouts need the
 * generator and the weekly planner, so they stay visibly empty and say which
 * phase brings them. Nothing here is invented.
 */

const KIND_LABEL: Record<LocationKind, string> = {
  gym: 'Gym',
  home: 'Home',
  travel: 'Travel',
  custom: 'Custom',
}

/** Day names come from the shared week, so this screen owns no second list. */
function dayOption(day: Weekday) {
  return WEEK_DAYS.find((option) => option.id === day)
}

/**
 * Seven cells across. Only two characters and a marker are shown, because at
 * 240 CSS px each cell is barely 21px wide — the full day name and the
 * training / rest state are carried in the accessible name instead.
 */
function WeekRow({ planned }: { planned: readonly Weekday[] }) {
  return (
    <ul className={styles.week} role="list" aria-label="Training week">
      {WEEKDAYS.map((day) => {
        const option = dayOption(day)
        const isPlanned = planned.includes(day)

        return (
          <li key={day} className={isPlanned ? `${styles.day} ${styles.dayOn}` : styles.day}>
            <span className={styles.dayName} aria-hidden="true">
              {option?.short ?? day}
            </span>
            <span className={styles.dayMark} aria-hidden="true" />
            <span className="wc-visually-hidden">
              {option?.label ?? day}: {isPlanned ? 'training day' : 'rest day'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function PlanScreen() {
  const { status, profile, error, reload } = useProfile()

  return (
    <div className={styles.screen}>
      <ScreenHeader title="Plan" subtitle="Your training week and where you train." />

      {status === 'loading' && (
        <Card title="Your week">
          <p className={styles.caption}>Reading your profile from this device…</p>
        </Card>
      )}

      {status === 'error' && (
        <Card title="Your plan is unavailable">
          <p className={styles.error}>{error ?? 'Your profile could not be read from this device.'}</p>
          <PrimaryAction variant="ghost" onClick={() => void reload()}>
            Try again
          </PrimaryAction>
        </Card>
      )}

      {status === 'empty' && (
        <Card title="Your week">
          <p className={styles.empty}>
            Setup has not run on this device yet, so there is no schedule and no equipment to show.
          </p>
          <Link className={styles.link} to="/settings">
            Go to Settings
          </Link>
        </Card>
      )}

      {status === 'ready' && profile && (
        <>
          <Card title="Your week">
            <WeekRow planned={profile.schedule.availableDays} />
            <div className={styles.tiles}>
              <StatTile
                label="Sessions per week"
                value={String(profile.schedule.sessionsPerWeek)}
                footnote="Your target"
              />
              <StatTile
                label="Training days"
                value={String(profile.schedule.availableDays.length)}
                footnote="Days you are available"
              />
              <StatTile
                label="Typical length"
                value={`${profile.schedule.typicalDurationMin} min`}
                footnote="Default session"
              />
            </div>
            <p className={styles.caption}>
              These are the days you told us you are free, not scheduled sessions. Change them in Settings.
            </p>
          </Card>

          <Card title="Locations and equipment" action={<Pill tone="muted">Saved</Pill>}>
            <ul className={styles.locations} role="list" aria-label="Saved locations">
              {profile.locations.map((location) => {
                const items = sortEquipmentIds(location.equipment)
                const isActive = location.id === profile.activeLocationId

                return (
                  <li key={location.id} className={styles.location}>
                    <div className={styles.locationHead}>
                      <h3 className={styles.locationName}>{location.name}</h3>
                      {isActive && <Pill tone="accent">Active</Pill>}
                    </div>
                    <p className={styles.locationMeta}>
                      {KIND_LABEL[location.kind]} · {items.length === 1 ? '1 item' : `${items.length} items`}
                    </p>
                    {items.length === 0 ? (
                      <p className={styles.empty}>No equipment listed for this location.</p>
                    ) : (
                      <ul
                        className={styles.equipment}
                        role="list"
                        aria-label={`Equipment at ${location.name}`}
                      >
                        {items.map((id) => (
                          <li key={id} className={styles.equipmentItem}>
                            {equipmentLabel(id)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {location.notes.trim() !== '' && <p className={styles.notes}>{location.notes}</p>}
                  </li>
                )
              })}
            </ul>
            <Link className={styles.link} to="/settings">
              Edit locations in Settings
            </Link>
          </Card>
        </>
      )}

      <Card title="Weekly muscle targets">
        <p className={styles.empty}>No targets yet.</p>
        <p className={styles.caption}>
          Weekly set targets per muscle group arrive with the weekly planner in Phase 7.
        </p>
      </Card>

      <Card title="Upcoming sessions">
        <p className={styles.empty}>Nothing scheduled.</p>
        <p className={styles.caption}>
          Sessions are placed on days once the generator and the planner exist, in Phases 3 and 7.
        </p>
      </Card>

      <Card title="Saved workouts">
        <p className={styles.empty}>No saved workouts.</p>
        <p className={styles.caption}>Saving and reusing a workout arrives in Phase 7.</p>
      </Card>

      <PhaseNotice phase="Phase 7" heading="Weekly planning">
        Targets, upcoming sessions, and saved workouts stay empty until the weekly planner is built. Your
        schedule and equipment above are real, saved values.
      </PhaseNotice>
    </div>
  )
}
