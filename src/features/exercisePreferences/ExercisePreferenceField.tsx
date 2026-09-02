import { useState } from 'react'
import { FormField } from '../../components/FormField'
import { PrimaryAction } from '../../components/PrimaryAction'
import { SheetDialog } from '../../components/SheetDialog'
import { humaniseExerciseId } from '../../catalog/exercises'
import type { ExercisePreferenceList } from '../../core/validation'
import { ExercisePicker } from './ExercisePicker'
import { useExerciseCatalog } from './useExerciseCatalog'
import styles from './ExercisePreferenceField.module.css'

/**
 * One preference list, as setup shows it: what is on the list right now, and one
 * button that opens the picker.
 *
 * WHY A SHEET RATHER THAN THE STEP ITSELF. The limits step already scrolls past
 * a phone screen, and putting a search field with a hundred results inline —
 * twice, once per side — would bury the injury toggles above it and the Continue
 * button below. The sheet is the same one Settings uses, so a person meets the
 * picker in one form, not two.
 *
 * THE SUMMARY NEEDS NO CATALOG. It renders from the stored list alone: chosen
 * exercises fall back to their humanised id, and free text is shown verbatim and
 * marked as the person's own words. That is what keeps this component — which
 * setup renders on arrival — off the catalog chunk until somebody opens the
 * picker. Once they have, the real names are used, because by then they are free.
 */

export interface ExercisePreferenceFieldProps {
  /** The field's visible label — "Exercises you like". */
  label: string
  hint?: string
  /** Singular noun for one entry, used to name the button and the picker. */
  noun: string
  /** The picker sheet's heading and its one line of explanation. */
  sheetTitle: string
  sheetDescription: string
  value: ExercisePreferenceList
  onChange: (next: ExercisePreferenceList) => void
}

export function ExercisePreferenceField({
  label,
  hint,
  noun,
  sheetTitle,
  sheetDescription,
  value,
  onChange,
}: ExercisePreferenceFieldProps) {
  const [open, setOpen] = useState(false)
  const { catalog } = useExerciseCatalog(open)

  const chosen = value.exerciseIds.map((id) => ({
    key: `id:${id}`,
    text: catalog?.exerciseNameOf(id) ?? humaniseExerciseId(id),
    ownWords: false,
  }))
  const words = value.freeText.map((entry) => ({ key: `text:${entry}`, text: entry, ownWords: true }))
  const entries = [...chosen, ...words]

  return (
    <>
      <FormField as="group" label={label} hint={hint}>
        {(field) => (
          <div className={styles.field}>
            {entries.length === 0 ? (
              <p className={styles.empty}>Nothing added yet.</p>
            ) : (
              <ul className={styles.list} role="list" aria-labelledby={field.labelId}>
                {entries.map((entry) => (
                  <li key={entry.key} className={styles.entry}>
                    <span className={styles.entryText}>{entry.text}</span>
                    {entry.ownWords && <span className={styles.ownTag}>your words</span>}
                  </li>
                ))}
              </ul>
            )}
            <PrimaryAction variant="ghost" onClick={() => setOpen(true)}>
              {entries.length === 0 ? `Choose ${noun}s` : `Edit ${noun}s`}
            </PrimaryAction>
          </div>
        )}
      </FormField>

      {open && (
        <SheetDialog
          open
          title={sheetTitle}
          description={sheetDescription}
          onClose={() => setOpen(false)}
          footer={<PrimaryAction onClick={() => setOpen(false)}>Done</PrimaryAction>}
        >
          <ExercisePicker noun={noun} value={value} onChange={onChange} />
        </SheetDialog>
      )}
    </>
  )
}
