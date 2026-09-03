import { FormField } from '../FormField'
import { PrimaryAction } from '../PrimaryAction'
import { SheetDialog } from '../SheetDialog'
import { equipmentLabel } from '../../catalog/equipment'
import {
  difficultyLabel,
  jointLabel,
  movementPatternLabel,
  muscleLabel,
  stressIntensityLabel,
} from '../../catalog/labels/catalogLabels'
import type { JointId } from '../../catalog/taxonomy/joints'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { mediaAssetUrl, useExerciseMedia, type MediaRecord } from './useExerciseMedia'
import styles from './ExerciseDetail.module.css'

/**
 * THE exercise sheet: what this movement is, how to do it, what to watch for,
 * and the one thing the person wants to remember about it next time.
 *
 * It opens mid-set, one-handed, on a phone, from somebody who is out of breath.
 * That is the whole design brief, and it decides three things:
 *
 *   - The close control never scrolls away. The sheet's own head stays put and
 *     the long content scrolls under it; a second, thumb-height Done sits in the
 *     footer so the sheet can be shut without reaching for the top corner.
 *   - Nothing is shown that the exercise does not actually carry. An empty
 *     "Common mistakes" heading, or a "Knee" row with nothing under it, is worse
 *     than the section being absent — it reads as an app that lost the text.
 *   - THE MEDIA DOES NOT PRETEND. Every asset in the catalog today is a generated
 *     placeholder poster for a movement PATTERN, not a demonstration of this
 *     exercise, so the sheet says exactly that under the image. No play control,
 *     no video element, nothing that implies a demonstration exists yet. The
 *     manifest is the source of that claim (`isPlaceholder`), not a constant
 *     here, so the day real media lands the copy corrects itself.
 *
 * IT OWNS NO STATE AND NO STORAGE. The note is a controlled prop: the session
 * store holds it, persists it, and decides when. See `onNoteChange`.
 */

/** A joint the catalog can carry plain-language advice about. */
const CONSIDERED_JOINTS = [
  { joint: 'shoulder', field: 'shoulderConsiderations' },
  { joint: 'knee', field: 'kneeConsiderations' },
  { joint: 'lower-back', field: 'lowerBackConsiderations' },
] as const satisfies readonly { joint: JointId; field: keyof Exercise }[]

/** Long enough for a real setup cue, short enough to stay a cue. */
const DEFAULT_NOTE_MAX_LENGTH = 300
/** How close to the limit the remaining count starts being worth showing. */
const COUNTER_THRESHOLD = 40

export interface ExerciseDetailProps {
  open: boolean
  /** The exercise being read. Everything on the sheet comes from this. */
  exercise: Exercise
  /** Escape, the backdrop, the close button, and Done all call this. */
  onClose: () => void
  /**
   * The person's own cue for this exercise — grip, seat height, cable position,
   * a pain-safe setup. Empty string when they have not written one.
   */
  note: string
  /**
   * Fires on every keystroke with the full next value. The caller owns
   * persistence and any debouncing; this component stores nothing.
   */
  onNoteChange: (note: string) => void
  /** Characters the note field accepts. Defaults to 300. */
  noteMaxLength?: number
}

export function ExerciseDetail({
  open,
  exercise,
  onClose,
  note,
  onNoteChange,
  noteMaxLength = DEFAULT_NOTE_MAX_LENGTH,
}: ExerciseDetailProps) {
  const media = useExerciseMedia(
    open
      ? {
          id: exercise.id,
          movementPattern: exercise.movementPattern,
          productionEnabled: exercise.productionEnabled,
        }
      : null,
  )

  const considerations = CONSIDERED_JOINTS.map(({ joint, field }) => ({
    joint,
    text: exercise[field].trim(),
  })).filter((entry) => entry.text !== '')

  const hasJointSection = exercise.jointStressTags.length > 0 || considerations.length > 0
  const remaining = noteMaxLength - note.length

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title={exercise.name}
      description={movementPatternLabel(exercise.movementPattern)}
      footer={<PrimaryAction onClick={onClose}>Done</PrimaryAction>}
    >
      <ExerciseMedia exercise={exercise} status={media.status} record={media.record} />

      <dl className={styles.facts}>
        <Fact term="Works" detail={joinLabels(exercise.primaryMuscles.map(muscleLabel))} />
        {exercise.secondaryMuscles.length > 0 && (
          <Fact term="Also works" detail={joinLabels(exercise.secondaryMuscles.map(muscleLabel))} />
        )}
        <Fact
          term="Equipment"
          detail={
            exercise.equipment.length > 0
              ? joinLabels(exercise.equipment.map(equipmentLabel))
              : 'Nothing needed'
          }
        />
        <Fact term="Difficulty" detail={difficultyLabel(exercise.difficulty)} />
      </dl>

      <section className={styles.section}>
        <h3 className={styles.heading}>How to do it</h3>
        <ol className={styles.steps} role="list">
          {exercise.instructionSteps.map((step, index) => (
            <li className={styles.step} key={`${index}-${step}`}>
              {step}
            </li>
          ))}
        </ol>
      </section>

      {exercise.commonMistakes.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Common mistakes</h3>
          <ul className={styles.mistakes} role="list">
            {exercise.commonMistakes.map((mistake, index) => (
              <li className={styles.mistake} key={`${index}-${mistake}`}>
                {mistake}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasJointSection && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Joints</h3>
          {exercise.jointStressTags.length > 0 && (
            <ul className={styles.stress} role="list">
              {exercise.jointStressTags.map((tag) => (
                <li className={styles.stressRow} key={tag.joint}>
                  <span className={styles.stressJoint}>{jointLabel(tag.joint)}</span>
                  <span className={styles.stressLoad}>{stressIntensityLabel(tag.intensity)}</span>
                </li>
              ))}
            </ul>
          )}
          {considerations.length > 0 && (
            <dl className={styles.considerations}>
              {considerations.map(({ joint, text }) => (
                <div className={styles.consideration} key={joint}>
                  <dt className={styles.considerationJoint}>{jointLabel(joint)}</dt>
                  <dd className={styles.considerationText}>{text}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      <section className={styles.section}>
        <FormField
          label="Your note"
          hint="Grip, seat height, cable position — whatever you want to find here next time."
        >
          {({ id, describedBy }) => (
            <>
              <textarea
                id={id}
                aria-describedby={describedBy}
                className={styles.note}
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                rows={3}
                maxLength={noteMaxLength}
              />
              {remaining <= COUNTER_THRESHOLD && (
                <p className={styles.counter}>{remaining} characters left</p>
              )}
            </>
          )}
        </FormField>
      </section>
    </SheetDialog>
  )
}

/* ------------------------------------------------------------------ pieces */

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factTerm}>{term}</dt>
      <dd className={styles.factDetail}>{detail}</dd>
    </div>
  )
}

interface ExerciseMediaProps {
  exercise: Exercise
  status: ReturnType<typeof useExerciseMedia>['status']
  record: MediaRecord | null
}

/**
 * The picture, and an honest sentence about what it is.
 *
 * The frame reserves a 16:9 box before anything loads and the image is
 * `object-fit: contain` inside it, so neither the manifest arriving nor the
 * image decoding moves a single line of text below it — and an asset with some
 * other shape letterboxes rather than reflowing the sheet.
 */
function ExerciseMedia({ exercise, status, record }: ExerciseMediaProps) {
  const poster = record?.entry.poster ?? null
  const isPlaceholder = record?.isPlaceholder ?? false
  const pattern = record?.placeholderPattern ?? exercise.movementPattern

  const alt = isPlaceholder
    ? `Stand-in picture for ${movementPatternLabel(pattern).toLowerCase()} movements. It does not show ${exercise.name}.`
    : `Still picture of ${exercise.name}.`

  const caption = isPlaceholder
    ? 'A stand-in picture, not a demonstration. A full demonstration of this exercise is still to come.'
    : record && record.entry.demonstrations.length === 0
      ? 'A still picture. A moving demonstration is still to come.'
      : status === 'unavailable'
        ? 'The picture could not be loaded. Everything below is still right.'
        : ''

  return (
    <figure className={styles.media}>
      <div className={styles.frame}>
        {poster && (
          <img
            className={styles.poster}
            src={mediaAssetUrl(poster.path)}
            width={poster.width}
            height={poster.height}
            alt={alt}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  )
}

/** A readable list of names. Never a bare id, and never an empty string. */
function joinLabels(labels: readonly string[]): string {
  return labels.join(', ')
}
