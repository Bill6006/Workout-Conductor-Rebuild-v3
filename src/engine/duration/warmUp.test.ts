import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { DURATION_CHOICES, type DurationChoice, isWarmUpSet } from '../../core/validation/workoutSchema'
import { anExercise } from '../conflicts/testFixtures'
import { budgetFor } from './budget'
import {
  GENERAL_STEP_PLANS,
  MAX_RAMP_SETS,
  MIN_RAMP_SETS_FOR_LOADED_COMPOUND,
  RAMP_LADDERS,
  idealRampSets,
  planWarmUp,
  rampRestSeconds,
  rampSetCount,
  rampSets,
} from './warmUp'

const SQUAT: Exercise = anExercise({
  id: 'barbell-back-squat',
  setupTimeSeconds: 120,
  transitionCost: 'high',
  compoundOrIsolation: 'compound',
  typicalRepRange: { min: 5, max: 8 },
  warmUpSuitability: 'specific-ramp',
  load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
})

const CURL: Exercise = anExercise({
  id: 'dumbbell-biceps-curl',
  setupTimeSeconds: 30,
  transitionCost: 'low',
  compoundOrIsolation: 'isolation',
  typicalRepRange: { min: 10, max: 15 },
  warmUpSuitability: 'general',
  load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false, plateMath: false },
})

const PLANK: Exercise = anExercise({
  id: 'plank',
  setupTimeSeconds: 15,
  transitionCost: 'low',
  compoundOrIsolation: 'isolation',
  repUnit: 'seconds',
  typicalRepRange: { min: 30, max: 60 },
  warmUpSuitability: 'general',
  load: { basis: 'bodyweight', measure: 'none', usesBar: false, plateMath: false },
})

const FINISHER: Exercise = anExercise({
  id: 'machine-leg-extension',
  setupTimeSeconds: 40,
  transitionCost: 'moderate',
  compoundOrIsolation: 'isolation',
  warmUpSuitability: 'unsuitable',
})

function request(exercise: Exercise | null, allowanceSeconds: number, restSeconds = 40) {
  return {
    exercise,
    entryId: 'e1',
    idPrefix: 'b1-e1',
    allowanceSeconds,
    restSeconds,
    workingReps: 8,
    repUnit: 'reps' as const,
    workingLoad: { value: 100, unit: 'kg' as const, measure: 'total' as const },
  }
}

/* ------------------------------------------------------------------ *
 * The ramp
 * ------------------------------------------------------------------ */

describe('how many ramp sets an exercise wants', () => {
  it('gives a loaded compound the full ladder', () => {
    expect(idealRampSets(SQUAT)).toBe(MAX_RAMP_SETS)
  })

  it('gives a loaded isolation one rung', () => {
    expect(idealRampSets(CURL)).toBe(1)
  })

  it('gives an unloaded isolation none — it ramps into itself', () => {
    expect(idealRampSets(PLANK)).toBe(0)
  })

  it('never ramps ON an exercise the catalog says is unsuitable for it', () => {
    expect(idealRampSets(FINISHER)).toBe(0)
    expect(rampSets(request(FINISHER, 600))).toHaveLength(0)
  })

  it('gives a movement the catalog does not know a single rehearsal rung', () => {
    expect(idealRampSets(null)).toBe(1)
  })
})

describe('the ramp sets themselves', () => {
  it('flags every one of them as a warm-up', () => {
    // The flag is the whole point: Phases 6 and 7 exclude ramp sets from
    // progression, plateau detection, personal records and volume on exactly this.
    const sets = rampSets(request(SQUAT, 600))
    expect(sets.length).toBeGreaterThan(0)
    for (const set of sets) {
      expect(set.kind).toBe('warm-up')
      expect(isWarmUpSet(set)).toBe(true)
    }
  })

  it('never claims a reps-in-reserve target, because a ramp set is not trying', () => {
    for (const set of rampSets(request(SQUAT, 600))) expect(set.rirTarget).toBeNull()
  })

  it('climbs in load and comes down in reps', () => {
    const sets = rampSets(request(SQUAT, 600))
    expect(sets).toHaveLength(MAX_RAMP_SETS)
    let previousLoad = -1
    let previousReps = Number.POSITIVE_INFINITY
    for (const set of sets) {
      expect(set.weight.kind).toBe('load')
      const load = set.weight.kind === 'load' ? set.weight.value : 0
      expect(load).toBeGreaterThan(previousLoad)
      expect(set.reps.min).toBeLessThanOrEqual(previousReps)
      previousLoad = load
      previousReps = set.reps.min
    }
  })

  it('stops well short of the working load', () => {
    const sets = rampSets(request(SQUAT, 600))
    const last = sets[sets.length - 1]
    const load = last.weight.kind === 'load' ? last.weight.value : 0
    expect(load).toBeLessThan(100)
  })

  it('carries the unit and the measure the working load was stated in', () => {
    const sets = rampSets({
      ...request(CURL, 600),
      workingLoad: { value: 20, unit: 'lb', measure: 'per-hand' },
    })
    for (const set of sets) {
      expect(set.weight).toMatchObject({ kind: 'load', unit: 'lb', measure: 'per-hand' })
    }
  })

  it('says plainly that the load is unknown rather than inventing one', () => {
    const sets = rampSets({ ...request(SQUAT, 600), workingLoad: null })
    for (const set of sets) expect(set.weight).toEqual({ kind: 'unknown', reason: 'no-history' })
  })

  it('carries no load at all for an unloaded movement', () => {
    const sets = rampSets({
      ...request(anExercise({ ...PLANK, compoundOrIsolation: 'compound' }), 600),
      workingLoad: null,
    })
    for (const set of sets) expect(set.weight).toEqual({ kind: 'none' })
  })

  it('mints ids from the caller prefix, so a rebuild reproduces them', () => {
    expect(rampSets(request(SQUAT, 600)).map((set) => set.setId)).toEqual([
      'b1-e1-warmup-1',
      'b1-e1-warmup-2',
      'b1-e1-warmup-3',
    ])
  })

  it('has a ladder for every rung count it can return', () => {
    for (let count = 0; count <= MAX_RAMP_SETS; count += 1) {
      expect(RAMP_LADDERS[count]).toHaveLength(count)
    }
  })
})

describe('the ramp scaling with the time available', () => {
  it('shortens as the allowance shrinks', () => {
    const generous = rampSetCount(request(SQUAT, 600))
    const middling = rampSetCount(request(SQUAT, 130))
    const tiny = rampSetCount(request(SQUAT, 10))
    expect(generous).toBe(MAX_RAMP_SETS)
    expect(middling).toBeLessThanOrEqual(generous)
    expect(tiny).toBeLessThanOrEqual(middling)
  })

  it('never ramps a loaded compound on fewer than two sets, whatever the clock says', () => {
    // The one place the warm-up refuses to scale down. Going from nothing to a
    // working set of squats is not a fifty-second saving worth making.
    expect(rampSetCount(request(SQUAT, 0))).toBe(MIN_RAMP_SETS_FOR_LOADED_COMPOUND)
    expect(rampSets(request(SQUAT, 0))).toHaveLength(MIN_RAMP_SETS_FOR_LOADED_COMPOUND)
  })

  it('drops an isolation ramp entirely when there is genuinely no time', () => {
    expect(rampSetCount(request(CURL, 0))).toBe(0)
  })

  it('rests less between rungs in a squeezed session', () => {
    expect(rampRestSeconds(budgetFor(15))).toBeLessThan(rampRestSeconds(budgetFor('default')))
  })
})

/* ------------------------------------------------------------------ *
 * The whole plan
 * ------------------------------------------------------------------ */

function plan(choice: DurationChoice, exercise: Exercise | null = SQUAT) {
  return planWarmUp({
    budget: budgetFor(choice, { defaultMinutes: 60 }),
    firstMovement: exercise,
    firstEntryId: 'e1',
    idPrefix: 'b1-e1',
    targetGroups: ['quads', 'glutes'],
    workingLoad: { value: 100, unit: 'kg', measure: 'total' },
  })
}

describe('the warm-up plan', () => {
  it('scales down with the time available', () => {
    const lengths = [15, 30, 45, 'default'].map((choice) => plan(choice as DurationChoice).totalSeconds)
    for (let index = 1; index < lengths.length; index += 1) {
      expect(lengths[index]).toBeGreaterThan(lengths[index - 1])
    }
  })

  it('does not spend a fifteen-minute session on a long optional warm-up block', () => {
    const short = plan(15)
    const full = plan('default')
    expect(short.stepSeconds).toBeLessThanOrEqual(budgetFor(15).generalStepCapSeconds)
    expect(short.stepSeconds).toBeLessThan(full.stepSeconds)
    // The specific ramp survives the squeeze; the general block is what gives way.
    expect(short.rampSets.length).toBeGreaterThanOrEqual(MIN_RAMP_SETS_FOR_LOADED_COMPOUND)
    expect(short.rampSeconds).toBeGreaterThan(short.stepSeconds)
  })

  it('spends the allowance on the ramp first, then on general steps', () => {
    for (const choice of DURATION_CHOICES) {
      const draft = plan(choice)
      expect(draft.totalSeconds).toBe(draft.rampSeconds + draft.stepSeconds)
      expect(draft.plan.estimatedSeconds).toBe(draft.totalSeconds)
    }
  })

  it('names the ramped entry, and only when there really are ramp sets', () => {
    expect(plan(45).plan.rampedEntryIds).toEqual(['e1'])
    // `workoutSchema` rejects a plan that names an entry programming no ramp sets.
    const unrampable = plan(45, FINISHER)
    expect(unrampable.rampSets).toHaveLength(0)
    expect(unrampable.plan.rampedEntryIds).toEqual([])
  })

  it('leads with raising the pulse at every length that has a general block', () => {
    for (const choice of DURATION_CHOICES) {
      const steps = plan(choice).plan.steps
      if (steps.length > 0) expect(steps[0].kind).toBe('raise')
    }
  })

  it('shortens the pulse-raiser rather than dropping it when the cap is tight', () => {
    const declared = GENERAL_STEP_PLANS['15'][0].seconds
    const draft = planWarmUp({
      budget: budgetFor(15),
      firstMovement: SQUAT,
      firstEntryId: 'e1',
      idPrefix: 'b1-e1',
      workingLoad: { value: 100, unit: 'kg', measure: 'total' },
    })
    if (draft.plan.steps.length > 0) {
      expect(draft.plan.steps[0].kind).toBe('raise')
      expect(draft.plan.steps[0].seconds).toBeLessThanOrEqual(declared)
    }
  })

  it('only rehearses a movement when there is one to rehearse', () => {
    const withMovement = plan('default')
    const without = planWarmUp({
      budget: budgetFor('default', { defaultMinutes: 60 }),
      firstMovement: null,
      firstEntryId: null,
      idPrefix: 'b1-e1',
    })
    expect(withMovement.plan.steps.some((step) => step.kind === 'movement-rehearsal')).toBe(true)
    expect(without.plan.steps.some((step) => step.kind === 'movement-rehearsal')).toBe(false)
    expect(without.rampSets).toHaveLength(0)
  })

  it('points a rehearsal step at the movement it rehearses, and names none in prose', () => {
    for (const step of plan('default').plan.steps) {
      if (step.kind === 'movement-rehearsal') expect(step.exerciseId).toBe(SQUAT.id)
      else expect(step.exerciseId).toBeNull()
      expect(step.instruction.toLowerCase()).not.toContain('squat')
      expect(step.instruction.length).toBeLessThanOrEqual(160)
    }
  })

  it('reports going over its allowance rather than going over it silently', () => {
    const squeezed = planWarmUp({
      budget: { ...budgetFor(15), warmUpAllowanceSeconds: 10, generalStepCapSeconds: 0 },
      firstMovement: SQUAT,
      firstEntryId: 'e1',
      idPrefix: 'b1-e1',
      workingLoad: { value: 100, unit: 'kg', measure: 'total' },
    })
    expect(squeezed.rampSets).toHaveLength(MIN_RAMP_SETS_FOR_LOADED_COMPOUND)
    expect(squeezed.overAllowanceSeconds).toBeGreaterThan(0)
  })

  it('stays inside what the durable schema accepts', () => {
    for (const choice of DURATION_CHOICES) {
      const draft = plan(choice)
      expect(draft.plan.steps.length).toBeLessThanOrEqual(10)
      expect(draft.plan.rampedEntryIds.length).toBeLessThanOrEqual(20)
      expect(draft.plan.estimatedSeconds).toBeLessThanOrEqual(3600)
      expect(draft.plan.rationale.length).toBeLessThanOrEqual(240)
      for (const step of draft.plan.steps) {
        expect(step.instruction.length).toBeGreaterThan(0)
        expect(step.seconds).toBeGreaterThanOrEqual(0)
        expect(step.targetGroups.length).toBeLessThanOrEqual(8)
      }
      for (const set of draft.rampSets) {
        expect(set.reps.min).toBeGreaterThanOrEqual(1)
        expect(set.reps.min).toBeLessThanOrEqual(set.reps.max)
        expect(set.restSeconds).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(set.estimatedSeconds)).toBe(true)
      }
    }
  })

  it('is deterministic', () => {
    for (const choice of DURATION_CHOICES) {
      expect(JSON.stringify(plan(choice))).toBe(JSON.stringify(plan(choice)))
    }
  })
})
