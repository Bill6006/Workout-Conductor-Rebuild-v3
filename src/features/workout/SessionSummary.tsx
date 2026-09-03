/**
 * What you did, shown once the last set is logged.
 *
 * Phase 7 owns the full Session Summary — weekly volume effect, personal
 * records, strength progression, next-workout implications. This is the honest
 * subset that can be told from the session alone, and it says so rather than
 * showing empty panels for the parts that need history.
 *
 * The plan gives a superset's FINAL ROUND completion authority: when the last
 * round of the last block is logged on both moves, the session is over and this
 * is what comes next. There is no extra round and no stray timer.
 */
import { Card } from '../../components/Card'
import { PhaseNotice } from '../../components/PhaseNotice'
import { PrimaryAction } from '../../components/PrimaryAction'
import { StatTile } from '../../components/StatTile'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import {
  blockEntries,
  workoutListRows,
  workingSets,
  type WeightUnit,
  type Workout,
} from '../../core/validation/workoutSchema'
import styles from './SessionSummary.module.css'

export interface SessionSummaryProps {
  readonly workout: Workout
  readonly volume: number
  readonly unit: WeightUnit
  readonly exerciseOf: (exerciseId: string) => Exercise | null
  readonly onDone: () => void
}

export function SessionSummary({ workout, volume, unit, exerciseOf, onDone }: SessionSummaryProps) {
  const rows = workoutListRows(workout, (id) => exerciseOf(id)?.name ?? null)

  let completed = 0
  let skipped = 0
  const muscles = new Set<string>()
  for (const block of workout.blocks) {
    for (const entry of blockEntries(block)) {
      const workingIds = new Set(workingSets(entry.targets).map((target) => target.setId))
      for (const record of entry.records) {
        if (!workingIds.has(record.setId)) continue
        if (record.outcome === 'skipped') skipped += 1
        else completed += 1
      }
      const exercise = exerciseOf(entry.exerciseId)
      for (const muscle of exercise?.primaryMuscles ?? []) muscles.add(muscle)
    }
  }

  return (
    <>
      <Card tone="accent" eyebrow="Done" title={workout.title}>
        <ul className={styles.stats} role="list">
          <li>
            <StatTile label="Sets" value={String(completed)} footnote="working sets logged" />
          </li>
          <li>
            <StatTile
              label="Volume"
              value={volume > 0 ? String(volume) : '—'}
              footnote={volume > 0 ? unit : 'nothing loaded'}
            />
          </li>
          <li>
            <StatTile label="Exercises" value={String(rows.length)} footnote="blocks" />
          </li>
        </ul>

        {skipped > 0 && (
          <p className={styles.note}>
            {skipped} set{skipped === 1 ? '' : 's'} skipped.
          </p>
        )}

        <PrimaryAction onClick={onDone}>Finish</PrimaryAction>
      </Card>

      <Card title="What you did">
        <ol className={styles.list} role="list">
          {rows.map((row) => (
            <li key={row.rowId} className={styles.row}>
              <span className={styles.rowTitle}>{row.title}</span>
              <span className={styles.rowDetail}>{row.detail}</span>
            </li>
          ))}
        </ol>
      </Card>

      <PhaseNotice phase="Phase 7" heading="The rest of the picture">
        Personal records, weekly volume, strength trends, and what this session means for the next one arrive
        in Phase 7, once there is history to read them from.
      </PhaseNotice>
    </>
  )
}
