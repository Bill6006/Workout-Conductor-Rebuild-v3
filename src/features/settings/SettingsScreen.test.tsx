import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BUILD_INFO, formatBuildStamp } from '../../app/buildInfo'
import { DROP_WRITE } from '../../core/storage/memoryStore'
import { makeProfile, renderSettings } from './settingsTestHarness'

/** Opens a settings row by its accessible name and hands back the user session. */
async function openRow(name: RegExp) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  return user
}

describe('SettingsScreen', () => {
  it('renders a single h1', async () => {
    renderSettings()
    const headings = await screen.findAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Settings')
  })

  it('groups every editable section', async () => {
    renderSettings()

    for (const group of [
      'Goals and programming',
      'Schedule',
      'Training preferences',
      'Exercise preferences',
      'Limitations',
      'Units and bodyweight',
      'Equipment and locations',
      'Setup',
      'Data',
      'Build',
      'About',
    ]) {
      expect(await screen.findByRole('heading', { level: 2, name: group })).toBeInTheDocument()
    }
  })

  it('shows the saved profile values on the rows, not placeholders', async () => {
    renderSettings()

    expect(await screen.findByRole('button', { name: /Primary goal Build muscle/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Training days Mon, Tue, Thu, Sat/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Typical session length 60 min/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rest style Standard rests/ })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Advanced techniques Supersets · Drop sets/ }),
    ).toBeInTheDocument()
  })

  it('persists an edit through the store and shows the new value', async () => {
    const harness = renderSettings()
    const user = await openRow(/Training style Hybrid/)

    await user.click(screen.getByRole('radio', { name: /^Strength/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: /Training style Strength/ })).toBeInTheDocument()
    expect(harness.stored()?.trainingStyle).toBe('strength')
    expect(screen.getByText('Training style saved.')).toBeInTheDocument()
  })

  it('edits a nested group without dropping its siblings', async () => {
    const harness = renderSettings()
    const user = await openRow(/Sessions per week 4 sessions/)

    await user.click(screen.getByRole('button', { name: 'Increase Sessions per week' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(harness.stored()?.schedule.sessionsPerWeek).toBe(5))
    expect(harness.stored()?.schedule.availableDays).toEqual(['mon', 'tue', 'thu', 'sat'])
    expect(harness.stored()?.schedule.typicalDurationMin).toBe(60)
  })

  it('surfaces an error instead of a success when the verified save fails', async () => {
    const harness = renderSettings()
    // A write the browser silently swallows: the promise resolves, the bytes
    // never land. Only the read-back catches it.
    harness.store.faults.onWrite = () => DROP_WRITE

    const user = await openRow(/Rest style Standard rests/)
    await user.click(screen.getByRole('radio', { name: /^Longer rests/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/differs from what was written/i)

    // The sheet stays open with the draft, the row is unchanged, and nothing
    // anywhere claims the change was saved.
    expect(screen.getByRole('dialog', { name: 'Rest style' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('Rest style saved.')).not.toBeInTheDocument()
    expect(harness.stored()?.restStyle).toBe('standard')
  })

  it('keeps a failed save recoverable — the same sheet succeeds once storage works', async () => {
    const harness = renderSettings()
    harness.store.faults.onWrite = () => DROP_WRITE

    const user = await openRow(/Units Imperial/)
    await user.click(screen.getByRole('radio', { name: /^Metric/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')

    harness.store.faults.onWrite = undefined
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: /Units Metric/ })).toBeInTheDocument()
    expect(harness.stored()?.units).toBe('metric')
  })

  it('cancels without writing anything', async () => {
    const harness = renderSettings()
    const user = await openRow(/Experience Intermediate/)

    await user.click(screen.getByRole('radio', { name: /^Advanced/ }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('button', { name: /Experience Intermediate/ })).toBeInTheDocument()
    expect(harness.stored()?.experience).toBe('intermediate')
  })

  it('will not save an empty training week', async () => {
    const harness = renderSettings()
    const user = await openRow(/Training days Mon, Tue, Thu, Sat/)

    for (const day of ['Monday', 'Tuesday', 'Thursday', 'Saturday']) {
      await user.click(screen.getByRole('checkbox', { name: day }))
    }

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Choose at least one training day.')).toBeInTheDocument()
    expect(harness.stored()?.schedule.availableDays).toEqual(['mon', 'tue', 'thu', 'sat'])
  })

  it('records a catalog exercise chosen from the picker', async () => {
    const harness = renderSettings()
    const user = await openRow(/Preferred exercises None listed/)

    // The catalog is a lazy chunk: it arrives after the sheet is already up, so
    // the first assertion is that the sheet waited calmly rather than blocking.
    await user.type(await screen.findByRole('searchbox', { name: 'Search exercises' }), 'incline dumbbell')
    await user.click(await screen.findByRole('button', { name: /^Incline dumbbell press/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(harness.stored()?.exercisePreferences.preferred).toEqual({
        exerciseIds: ['incline-dumbbell-press'],
        freeText: [],
      }),
    )
    // The row reads the catalog's own name, not the raw id.
    expect(
      await screen.findByRole('button', { name: /Preferred exercises Incline dumbbell press/ }),
    ).toBeInTheDocument()
  })

  it('keeps words the catalog cannot match, rather than guessing at them', async () => {
    const harness = renderSettings()
    const user = await openRow(/Preferred exercises None listed/)

    await user.type(await screen.findByRole('searchbox', { name: 'Search exercises' }), 'my gym class')
    await user.click(await screen.findByRole('button', { name: /Keep .my gym class. in your own words/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(harness.stored()?.exercisePreferences.preferred).toEqual({
        exerciseIds: [],
        freeText: ['my gym class'],
      }),
    )
  })

  it('shows free text carried over by the migration, and can swap it for a real exercise', async () => {
    // Exactly what a Phase 1 profile looks like after the v1 -> v2 migration:
    // everything the person typed, kept verbatim, with no ids guessed for them.
    const harness = renderSettings(
      makeProfile({
        exercisePreferences: {
          preferred: { exerciseIds: [], freeText: ['Front squat', 'whatever my coach calls it'] },
          disliked: { exerciseIds: [], freeText: [] },
        },
      }),
    )
    const user = await openRow(/Preferred exercises Front squat, whatever my coach calls it/)

    // Both entries are visible in full — neither is hidden behind a count.
    expect(await screen.findByText('Front squat')).toBeInTheDocument()
    expect(screen.getByText('whatever my coach calls it')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Find a match for Front squat' }))
    await user.click(await screen.findByRole('button', { name: /^Barbell front squat/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(harness.stored()?.exercisePreferences.preferred).toEqual({
        exerciseIds: ['barbell-front-squat'],
        // The entry the person did not replace is still theirs, untouched.
        freeText: ['whatever my coach calls it'],
      }),
    )
  })

  it('leaves the stored lists alone when the sheet is cancelled', async () => {
    const harness = renderSettings()
    const user = await openRow(/Preferred exercises None listed/)

    await user.type(await screen.findByRole('searchbox', { name: 'Search exercises' }), 'push up')
    await user.click(await screen.findByRole('button', { name: /^Push-up/ }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(harness.stored()?.exercisePreferences.preferred).toEqual({ exerciseIds: [], freeText: [] })
  })

  it('re-enters setup by clearing the completion stamp', async () => {
    const harness = renderSettings()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Re-run setup' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Re-run setup?' }))
    await user.click(sheet.getByRole('button', { name: 'Re-run setup' }))

    await waitFor(() => expect(harness.stored()?.onboardingCompletedAt).toBeNull())
  })

  it('says so plainly when there is no profile to edit', async () => {
    renderSettings(null)

    expect(await screen.findByRole('heading', { level: 2, name: 'No profile yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up now' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Primary goal/ })).not.toBeInTheDocument()
  })

  it('reports unreadable storage instead of pretending the profile is empty', async () => {
    renderSettings(undefined, { failRead: new Error('storage is blocked') })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Settings are unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/storage is blocked/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows the live build values, sourced from the build globals', async () => {
    renderSettings()
    const card = within(await screen.findByTestId('build-card'))

    expect(card.getByText('test-marker')).toBeInTheDocument()
    expect(card.getByText('Phase 0 - Repository, Live Pages, and Scaffold')).toBeInTheDocument()
    expect(card.getByText('abcdef1234567890')).toBeInTheDocument()
    // The ISO value stays machine-readable in `datetime`; only the rendered
    // text changed, and it changed to the footer stamp's own words.
    expect(card.getByText('2026-09-01 14:22 UTC')).toHaveAttribute('datetime', '2026-09-01T14:22:00.000Z')
  })

  it('spells the build time the way the footer stamp does, not as a raw timestamp', async () => {
    renderSettings()
    const card = within(await screen.findByTestId('build-card'))

    // One value, one format, one screen: `formatBuildStamp` is the only
    // formatter for it, and this reads back the time half of its output.
    const [, footerTime] = formatBuildStamp(BUILD_INFO).split(' · ')
    expect(card.getByText(footerTime)).toBeInTheDocument()
    expect(card.queryByText(BUILD_INFO.time)).not.toBeInTheDocument()
  })

  it('will not let "Set up now" start two profiles at once', async () => {
    const harness = renderSettings(null)
    const writes: string[] = []
    harness.store.faults = {
      onWrite: (key, value) => {
        writes.push(key)
        return value
      },
    }

    const button = await screen.findByRole('button', { name: 'Set up now' })
    fireEvent.click(button)

    // In flight: the label says so, and the second tap has nothing to hit.
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Setting up…')
    fireEvent.click(button)

    await waitFor(() => expect(harness.stored()).not.toBeNull())
    expect(writes).toEqual(['primary'])
  })

  it('links to the public repository and says the link opens a new tab', async () => {
    renderSettings()
    const link = await screen.findByRole('link', { name: /github repository/i })

    expect(link).toHaveAttribute('href', 'https://github.com/Bill6006/Workout-Conductor-Rebuild-v3')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    expect(link).toHaveAccessibleName('GitHub repository (opens in a new tab)')
  })

  it('drops the stale Phase 0 promise about settings becoming editable', async () => {
    renderSettings()
    await screen.findByRole('button', { name: /Primary goal/ })

    expect(screen.queryByRole('heading', { name: 'Editable settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Backups grow with the app' })).toBeInTheDocument()
  })

  it('marks every list as a list so screen readers keep the item count', async () => {
    const { container } = renderSettings()
    await screen.findByRole('button', { name: /Primary goal/ })

    for (const list of container.querySelectorAll('ul, ol')) {
      expect(list).toHaveAttribute('role', 'list')
    }
  })
})
