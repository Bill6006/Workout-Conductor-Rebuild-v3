/**
 * The block you are working on right now.
 *
 * A single exercise and a superset are ONE component on purpose. The product
 * plan locks the superset contract: one combined two-move execution card, both
 * moves visible together, separate durable records for each, and completed
 * rounds correctable without adding a round or a timer. Building two components
 * would have meant two places for that contract to drift.
 *
 * What the plan means by "combined": a superset shows BOTH moves at once, with
 * one round advancing both. Round two of move A never appears before round one
 * of move B — that would be two exercises taking turns, not a superset.
 */
import { Pill } from '../../components/Pill'
import { SetLogger, type SetLoggerValues } from '../../components/SetLogger'
import { describeRecord } from '../../components/SetLogger/describeRecord'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import {
  isSupersetBlock,
  type ExerciseEntry,
  type SetTarget,
  type WeightUnit,
  type WorkoutBlock,
} from '../../core/validation/workoutSchema'
import type { SessionPosition } from '../../core/state/activeSession'
import styles from './BlockCard.module.css'

export interface BlockCardProps {
  readonly block: WorkoutBlock
  readonly position: SessionPosition | null
  readonly unit: WeightUnit
  readonly exerciseOf: (exerciseId: string) => Exercise | null
  readonly values: SetLoggerValues
  readonly onValuesChange: (values: SetLoggerValues) => void
  readonly onLog: () => void
  readonly onUndo?: () => void
  readonly onEditRecord: (entryId: string, setId: string) => void
  readonly onOpenDetail: (exerciseId: string) => void
  readonly onOpenAlternatives: (entryId: string) => void
  readonly busy?: boolean
}

export function BlockCard({
  block,
  position,
  unit,
  exerciseOf,
  values,
  onValuesChange,
  onLog,
  onUndo,
  onEditRecord,
  onOpenDetail,
  onOpenAlternatives,
  busy = false,
}: BlockCardProps) {
  const superset = isSupersetBlock(block)
  const entries: readonly ExerciseEntry[] = superset ? block.moves : [block.entry]
  const active = entries.find((entry) => entry.entryId === position?.entryId) ?? entries[0]
  const exercise = exerciseOf(active.exerciseId)
  const target = active.targets.find((candidate) => candidate.setId === position?.setId)

  return (
    <section className={styles.card} aria-label={superset ? 'Superset' : 'Current exercise'}>
      {superset && (
        <div className={styles.supersetHead}>
          <Pill tone="accent">Superset</Pill>
          <span className={styles.rounds}>
            Round {position?.round ?? 1} of {block.rounds}
          </span>
        </div>
      )}

      <ul className={styles.moves} role="list">
        {entries.map((entry) => {
          const moveExercise = exerciseOf(entry.exerciseId)
          const isActive = entry.entryId === active.entryId
          return (
            <li key={entry.entryId} className={isActive ? styles.moveActive : styles.move}>
              <div className={styles.moveHead}>
                <button
                  type="button"
                  className={styles.moveName}
                  onClick={() => onOpenDetail(entry.exerciseId)}
                >
                  {moveExercise?.name ?? entry.exerciseId}
                </button>
                <button
                  type="button"
                  className={styles.swap}
                  onClick={() => onOpenAlternatives(entry.entryId)}
                  aria-label={`Swap ${moveExercise?.name ?? 'this exercise'}`}
                >
                  Swap
                </button>
              </div>

              {/*
                Each move keeps its own completed sets. They are never merged, so
                correcting one round of move B leaves move A exactly as it was.
              */}
              <CompletedStrip entry={entry} unit={unit} onEdit={onEditRecord} />
            </li>
          )
        })}
      </ul>

      {target ? (
        <SetLogger
          target={target}
          setNumber={position?.setNumber ?? 1}
          setCount={position?.setCount ?? active.targets.length}
          unit={unit}
          measure={exercise?.load.measure ?? 'none'}
          values={values}
          onChange={onValuesChange}
          onLog={onLog}
          onUndo={onUndo}
          busy={busy}
        />
      ) : (
        <p className={styles.done}>Every set here is logged.</p>
      )}
    </section>
  )
}

interface CompletedStripProps {
  readonly entry: ExerciseEntry
  readonly unit: WeightUnit
  readonly onEdit: (entryId: string, setId: string) => void
}

/**
 * The sets already done, each one tappable.
 *
 * The plan asks for a persistent completion indicator, for any completed value
 * to be tappable for correction, and for no separate edit page — so a completed
 * set is a button that opens the same logger inline.
 */
function CompletedStrip({ entry, unit, onEdit }: CompletedStripProps) {
  const done = entry.targets
    .map((target: SetTarget) => ({
      target,
      record: entry.records.find((candidate) => candidate.setId === target.setId),
    }))
    .filter((pair) => pair.record !== undefined)

  if (done.length === 0) return null

  return (
    <ul className={styles.completed} role="list" aria-label="Completed sets">
      {done.map(({ target, record }, index) => (
        <li key={target.setId}>
          <button
            type="button"
            className={record?.outcome === 'skipped' ? styles.skipped : styles.doneSet}
            onClick={() => onEdit(entry.entryId, target.setId)}
            aria-label={`Set ${index + 1}: ${record ? describeRecord(record, unit) : ''}. Tap to correct.`}
          >
            <span className={styles.doneIndex}>{index + 1}</span>
            <span className={styles.doneValue}>{record ? describeRecord(record, unit) : ''}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
