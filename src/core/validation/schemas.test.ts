import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GYM_LOCATION_ID,
  DEFAULT_HOME_LOCATION_ID,
  PROFILE_ID,
  SCHEMA_VERSION,
  WEEKDAYS,
  activeLocation,
  createDefaultProfile,
  createLocation,
  newLocationId,
  profileIntegrityIssues,
  profileSchema,
  type Profile,
} from './schemas'
import { formatIssues, parseProfile } from './validate'
import { EQUIPMENT } from '../../catalog/equipment/equipment'

const NOW = '2026-09-01T12:00:00.000Z'

function base(): Profile {
  return createDefaultProfile(NOW)
}

/** A profile as a bag of keys, so a test can plant a field the schema does not declare. */
function raw(profile: Profile = base()): Record<string, unknown> {
  return JSON.parse(JSON.stringify(profile)) as Record<string, unknown>
}

describe('SCHEMA_VERSION', () => {
  it('is the Phase 1 baseline', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('createDefaultProfile', () => {
  const profile = base()

  it('produces a profile that validates', () => {
    const result = parseProfile(profile)
    expect(result.ok, result.ok ? '' : formatIssues(result.issues)).toBe(true)
  })

  it('matches the documented defaults', () => {
    expect(profile.schemaVersion).toBe(SCHEMA_VERSION)
    expect(profile.id).toBe(PROFILE_ID)
    expect(profile.createdAt).toBe(NOW)
    expect(profile.updatedAt).toBe(NOW)
    expect(profile.goals).toEqual({ primary: 'build-muscle', secondary: null })
    expect(profile.experience).toBe('intermediate')
    expect(profile.trainingStyle).toBe('hybrid')
    expect(profile.schedule.sessionsPerWeek).toBe(4)
    expect(profile.schedule.typicalDurationMin).toBe(60)
    expect(profile.techniques).toEqual({ supersets: true, dropSets: true, circuits: false })
    expect(profile.restStyle).toBe('standard')
    expect(profile.units).toBe('imperial')
    expect(profile.bodyweight).toBeNull()
    expect(profile.limitations).toEqual({
      shoulder: false,
      knee: false,
      lowerBack: false,
      avoidBarbellSquat: false,
      notes: '',
    })
    expect(profile.exercisePreferences).toEqual({ preferred: [], disliked: [] })
    expect(profile.onboardingCompletedAt).toBeNull()
  })

  it('lists one available day per planned session', () => {
    expect(profile.schedule.availableDays).toHaveLength(profile.schedule.sessionsPerWeek)
    for (const day of profile.schedule.availableDays) {
      expect(WEEKDAYS).toContain(day)
    }
  })

  it('seeds a Gym and a Home location, with Gym active', () => {
    expect(profile.locations.map((location) => location.name)).toEqual(['Gym', 'Home'])
    expect(profile.locations.map((location) => location.id)).toEqual([
      DEFAULT_GYM_LOCATION_ID,
      DEFAULT_HOME_LOCATION_ID,
    ])
    expect(profile.activeLocationId).toBe(DEFAULT_GYM_LOCATION_ID)
    expect(activeLocation(profile).name).toBe('Gym')
  })

  it('gives the Gym every real item but not the bodyweight-only constraint', () => {
    const [gym, home] = profile.locations
    // `bodyweight-only` describes the absence of equipment, so seeding it beside a
    // squat rack would describe a setup that cannot exist.
    expect(gym.equipment).not.toContain('bodyweight-only')
    expect(gym.equipment).toHaveLength(EQUIPMENT.length - 1)
    expect(home.equipment.length).toBeGreaterThan(0)
    expect(home.equipment.length).toBeLessThan(gym.equipment.length)
  })

  it('takes its timestamps from the caller, never the wall clock', () => {
    const other = createDefaultProfile('2020-01-01T00:00:00.000Z')
    expect(other.createdAt).toBe('2020-01-01T00:00:00.000Z')
  })
})

describe('field boundaries', () => {
  function expectAccepted(patch: Record<string, unknown>) {
    const result = parseProfile({ ...raw(), ...patch })
    expect(result.ok, result.ok ? '' : formatIssues(result.issues)).toBe(true)
  }

  function expectRejected(patch: Record<string, unknown>) {
    expect(parseProfile({ ...raw(), ...patch }).ok).toBe(false)
  }

  it('requires the record id to be exactly "primary"', () => {
    expectAccepted({ id: 'primary' })
    expectRejected({ id: 'secondary' })
    expectRejected({ id: '' })
  })

  it('bounds sessionsPerWeek to 1..7 whole sessions', () => {
    for (const sessionsPerWeek of [1, 4, 7]) {
      expectAccepted({ schedule: { ...base().schedule, sessionsPerWeek } })
    }
    for (const sessionsPerWeek of [0, -1, 8, 3.5]) {
      expectRejected({ schedule: { ...base().schedule, sessionsPerWeek } })
    }
  })

  it('bounds typicalDurationMin to 15..180 whole minutes', () => {
    for (const typicalDurationMin of [15, 60, 180]) {
      expectAccepted({ schedule: { ...base().schedule, typicalDurationMin } })
    }
    for (const typicalDurationMin of [14, 181, 45.5, 0]) {
      expectRejected({ schedule: { ...base().schedule, typicalDurationMin } })
    }
  })

  it('accepts at most seven real weekdays', () => {
    expectAccepted({ schedule: { ...base().schedule, availableDays: [] } })
    expectAccepted({ schedule: { ...base().schedule, availableDays: [...WEEKDAYS] } })
    expectRejected({ schedule: { ...base().schedule, availableDays: [...WEEKDAYS, 'mon'] } })
    expectRejected({ schedule: { ...base().schedule, availableDays: ['monday'] } })
  })

  it('accepts only catalogue goals', () => {
    expectAccepted({ goals: { primary: 'stay-consistent', secondary: 'bigger-arms' } })
    expectAccepted({ goals: { primary: 'get-stronger', secondary: null } })
    expectRejected({ goals: { primary: 'look-cool', secondary: null } })
    expectRejected({ goals: { primary: 'build-muscle' } })
  })

  it('accepts only the three experience levels and three training styles', () => {
    expectAccepted({ experience: 'beginner' })
    expectRejected({ experience: 'expert' })
    expectAccepted({ trainingStyle: 'strength' })
    expectRejected({ trainingStyle: 'powerlifting' })
  })

  it('accepts only the declared rest styles and units', () => {
    expectAccepted({ restStyle: 'long' })
    expectRejected({ restStyle: 'medium' })
    expectAccepted({ units: 'metric' })
    expectRejected({ units: 'stones' })
  })

  it('takes a bodyweight or nothing at all', () => {
    expectAccepted({ bodyweight: null })
    expectAccepted({ bodyweight: { value: 82.5, unit: 'kg' } })
    expectAccepted({ bodyweight: { value: 180, unit: 'lb' } })
    expectRejected({ bodyweight: { value: 0, unit: 'kg' } })
    expectRejected({ bodyweight: { value: -80, unit: 'kg' } })
    expectRejected({ bodyweight: { value: 1001, unit: 'kg' } })
    expectRejected({ bodyweight: { value: 80, unit: 'stone' } })
    expectRejected({ bodyweight: { unit: 'kg' } })
  })

  it('requires every limitation flag to be a boolean', () => {
    expectRejected({ limitations: { ...base().limitations, knee: 'yes' } })
    expectRejected({ limitations: { shoulder: false, knee: false, lowerBack: false, notes: '' } })
  })

  it('caps free-text notes', () => {
    expectAccepted({ limitations: { ...base().limitations, notes: 'x'.repeat(500) } })
    expectRejected({ limitations: { ...base().limitations, notes: 'x'.repeat(501) } })
  })

  it('takes free-text exercise preferences but not empty entries', () => {
    expectAccepted({ exercisePreferences: { preferred: ['Incline press'], disliked: ['Burpees'] } })
    expectRejected({ exercisePreferences: { preferred: [''], disliked: [] } })
    expectRejected({ exercisePreferences: { preferred: 'Incline press', disliked: [] } })
  })

  it('needs at least one location, with equipment drawn from the catalogue', () => {
    expectRejected({ locations: [] })
    expectRejected({
      locations: [{ id: 'a', name: 'A', kind: 'gym', equipment: ['moon-boots'], notes: '' }],
      activeLocationId: 'a',
    })
    expectAccepted({
      locations: [{ id: 'a', name: 'A', kind: 'travel', equipment: ['resistance-bands'], notes: '' }],
      activeLocationId: 'a',
    })
  })

  it('demands parseable timestamps', () => {
    expectAccepted({ onboardingCompletedAt: null })
    expectAccepted({ onboardingCompletedAt: '2026-09-01T12:00:00.000Z' })
    expectRejected({ createdAt: 'sometime' })
    expectRejected({ updatedAt: 1756742520000 })
    expectRejected({ onboardingCompletedAt: 'later' })
  })
})

describe('declared defaults fill in for a record that omits them', () => {
  it('defaults trainingStyle to hybrid', () => {
    const record = raw()
    delete record.trainingStyle
    const result = parseProfile(record)
    expect(result.ok && result.value.trainingStyle).toBe('hybrid')
  })

  it('defaults the primary goal to build-muscle', () => {
    const record = raw()
    delete (record.goals as Record<string, unknown>).primary
    const result = parseProfile(record)
    expect(result.ok && result.value.goals.primary).toBe('build-muscle')
  })
})

describe('cross-field integrity', () => {
  it('rejects an activeLocationId that matches no location', () => {
    const profile = { ...base(), activeLocationId: 'loc-nowhere' }
    expect(profileIntegrityIssues(profile).map((issue) => issue.path)).toContain('activeLocationId')
    expect(parseProfile(profile).ok).toBe(false)
  })

  it('rejects duplicate location ids', () => {
    const profile = base()
    const clashing = {
      ...profile,
      locations: [profile.locations[0], { ...profile.locations[1], id: 'loc-gym' }],
    }
    expect(profileIntegrityIssues(clashing).map((issue) => issue.path)).toContain('locations')
  })

  it('rejects a record stamped with a schema version this build does not know', () => {
    const profile = { ...base(), schemaVersion: SCHEMA_VERSION + 1 }
    expect(profileIntegrityIssues(profile).map((issue) => issue.path)).toContain('schemaVersion')
    expect(parseProfile(profile).ok).toBe(false)
  })

  it('accepts the defaults unchanged', () => {
    expect(profileIntegrityIssues(base())).toEqual([])
  })
})

describe('unknown-field preservation', () => {
  it('keeps a top-level field written by a future version through a read/write cycle', () => {
    const record = raw()
    record.coachPersona = 'encouraging'

    const parsed = parseProfile(record)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const readBack = parsed.value as unknown as Record<string, unknown>
    expect(readBack.coachPersona).toBe('encouraging')

    // Write it out and read it in again: still there.
    const secondPass = parseProfile(JSON.parse(JSON.stringify(readBack)))
    expect(secondPass.ok).toBe(true)
    expect((secondPass.ok ? (secondPass.value as unknown as Record<string, unknown>) : {}).coachPersona).toBe(
      'encouraging',
    )
  })

  it('keeps unknown fields nested inside known groups and inside a location', () => {
    const record = raw()
    ;(record.goals as Record<string, unknown>).tertiary = 'grip-strength'
    ;(record.schedule as Record<string, unknown>).deloadEveryWeeks = 6
    ;(record.limitations as Record<string, unknown>).wrist = true
    ;((record.locations as Record<string, unknown>[])[0] as Record<string, unknown>).chalkAllowed = false

    const parsed = parseProfile(record)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const value = parsed.value as unknown as Record<string, unknown>
    expect((value.goals as Record<string, unknown>).tertiary).toBe('grip-strength')
    expect((value.schedule as Record<string, unknown>).deloadEveryWeeks).toBe(6)
    expect((value.limitations as Record<string, unknown>).wrist).toBe(true)
    expect((value.locations as Record<string, unknown>[])[0].chalkAllowed).toBe(false)
  })

  it('does not invent fields that were never there', () => {
    const parsed = profileSchema.safeParse(raw())
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(Object.keys(parsed.data).sort()).toEqual(Object.keys(raw()).sort())
  })
})

describe('location helpers', () => {
  it('creates a location seeded for its kind', () => {
    const location = createLocation('travel', 'Hotel', 'loc-hotel')
    expect(location).toEqual({
      id: 'loc-hotel',
      name: 'Hotel',
      kind: 'travel',
      equipment: ['resistance-bands', 'bodyweight-only'],
      notes: '',
    })
  })

  it('mints distinct ids', () => {
    const ids = new Set(Array.from({ length: 25 }, () => newLocationId()))
    expect(ids.size).toBe(25)
    for (const id of ids) expect(id.startsWith('loc-')).toBe(true)
  })

  it('falls back to the first location when the active one has gone missing', () => {
    const profile = { ...base(), activeLocationId: 'loc-nowhere' }
    expect(activeLocation(profile).id).toBe(DEFAULT_GYM_LOCATION_ID)
  })
})
