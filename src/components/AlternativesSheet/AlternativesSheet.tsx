import { useId } from 'react'
import { Pill } from '../Pill'
import { PrimaryAction } from '../PrimaryAction'
import { SheetDialog } from '../SheetDialog'
import {
  countLabel,
  differenceLeadIn,
  equipmentSummary,
  formatDuration,
  matchQualityLabel,
  noAlternativeHeadline,
  posterUrl,
  progressionFlag,
  supersetFlag,
  supersetNeedsExplaining,
  type AlternativeFlag,
} from './copy'
import styles from './AlternativesSheet.module.css'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type {
  AlternativesResult,
  NoAlternatives,
  RankedAlternative,
  RankedAlternatives,
} from '../../engine/alternatives'

/**
 * SWAPPING ONE EXERCISE — the whole surface, and only that.
 *
 * IT RANKS NOTHING. `src/engine/alternatives` decides what may be swapped in and
 * in what order; the screen runs `rankAlternatives(index, context)` and hands the
 * result here. Everything a row shows — score, quality, the reason it ranks
 * highly, the key difference, equipment, setup time, whether progression carries
 * across, whether the superset survives — is a field on `RankedAlternative`,
 * rendered as given. No exclusion rule, no re-scoring, no second opinion.
 *
 * IT CHANGES NOTHING EITHER. `onChoose(exerciseId)` is the whole output. The
 * screen owns the recalibration engine, the session store, and whether this
 * sheet then closes — a swap that has to be confirmed, previewed, or undone is
 * that screen's business, and this component would be in the way if it guessed.
 *
 * ONE TAP CHOOSES. A row IS the button. There is no chevron to hit and no "Use
 * this" affordance tucked at the end of a row, because this is pressed one-handed
 * with a bar still in the other hand.
 *
 * THE TOP ONE IS NOT MERELY FIRST. It is lifted out above the list, badged, and
 * given the room its score deserves.
 *
 * "NOTHING SUITABLE" IS A REAL ANSWER. When the ranker returns its `none`
 * outcome the sheet says so, in the ranker's own words, and shows what was ruled
 * out. An empty list is never rendered.
 */

/**
 * A poster for one alternative, already located.
 *
 * The screen resolves it, not this component: the media manifest is
 * catalog-sized data that must only ever be reached through `await import()`, and
 * a component on a screen's chunk is the wrong place to drag it in. The adapter
 * is two lines, and `MediaManifestRecord` satisfies it structurally:
 *
 *     const record = mediaRecordFor(exercise)                      // dynamic import
 *     posterFor={() => ({ path: record.entry.poster.path, isPlaceholder: record.isPlaceholder })}
 *
 * `isPlaceholder` is not decoration. Every poster the app ships today is a
 * generated diagram of a movement pattern, not a demonstration of the exercise,
 * and this sheet says so rather than letting a thumbnail imply otherwise.
 */
export interface AlternativePosterRef {
  /** Repository-relative path under the public root, e.g. `media/posters/squat.png`. */
  readonly path: string
  /** True when the asset is a generated stand-in rather than a demonstration. */
  readonly isPlaceholder: boolean
}

export interface AlternativesSheetProps {
  open: boolean
  /** Escape, the backdrop, the close button, and "Keep this exercise". */
  onClose: () => void
  /** The exercise being replaced. Named in the title so the sheet is unambiguous. */
  currentExercise: Exercise
  /** Straight out of `rankAlternatives`. Both outcomes are rendered. */
  result: AlternativesResult
  /** One tap on a row. The screen decides what a swap then does. */
  onChoose: (exerciseId: string) => void
  /** Poster lookup. Omit it and rows render a monogram tile instead. */
  posterFor?: (exerciseId: string) => AlternativePosterRef | null
  /** Prefix for poster paths. Defaults to the app's base URL. */
  posterBase?: string
  /** True while a chosen swap is being applied: rows stop taking taps. */
  busy?: boolean
  className?: string
}

/** How many ruled-out candidates the "nothing suitable" panel names before counting. */
export const RULED_OUT_PREVIEW = 4

/* ------------------------------------------------------------------ a row */

interface AlternativeRowProps {
  alternative: RankedAlternative
  poster: AlternativePosterRef | null
  posterBase: string
  /** The strongest match, rendered as such. */
  best: boolean
  disabled: boolean
  onChoose: (exerciseId: string) => void
}

function AlternativeRow({ alternative, poster, posterBase, best, disabled, onChoose }: AlternativeRowProps) {
  const id = useId()
  const badgeId = `${id}-badge`
  const nameId = `${id}-name`
  const scoreId = `${id}-score`
  const detailId = `${id}-detail`

  const { progression, superset, keyDifference } = alternative
  const flags: AlternativeFlag[] = [progressionFlag(progression), supersetFlag(superset)].filter(
    (flag): flag is AlternativeFlag => flag !== null,
  )

  return (
    <button
      type="button"
      // The name is what the row IS; the facts that decide it are the description,
      // so a screen reader hears "Goblet squat, 92 percent match" and then why.
      aria-labelledby={[best ? badgeId : null, nameId, scoreId].filter(Boolean).join(' ')}
      aria-describedby={detailId}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={[styles.row, best ? styles.best : null].filter(Boolean).join(' ')}
      data-exercise-id={alternative.exerciseId}
      onClick={() => onChoose(alternative.exerciseId)}
    >
      <span className={styles.thumb}>
        {poster ? (
          <img
            className={styles.poster}
            src={posterUrl(poster.path, posterBase)}
            alt={
              poster.isPlaceholder
                ? `Placeholder diagram, not a demonstration of ${alternative.name}`
                : `${alternative.name} poster`
            }
            width={96}
            height={54}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={styles.monogram} aria-hidden="true">
            {alternative.name.slice(0, 1)}
          </span>
        )}
      </span>

      <span className={styles.rowBody}>
        <span className={styles.rowTop}>
          {best && (
            <span className={styles.badge} id={badgeId}>
              <Pill tone="accent">Best match</Pill>
            </span>
          )}
          <span className={styles.name} id={nameId}>
            {alternative.name}
          </span>
          <span className={styles.score} id={scoreId} aria-label={`${alternative.matchScore} percent match`}>
            <span className={styles.scoreValue}>{alternative.matchScore}</span>
            <span className={styles.scoreUnit}>% match</span>
          </span>
        </span>

        <span className={styles.detail} id={detailId}>
          <span className={styles.quality}>{matchQualityLabel(alternative.matchQuality)}</span>
          <span className={styles.reason}>{alternative.primaryReason.text}</span>
          <span className={styles.difference}>
            {keyDifference
              ? `${differenceLeadIn(keyDifference.magnitude)}: ${keyDifference.text}`
              : 'Nothing material feels different.'}
          </span>
          <span className={styles.meta}>
            {equipmentSummary(alternative.equipment, alternative.optionalEquipment)}
          </span>
          <span className={styles.meta}>
            {`Setup ${formatDuration(alternative.setupTimeSeconds)} · about ${formatDuration(
              alternative.estimatedSlotSeconds,
            )} in the session`}
          </span>
          <span className={styles.flags}>
            {flags.map((flag) => (
              <span key={flag.key} className={[styles.flag, styles[flag.tone]].join(' ')}>
                {flag.label}
              </span>
            ))}
          </span>
          {supersetNeedsExplaining(superset) && <span className={styles.supersetNote}>{superset.text}</span>}
          {alternative.warnings.map((warning) => (
            <span key={warning} className={styles.warning}>
              {warning}
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}

/* ------------------------------------------------- nothing suitable at all */

function NoAlternativesPanel({ result }: { result: NoAlternatives }) {
  const id = useId()
  const preview = result.excluded.slice(0, RULED_OUT_PREVIEW)
  const remaining = result.excluded.length - preview.length

  return (
    <div className={styles.none}>
      <h3 className={styles.noneHeading}>{noAlternativeHeadline(result.reason)}</h3>
      {/* The ranker's own sentence. Never paraphrased, never replaced. */}
      <p className={styles.noneMessage}>{result.message}</p>
      <p className={styles.noneCount}>
        {`${countLabel(result.considered, 'exercise', 'exercises')} checked · ${countLabel(
          result.excluded.length,
          'was',
          'were',
        )} ruled out`}
      </p>

      {preview.length > 0 && (
        <>
          <h4 className={styles.noneSubheading} id={`${id}-ruled-out`}>
            Why they were ruled out
          </h4>
          <ul role="list" className={styles.ruledOut} aria-labelledby={`${id}-ruled-out`}>
            {preview.map((candidate) => (
              <li key={candidate.exerciseId} className={styles.ruledOutItem}>
                <span className={styles.ruledOutName}>{candidate.name}</span>
                <span className={styles.ruledOutText}>{candidate.text}</span>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <p className={styles.noneCount}>{`and ${countLabel(remaining, 'other', 'others')}.`}</p>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------- the ranked outcome */

interface RankedPanelProps {
  result: RankedAlternatives
  posterFor: ((exerciseId: string) => AlternativePosterRef | null) | undefined
  posterBase: string
  busy: boolean
  onChoose: (exerciseId: string) => void
}

function RankedPanel({ result, posterFor, posterBase, busy, onChoose }: RankedPanelProps) {
  const id = useId()
  const [strongest, ...rest] = result.alternatives
  const posters = new Map<string, AlternativePosterRef | null>(
    result.alternatives.map((alternative) => [
      alternative.exerciseId,
      posterFor?.(alternative.exerciseId) ?? null,
    ]),
  )
  const showsPlaceholder = [...posters.values()].some((poster) => poster?.isPlaceholder === true)

  return (
    <div className={styles.body} aria-busy={busy || undefined}>
      {showsPlaceholder && (
        <p className={styles.mediaNote}>
          Thumbnails are generated diagrams of the movement, not demonstrations of the exercise.
        </p>
      )}

      <h3 className={styles.groupHeading}>Best match</h3>
      <AlternativeRow
        alternative={strongest}
        poster={posters.get(strongest.exerciseId) ?? null}
        posterBase={posterBase}
        best
        disabled={busy}
        onChoose={onChoose}
      />

      {rest.length > 0 && (
        <>
          <h3 className={styles.groupHeading} id={`${id}-others`}>
            Other options
          </h3>
          <ul role="list" className={styles.list} aria-labelledby={`${id}-others`}>
            {rest.map((alternative) => (
              <li key={alternative.exerciseId} className={styles.item}>
                <AlternativeRow
                  alternative={alternative}
                  poster={posters.get(alternative.exerciseId) ?? null}
                  posterBase={posterBase}
                  best={false}
                  disabled={busy}
                  onChoose={onChoose}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- the sheet */

export function AlternativesSheet({
  open,
  onClose,
  currentExercise,
  result,
  onChoose,
  posterFor,
  posterBase,
  busy = false,
  className,
}: AlternativesSheetProps) {
  // The discriminant, not the engine's `isRanked` helper: reading one field keeps
  // this component free of any runtime dependency on the ranker's module.
  const description =
    result.outcome === 'ranked'
      ? `${countLabel(result.alternatives.length, 'option', 'options')}, best first. Tap one to swap it in.`
      : `Nothing suitable to put in place of ${currentExercise.name}.`

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title={`Swap ${currentExercise.name}`}
      description={description}
      className={className}
      footer={
        <PrimaryAction variant="ghost" onClick={onClose}>
          Keep this exercise
        </PrimaryAction>
      }
    >
      {result.outcome === 'ranked' ? (
        <RankedPanel
          result={result}
          posterFor={posterFor}
          posterBase={posterBase ?? import.meta.env.BASE_URL}
          busy={busy}
          onChoose={onChoose}
        />
      ) : (
        <NoAlternativesPanel result={result} />
      )}
    </SheetDialog>
  )
}
