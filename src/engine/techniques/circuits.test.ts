import { describe, expect, it } from 'vitest'
import { createTechniqueContext } from './context'
import { proposeCircuits } from './circuits'
import { aSlot, anExercise } from './testFixtures'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleId } from '../../catalog/muscles/muscles'
import type { CircuitProposal, TechniqueCandidate, TechniqueContextInput } from './types'
import type { TechniqueFindings } from './types'

/**
 * A circuit has four supports — goal, equipment, location and fatigue — and the
 * plan's flat rule that it is never forced into a strength-priority session. Each
 * is tested from both sides, and the strength rule is tested twice: once as the
 * session's style, once as a member the session was built around.
 *
 * `WORKABLE` is the context in which a circuit IS a good idea. Every test below
 * changes exactly one thing about it, so a failure names the support that broke.
 */

const WORKABLE: TechniqueContextInput = {
  goal: 'stay-consistent',
  availableEquipment: ['dumbbells'],
  location: 'gym',
}

const MUSCLES: readonly MuscleId[] = ['side-delt', 'triceps-long-head', 'lats', 'quads', 'rectus-abdominis']

function members(count: number, exercise: Partial<Exercise> = {}): TechniqueCandidate[] {
  return Array.from({ length: count }, (_unused, index) =>
    aSlot(
      `slot-${index}`,
      anExercise({
        id: `move-${index}`,
        primaryMuscles: [MUSCLES[index % MUSCLES.length]],
        ...exercise,
      }),
      { position: index },
    ),
  )
}

function propose(input: TechniqueContextInput): TechniqueFindings<CircuitProposal> {
  return proposeCircuits(createTechniqueContext({ ...WORKABLE, ...input }))
}

function codes(findings: TechniqueFindings<CircuitProposal>): string[] {
  return findings.rejections.map((entry) => entry.code)
}

describe('proposeCircuits — the technique gate', () => {
  it('never proposes a circuit when the user has them switched off', () => {
    const findings = propose({ candidates: members(3), techniques: { circuits: false } })

    expect(findings.proposals).toEqual([])
    expect(codes(findings)).toEqual(['technique-disabled'])
  })
})

describe('proposeCircuits — never forced into a strength session', () => {
  it('proposes nothing in a session built around getting stronger', () => {
    const findings = propose({ candidates: members(3), style: 'strength' })

    expect(findings.proposals).toEqual([])
    expect(codes(findings)).toEqual(['strength-session'])
  })

  it('proposes one in the same session at a hybrid style', () => {
    expect(propose({ candidates: members(3), style: 'hybrid' }).proposals).toHaveLength(1)
  })

  it('never takes the slot the session was built around as a member', () => {
    const slots = members(3)
    const findings = propose({
      candidates: [{ ...slots[0], priority: 'priority' }, slots[1], slots[2]],
    })

    expect(codes(findings)).toContain('protects-priority-lift')
    expect(findings.proposals[0].memberSlotIds).toEqual(['slot-1', 'slot-2'])
  })

  it('never takes a slot in an anchor role as a member', () => {
    const slots = members(3)
    const findings = propose({
      candidates: [{ ...slots[0], role: 'primary-strength' }, slots[1], slots[2]],
    })

    expect(findings.proposals[0].memberSlotIds).not.toContain('slot-0')
  })
})

describe('proposeCircuits — goal, equipment, location, fatigue', () => {
  it('proposes nothing for a goal a circuit does not serve', () => {
    const findings = propose({ candidates: members(3), goal: 'get-stronger' })

    expect(findings.proposals).toEqual([])
    expect(codes(findings)).toEqual(['goal-does-not-suit-circuits'])
  })

  it('refuses a member whose kit is not at the place they are training', () => {
    const findings = propose({ candidates: members(3), availableEquipment: [] })

    expect(findings.proposals).toEqual([])
    expect(codes(findings)).toContain('equipment-unavailable')
    expect(codes(findings)).toContain('too-few-members')
  })

  it('will not tie up a station the gym has one of, and does not care at home', () => {
    const onARack = {
      supersetCompatibility: {
        eligible: true,
        stationId: 'squat-rack' as const,
        gripHeavy: false,
        competingDemands: [],
      },
    }
    const slots = members(3)
    const withRack = [
      { ...slots[0], exercise: anExercise({ ...slots[0].exercise, ...onARack }) },
      ...slots.slice(1),
    ]

    const atGym = propose({ candidates: withRack, location: 'gym' })
    expect(codes(atGym)).toContain('scarce-station')
    expect(atGym.proposals[0].memberSlotIds).toEqual(['slot-1', 'slot-2'])

    const atHome = propose({ candidates: withRack, location: 'home' })
    expect(atHome.proposals[0].memberSlotIds).toEqual(['slot-0', 'slot-1', 'slot-2'])
  })

  it('says nothing about stations at a location of no fixed kind', () => {
    const onARack = {
      supersetCompatibility: {
        eligible: true,
        stationId: 'squat-rack' as const,
        gripHeavy: false,
        competingDemands: [],
      },
    }
    const findings = propose({ candidates: members(3, onARack), location: null })

    // Two members share the station, so only the first of them is taken.
    expect(codes(findings)).not.toContain('scarce-station')
    expect(codes(findings)).toContain('same-station')
  })

  it('refuses two members that would take turns on one station', () => {
    const cable = {
      supersetCompatibility: {
        eligible: true,
        stationId: 'cable-tower' as const,
        gripHeavy: false,
        competingDemands: [],
      },
    }
    const findings = propose({ candidates: members(3, cable) })

    expect(codes(findings).filter((code) => code === 'same-station')).toHaveLength(2)
    expect(codes(findings)).toContain('too-few-members')
  })

  it('refuses a circuit when the person is too worn down, and takes one when they are fresh', () => {
    const spent = propose({ candidates: members(3), systemicRecovery: 0.2 })
    expect(spent.proposals).toEqual([])
    expect(codes(spent)).toEqual(['fatigue-too-high'])

    const fresh = propose({ candidates: members(3), systemicRecovery: 0.9 })
    expect(fresh.proposals).toHaveLength(1)
    expect(fresh.proposals[0].reasons.map((entry) => entry.code)).toContain('recovered-enough')
  })

  it('treats unmeasured recovery as unknown rather than exhausted', () => {
    const findings = propose({ candidates: members(3), systemicRecovery: null })

    expect(findings.proposals).toHaveLength(1)
    expect(findings.proposals[0].reasons.map((entry) => entry.code)).not.toContain('recovered-enough')
  })
})

describe('proposeCircuits — the structure', () => {
  it('refuses two members that train the same thing', () => {
    const slots = members(3)
    const clashing = [
      slots[0],
      { ...slots[1], exercise: anExercise({ id: 'move-clash', primaryMuscles: ['side-delt'] }) },
      slots[2],
    ]

    const findings = propose({ candidates: clashing })
    expect(codes(findings)).toContain('shares-muscle-with-member')
    expect(findings.proposals[0].memberSlotIds).toEqual(['slot-0', 'slot-2'])
  })

  it('refuses a member that costs too much to set up again each round', () => {
    const slots = members(3)
    const findings = propose({
      candidates: [
        { ...slots[0], exercise: anExercise({ ...slots[0].exercise, transitionCost: 'high' }) },
        slots[1],
        slots[2],
      ],
    })

    expect(codes(findings)).toContain('transition-too-costly')
    expect(findings.proposals[0].memberSlotIds).toEqual(['slot-1', 'slot-2'])
  })

  it('refuses a member with too few rounds in it', () => {
    const slots = members(3)
    const findings = propose({ candidates: [{ ...slots[0], plannedSets: 1 }, slots[1], slots[2]] })

    expect(codes(findings)).toContain('too-few-rounds')
    expect(findings.proposals[0].rounds).toBe(3)
  })

  it('runs to the policy"s number of stations and says which slots did not fit', () => {
    const findings = propose({ candidates: members(5), policy: { maxCircuitMembers: 3 } })

    expect(findings.proposals[0].memberSlotIds).toHaveLength(3)
    expect(codes(findings).filter((code) => code === 'circuit-already-full')).toHaveLength(2)
  })

  it('proposes nothing when too few slots suit a circuit', () => {
    const findings = propose({ candidates: members(1) })

    expect(findings.proposals).toEqual([])
    expect(codes(findings)).toEqual(['not-enough-candidates'])
  })

  it('refuses a circuit that would not save enough time to be worth it', () => {
    const slots = members(2).map((slot) => ({ ...slot, restSeconds: 30, plannedSets: 2 }))
    const findings = propose({ candidates: slots })

    expect(findings.proposals).toEqual([])
    expect(codes(findings)).toContain('saves-too-little-time')
  })
})

describe('proposeCircuits — the proposal itself', () => {
  it('carries the rounds, the rests, the stations and the arithmetic', () => {
    const findings = propose({ candidates: members(3) })
    const proposal = findings.proposals[0]

    expect(proposal.technique).toBe('circuit')
    expect(proposal.rounds).toBe(3)
    expect(proposal.restBetweenStationsSeconds).toBeGreaterThan(0)
    expect(proposal.restAfterRoundSeconds).toBeGreaterThanOrEqual(45)
    expect(proposal.stations).toEqual([])
    expect(proposal.timeEffect.savedSeconds).toBe(
      proposal.timeEffect.beforeSeconds - proposal.timeEffect.afterSeconds,
    )
    expect(proposal.timeEffect.addedSeconds).toBe(0)
    expect(proposal.reasons.map((entry) => entry.code)).toContain('goal-suits-circuit')
  })

  it('returns byte-identical findings for the same context, every time', () => {
    const input: TechniqueContextInput = { candidates: members(4) }

    expect(JSON.stringify(propose(input))).toBe(JSON.stringify(propose(input)))
  })
})
