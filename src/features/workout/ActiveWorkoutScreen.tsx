/**
 * The screen you look at between sets.
 *
 * The plan is explicit about what NOT to do here: do not put every feature on
 * one giant scrolling screen. So the shape is a short header, the block you are
 * on, and a compact list of everything else — with detail, alternatives, and
 * plate math behind sheets rather than stacked down the page.
 *
 * The list shows ONE ROW PER BLOCK. A superset is one row naming both moves,
 * which is the locked contract: an Active Workout List must never show one half
 * of a superset as if another required exercise were still outstanding.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/Card'
import { ScreenHeader } from '../../components/ScreenHeader'
import type { SetLoggerValues } from '../../components/SetLogger'
import { useProfile } from '../../core/state'
import { weightUnitFor } from '../../catalog/labels'
import { buildAlternativesIndex, defineSessionSlot, rankAlternatives } from '../../engine/alternatives'
import type { LimitationFlag } from '../../catalog/taxonomy/taxonomy'
import { nowIso } from '../../core/time/clock'
import { activeLocation } from '../../core/validation/schemas'
import {
  blockEntries,
  isSupersetBlock,
  workoutListRows,
  type Workout,
  type WorkoutBlock,
} from '../../core/validation/workoutSchema'
import { useExerciseCatalog } from '../exercisePreferences/useExerciseCatalog'
import { RestTimer } from '../../components/RestTimer'
import { BlockCard } from './BlockCard'
import { useActiveSession } from './useActiveSession'
import styles from './ActiveWorkoutScreen.module.css'

const SessionSummary = lazy(() =>
  import('./SessionSummary').then((module) => ({ default: module.SessionSummary })),
)
// The sheets are reached by a deliberate tap, so they load then rather than
// riding along with the screen.
const ExerciseDetail = lazy(() =>
  import('../../components/ExerciseDetail').then((module) => ({ default: module.ExerciseDetail })),
)
const AlternativesSheet = lazy(() =>
  import('../../components/AlternativesSheet').then((module) => ({
    default: module.AlternativesSheet,
  })),
)

export function ActiveWorkoutScreen() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const session = useActiveSession()
  const { catalog } = useExerciseCatalog(session.workout !== null)

  const [values, setValues] = useState<SetLoggerValues>({ weight: null, reps: 8, rir: 2 })
  const [editing, setEditing] = useState<{ entryId: string; setId: string } | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [swapFor, setSwapFor] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  /**
   * The rest timer runs off an end TIMESTAMP, not a countdown, so backgrounding
   * the app or switching tabs cannot lose time.
   */
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)

  const unit = profile ? weightUnitFor(profile.units) : 'kg'
  const exerciseOf = useCallback((id: string) => catalog?.getExercise(id) ?? null, [catalog])

  const workout = session.workout
  const position = session.position

  const currentBlock: WorkoutBlock | null = useMemo(() => {
    if (!workout || !position) return null
    return workout.blocks.find((block) => block.blockId === position.blockId) ?? null
  }, [workout, position])

  // Seed the logger from the set's own target, and from the last set logged on
  // the same exercise — someone doing set three has almost certainly just done
  // set two at the same weight.
  useEffect(() => {
    if (!workout || !position) return
    const entry = workout.blocks
      .flatMap((block) => blockEntries(block))
      .find((candidate) => candidate.entryId === position.entryId)
    if (!entry) return

    const target = entry.targets.find((candidate) => candidate.setId === position.setId)
    if (!target) return

    const lastRecord = [...entry.records].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)).at(-1)
    const targetWeight = target.weight.kind === 'load' ? target.weight.value : null

    setValues({
      weight: lastRecord?.load?.value ?? targetWeight,
      reps: lastRecord?.reps ?? Math.round((target.reps.min + target.reps.max) / 2),
      rir: target.rirTarget,
    })
  }, [workout, position])

  const onLog = useCallback(() => {
    if (!position) return
    const exercise = exerciseOf(
      workout?.blocks
        .flatMap((block) => blockEntries(block))
        .find((entry) => entry.entryId === position.entryId)?.exerciseId ?? '',
    )
    const measure = exercise?.load.measure ?? 'none'
    const restSeconds = currentBlock
      ? (blockEntries(currentBlock)
          .find((entry) => entry.entryId === position.entryId)
          ?.targets.find((target) => target.setId === position.setId)?.restSeconds ?? 0)
      : 0
    if (restSeconds > 0) setRestEndsAt(Date.now() + restSeconds * 1000)
    void session.log(position.entryId, position.setId, {
      reps: values.reps,
      rir: values.rir,
      load: measure === 'none' || values.weight === null ? null : { value: values.weight, unit, measure },
    })
  }, [position, session, values, unit, exerciseOf, workout, currentBlock])

  const onEditRecord = useCallback((entryId: string, setId: string) => {
    setEditing({ entryId, setId })
  }, [])

  const detailExercise = detailFor ? exerciseOf(detailFor) : null

  const swapEntry = useMemo(() => {
    if (!workout || !swapFor) return null
    return (
      workout.blocks.flatMap((block) => blockEntries(block)).find((entry) => entry.entryId === swapFor) ??
      null
    )
  }, [workout, swapFor])
  const swapExercise = swapEntry ? exerciseOf(swapEntry.exerciseId) : null

  /**
   * The alternatives come from the Phase 2 ranker, not from anything here. This
   * screen decides WHEN to ask; the ranker decides what is suitable.
   */
  const alternatives = useMemo(() => {
    if (!catalog || !swapExercise || !swapEntry || !profile || !workout) return null
    const place = activeLocation(profile)

    // Every slot in the session, so the ranker can see what would clash with
    // what is already programmed — including the slot being replaced.
    const slots = workout.blocks.flatMap((block) =>
      blockEntries(block).map((entry) => {
        const exercise = exerciseOf(entry.exerciseId)
        if (!exercise) return null
        return defineSessionSlot({
          slotId: entry.entryId,
          exercise,
          priority: entry.priority,
          plannedSets: entry.targets.length,
          restSeconds: entry.targets[0]?.restSeconds ?? 90,
          supersetId: isSupersetBlock(block) ? block.blockId : null,
          status: entry.records.length > 0 ? 'in-progress' : 'pending',
        })
      }),
    )
    const session = slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    if (!session.some((slot) => slot.slotId === swapEntry.entryId)) return null

    const limitations: LimitationFlag[] = []
    if (profile.limitations.shoulder) limitations.push('shoulder')
    if (profile.limitations.knee) limitations.push('knee')
    if (profile.limitations.lowerBack) limitations.push('lower-back')
    if (profile.limitations.avoidBarbellSquat) limitations.push('barbell-squat')

    return rankAlternatives(buildAlternativesIndex(catalog.EXERCISES), {
      session,
      targetSlotId: swapEntry.entryId,
      availableEquipment: place.equipment,
      location: place.kind === 'custom' ? 'gym' : place.kind,
      limitations,
      preferences: profile.exercisePreferences,
      goal: profile.trainingStyle,
      remainingSeconds: null,
      fatigue: null,
      techniques: profile.techniques,
    })
  }, [catalog, swapExercise, swapEntry, profile, workout, exerciseOf])

  /**
   * Swapping goes through the RECALIBRATION ENGINE, not through a local edit.
   * That engine is what refuses to touch logged work, and a screen that edited
   * the session directly would be the one path around it.
   */
  const onSwap = useCallback(
    async (exerciseId: string) => {
      if (!workout || !swapEntry || !catalog || !profile) return
      const place = activeLocation(profile)
      const { recalibrate } = await import('../../engine/recalibration/recalibrate')
      const result = recalibrate({
        trigger: 'exercise-replaced',
        current: workout,
        profile,
        targetEntryId: swapEntry.entryId,
        replacementExerciseId: exerciseId,
        location: {
          id: place.id,
          name: place.name,
          suitability: place.kind === 'custom' ? null : place.kind,
        },
        equipment: place.equipment,
        exercises: catalog.EXERCISES,
        timestamp: nowIso(),
      })
      if (result.outcome === 'recalibrated') await session.replaceWorkout(result.workout)
    },
    [workout, swapEntry, catalog, profile, session],
  )

  /** What the rest is for — the plan asks the timer to show the next set's target. */
  const nextSetSummary = useMemo(() => {
    if (!workout || !position) return undefined
    const entry = workout.blocks
      .flatMap((block) => blockEntries(block))
      .find((candidate) => candidate.entryId === position.entryId)
    const target = entry?.targets.find((candidate) => candidate.setId === position.setId)
    if (!entry || !target) return undefined
    const name = exerciseOf(entry.exerciseId)?.name ?? entry.exerciseId
    return `${name} · ${target.reps.min}-${target.reps.max} ${target.reps.unit === 'seconds' ? 'sec' : 'reps'}`
  }, [workout, position, exerciseOf])

  if (session.status === 'loading') {
    return (
      <div className={styles.screen}>
        <ScreenHeader title="Workout" subtitle="Looking for a session in progress." />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className={styles.screen}>
        <ScreenHeader title="Workout" subtitle="No session in progress." />
        <Card title="Nothing running">
          <p className={styles.copy}>
            Start a session from Today and it appears here, set by set. If you close the app part-way through,
            this is where you pick it back up.
          </p>
          {/* Navigation, so a link — it should middle-click, long-press, and
              announce as a link rather than as a button that happens to move you. */}
          <Link className={styles.goToToday} to="/">
            Go to Today
          </Link>
        </Card>
      </div>
    )
  }

  if (session.status === 'finished') {
    return (
      <div className={styles.screen}>
        <ScreenHeader title="Workout" subtitle="Every set is logged." />
        <Suspense fallback={null}>
          <SessionSummary
            workout={workout}
            volume={session.volume}
            unit={unit}
            exerciseOf={exerciseOf}
            onDone={() => {
              void session.end().then(() => navigate('/'))
            }}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <ScreenHeader
        eyebrow={workout.title}
        title="Workout"
        subtitle={`${session.progress.logged} of ${session.progress.total} working sets logged.`}
      />

      {session.error && (
        <p className={styles.error} role="alert">
          {session.error}
        </p>
      )}

      {currentBlock && (
        <BlockCard
          block={currentBlock}
          position={position}
          unit={unit}
          exerciseOf={exerciseOf}
          values={values}
          onValuesChange={setValues}
          onLog={onLog}
          onUndo={session.progress.logged > 0 ? () => void session.undo() : undefined}
          onEditRecord={onEditRecord}
          onOpenDetail={setDetailFor}
          onOpenAlternatives={setSwapFor}
          busy={session.saving}
        />
      )}

      {/*
        Directly under the block, because resting is the moment you are looking
        at this screen. At the foot of the page it would be below the session
        list, where nobody would ever see it.
      */}
      <RestTimer
        endsAt={restEndsAt}
        nextSetSummary={nextSetSummary}
        onSkip={() => setRestEndsAt(null)}
        onAdjust={(seconds) => setRestEndsAt((at) => (at === null ? at : at + seconds * 1000))}
        onComplete={() => setRestEndsAt(null)}
      />

      <SessionList workout={workout} currentBlockId={position?.blockId ?? null} />

      {editing && (
        <p className={styles.editing} role="status">
          Correcting a logged set — tap a value above to change it.
        </p>
      )}

      {detailExercise && (
        <Suspense fallback={null}>
          <ExerciseDetail
            open
            exercise={detailExercise}
            onClose={() => setDetailFor(null)}
            note={notes[detailExercise.id] ?? ''}
            onNoteChange={(note) => setNotes((current) => ({ ...current, [detailExercise.id]: note }))}
          />
        </Suspense>
      )}

      {swapExercise && alternatives && (
        <Suspense fallback={null}>
          <AlternativesSheet
            open
            onClose={() => setSwapFor(null)}
            currentExercise={swapExercise}
            result={alternatives}
            onChoose={(exerciseId) => {
              void onSwap(exerciseId)
              setSwapFor(null)
            }}
            busy={session.saving}
          />
        </Suspense>
      )}
    </div>
  )
}

/**
 * Everything in the session, one row per block.
 *
 * `workoutListRows` is the model's own helper, so the row a superset gets here
 * is the same row every other surface gets. Deriving it locally is how two
 * screens end up disagreeing about what a superset is.
 */
function SessionList({ workout, currentBlockId }: { workout: Workout; currentBlockId: string | null }) {
  const rows = workoutListRows(workout)

  return (
    <Card title="This session">
      <ol className={styles.list} role="list">
        {rows.map((row) => {
          const done = row.progress.status === 'complete'
          const current = row.rowId === currentBlockId
          return (
            <li
              key={row.rowId}
              className={current ? styles.rowCurrent : done ? styles.rowDone : styles.row}
              aria-current={current ? 'step' : undefined}
            >
              <span className={styles.rowTitle}>{row.title}</span>
              <span className={styles.rowDetail}>
                {done ? 'Done' : row.detail}
                {row.kind === 'superset' ? ' · superset' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
