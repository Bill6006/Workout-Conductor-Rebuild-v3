import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createLocation } from '../../core/validation/schemas'
import { EQUIPMENT, defaultEquipmentFor } from '../../catalog/equipment'
import { makeProfile, renderSettings } from './settingsTestHarness'

/**
 * The seeded item counts come from the equipment catalogue rather than a number
 * typed here. The catalogue grows as the exercise catalog needs more kit, and a
 * hand-written total would then fail on the growth instead of on the screen;
 * what the catalogue holds is pinned exactly in `catalog/equipment/equipment.test.ts`.
 */
const GYM_ITEMS = defaultEquipmentFor('gym').length
const HOME_ITEMS = defaultEquipmentFor('home').length

const ONE_LOCATION = makeProfile({
  locations: [createLocation('gym', 'Gym', 'loc-gym')],
  activeLocationId: 'loc-gym',
})

describe('SettingsScreen — locations and equipment', () => {
  it('lists every saved location with its equipment count and marks the active one', async () => {
    renderSettings()

    expect(
      await screen.findByRole('button', { name: new RegExp(`^Gym location Gym ${GYM_ITEMS} items`) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: new RegExp(`^Home location Home ${HOME_ITEMS} items`) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: new RegExp(`^Gym location Gym ${GYM_ITEMS} items Active`) }),
    ).toBeInTheDocument()
  })

  it('refuses to delete the last location and says why', async () => {
    const harness = renderSettings(ONE_LOCATION)
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^Gym location Gym ${GYM_ITEMS} items`) }),
    )
    const sheet = within(screen.getByRole('dialog', { name: 'Edit Gym' }))

    expect(sheet.getByRole('button', { name: 'Delete location' })).toBeDisabled()
    expect(
      sheet.getByText('This is your only location, so it cannot be deleted. Add another one first.'),
    ).toBeInTheDocument()
    expect(harness.stored()?.locations).toHaveLength(1)
  })

  it('deletes a location after an explicit confirmation', async () => {
    const harness = renderSettings()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^Home location Home ${HOME_ITEMS} items`) }),
    )
    await user.click(screen.getByRole('button', { name: 'Delete location' }))

    const confirm = within(screen.getByRole('dialog', { name: 'Delete Home?' }))
    await user.click(confirm.getByRole('button', { name: 'Delete location' }))

    await waitFor(() => expect(harness.stored()?.locations).toHaveLength(1))
    expect(harness.stored()?.locations[0].id).toBe('loc-gym')
    expect(harness.stored()?.activeLocationId).toBe('loc-gym')
  })

  it('moves the active location in the same write when the active one is deleted', async () => {
    const harness = renderSettings()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^Gym location Gym ${GYM_ITEMS} items`) }),
    )
    await user.click(screen.getByRole('button', { name: 'Delete location' }))

    const confirm = within(screen.getByRole('dialog', { name: 'Delete Gym?' }))
    await user.click(confirm.getByRole('button', { name: 'Delete location' }))

    await waitFor(() => expect(harness.stored()?.locations).toHaveLength(1))
    // A profile whose activeLocationId matches nothing fails validation, so the
    // save could only have succeeded if both moved together.
    expect(harness.stored()?.activeLocationId).toBe('loc-home')
  })

  it('will not add a location without a name', async () => {
    renderSettings()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add a location' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Add a location' }))

    expect(sheet.getByRole('button', { name: 'Add location' })).toBeDisabled()
    expect(sheet.getByText('Give the location a name first.')).toBeInTheDocument()
  })

  it('adds a location seeded from the canonical catalogue for its kind', async () => {
    const harness = renderSettings()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add a location' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Hotel')
    await user.click(screen.getByRole('radio', { name: 'Travel' }))
    await user.click(screen.getByRole('button', { name: 'Add location' }))

    await waitFor(() => expect(harness.stored()?.locations).toHaveLength(3))
    const added = harness.stored()?.locations[2]
    expect(added?.name).toBe('Hotel')
    expect(added?.kind).toBe('travel')
    expect(added?.equipment).toEqual(['resistance-bands', 'bodyweight-only'])
  })

  it('renames a location and edits its equipment from the catalogue', async () => {
    const harness = renderSettings()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^Home location Home ${HOME_ITEMS} items`) }),
    )
    const name = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Garage')
    await user.click(screen.getByRole('checkbox', { name: 'Adjustable dumbbells' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(harness.stored()?.locations[1].name).toBe('Garage'))
    expect(harness.stored()?.locations[1].equipment).not.toContain('adjustable-dumbbells')
    expect(harness.stored()?.locations[1].equipment).toContain('dumbbells')
  })

  it('changes the active location', async () => {
    const harness = renderSettings()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^Active location Gym/ }))
    await user.click(screen.getByRole('radio', { name: /^Home/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(harness.stored()?.activeLocationId).toBe('loc-home'))
    expect(screen.getByText('Active location saved.')).toBeInTheDocument()
  })

  it('does not offer a second, hand-typed equipment list', async () => {
    renderSettings()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^Gym location Gym ${GYM_ITEMS} items`) }),
    )
    const chips = screen.getAllByRole('checkbox')

    // Every chip, in the catalogue's own order, and nothing the catalogue does not
    // name — which a count alone would not have caught.
    expect(chips.map((chip) => chip.textContent)).toEqual(EQUIPMENT.map((item) => item.label))
    expect(chips.map((chip) => chip.textContent)).toContain('Selectorised machines')
  })
})
