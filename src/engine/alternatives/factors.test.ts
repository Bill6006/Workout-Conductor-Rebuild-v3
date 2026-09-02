import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { defaultSlotEstimator } from './estimate'
import { factorApplicability, scoreCandidate, type ScoringInput } from './factors'
import { progressionContinuity, supersetImpact } from './explain'
import { readSession } from './sessionView'
import {
  BARBELL_BENCH,
  BARBELL_ROW,
  CABLE_FLY,
  DUMBBELL_BENCH,
  MACHINE_PRESS,
  PUSH_UP,
  context,
  exercise,
  slot,
} from './testFixtures'
import type { AlternativesContext } from './types'
import { FACTOR_WEIGHTS, TOTAL_WEIGHT, type FactorKey } from './weights'

function scoringInput(candidate: Exercise, ctx: AlternativesContext = context()): ScoringInput {
  const view = readSession(ctx)
  return {
    candidate,
    current: view.target.exercise,
    context: ctx,
    view,
    available: new Set(ctx.availableEquipment),
    preference: { side: 'neutral', route: 'none' },
    performance: null,
    conflicts: [],
    estimatedSeconds: defaultSlotEstimator({ exercise: candidate, sets: 3, restSeconds: 90 }),
    progression: progressionContinuity(candidate, view.target.exercise),
    superset: supersetImpact(candidate, view, []),
  }
}

function score(candidate: Exercise, ctx: AlternativesContext = context()): number {
  const view = readSession(ctx)
  return scoreCandidate(scoringInput(candidate, ctx), factorApplicability(ctx, view, false)).matchScore
}

function factor(candidate: Exercise, key: FactorKey, ctx: AlternativesContext = context()) {
  const view = readSession(ctx)
  const result = scoreCandidate(scoringInput(candidate, ctx), factorApplicability(ctx, view, false))
  const found = result.factors.find((entry) => entry.key === key)
  if (!found) throw new Error(`factor ${key} was not applicable`)
  return found
}

describe('which factors apply', () => {
  it('drops the ones with nothing to say, and scales the rest back up to 100', () => {
    const ctx = context()
    const applicability = factorApplicability(ctx, readSession(ctx), false)
    expect(applicability.keys).not.toContain('remaining-time')
    expect(applicability.keys).not.toContain('fatigue')
    expect(applicability.keys).not.toContain('preference')
    expect(applicability.keys).not.toContain('previous-performance')
    expect(applicability.keys).not.toContain('superset-compatibility')
    expect(applicability.keys).not.toContain('drop-set-compatibility')

    const total = applicability.keys.reduce((sum, key) => sum + FACTOR_WEIGHTS[key] * applicability.scale, 0)
    expect(total).toBeCloseTo(TOTAL_WEIGHT)
  })

  it('brings a factor back as soon as the context gives it something to read', () => {
    const ctx = context({
      remainingSeconds: 1800,
      fatigue: { systemic: 0.3, byMuscleGroup: {}, grip: 0.1 },
      performance: [{ exerciseId: DUMBBELL_BENCH.id, sessions: 4, successRate: 0.8 }],
      session: [slot({ slotId: 'a', exercise: BARBELL_BENCH, usesDropSet: true })],
    })
    const keys = factorApplicability(ctx, readSession(ctx), true).keys
    expect(keys).toContain('remaining-time')
    expect(keys).toContain('fatigue')
    expect(keys).toContain('preference')
    expect(keys).toContain('previous-performance')
    expect(keys).toContain('drop-set-compatibility')
  })

  it('NEVER varies with the candidate — that is what keeps two candidates comparable', () => {
    const ctx = context()
    const view = readSession(ctx)
    const applicability = factorApplicability(ctx, view, false)
    const first = scoreCandidate(scoringInput(PUSH_UP, ctx), applicability).factors
    const second = scoreCandidate(scoringInput(CABLE_FLY, ctx), applicability).factors
    expect(first.map((entry) => entry.key)).toEqual(second.map((entry) => entry.key))
    expect(first.map((entry) => entry.weight)).toEqual(second.map((entry) => entry.weight))
  })

  it('gives a superset factor only when there is a pairing to protect', () => {
    const alone = context()
    expect(factorApplicability(alone, readSession(alone), false).keys).not.toContain('superset-compatibility')
    const paired = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
        slot({ slotId: 'b', exercise: BARBELL_ROW, supersetId: 's1' }),
      ],
    })
    expect(factorApplicability(paired, readSession(paired), false).keys).toContain('superset-compatibility')
  })
})

describe('scoring one candidate', () => {
  it('produces a whole number from 0 to 100 whose factors sum to it', () => {
    const ctx = context()
    const result = scoreCandidate(
      scoringInput(DUMBBELL_BENCH, ctx),
      factorApplicability(ctx, readSession(ctx), false),
    )
    expect(result.matchScore).toBeGreaterThan(0)
    expect(result.matchScore).toBeLessThanOrEqual(100)
    expect(Number.isInteger(result.matchScore)).toBe(true)
    const summed = result.factors.reduce((total, entry) => total + entry.contribution, 0)
    expect(summed).toBeCloseTo(result.rawScore)
  })

  it('gives every factor a line of its own, so a score can be read rather than trusted', () => {
    const ctx = context()
    const result = scoreCandidate(
      scoringInput(DUMBBELL_BENCH, ctx),
      factorApplicability(ctx, readSession(ctx), false),
    )
    for (const entry of result.factors) {
      expect(entry.text.length).toBeGreaterThan(0)
      expect(entry.score).toBeGreaterThanOrEqual(0)
      expect(entry.score).toBeLessThanOrEqual(1)
    }
  })
})

describe('individual factors', () => {
  it('scores an exact muscle match above a same-group one', () => {
    const exact = factor(DUMBBELL_BENCH, 'primary-muscle').score
    const shifted = factor(
      exercise({ id: 'decline-press', name: 'Decline press', primaryMuscles: ['lower-chest'] }),
      'primary-muscle',
    ).score
    expect(exact).toBe(1)
    expect(shifted).toBeLessThan(exact)
    expect(shifted).toBeGreaterThan(0)
  })

  it('scores the same pattern above an overlapping one above an unrelated one', () => {
    const same = factor(DUMBBELL_BENCH, 'movement-pattern').score
    const overlapping = factor(CABLE_FLY, 'movement-pattern').score
    const unrelated = factor(
      exercise({ id: 'chest-carry', name: 'Chest carry', movementPattern: 'carry' }),
      'movement-pattern',
    ).score
    expect(same).toBe(1)
    expect(same).toBeGreaterThan(overlapping)
    expect(overlapping).toBeGreaterThan(unrelated)
  })

  it('does not punish a candidate BETTER suited to the goal than the one it replaces', () => {
    const better = exercise({
      id: 'safety-bar-press',
      name: 'Safety bar press',
      strengthSuitability: 'excellent',
      hypertrophySuitability: 'excellent',
    })
    expect(factor(better, 'stimulus', context({ goal: 'strength' })).score).toBeGreaterThanOrEqual(
      factor(DUMBBELL_BENCH, 'stimulus', context({ goal: 'strength' })).score,
    )
  })

  it('weights the suitability the person is actually training for', () => {
    const strengthy = exercise({
      id: 'floor-press',
      name: 'Floor press',
      strengthSuitability: 'excellent',
      hypertrophySuitability: 'limited',
    })
    expect(factor(strengthy, 'stimulus', context({ goal: 'strength' })).score).toBeGreaterThan(
      factor(strengthy, 'stimulus', context({ goal: 'hypertrophy' })).score,
    )
  })

  it('gives a full mark for setting up no slower, and less for setting up much slower', () => {
    const quick = exercise({ id: 'quick', name: 'Quick', setupTimeSeconds: 10 })
    const slow = exercise({ id: 'slow', name: 'Slow', setupTimeSeconds: 300 })
    expect(factor(quick, 'setup-time').score).toBe(1)
    expect(factor(slow, 'setup-time').score).toBe(0)
  })

  it('rewards headroom on the clock rather than merely fitting it', () => {
    const roomy = context({ remainingSeconds: 3600 })
    const tight = context({ remainingSeconds: 400 })
    expect(factor(DUMBBELL_BENCH, 'remaining-time', roomy).score).toBe(1)
    expect(factor(DUMBBELL_BENCH, 'remaining-time', tight).score).toBeLessThan(1)
  })

  it('charges a grip-heavy candidate more when the rest of the session is grip work', () => {
    const easy = context()
    const gripHeavy = context({
      session: [slot({ slotId: 'a', exercise: BARBELL_BENCH }), slot({ slotId: 'b', exercise: BARBELL_ROW })],
    })
    const holdy = exercise({ id: 'towel-press', name: 'Towel press', gripDemand: 'high' })
    expect(factor(holdy, 'grip', gripHeavy).score).toBeLessThan(factor(holdy, 'grip', easy).score)
  })

  it('charges joint stress more when the session has already loaded that joint', () => {
    const fresh = context()
    const loaded = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
        slot({ slotId: 'b', exercise: BARBELL_BENCH }),
        slot({ slotId: 'c', exercise: DUMBBELL_BENCH }),
      ],
    })
    const stressful = exercise({
      id: 'wide-press',
      name: 'Wide press',
      jointStressTags: [{ joint: 'shoulder', intensity: 'high' }],
    })
    expect(factor(stressful, 'joint-stress', loaded).score).toBeLessThan(
      factor(stressful, 'joint-stress', fresh).score,
    )
  })

  it('scores a machine as gentler on the joints than a heavy free-weight press', () => {
    expect(factor(MACHINE_PRESS, 'joint-stress').score).toBeGreaterThan(
      factor(DUMBBELL_BENCH, 'joint-stress').score,
    )
  })

  it('scores a hand-picked substitution above one that is merely similar', () => {
    expect(factor(DUMBBELL_BENCH, 'hand-picked-substitution').score).toBeGreaterThan(0)
    expect(factor(PUSH_UP, 'hand-picked-substitution').score).toBe(0)
    // Earlier in the author's list ranks marginally higher than later.
    expect(factor(DUMBBELL_BENCH, 'hand-picked-substitution').score).toBeGreaterThan(
      factor(MACHINE_PRESS, 'hand-picked-substitution').score,
    )
  })

  it('scores an alternative in the same progression family top of that factor', () => {
    const sameFamily = exercise({
      id: 'paused-bench-press',
      name: 'Paused bench press',
      progressionFamily: BARBELL_BENCH.progressionFamily,
      equipment: ['barbell', 'flat-bench'],
    })
    expect(factor(sameFamily, 'progression-continuity').score).toBe(1)
    expect(factor(CABLE_FLY, 'progression-continuity').score).toBeLessThan(1)
  })
})

describe('the whole score', () => {
  it('ranks the closest substitute above a loosely related one', () => {
    expect(score(DUMBBELL_BENCH)).toBeGreaterThan(score(CABLE_FLY))
  })

  it('moves with the context rather than being a property of the exercise', () => {
    // A push-up is a poor stand-in for a heavy press and a passable one for a
    // hypertrophy slot, and the same two catalog entries have to say both.
    expect(score(PUSH_UP, context({ goal: 'hypertrophy' }))).toBeGreaterThan(
      score(PUSH_UP, context({ goal: 'strength' })),
    )
  })
})
