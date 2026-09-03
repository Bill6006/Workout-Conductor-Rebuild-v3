import { describe, expect, it } from 'vitest'
import { createTechniqueContext } from './context'
import { proposeSupersets } from './supersets'
import { aPair, aSlot, anExercise } from './testFixtures'
import type { TechniqueCandidate, TechniqueContextInput, TechniqueFindings } from './types'
import type { SupersetProposal, TechniqueRejectionCode } from './types'

/**
 * The avoid-rules the product plan names are tested BOTH WAYS ROUND. A rule that
 * only ever fires proves nothing: the negative case — the same fixture with the
 * one offending field changed back — is what shows the rule is reading that field
 * and not refusing everything.
 */

function propose(input: TechniqueContextInput): TechniqueFindings<SupersetProposal> {
  return proposeSupersets(createTechniqueContext(input))
}

function codeFor(findings: TechniqueFindings<SupersetProposal>, ...slotIds: string[]): string | undefined {
  const wanted = slotIds.join('|')
  return findings.rejections.find((entry) => entry.slotIds.join('|') === wanted)?.code
}

function withPair(
  first: Parameters<typeof aPair>[0] = {},
  second: Parameters<typeof aPair>[1] = {},
  extra: TechniqueContextInput = {},
): TechniqueFindings<SupersetProposal> {
  return propose({ candidates: aPair(first, second), ...extra })
}

describe('proposeSupersets — the technique gate', () => {
  it('never proposes a superset when the user has them switched off', () => {
    const findings = propose({ candidates: aPair(), techniques: { supersets: false } })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections).toHaveLength(1)
    expect(findings.rejections[0].code).toBe('technique-disabled')
    expect(findings.rejections[0].technique).toBe('superset')
  })

  it('proposes nothing when there is only one slot to pair', () => {
    const findings = propose({ candidates: [aSlot('only', anExercise({ id: 'only' }))] })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections[0].code).toBe('not-enough-candidates')
  })
})

describe('proposeSupersets — the pairing that works', () => {
  it('pairs two ordinary accessory slots and says what it saves', () => {
    const findings = withPair()

    expect(findings.proposals).toHaveLength(1)
    const proposal = findings.proposals[0]
    expect(proposal.firstSlotId).toBe('slot-a')
    expect(proposal.secondSlotId).toBe('slot-b')
    expect(proposal.rounds).toBe(3)
    expect(proposal.rationale).toBe('unrelated-muscles')
    expect(proposal.slotDistance).toBe(1)
    expect(proposal.reorderRequired).toBe(false)
    expect(proposal.unpairedSets).toEqual([])
    expect(proposal.timeEffect.savedSeconds).toBe(
      proposal.timeEffect.beforeSeconds - proposal.timeEffect.afterSeconds,
    )
    expect(proposal.timeEffect.savedSeconds).toBeGreaterThan(60)
    expect(proposal.timeEffect.addedSeconds).toBe(0)
    expect(proposal.reasons[0].code).toBe('saves-time')
    expect(proposal.summary).toContain('Saves')
  })

  it('reports the sets left over when one slot planned more than the other', () => {
    const [a, b] = aPair()
    const findings = propose({ candidates: [a, { ...b, plannedSets: 5 }] })

    expect(findings.proposals[0].rounds).toBe(3)
    expect(findings.proposals[0].unpairedSets).toEqual([{ slotId: 'slot-b', sets: 2 }])
  })

  it('flags a pairing that would need the two slots moved together', () => {
    const [a, b] = aPair()
    const findings = propose({ candidates: [a, { ...b, position: 3 }] })

    expect(findings.proposals[0].slotDistance).toBe(3)
    expect(findings.proposals[0].reorderRequired).toBe(true)
  })

  it('calls a push paired with a pull an antagonist pairing', () => {
    const findings = withPair(
      { movementPattern: 'horizontal-push', primaryMuscles: ['mid-chest'] },
      { movementPattern: 'horizontal-pull', primaryMuscles: ['lats'] },
    )

    expect(findings.proposals[0].rationale).toBe('antagonist-pairing')
    expect(findings.proposals[0].reasons.map((reason) => reason.code)).toContain('antagonist-pairing')
  })

  it('falls back to time pressure when the pairing"s own nature explains nothing', () => {
    const [a, b] = aPair({}, { primaryMuscles: ['side-delt'], progressionFamily: 'lateral-raise' })
    // Same muscle group, neither slot accessory: nothing about the pair explains it.
    const findings = propose({
      candidates: [
        { ...a, priority: 'normal' },
        { ...b, priority: 'normal' },
      ],
      timeBudgetSeconds: 1800,
      estimatedSeconds: 2400,
    })

    expect(findings.proposals[0].rationale).toBe('time-pressure')
    expect(findings.proposals[0].reasons.map((reason) => reason.code)).toContain('time-pressure')
  })
})

describe('proposeSupersets — the conflict engine owns the pairing rules', () => {
  it('refuses two grip-heavy exercises, and allows one', () => {
    const gripHeavy = {
      supersetCompatibility: { eligible: true, stationId: null, gripHeavy: true, competingDemands: [] },
    }

    const both = withPair(gripHeavy, gripHeavy)
    expect(both.proposals).toEqual([])
    const rejected = both.rejections[0]
    expect(rejected.code).toBe('weakens-pairing')
    expect(rejected.conflictRule).toBe('both-grip-heavy')
    expect(rejected.conflictKind).toBe('superset')
    expect(rejected.conflictSeverity).toBe('strong')

    const one = withPair(gripHeavy)
    expect(one.proposals).toHaveLength(1)
  })

  it('refuses two exercises on one station, and allows two different stations', () => {
    const station = (stationId: 'cable-tower' | 'lat-pulldown-station') => ({
      supersetCompatibility: { eligible: true, stationId, gripHeavy: false, competingDemands: [] },
    })

    const same = withPair(station('cable-tower'), station('cable-tower'))
    expect(same.proposals).toEqual([])
    expect(same.rejections[0].code).toBe('blocked-by-conflict')
    expect(same.rejections[0].conflictKind).toBe('station')
    expect(same.rejections[0].conflictSeverity).toBe('blocking')

    const different = withPair(station('cable-tower'), station('lat-pulldown-station'))
    expect(different.proposals).toHaveLength(1)
  })

  it('refuses two exercises making the same competing demand, and allows different ones', () => {
    const demand = (competingDemands: ('grip' | 'balance')[]) => ({
      supersetCompatibility: { eligible: true, stationId: null, gripHeavy: false, competingDemands },
    })

    const same = withPair(demand(['grip']), demand(['grip']))
    expect(same.proposals).toEqual([])
    expect(codeFor(same, 'slot-a', 'slot-b')).toBe('weakens-pairing')
    expect(same.rejections[0].conflictRule).toBe('competing-demands')

    const different = withPair(demand(['grip']), demand(['balance']))
    expect(different.proposals).toHaveLength(1)
  })

  it('refuses two demanding compounds, and allows two ordinary ones', () => {
    const heavy = { compoundOrIsolation: 'compound' as const, trainingRole: 'primary-hypertrophy' as const }
    const both = withPair(heavy, heavy)

    expect(both.proposals).toEqual([])
    expect(both.rejections[0].conflictRule).toBe('two-heavy-compounds')

    const ordinary = {
      compoundOrIsolation: 'compound' as const,
      trainingRole: 'secondary-hypertrophy' as const,
    }
    expect(withPair(ordinary, ordinary).proposals).toHaveLength(1)
  })

  it('refuses two exercises loading one joint hard, and allows one hard and one light', () => {
    const hard = { jointStressTags: [{ joint: 'shoulder' as const, intensity: 'high' as const }] }
    const light = { jointStressTags: [{ joint: 'shoulder' as const, intensity: 'low' as const }] }

    const both = withPair(hard, hard)
    expect(both.proposals).toEqual([])
    expect(both.rejections[0].conflictRule).toBe('shared-joint-stress')

    expect(withPair(hard, light).proposals).toHaveLength(1)
  })

  it('refuses a pairing that means hopping between two costly set-ups', () => {
    const hopping = withPair(
      {
        transitionCost: 'high',
        supersetCompatibility: {
          eligible: true,
          stationId: 'squat-rack',
          gripHeavy: false,
          competingDemands: [],
        },
      },
      {
        transitionCost: 'moderate',
        supersetCompatibility: {
          eligible: true,
          stationId: 'leg-press-station',
          gripHeavy: false,
          competingDemands: [],
        },
      },
    )

    expect(hopping.proposals).toEqual([])
    expect(hopping.rejections[0].conflictRule).toBe('station-hopping')

    const walking = withPair(
      {
        transitionCost: 'high',
        supersetCompatibility: {
          eligible: true,
          stationId: 'squat-rack',
          gripHeavy: false,
          competingDemands: [],
        },
      },
      {
        transitionCost: 'low',
        supersetCompatibility: {
          eligible: true,
          stationId: 'dumbbell-rack',
          gripHeavy: false,
          competingDemands: [],
        },
      },
    )
    expect(walking.proposals).toHaveLength(1)
  })

  it('refuses an exercise the catalog says must be done on its own', () => {
    const findings = withPair({
      supersetCompatibility: { eligible: false, stationId: null, gripHeavy: false, competingDemands: [] },
    })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections[0].code).toBe('blocked-by-conflict')
    expect(findings.rejections[0].conflictRule).toBe('ineligible-exercise')
  })
})

describe('proposeSupersets — what this module adds', () => {
  it('never pairs a priority lift, and pairs the same slots at normal priority', () => {
    const [a, b] = aPair()

    const protectedSlot = propose({ candidates: [{ ...a, priority: 'priority' }, b] })
    expect(protectedSlot.proposals).toEqual([])
    expect(protectedSlot.rejections[0].code).toBe('protects-priority-lift')

    expect(propose({ candidates: [{ ...a, priority: 'normal' }, b] }).proposals).toHaveLength(1)
  })

  it('never pairs a slot in an anchor role even when priority was not set', () => {
    const [a, b] = aPair({ trainingRole: 'primary-strength', compoundOrIsolation: 'compound' })
    const findings = propose({ candidates: [a, b] })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections[0].code).toBe('protects-priority-lift')
  })

  it('refuses a pairing that would tire a priority lift still to come', () => {
    const [a, b] = aPair()
    const later = (muscle: 'side-delt' | 'quads'): TechniqueCandidate =>
      aSlot('slot-c', anExercise({ id: 'move-c', primaryMuscles: [muscle] }), {
        position: 2,
        priority: 'priority',
      })

    const clashing = propose({ candidates: [a, b, later('side-delt')] })
    expect(codeFor(clashing, 'slot-a', 'slot-b')).toBe('compromises-later-priority')
    expect(clashing.proposals).toEqual([])

    const clear = propose({ candidates: [a, b, later('quads')] })
    expect(clear.proposals).toHaveLength(1)
    expect(clear.proposals[0].firstSlotId).toBe('slot-a')
  })

  it('refuses a pairing beyond the person"s experience, and allows it at their level', () => {
    const hard = { difficulty: 'advanced' as const }

    const beyond = withPair(hard, {}, { experience: 'intermediate' })
    expect(beyond.proposals).toEqual([])
    expect(beyond.rejections[0].code).toBe('beyond-experience')

    expect(withPair(hard, {}, { experience: 'advanced' }).proposals).toHaveLength(1)
  })

  it('holds a beginner"s pairing to one compound, and allows two for an intermediate', () => {
    const compound = {
      compoundOrIsolation: 'compound' as const,
      trainingRole: 'secondary-hypertrophy' as const,
    }

    const beginner = withPair(compound, compound, { experience: 'beginner' })
    expect(beginner.proposals).toEqual([])
    expect(beginner.rejections[0].code).toBe('too-many-compounds-for-experience')

    expect(withPair(compound, {}, { experience: 'beginner' }).proposals).toHaveLength(1)
    expect(withPair(compound, compound, { experience: 'intermediate' }).proposals).toHaveLength(1)
  })

  it('refuses a pairing with too few rounds to be worth setting up', () => {
    const [a, b] = aPair()
    const findings = propose({ candidates: [{ ...a, plannedSets: 1 }, b] })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections[0].code).toBe('too-few-rounds')
  })

  it('refuses a pairing that would not save enough time to be worth it', () => {
    const [a, b] = aPair()
    const short = { restSeconds: 30 }
    const findings = propose({
      candidates: [
        { ...a, ...short },
        { ...b, ...short },
      ],
    })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections[0].code).toBe('saves-too-little-time')
  })

  it('refuses a pairing too far apart to accept, and takes it when the policy widens', () => {
    const [a, b] = aPair()
    const far = [a, { ...b, position: 5 }]

    const findings = propose({ candidates: far })
    expect(findings.proposals).toEqual([])
    expect(findings.rejections[0].code).toBe('too-far-apart')

    const widened = propose({ candidates: far, policy: { maxSupersetSlotDistance: 5 } })
    expect(widened.proposals).toHaveLength(1)
    expect(widened.proposals[0].slotDistance).toBe(5)
  })

  it('reads its saving threshold from the policy rather than a constant', () => {
    const [a, b] = aPair()
    const short = [
      { ...a, restSeconds: 30 },
      { ...b, restSeconds: 30 },
    ]

    expect(propose({ candidates: short }).proposals).toEqual([])
    expect(propose({ candidates: short, policy: { minSupersetSavingSeconds: 10 } }).proposals).toHaveLength(1)
  })
})

describe('proposeSupersets — order and determinism', () => {
  it('returns byte-identical findings for the same context, every time', () => {
    const input: TechniqueContextInput = {
      candidates: [
        ...aPair(),
        aSlot('slot-c', anExercise({ id: 'move-c', primaryMuscles: ['biceps-long-head'] }), {
          position: 2,
        }),
      ],
    }

    expect(JSON.stringify(propose(input))).toBe(JSON.stringify(propose(input)))
  })

  it('does not depend on the order the candidates were handed in', () => {
    const [a, b] = aPair()
    const c = aSlot('slot-c', anExercise({ id: 'move-c', primaryMuscles: ['biceps-long-head'] }), {
      position: 2,
    })

    const forwards = propose({ candidates: [a, b, c] })
    const backwards = propose({ candidates: [c, b, a] })

    expect(JSON.stringify(forwards.proposals)).toBe(JSON.stringify(backwards.proposals))
  })

  it('returns the best pairing first', () => {
    const [a, b] = aPair()
    const c = aSlot('slot-c', anExercise({ id: 'move-c', primaryMuscles: ['side-delt'] }), { position: 2 })

    const findings = propose({ candidates: [a, b, c] })
    const scores = findings.proposals.map((proposal) => proposal.score)

    expect(scores.length).toBeGreaterThan(1)
    expect([...scores].sort((first, second) => second - first)).toEqual(scores)
  })

  it('never reports a rejection code that is not in the canonical list', () => {
    const [a, b] = aPair()
    const findings = propose({ candidates: [{ ...a, priority: 'priority' }, b] })
    const codes: TechniqueRejectionCode[] = findings.rejections.map((entry) => entry.code)

    expect(codes).toEqual(['protects-priority-lift'])
  })
})
