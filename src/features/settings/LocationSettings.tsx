import { useState } from 'react'
import { Card } from '../../components/Card'
import { ChipGroup } from '../../components/ChipGroup'
import { ChoiceCard, ChoiceCardGroup } from '../../components/ChoiceCard'
import { FormField } from '../../components/FormField'
import { Pill } from '../../components/Pill'
import { PrimaryAction } from '../../components/PrimaryAction'
import { SegmentedControl } from '../../components/SegmentedControl'
import { EQUIPMENT, defaultEquipmentFor, sortEquipmentIds } from '../../catalog/equipment'
import {
  LOCATION_KIND_LABELS,
  equipmentSummary,
  locationKindLabel,
  segmentOptions,
} from '../../catalog/labels'
import { useProfile } from '../../core/state'
import type { SaveResult } from '../../core/storage/verifiedSave'
import {
  createLocation,
  type LocationKind,
  type LocationProfile,
  type Profile,
} from '../../core/validation/schemas'
import { EditRow } from './EditRow'
import { EditSheet } from './EditSheet'
import styles from './LocationSettings.module.css'

/**
 * Locations and their equipment.
 *
 * A profile must always keep at least one location — `parseProfile` rejects a
 * profile whose `activeLocationId` matches nothing — so deleting the last one is
 * refused here with the reason on screen rather than allowed and then rejected
 * by the validator.
 */

const MAX_LOCATIONS = 20

/** Chip items come from the canonical catalogue; this file never names equipment. */
const EQUIPMENT_ITEMS = EQUIPMENT.map((item) => ({ id: item.id, label: item.label }))

type Dialog =
  | { kind: 'none' }
  | { kind: 'active' }
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'delete'; id: string }

export interface LocationSettingsProps {
  profile: Profile
  onSaved: (message: string) => void
}

export function LocationSettings({ profile, onSaved }: LocationSettingsProps) {
  const { updateProfile } = useProfile()
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const close = () => setDialog({ kind: 'none' })

  const locations = profile.locations
  const active = locations.find((location) => location.id === profile.activeLocationId) ?? locations[0]
  const atLimit = locations.length >= MAX_LOCATIONS
  const isLastLocation = locations.length <= 1

  const editing = dialog.kind === 'edit' ? locations.find((l) => l.id === dialog.id) : undefined
  const deleting = dialog.kind === 'delete' ? locations.find((l) => l.id === dialog.id) : undefined

  function saveLocation(next: LocationProfile): Promise<SaveResult<Profile>> {
    const exists = locations.some((location) => location.id === next.id)
    const updated = exists
      ? locations.map((location) => (location.id === next.id ? next : location))
      : [...locations, next]
    return updateProfile({ locations: updated })
  }

  function deleteLocation(id: string): Promise<SaveResult<Profile>> {
    const remaining = locations.filter((location) => location.id !== id)
    // activeLocationId must always match a saved location, so it moves in the
    // same write rather than in a follow-up save that could fail on its own.
    const activeId = remaining.some((location) => location.id === profile.activeLocationId)
      ? profile.activeLocationId
      : remaining[0].id
    return updateProfile({ locations: remaining, activeLocationId: activeId })
  }

  return (
    <>
      <Card title="Equipment and locations">
        <div className={styles.rows}>
          <EditRow
            label="Active location"
            value={active.name}
            hint={`${locationKindLabel(active.kind)} · ${equipmentSummary(active)}`}
            onEdit={() => setDialog({ kind: 'active' })}
            disabled={locations.length < 2}
          />
        </div>

        <ul className={styles.list} role="list">
          {locations.map((location) => (
            <li key={location.id}>
              <EditRow
                label={`${locationKindLabel(location.kind)} location`}
                value={location.name}
                hint={equipmentSummary(location)}
                badge={location.id === active.id ? <Pill tone="accent">Active</Pill> : undefined}
                onEdit={() => setDialog({ kind: 'edit', id: location.id })}
              />
            </li>
          ))}
        </ul>

        <PrimaryAction variant="ghost" onClick={() => setDialog({ kind: 'add' })} disabled={atLimit}>
          Add a location
        </PrimaryAction>
        {atLimit && (
          <p className={styles.note}>
            That is the limit of {MAX_LOCATIONS} locations. Delete one before adding another.
          </p>
        )}
      </Card>

      {dialog.kind === 'active' && (
        <ActiveLocationSheet
          locations={locations}
          current={active.id}
          onPick={(id) => updateProfile({ activeLocationId: id })}
          onSaved={() => onSaved('Active location saved.')}
          onClose={close}
        />
      )}

      {dialog.kind === 'add' && (
        <LocationSheet
          mode="add"
          initial={createLocation('gym', '')}
          onPick={saveLocation}
          onSaved={() => onSaved('Location added.')}
          onClose={close}
        />
      )}

      {dialog.kind === 'edit' && editing && (
        <LocationSheet
          mode="edit"
          initial={editing}
          isLastLocation={isLastLocation}
          onDelete={() => setDialog({ kind: 'delete', id: editing.id })}
          onPick={saveLocation}
          onSaved={() => onSaved('Location saved.')}
          onClose={close}
        />
      )}

      {dialog.kind === 'delete' && deleting && (
        <EditSheet
          title={`Delete ${deleting.name}?`}
          description="This removes the location and its equipment list from this device."
          saveLabel="Delete location"
          tone="danger"
          onSave={() => deleteLocation(deleting.id)}
          onSaved={() => onSaved('Location deleted.')}
          onClose={close}
        >
          <p className={styles.confirm}>
            {deleting.id === active.id
              ? 'This is your active location, so another one becomes active in the same save.'
              : 'Your other locations are not affected.'}
          </p>
        </EditSheet>
      )}
    </>
  )
}

function ActiveLocationSheet({
  locations,
  current,
  onPick,
  onSaved,
  onClose,
}: {
  locations: readonly LocationProfile[]
  current: string
  onPick: (id: string) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [id, setId] = useState(current)

  return (
    <EditSheet
      title="Active location"
      description="Where you are training right now. Sessions are built from this location's equipment."
      onSave={() => onPick(id)}
      onSaved={onSaved}
      onClose={onClose}
    >
      <ChoiceCardGroup label="Active location">
        {locations.map((location) => (
          <ChoiceCard
            key={location.id}
            title={location.name}
            description={`${locationKindLabel(location.kind)} · ${equipmentSummary(location)}`}
            selected={location.id === id}
            onSelect={() => setId(location.id)}
          />
        ))}
      </ChoiceCardGroup>
    </EditSheet>
  )
}

function LocationSheet({
  mode,
  initial,
  isLastLocation = false,
  onDelete,
  onPick,
  onSaved,
  onClose,
}: {
  mode: 'add' | 'edit'
  initial: LocationProfile
  isLastLocation?: boolean
  onDelete?: () => void
  onPick: (location: LocationProfile) => Promise<SaveResult<Profile>>
  onSaved: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<LocationProfile>(initial)
  const named = draft.name.trim() !== ''

  function changeKind(kind: LocationKind) {
    // A new location is re-seeded from its kind; an existing one keeps the
    // equipment list the user curated.
    setDraft((current) => ({
      ...current,
      kind,
      equipment: mode === 'add' ? defaultEquipmentFor(kind) : current.equipment,
    }))
  }

  return (
    <EditSheet
      title={mode === 'add' ? 'Add a location' : `Edit ${initial.name}`}
      description="Name it, then tick the equipment that is actually there."
      saveLabel={mode === 'add' ? 'Add location' : 'Save'}
      canSave={named}
      blockedReason="Give the location a name first."
      onSave={() =>
        onPick({ ...draft, name: draft.name.trim(), equipment: sortEquipmentIds(draft.equipment) })
      }
      onSaved={onSaved}
      onClose={onClose}
    >
      <FormField label="Name">
        {(field) => (
          <input
            id={field.id}
            className={styles.input}
            type="text"
            maxLength={60}
            autoComplete="off"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        )}
      </FormField>

      <FormField label="Kind" as="group">
        {(field) => (
          <SegmentedControl
            options={segmentOptions(LOCATION_KIND_LABELS)}
            value={draft.kind}
            onChange={changeKind}
            aria-labelledby={field.labelId}
          />
        )}
      </FormField>

      <FormField
        label="Equipment"
        hint={`${sortEquipmentIds(draft.equipment).length} of ${EQUIPMENT_ITEMS.length} selected.`}
        as="group"
      >
        {(field) => (
          <ChipGroup
            items={EQUIPMENT_ITEMS}
            selected={draft.equipment}
            onChange={(selected) => setDraft({ ...draft, equipment: sortEquipmentIds(selected) })}
            aria-labelledby={field.labelId}
          />
        )}
      </FormField>

      <FormField label="Notes" hint="Optional. Anything about this place worth remembering.">
        {(field) => (
          <textarea
            id={field.id}
            className={styles.textarea}
            rows={3}
            maxLength={500}
            value={draft.notes}
            aria-describedby={field.describedBy}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        )}
      </FormField>

      {mode === 'edit' && (
        <div className={styles.deleteBlock}>
          <PrimaryAction
            variant="ghost"
            className={styles.delete}
            onClick={onDelete}
            disabled={isLastLocation}
          >
            Delete location
          </PrimaryAction>
          {isLastLocation && (
            <p className={styles.note}>
              This is your only location, so it cannot be deleted. Add another one first.
            </p>
          )}
        </div>
      )}
    </EditSheet>
  )
}
