import { useEffect, useRef, useState } from 'react'
import { ChipGroup, type ChipItem } from '../../components/ChipGroup'
import { ChoiceCard, ChoiceCardGroup } from '../../components/ChoiceCard'
import { FormField } from '../../components/FormField'
import { SegmentedControl } from '../../components/SegmentedControl'
import { EQUIPMENT, defaultEquipmentFor, sortEquipmentIds } from '../../catalog/equipment'
import { LOCATION_KIND_LABELS, locationKindLabel, segmentOptions } from '../../catalog/labels'
import { createLocation, type LocationKind, type LocationProfile } from '../../core/validation'
import { MAX_LOCATIONS, MAX_LOCATION_NAME, issueFor, type StepBodyProps } from './steps'
import styles from './OnboardingSteps.module.css'

const EQUIPMENT_CHIPS: ChipItem[] = EQUIPMENT.map((item) => ({ id: item.id, label: item.label }))

const KIND_SEGMENTS = segmentOptions(LOCATION_KIND_LABELS)

/**
 * The places a person trains, and what each one has.
 *
 * Equipment is never reseeded behind their back when the type changes — a tap
 * that silently unticks twelve chips is a bug from the user's side of the screen.
 * The "Use typical" button does it only when asked.
 *
 * ACCESSIBLE NAMES: this step renders the same controls once per place, so with
 * the two default locations a screen-reader list of buttons and fields used to
 * read "Remove, Remove, Name, Name, Clear equipment, Clear equipment" with
 * nothing to tell them apart. Every one of them now carries its place's name —
 * either appended to the visible label, so the visible text stays the start of
 * the accessible name, or by pointing `aria-labelledby` at the field label and
 * the place heading together. The chips and segments inside a group are named by
 * that group, which now says which place it belongs to.
 */
export function LocationsStep({ answers, onChange, issues }: StepBodyProps) {
  const nameFields = useRef(new Map<string, HTMLInputElement | null>())
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusId) return
    const field = nameFields.current.get(focusId)
    field?.focus()
    field?.select()
    setFocusId(null)
  }, [focusId])

  const { locations, activeLocationId } = answers

  function patch(id: string, changes: Partial<LocationProfile>) {
    onChange({
      locations: locations.map((location) => (location.id === id ? { ...location, ...changes } : location)),
    })
  }

  function add() {
    if (locations.length >= MAX_LOCATIONS) return
    const next = createLocation('custom', 'New place')
    onChange({ locations: [...locations, next] })
    setFocusId(next.id)
  }

  function remove(id: string) {
    if (locations.length <= 1) return
    const remaining = locations.filter((location) => location.id !== id)
    // The active id must always name a location that exists, so it moves in the
    // same change rather than in a follow-up the validator would catch first.
    onChange({
      locations: remaining,
      activeLocationId: remaining.some((location) => location.id === activeLocationId)
        ? activeLocationId
        : remaining[0].id,
    })
  }

  return (
    <div className={styles.stack}>
      <p className={styles.copy}>
        Add every place you train. Each one keeps its own equipment list, so a hotel week and a full gym do
        not have to share one.
      </p>

      <ul className={styles.places} role="list">
        {locations.map((location, index) => {
          const headingId = `wc-location-${location.id}`
          const displayName = location.name.trim() || `Place ${index + 1}`

          return (
            <li key={location.id} className={styles.place} aria-labelledby={headingId}>
              <div className={styles.placeHead}>
                <h2 className={styles.placeTitle} id={headingId}>
                  {displayName}
                </h2>
                <button
                  type="button"
                  className={styles.danger}
                  aria-label={`Remove ${displayName}`}
                  disabled={locations.length <= 1}
                  aria-disabled={locations.length <= 1 || undefined}
                  onClick={() => remove(location.id)}
                >
                  Remove
                </button>
              </div>

              <FormField label="Name" error={issueFor(issues, `locations.${location.id}.name`)}>
                {(field) => (
                  <input
                    id={field.id}
                    ref={(node) => {
                      nameFields.current.set(location.id, node)
                    }}
                    className={styles.text}
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_LOCATION_NAME}
                    aria-labelledby={`${field.labelId} ${headingId}`}
                    aria-describedby={field.describedBy}
                    aria-invalid={field.invalid || undefined}
                    value={location.name}
                    onChange={(event) => patch(location.id, { name: event.target.value })}
                  />
                )}
              </FormField>

              <FormField as="group" label="Type">
                {(field) => (
                  <SegmentedControl<LocationKind>
                    aria-labelledby={`${field.labelId} ${headingId}`}
                    options={KIND_SEGMENTS}
                    value={location.kind}
                    onChange={(kind) => patch(location.id, { kind })}
                  />
                )}
              </FormField>

              <FormField
                as="group"
                label="Equipment here"
                hint={`${location.equipment.length} of ${EQUIPMENT_CHIPS.length} selected.`}
              >
                {(field) => (
                  <ChipGroup
                    aria-labelledby={`${field.labelId} ${headingId}`}
                    items={EQUIPMENT_CHIPS}
                    selected={[...location.equipment]}
                    onChange={(selected) => patch(location.id, { equipment: sortEquipmentIds(selected) })}
                  />
                )}
              </FormField>

              <div className={styles.placeActions}>
                <button
                  type="button"
                  className={styles.small}
                  aria-label={`Use typical ${locationKindLabel(location.kind).toLowerCase()} kit for ${displayName}`}
                  onClick={() => patch(location.id, { equipment: defaultEquipmentFor(location.kind) })}
                >
                  {`Use typical ${locationKindLabel(location.kind).toLowerCase()} kit`}
                </button>
                <button
                  type="button"
                  className={styles.small}
                  aria-label={`Clear equipment at ${displayName}`}
                  onClick={() => patch(location.id, { equipment: [] })}
                >
                  Clear equipment
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className={styles.placeActions}>
        <button
          type="button"
          className={styles.small}
          disabled={locations.length >= MAX_LOCATIONS}
          aria-disabled={locations.length >= MAX_LOCATIONS || undefined}
          onClick={add}
        >
          Add a place
        </button>
      </div>

      {locations.length >= MAX_LOCATIONS && (
        <p className={styles.note}>{`${MAX_LOCATIONS} places is the limit for now.`}</p>
      )}

      <FormField
        as="group"
        label="Where you train most"
        hint="The one the app opens with."
        error={issueFor(issues, 'activeLocationId') ?? issueFor(issues, 'locations')}
      >
        {(field) => (
          <ChoiceCardGroup label="Where you train most" labelledBy={field.labelId}>
            {locations.map((location, index) => (
              <ChoiceCard
                key={location.id}
                title={location.name.trim() || `Place ${index + 1}`}
                description={`${locationKindLabel(location.kind)} · ${location.equipment.length} items`}
                selected={activeLocationId === location.id}
                onSelect={() => onChange({ activeLocationId: location.id })}
              />
            ))}
          </ChoiceCardGroup>
        )}
      </FormField>
    </div>
  )
}
