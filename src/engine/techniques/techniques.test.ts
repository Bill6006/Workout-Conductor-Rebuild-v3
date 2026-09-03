import { describe, expect, it } from 'vitest'
import { exerciseSchema } from '../../catalog/exercises/exerciseSchema'
import {
  DEFAULT_TECHNIQUE_POLICY,
  TECHNIQUE_KINDS,
  TECHNIQUE_REASON_CODES,
  TECHNIQUE_REJECTION_CODES,
  createTechniqueContext,
  defaultWorkSecondsEstimator,
  difficultyCeiling,
  isProtectedSlot,
  laterPriorityGroups,
  minutesPhrase,
  primaryGroupsOf,
  proposalScore,
  proposeTechniques,
  resolveTechniquePolicy,
  sharedGroups,
  timeEffect,
  transitionPenalty,
  underTimePressure,
} from './index'
import { BASE_EXERCISE, aPair, aSlot, anExercise } from './testFixtures'
import type { TechniqueContextInput, TechniqueRejectionCode } from './index'

/**
 * The barrel, the shared helpers, and the promises the whole folder makes:
 * determinism, no exercise names in copy, no rival mode vocabulary, and one
 * canonical list of codes that nothing escapes.
 */

const READY: TechniqueContextInput = {
  goal: 'stay-consistent',
  availableEquipment: ['dumbbells'],
  location: 'gym',
  timePressure: 0.6,
}

function aSession(): TechniqueContextInput {
  const [a, b] = aPair()
  return {
    ...READY,
    candidates: [
      a,
      b,
      aSlot('slot-c', anExercise({ id: 'move-c', primaryMuscles: ['lats'] }), { position: 2 }),
    ],
  }
}

describe('the fixtures cannot drift from what the catalog could produce', () => {
  it('validates the base exercise against the real schema', () => {
    expect(() => exerciseSchema.parse(BASE_EXERCISE)).not.toThrow()
  })
})

describe('proposeTechniques', () => {
  it('considers all three techniques and mutates nothing', () => {
    const input = aSession()
    const before = JSON.stringify(input.candidates)
    const proposals = proposeTechniques(input)

    expect(JSON.stringify(input.candidates)).toBe(before)
    expect(proposals.supersets.length).toBeGreaterThan(0)
    expect(proposals.dropSets.length).toBeGreaterThan(0)
    expect(proposals.circuits.length).toBeGreaterThan(0)
  })

  it('proposes none of the three when the user has switched them all off', () => {
    const proposals = proposeTechniques({
      ...aSession(),
      techniques: { supersets: false, dropSets: false, circuits: false },
    })

    expect(proposals.supersets).toEqual([])
    expect(proposals.dropSets).toEqual([])
    expect(proposals.circuits).toEqual([])
    expect(proposals.rejections.map((entry) => entry.technique)).toEqual([...TECHNIQUE_KINDS])
    expect(new Set(proposals.rejections.map((entry) => entry.code))).toEqual(new Set(['technique-disabled']))
  })

  it('switches off exactly the technique that was switched off', () => {
    const proposals = proposeTechniques({ ...aSession(), techniques: { supersets: false } })

    expect(proposals.supersets).toEqual([])
    expect(proposals.dropSets.length).toBeGreaterThan(0)
    expect(proposals.circuits.length).toBeGreaterThan(0)
  })

  it('returns byte-identical proposals for the same input, every time', () => {
    const input = aSession()

    expect(JSON.stringify(proposeTechniques(input))).toBe(JSON.stringify(proposeTechniques(input)))
  })

  it('returns nothing at all, and complains about nothing, for an empty session', () => {
    const proposals = proposeTechniques({})

    expect(proposals.supersets).toEqual([])
    expect(proposals.dropSets).toEqual([])
    expect(proposals.circuits).toEqual([])
    expect(proposals.rejections.length).toBeGreaterThan(0)
  })
})

describe('the copy', () => {
  const proposals = proposeTechniques(aSession())
  const texts = [
    ...proposals.rejections.map((entry) => entry.text),
    ...[...proposals.supersets, ...proposals.dropSets, ...proposals.circuits].flatMap((proposal) => [
      proposal.summary,
      ...proposal.reasons.map((reason) => reason.text),
    ]),
  ]

  it('never names an exercise', () => {
    for (const text of texts) {
      expect(text).not.toContain('Base move')
      expect(text).not.toContain('Move a')
      expect(text).not.toContain('move-a')
    }
  })

  it('never opens with a competing workout-mode word', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/^(full|lazy|short|density|recovery)\b/i)
    }
  })

  it('is a finished sentence rather than a template', () => {
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toContain('{')
      expect(text).not.toContain('undefined')
      expect(text.trim()).toBe(text)
    }
  })

  it('quotes a saving in minutes, never in raw seconds', () => {
    expect(minutesPhrase(10)).toBe('a few seconds')
    expect(minutesPhrase(30)).toBe('half a minute')
    expect(minutesPhrase(60)).toBe('1 minute')
    expect(minutesPhrase(120)).toBe('2 minutes')
    expect(minutesPhrase(150)).toBe('2.5 minutes')
  })

  it('says a saving out loud as a hedge, never as a false precision', () => {
    const summary = proposeTechniques(aSession()).supersets[0].summary

    expect(summary).toMatch(/^Saves about /)
    expect(summary).not.toMatch(/\d+ seconds/)
  })
})

describe('the canonical code lists', () => {
  it('has no duplicate reason or rejection codes', () => {
    expect(new Set(TECHNIQUE_REASON_CODES).size).toBe(TECHNIQUE_REASON_CODES.length)
    expect(new Set(TECHNIQUE_REJECTION_CODES).size).toBe(TECHNIQUE_REJECTION_CODES.length)
  })

  it('never reports a code outside the canonical list', () => {
    const known = new Set<string>(TECHNIQUE_REJECTION_CODES)
    const seen: TechniqueRejectionCode[] = proposeTechniques({
      ...aSession(),
      style: 'strength',
    }).rejections.map((entry) => entry.code)

    for (const code of seen) expect(known.has(code)).toBe(true)
  })
})

describe('the shared helpers', () => {
  it('fills every default, and treats every measurement as unmeasured', () => {
    const context = createTechniqueContext()

    expect(context.techniques).toEqual({ supersets: true, dropSets: true, circuits: true })
    expect(context.timePressure).toBeNull()
    expect(context.muscleVolumeNeed).toBeNull()
    expect(context.systemicRecovery).toBeNull()
    expect(context.policy).toEqual(DEFAULT_TECHNIQUE_POLICY)
  })

  it('resolves a policy from overrides without losing the rest of it', () => {
    const policy = resolveTechniquePolicy({ minSupersetSavingSeconds: 5 })

    expect(policy.minSupersetSavingSeconds).toBe(5)
    expect(policy.maxCircuitMembers).toBe(DEFAULT_TECHNIQUE_POLICY.maxCircuitMembers)
    expect(resolveTechniquePolicy()).toBe(DEFAULT_TECHNIQUE_POLICY)
  })

  it('raises and clamps a difficulty ceiling on the one scale', () => {
    expect(difficultyCeiling('beginner', 0)).toBe('beginner')
    expect(difficultyCeiling('beginner', 1)).toBe('intermediate')
    expect(difficultyCeiling('advanced', 3)).toBe('advanced')
    expect(difficultyCeiling('intermediate', -5)).toBe('beginner')
  })

  it('counts a hold in seconds and a unilateral movement twice', () => {
    const held = anExercise({ id: 'hold', repUnit: 'seconds', typicalRepRange: { min: 40, max: 40 } })
    const oneSided = anExercise({ id: 'one-sided', unilateral: true })

    expect(defaultWorkSecondsEstimator({ exercise: held, reps: null })).toBe(40)
    expect(defaultWorkSecondsEstimator({ exercise: oneSided, reps: 10 })).toBe(60)
  })

  it('calls a rush a rush from either the person or the clock, and never invents one', () => {
    expect(underTimePressure(createTechniqueContext())).toBe(false)
    expect(underTimePressure(createTechniqueContext({ timePressure: 0.4 }))).toBe(true)
    expect(underTimePressure(createTechniqueContext({ timePressure: 0.3 }))).toBe(false)
    expect(
      underTimePressure(createTechniqueContext({ timeBudgetSeconds: 1800, estimatedSeconds: 1900 })),
    ).toBe(false)
    expect(
      underTimePressure(createTechniqueContext({ timeBudgetSeconds: 1800, estimatedSeconds: 2000 })),
    ).toBe(true)
  })

  it('charges the costliest transition in a group', () => {
    const cheap = anExercise({ id: 'cheap', transitionCost: 'low' })
    const dear = anExercise({ id: 'dear', transitionCost: 'high' })

    expect(transitionPenalty(DEFAULT_TECHNIQUE_POLICY, [cheap, cheap])).toBe(0)
    expect(transitionPenalty(DEFAULT_TECHNIQUE_POLICY, [cheap, dear])).toBe(25)
    expect(transitionPenalty(DEFAULT_TECHNIQUE_POLICY, [])).toBe(0)
  })

  it('keeps the time arithmetic exact', () => {
    expect(timeEffect(540, 276)).toEqual({
      beforeSeconds: 540,
      afterSeconds: 276,
      savedSeconds: 264,
      addedSeconds: 0,
    })
    expect(timeEffect(100, 130).savedSeconds).toBe(-30)
  })

  it('keeps a score inside 0-100', () => {
    expect(proposalScore(0, 0, DEFAULT_TECHNIQUE_POLICY)).toBe(0)
    expect(proposalScore(100000, 100, DEFAULT_TECHNIQUE_POLICY)).toBe(100)
    expect(proposalScore(-500, 0, DEFAULT_TECHNIQUE_POLICY)).toBe(0)
  })

  it('protects a priority slot and an anchor role alike', () => {
    const base = aSlot('slot', BASE_EXERCISE)

    expect(isProtectedSlot(base)).toBe(false)
    expect(isProtectedSlot({ ...base, priority: 'priority' })).toBe(true)
    expect(isProtectedSlot({ ...base, role: 'primary-strength' })).toBe(true)
    expect(isProtectedSlot({ ...base, role: 'primary-hypertrophy' })).toBe(true)
  })

  it('looks forward only when asking what a later priority lift needs', () => {
    const context = createTechniqueContext({
      candidates: [
        aSlot('early', anExercise({ id: 'early', primaryMuscles: ['quads'] }), {
          position: 0,
          priority: 'priority',
        }),
        aSlot('middle', BASE_EXERCISE, { position: 1 }),
        aSlot('late', anExercise({ id: 'late', primaryMuscles: ['lats'] }), {
          position: 2,
          priority: 'priority',
        }),
      ],
    })

    expect(laterPriorityGroups(context, 1)).toEqual({ groups: ['back'], slotIds: ['late'] })
    expect(laterPriorityGroups(context, 2)).toEqual({ groups: [], slotIds: [] })
  })

  it('rolls muscles up to groups and intersects them in a stable order', () => {
    expect(primaryGroupsOf(anExercise({ id: 'x', primaryMuscles: ['side-delt', 'lats'] }))).toEqual([
      'back',
      'shoulders',
    ])
    expect(sharedGroups(['back', 'shoulders'], ['shoulders', 'quads'])).toEqual(['shoulders'])
    expect(sharedGroups(['back'], ['quads'])).toEqual([])
  })
})
