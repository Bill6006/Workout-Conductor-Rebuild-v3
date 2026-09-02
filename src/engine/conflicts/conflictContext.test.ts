import { describe, expect, it } from 'vitest'
import { createDefaultProfile } from '../../core/validation/schemas'
import { LIMITATION_FLAGS } from '../../catalog/taxonomy/taxonomy'
import { DEFAULT_CONFLICT_POLICY } from './conflictPolicy'
import {
  LIMITATION_JOINTS,
  conflictInputsFromProfile,
  createConflictContext,
  limitationFlagsFrom,
  limitedJoints,
  locationSuitabilityForKind,
} from './conflictContext'

const NOW = '2026-09-02T09:00:00.000Z'

describe('createConflictContext', () => {
  it('fills in every default, so a caller can hand it nothing', () => {
    const context = createConflictContext()
    expect(context.session).toEqual([])
    expect(context.availableEquipment).toEqual([])
    expect(context.limitations).toEqual([])
    expect(context.recentTraining).toEqual([])
    expect(context.timeBudgetSeconds).toBeNull()
    expect(context.location.suitability).toBeNull()
    expect(context.policy).toEqual(DEFAULT_CONFLICT_POLICY)
  })

  it('takes a partial policy without losing the rest of it', () => {
    const context = createConflictContext({ policy: { jointStressAdvisory: 2 } })
    expect(context.policy.jointStressAdvisory).toBe(2)
    expect(context.policy.jointStressStrong).toBe(DEFAULT_CONFLICT_POLICY.jointStressStrong)
  })

  it('takes a partial technique set, defaulting the rest to allowed', () => {
    const context = createConflictContext({ techniques: { supersets: false } })
    expect(context.techniques).toEqual({ supersets: false, dropSets: true, circuits: true })
  })
})

describe('limitation flags', () => {
  it('maps every profile boolean onto a catalog flag, and nothing else', () => {
    expect(
      limitationFlagsFrom({ shoulder: true, knee: true, lowerBack: true, avoidBarbellSquat: true }),
    ).toEqual([...LIMITATION_FLAGS])
  })

  it('turns the camelCase keys into the right kebab ids', () => {
    expect(
      limitationFlagsFrom({ shoulder: false, knee: false, lowerBack: true, avoidBarbellSquat: false }),
    ).toEqual(['lower-back'])
    expect(
      limitationFlagsFrom({ shoulder: false, knee: false, lowerBack: false, avoidBarbellSquat: true }),
    ).toEqual(['barbell-squat'])
  })

  it('is empty when nothing is flagged', () => {
    expect(
      limitationFlagsFrom({ shoulder: false, knee: false, lowerBack: false, avoidBarbellSquat: false }),
    ).toEqual([])
  })

  it('gives every flag a joint or an explicit null', () => {
    for (const flag of LIMITATION_FLAGS) expect(flag in LIMITATION_JOINTS).toBe(true)
    expect(LIMITATION_JOINTS['barbell-squat']).toBeNull()
  })

  it('collects only the flags that name a joint', () => {
    expect([...limitedJoints(['shoulder', 'barbell-squat'])]).toEqual(['shoulder'])
    expect([...limitedJoints([])]).toEqual([])
  })
})

describe('location suitability', () => {
  it('passes the three real kinds straight through', () => {
    expect(locationSuitabilityForKind('gym')).toBe('gym')
    expect(locationSuitabilityForKind('home')).toBe('home')
    expect(locationSuitabilityForKind('travel')).toBe('travel')
  })

  it('has no answer for a location of no fixed kind', () => {
    expect(locationSuitabilityForKind('custom')).toBeNull()
  })
})

describe('conflictInputsFromProfile', () => {
  it('reads the active location, not the first one', () => {
    const profile = createDefaultProfile(NOW)
    const home = profile.locations.find((location) => location.kind === 'home')
    const inputs = conflictInputsFromProfile({ ...profile, activeLocationId: home?.id ?? '' })
    expect(inputs.location.suitability).toBe('home')
    expect(inputs.availableEquipment).toEqual(home?.equipment)
  })

  it('carries the limitations and techniques across', () => {
    const profile = createDefaultProfile(NOW)
    const inputs = conflictInputsFromProfile({
      ...profile,
      limitations: { ...profile.limitations, knee: true },
      techniques: { ...profile.techniques, supersets: false },
    })
    expect(inputs.limitations).toEqual(['knee'])
    expect(inputs.techniques.supersets).toBe(false)
  })
})
