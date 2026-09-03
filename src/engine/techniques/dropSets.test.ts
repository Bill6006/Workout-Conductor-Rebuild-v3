import { describe, expect, it } from 'vitest'
import { createTechniqueContext } from './context'
import { DROP_SET_SIZE_ROLES, DROP_SET_STRENGTH_ROLES, proposeDropSets } from './dropSets'
import { aSlot, anExercise } from './testFixtures'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { DropSetProposal, TechniqueCandidate, TechniqueContextInput } from './types'
import type { TechniqueFindings } from './types'

/**
 * The drop-set rules exist to stop a drop set becoming a default intensifier, so
 * every one of them is tested from BOTH sides: the case it refuses, and the same
 * fixture with the one offending field put back.
 *
 * `pressed` is on almost every context here on purpose. Time pressure is the gate
 * a drop set has to clear before any of its other rules are even asked, and a test
 * that forgot it would pass for the wrong reason.
 */

const PRESSED: TechniqueContextInput = { timePressure: 0.5 }

function propose(input: TechniqueContextInput): TechniqueFindings<DropSetProposal> {
  return proposeDropSets(createTechniqueContext({ ...PRESSED, ...input }))
}

function oneSlot(
  exercise: Partial<Exercise> = {},
  slot: Partial<Omit<TechniqueCandidate, 'slotId' | 'exercise'>> = {},
): TechniqueCandidate[] {
  return [aSlot('slot-a', anExercise({ id: 'move-a', ...exercise }), slot)]
}

function codeOf(findings: TechniqueFindings<DropSetProposal>): string | undefined {
  return findings.rejections[0]?.code
}

describe('proposeDropSets — the technique gate', () => {
  it('never proposes a drop set when the user has them switched off', () => {
    const findings = propose({ candidates: oneSlot(), techniques: { dropSets: false } })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections).toHaveLength(1)
    expect(codeOf(findings)).toBe('technique-disabled')
  })

  it('proposes nothing when there is no slot to hang one off', () => {
    expect(codeOf(propose({ candidates: [] }))).toBe('not-enough-candidates')
  })
})

describe('proposeDropSets — the drop set that works', () => {
  it('hangs a drop set off the last working set and says what it saves', () => {
    const findings = propose({ candidates: oneSlot() })

    expect(findings.proposals).toHaveLength(1)
    const proposal = findings.proposals[0]
    expect(proposal.slotId).toBe('slot-a')
    expect(proposal.setIndex).toBe(2)
    expect(proposal.intent).toEqual({ drops: 1, loadReductionPercent: 20, transitionSeconds: 15 })
    expect(proposal.equivalentStraightSets).toBe(1)
    expect(proposal.timeEffect.savedSeconds).toBe(
      proposal.timeEffect.beforeSeconds - proposal.timeEffect.afterSeconds,
    )
    expect(proposal.timeEffect.addedSeconds).toBe(proposal.timeEffect.afterSeconds)
    expect(proposal.reasons.map((entry) => entry.code)).toContain('hypertrophy-focus')
  })

  it('proposes a second drop only when time pressure is high', () => {
    expect(propose({ candidates: oneSlot(), timePressure: 0.5 }).proposals[0].intent.drops).toBe(1)
    expect(propose({ candidates: oneSlot(), timePressure: 0.8 }).proposals[0].intent.drops).toBe(2)
  })
})

describe('proposeDropSets — safety and load', () => {
  it('never proposes one on an exercise the catalog calls unsafe for it', () => {
    const findings = propose({ candidates: oneSlot({ safeForDropSet: false }) })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('unsafe-for-drop-set')
    expect(propose({ candidates: oneSlot({ safeForDropSet: true }) }).proposals).toHaveLength(1)
  })

  it('never proposes one on a movement with no load to drop', () => {
    const findings = propose({
      candidates: oneSlot({
        load: { basis: 'bodyweight', measure: 'none', usesBar: false, plateMath: false },
      }),
    })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('no-load-to-drop')
  })

  it('never proposes one where the weight cannot come off quickly', () => {
    const barbell = propose({
      candidates: oneSlot({
        load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
      }),
    })
    expect(barbell.proposals).toEqual([])
    expect(codeOf(barbell)).toBe('setup-too-complex')

    const slowSetup = propose({ candidates: oneSlot({ setupTimeSeconds: 120 }) })
    expect(slowSetup.proposals).toEqual([])
    expect(codeOf(slowSetup)).toBe('setup-too-complex')

    const cable = propose({
      candidates: oneSlot({
        load: { basis: 'cable-stack', measure: 'total', usesBar: false, plateMath: false },
      }),
    })
    expect(cable.proposals).toHaveLength(1)
  })
})

describe('proposeDropSets — priority and goal', () => {
  it('never proposes one on a strength-priority slot', () => {
    for (const role of DROP_SET_STRENGTH_ROLES) {
      const findings = propose({
        candidates: oneSlot({ compoundOrIsolation: 'compound' }, { role }),
      })
      expect(findings.proposals).toEqual([])
      expect(codeOf(findings)).toBe('strength-priority-slot')
    }
  })

  it('never proposes one on the slot the session was built around', () => {
    const findings = propose({ candidates: oneSlot({}, { priority: 'priority' }) })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('protects-priority-lift')
    expect(propose({ candidates: oneSlot({}, { priority: 'normal' }) }).proposals).toHaveLength(1)
  })

  it('never proposes one in a session built around getting stronger', () => {
    const findings = propose({ candidates: oneSlot(), style: 'strength' })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('not-a-hypertrophy-context')
    expect(propose({ candidates: oneSlot(), style: 'hypertrophy' }).proposals).toHaveLength(1)
  })

  it('never proposes one on a slot whose job is not building size', () => {
    const findings = propose({ candidates: oneSlot({}, { role: 'corrective' }) })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('not-a-hypertrophy-context')

    for (const role of DROP_SET_SIZE_ROLES) {
      if (role === 'primary-hypertrophy') continue // an anchor role, protected above
      expect(propose({ candidates: oneSlot({}, { role }) }).proposals).toHaveLength(1)
    }
  })

  it('never proposes one on an exercise the catalog rates poorly for size', () => {
    const findings = propose({ candidates: oneSlot({ hypertrophySuitability: 'moderate' }) })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('not-a-hypertrophy-context')
    expect(propose({ candidates: oneSlot({ hypertrophySuitability: 'excellent' }) }).proposals).toHaveLength(
      1,
    )
  })

  it('refuses one that would tire a priority lift still to come', () => {
    const later = aSlot('slot-b', anExercise({ id: 'move-b', primaryMuscles: ['side-delt'] }), {
      position: 1,
      priority: 'priority',
    })
    const findings = propose({ candidates: [...oneSlot(), later] })

    expect(findings.proposals).toEqual([])
    expect(findings.rejections.map((entry) => entry.code)).toContain('compromises-later-priority')
  })
})

describe('proposeDropSets — time and volume', () => {
  it('is not proposed at all when there is time for another straight set', () => {
    const relaxed = proposeDropSets(createTechniqueContext({ candidates: oneSlot() }))

    expect(relaxed.proposals).toEqual([])
    expect(relaxed.rejections[0].code).toBe('no-time-pressure')
  })

  it('counts an overrunning session as time pressure, with nothing reported', () => {
    const findings = proposeDropSets(
      createTechniqueContext({
        candidates: oneSlot(),
        timeBudgetSeconds: 1800,
        estimatedSeconds: 2400,
      }),
    )

    expect(findings.proposals).toHaveLength(1)
  })

  it('refuses one on a muscle whose weekly sets are already covered', () => {
    const met = propose({
      candidates: oneSlot(),
      muscleVolumeNeed: [{ group: 'shoulders', setsRemaining: 0 }],
    })
    expect(met.proposals).toEqual([])
    expect(codeOf(met)).toBe('volume-already-met')

    const owed = propose({
      candidates: oneSlot(),
      muscleVolumeNeed: [{ group: 'shoulders', setsRemaining: 4 }],
    })
    expect(owed.proposals).toHaveLength(1)
    expect(owed.proposals[0].reasons.map((entry) => entry.code)).toContain('volume-still-owed')
  })

  it('treats unmeasured volume as unknown rather than met', () => {
    const findings = propose({ candidates: oneSlot(), muscleVolumeNeed: null })

    expect(findings.proposals).toHaveLength(1)
    expect(findings.proposals[0].reasons.map((entry) => entry.code)).not.toContain('volume-still-owed')
  })

  it('refuses one that would not beat the straight set it stands in for', () => {
    const findings = propose({
      candidates: oneSlot({ typicalRepRange: { min: 20, max: 20 } }, { restSeconds: 0 }),
    })

    expect(findings.proposals).toEqual([])
    expect(codeOf(findings)).toBe('saves-too-little-time')
  })
})

describe('proposeDropSets — how many a session gets', () => {
  it('stops at the policy limit and says which slots lost out', () => {
    const candidates = ['a', 'b', 'c'].map((letter, index) =>
      aSlot(
        `slot-${letter}`,
        anExercise({
          id: `move-${letter}`,
          primaryMuscles: index === 0 ? ['side-delt'] : index === 1 ? ['triceps-long-head'] : ['lats'],
        }),
        { position: index },
      ),
    )

    const findings = propose({ candidates, policy: { maxDropSetsPerSession: 1 } })

    expect(findings.proposals).toHaveLength(1)
    const spare = findings.rejections.filter((entry) => entry.code === 'enough-drop-sets-already')
    expect(spare).toHaveLength(2)
  })

  it('returns byte-identical findings for the same context, every time', () => {
    const input: TechniqueContextInput = { candidates: oneSlot(), muscleVolumeNeed: null }

    expect(JSON.stringify(propose(input))).toBe(JSON.stringify(propose(input)))
  })
})
