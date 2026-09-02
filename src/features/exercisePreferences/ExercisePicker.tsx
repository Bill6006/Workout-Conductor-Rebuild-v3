import { useMemo, useState } from 'react'
import { ChipGroup } from '../../components/ChipGroup'
import { FormField } from '../../components/FormField'
import { equipmentLabel } from '../../catalog/equipment'
import { muscleGroupLabel } from '../../catalog/labels/catalogLabels'
import { humaniseExerciseId, type Exercise } from '../../catalog/exercises'
import type { MuscleGroupId } from '../../catalog/muscles'
import type { ExercisePreferenceList } from '../../core/validation'
import { useExerciseCatalog, type ExerciseCatalog } from './useExerciseCatalog'
import styles from './ExercisePicker.module.css'

/**
 * THE exercise picker. One pattern, used by setup and by Settings, for both the
 * preferred and the avoided list.
 *
 * IT IS THE ONLY WAY IN. Phase 1 collected these as free text and Phase 2 makes
 * them catalog-backed, but a catalog of 127 entries will never hold every word a
 * person uses for a movement. So rather than a picker beside a second free-text
 * box — two workflows, two chances to diverge — there is one search field: it
 * finds catalog exercises, and when it finds nothing it offers to keep what was
 * typed, verbatim, as the person's own words.
 *
 * WHAT SOMEBODY TYPED IS THEIRS. Every free-text entry the v1 -> v2 migration
 * carried over is listed here in full, never folded into a count and never
 * quietly resolved to "the closest exercise". Each one carries a quiet
 * `Find a match` affordance that pre-fills the search with those words, so
 * replacing it is one tap and a choice they can see — and `Remove` is separate,
 * so replacing and discarding can never be the same gesture.
 *
 * THE CATALOG ARRIVES WHEN THIS MOUNTS, not when the screen does. See
 * `useExerciseCatalog`. Until it lands, the sheet shows one calm line; the
 * search field, the chosen list, and the person's own words are all still there
 * and still editable, because none of them need the catalog to be true.
 */

/** How many exercises one side may hold — catalog picks and own words together. */
export const MAX_PREFERENCE_ENTRIES = 40
/**
 * How many result rows are rendered before the list asks for a narrower search.
 *
 * Not a scroll budget — a scannable one. Thirty rows is more than any single
 * muscle-group filter produces, so browsing by muscle never truncates; it is the
 * unfiltered, untyped view that gets capped, and that is the one view where a
 * person is not looking for anything in particular yet. It also keeps a keystroke
 * cheap: every character retypes the list, and 127 rows of two-line markup on a
 * throttled phone is how a search box comes to feel laggy.
 */
const RESULT_LIMIT = 30
const MAX_OWN_WORDS_LENGTH = 80

export interface ExercisePickerProps {
  /**
   * Singular noun for one entry — `'preferred exercise'`, `'exercise to avoid'`.
   * It names the controls, so the two sides stay distinguishable to anything
   * reading by name.
   */
  noun: string
  value: ExercisePreferenceList
  onChange: (next: ExercisePreferenceList) => void
  maxEntries?: number
}

function metaFor(catalog: ExerciseCatalog, exercise: Exercise): string {
  const groups = catalog.muscleGroupsOf(exercise).map(muscleGroupLabel).join(', ')
  const kit =
    exercise.equipment.length === 0 ? 'No equipment' : exercise.equipment.map(equipmentLabel).join(', ')
  return `${groups} · ${kit}`
}

export function ExercisePicker({
  noun,
  value,
  onChange,
  maxEntries = MAX_PREFERENCE_ENTRIES,
}: ExercisePickerProps) {
  const { status, catalog, retry } = useExerciseCatalog(true)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<MuscleGroupId[]>([])
  /** The free-text entry being swapped for a catalog exercise, if any. */
  const [replacing, setReplacing] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const chosenIds = value.exerciseIds
  const ownWords = value.freeText
  const total = chosenIds.length + ownWords.length
  const full = total >= maxEntries

  const matches = useMemo(() => {
    if (!catalog) return null
    return catalog.searchExercises(query, { muscleGroups: groups })
  }, [catalog, query, groups])

  const shown = matches ? matches.slice(0, RESULT_LIMIT) : []
  const typed = query.trim().replace(/\s+/g, ' ')

  /**
   * Offer the typed words only when the catalog has no exact entry for them.
   * A near miss is still offered — "incline press" is not in the catalog and the
   * person may well mean something the catalog cannot name — but an exact name
   * is not, because keeping "Barbell row" as free text when the catalog holds
   * `barbell-row` would discard the match on their behalf.
   */
  const canKeepWords =
    typed !== '' &&
    typed.length <= MAX_OWN_WORDS_LENGTH &&
    catalog !== null &&
    catalog.resolveExerciseId(typed) === null &&
    !ownWords.some((entry) => entry.toLowerCase() === typed.toLowerCase())

  function replaceList(next: ExercisePreferenceList) {
    onChange(next)
  }

  function choose(exercise: Exercise) {
    if (chosenIds.includes(exercise.id)) {
      replaceList({ ...value, exerciseIds: chosenIds.filter((id) => id !== exercise.id) })
      setMessage(`${exercise.name} removed.`)
      return
    }
    // A replacement swaps one entry for another, so it is never blocked by a full
    // list — refusing it would strand the free text it was going to clear.
    if (full && replacing === null) {
      setMessage(`That is the limit of ${maxEntries}. Remove one first.`)
      return
    }

    replaceList({
      exerciseIds: [...chosenIds, exercise.id],
      freeText: replacing === null ? ownWords : ownWords.filter((entry) => entry !== replacing),
    })
    setMessage(
      replacing === null ? `${exercise.name} added.` : `${replacing} replaced with ${exercise.name}.`,
    )
    if (replacing !== null) {
      setReplacing(null)
      setQuery('')
    }
  }

  function keepWords() {
    if (!canKeepWords) return
    if (full) {
      setMessage(`That is the limit of ${maxEntries}. Remove one first.`)
      return
    }
    replaceList({
      exerciseIds: chosenIds,
      freeText: [...ownWords.filter((entry) => entry !== replacing), typed],
    })
    setMessage(`${typed} kept in your own words.`)
    setReplacing(null)
    setQuery('')
  }

  function removeOwnWords(entry: string) {
    replaceList({ ...value, freeText: ownWords.filter((existing) => existing !== entry) })
    if (replacing === entry) {
      setReplacing(null)
      setQuery('')
    }
    setMessage(`${entry} removed.`)
  }

  function startReplacing(entry: string) {
    setReplacing(entry)
    setQuery(entry)
    setGroups([])
    setMessage(`Searching for a match for ${entry}.`)
  }

  function cancelReplacing() {
    setReplacing(null)
    setQuery('')
    setMessage('')
  }

  const chosenChips = chosenIds.map((id) => ({
    id,
    // A stored id the catalog no longer ships still has to render as something a
    // person recognises, so the slug stands in rather than the row disappearing.
    label: catalog?.exerciseNameOf(id) ?? humaniseExerciseId(id),
  }))

  return (
    <div className={styles.wrap}>
      <FormField label="Search exercises" hint="By name, or by another word you use for it.">
        {(field) => (
          <input
            id={field.id}
            className={styles.search}
            type="search"
            value={query}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={MAX_OWN_WORDS_LENGTH}
            placeholder="e.g. incline press"
            aria-describedby={field.describedBy}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
      </FormField>

      {replacing !== null && (
        <div className={styles.replacing}>
          <p className={styles.replacingText}>
            Finding a match for <strong>{replacing}</strong>. Pick one below, or keep your words.
          </p>
          <button type="button" className={styles.linkButton} onClick={cancelReplacing}>
            Keep my words
          </button>
        </div>
      )}

      {catalog && (
        <FormField as="group" label="Narrow it down" hint="Optional. Filter by the muscle it trains.">
          {(field) => (
            <ChipGroup
              items={catalog.MUSCLE_GROUPS_IN_CATALOG.map((group) => ({
                id: group,
                label: muscleGroupLabel(group),
              }))}
              selected={groups}
              onChange={(next) => setGroups(next as MuscleGroupId[])}
              aria-labelledby={field.labelId}
            />
          )}
        </FormField>
      )}

      <p className={styles.status} role="status" aria-live="polite">
        {message}
      </p>

      <section className={styles.section} aria-label={`Your ${noun} list`}>
        <p className={styles.sectionHead}>
          {total === 0 ? 'Nothing on your list yet.' : `${total} of ${maxEntries} on your list.`}
        </p>

        {chosenChips.length > 0 && (
          <FormField as="group" label="Chosen exercises" hint="Tap one to take it off the list.">
            {(field) => (
              <ChipGroup
                items={chosenChips}
                selected={chosenIds}
                onChange={(next) => {
                  const dropped = chosenIds.find((id) => !next.includes(id))
                  replaceList({ ...value, exerciseIds: next })
                  if (dropped)
                    setMessage(`${catalog?.exerciseNameOf(dropped) ?? humaniseExerciseId(dropped)} removed.`)
                }}
                aria-labelledby={field.labelId}
              />
            )}
          </FormField>
        )}

        {ownWords.length > 0 && (
          <div className={styles.ownWords}>
            <p className={styles.sectionHead}>
              In your own words. Kept exactly as you typed them, and used as they are.
            </p>
            <ul className={styles.ownList} role="list">
              {ownWords.map((entry) => (
                <li key={entry} className={styles.ownRow}>
                  <span className={styles.ownText}>{entry}</span>
                  <span className={styles.ownActions}>
                    <button type="button" className={styles.ownAction} onClick={() => startReplacing(entry)}>
                      Find a match
                      <span className="wc-visually-hidden">{` for ${entry}`}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.ownRemove}
                      aria-label={`Remove ${entry}`}
                      onClick={() => removeOwnWords(entry)}
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="Exercises">
        {status === 'loading' && (
          <p className={styles.loading} role="status">
            Loading the exercise list…
          </p>
        )}

        {status === 'error' && (
          <div className={styles.failure} role="alert">
            <p>The exercise list could not be loaded. Everything already on your list is safe.</p>
            <button type="button" className={styles.linkButton} onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {catalog && matches && (
          <>
            {canKeepWords && (
              <button type="button" className={styles.keepWords} onClick={keepWords}>
                <span className={styles.resultName}>Keep &ldquo;{typed}&rdquo; in your own words</span>
                <span className={styles.resultMeta}>
                  {matches.length === 0
                    ? 'Nothing in the exercise list matches that.'
                    : 'Use your wording instead of one of the matches below.'}
                </span>
              </button>
            )}

            {matches.length === 0 && !canKeepWords && (
              <p className={styles.empty}>No exercise matches that. Try fewer words.</p>
            )}

            {shown.length > 0 && (
              <ul className={styles.results} role="list">
                {shown.map((exercise) => {
                  const chosen = chosenIds.includes(exercise.id)
                  return (
                    <li key={exercise.id}>
                      <button
                        type="button"
                        className={[styles.result, chosen ? styles.resultOn : null].filter(Boolean).join(' ')}
                        aria-pressed={chosen}
                        onClick={() => choose(exercise)}
                      >
                        <span className={styles.resultName}>{exercise.name}</span>
                        <span className={styles.resultMeta}>{metaFor(catalog, exercise)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {matches.length > shown.length && (
              <p className={styles.empty}>
                {`Showing the first ${shown.length} of ${matches.length}. Search or filter to narrow it down.`}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
