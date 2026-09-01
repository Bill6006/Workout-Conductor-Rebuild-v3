import { FormField } from '../../components/FormField'
import { NumberStepper } from '../../components/NumberStepper'
import { SegmentedControl } from '../../components/SegmentedControl'
import { ToggleRow } from '../../components/ToggleRow'
import { REST_STYLE_LABELS, UNITS_LABELS, segmentOptions, weightUnitFor } from '../../catalog/labels'
import type { RestStyle, Units } from '../../core/validation'
import type { StepBodyProps } from './steps'
import styles from './OnboardingSteps.module.css'

const TECHNIQUES: readonly { key: 'supersets' | 'dropSets' | 'circuits'; label: string; body: string }[] = [
  { key: 'supersets', label: 'Supersets', body: 'Two exercises back to back with no rest between them.' },
  { key: 'dropSets', label: 'Drop sets', body: 'Carry a set on at a lighter weight once you stall.' },
  { key: 'circuits', label: 'Circuits', body: 'Rotate through several exercises with little rest.' },
]

const REST_SEGMENTS = segmentOptions(REST_STYLE_LABELS)
const UNIT_SEGMENTS = segmentOptions(UNITS_LABELS)

/** Bounds wide enough for anyone, narrow enough that a slip is obvious. */
const WEIGHT_BOUNDS: Record<'kg' | 'lb', { min: number; max: number; start: number }> = {
  kg: { min: 30, max: 300, start: 80 },
  lb: { min: 66, max: 660, start: 175 },
}

/** Techniques, rest, the unit weights are written in, and an optional bodyweight. */
export function TrainingStep({ answers, onChange }: StepBodyProps) {
  const { techniques, restStyle, units, bodyweight } = answers
  const unit = bodyweight?.unit ?? weightUnitFor(units)
  const bounds = WEIGHT_BOUNDS[unit]

  function setUnits(next: Units) {
    // The bodyweight keeps the unit it was entered in. Relabelling 80 kg as
    // 80 lb because a different control moved would be a quiet lie.
    onChange({ units: next })
  }

  function toggleBodyweight(on: boolean) {
    if (!on) {
      onChange({ bodyweight: null })
      return
    }
    const start = WEIGHT_BOUNDS[weightUnitFor(units)].start
    onChange({ bodyweight: { value: start, unit: weightUnitFor(units) } })
  }

  return (
    <div className={styles.stack}>
      <FormField
        as="group"
        label="Techniques you are happy with"
        hint="Turn off anything you would rather not do."
      >
        <div className={styles.toggles}>
          {TECHNIQUES.map((technique) => (
            <ToggleRow
              key={technique.key}
              label={technique.label}
              description={technique.body}
              checked={techniques[technique.key]}
              onChange={(checked) => onChange({ techniques: { ...techniques, [technique.key]: checked } })}
            />
          ))}
        </div>
      </FormField>

      <FormField as="group" label="Rest between sets" hint="Roughly how long you like to wait.">
        {(field) => (
          <SegmentedControl<RestStyle>
            aria-labelledby={field.labelId}
            options={REST_SEGMENTS}
            value={restStyle}
            onChange={(value) => onChange({ restStyle: value })}
          />
        )}
      </FormField>

      <FormField as="group" label="Weights are shown in" hint="Kilograms or pounds.">
        {(field) => (
          <SegmentedControl<Units>
            aria-labelledby={field.labelId}
            options={UNIT_SEGMENTS}
            value={units}
            onChange={setUnits}
          />
        )}
      </FormField>

      <div className={styles.toggles}>
        <ToggleRow
          label="Add your bodyweight"
          description="Optional. Stored with your profile, on this device only."
          checked={bodyweight !== null}
          onChange={toggleBodyweight}
        />
      </div>

      {bodyweight !== null && (
        <FormField as="group" label="Bodyweight" hint={`In ${unit}.`}>
          {(field) => (
            <NumberStepper
              label="bodyweight"
              unit={unit}
              aria-labelledby={field.labelId}
              aria-describedby={field.describedBy}
              value={bodyweight.value}
              min={bounds.min}
              max={bounds.max}
              onChange={(value) => onChange({ bodyweight: { ...bodyweight, value } })}
            />
          )}
        </FormField>
      )}
    </div>
  )
}
