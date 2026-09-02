import { describe, expect, it } from 'vitest'
import { createConflictChecker } from './conflictsAdapter'
import { defaultSlotEstimator } from './estimate'
import {
  describeDifferences,
  explainReasons,
  progressionContinuity,
  summarise,
  supersetImpact,
} from './explain'
import { readSession } from './sessionView'
import {
  BACK_SQUAT,
  BARBELL_BENCH,
  BARBELL_ROW,
  CABLE_FLY,
  DUMBBELL_BENCH,
  LAT_PULLDOWN,
  MACHINE_PRESS,
  PUSH_UP,
  context,
  exercise,
  slot,
} from './testFixtures'
import type { AlternativeDifference, FactorScore } from './types'

const codes = (list: readonly AlternativeDifference[]) => list.map((entry) => entry.code)

describe('progression continuity', () => {
  it('says history carries when the family is the same, and says so in words', () => {
    const sameFamily = exercise({
      id: 'paused-bench-press',
      name: 'Paused bench press',
      progressionFamily: BARBELL_BENCH.progressionFamily,
    })
    const progression = progressionContinuity(sameFamily, BARBELL_BENCH)
    expect(progression.preservesHistory).toBe(true)
    expect(progression.currentFamily).toBe(BARBELL_BENCH.progressionFamily)
    expect(progression.candidateFamily).toBe(BARBELL_BENCH.progressionFamily)
    expect(progression.text).toMatch(/carr/i)
  })

  it('says it does not when the implement changes, which is the whole point of a family', () => {
    const progression = progressionContinuity(DUMBBELL_BENCH, BARBELL_BENCH)
    expect(progression.preservesHistory).toBe(false)
    expect(progression.candidateFamily).not.toBe(progression.currentFamily)
  })
})

describe('what a swap does to a superset', () => {
  /** A light isolation partner: nothing about it makes a pairing awkward. */
  const PUSHDOWN = exercise({
    id: 'triceps-pushdown',
    name: 'Triceps pushdown',
    primaryMuscles: ['triceps-long-head'],
    movementPattern: 'isolation-extension',
    trainingRole: 'isolation',
    compoundOrIsolation: 'isolation',
    equipment: ['cable-machine'],
    locationSuitability: ['gym'],
    supersetCompatibility: {
      eligible: true,
      stationId: 'cable-tower',
      gripHeavy: false,
      competingDemands: [],
    },
    progressionFamily: 'triceps-extension-cable',
  })

  function pairedWith(partner = PUSHDOWN) {
    return context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
        slot({ slotId: 'b', exercise: partner, supersetId: 's1' }),
      ],
    })
  }

  function impact(candidate = DUMBBELL_BENCH, ctx = pairedWith()) {
    const view = readSession(ctx)
    const checker = createConflictChecker(ctx, view, defaultSlotEstimator)
    return supersetImpact(candidate, view, checker.check(candidate))
  }

  it('says a slot outside a superset is outside a superset', () => {
    const view = readSession(context())
    const result = supersetImpact(DUMBBELL_BENCH, view, [])
    expect(result.effect).toBe('not-in-superset')
    expect(result.partnerSlotId).toBeNull()
    expect(result.partnerExerciseId).toBeNull()
  })

  it('names the partner it would be paired with', () => {
    const result = impact()
    expect(result.partnerSlotId).toBe('b')
    expect(result.partnerExerciseId).toBe(PUSHDOWN.id)
    expect(result.text).toContain(PUSHDOWN.name)
  })

  it('calls a clean pairing preserved', () => {
    // A dumbbell press and a cable pushdown want different stations, share no
    // competing demand, and are not both heavy: the pairing works as it did.
    expect(impact().effect).toBe('preserved')
  })

  it('calls out a shared demand as a change rather than a break', () => {
    const grippy = exercise({
      id: 'chest-supported-row',
      name: 'Chest-supported row',
      primaryMuscles: ['mid-chest'],
      trainingRole: 'secondary-hypertrophy',
      supersetCompatibility: { eligible: true, stationId: null, gripHeavy: true, competingDemands: ['grip'] },
    })
    const result = impact(grippy, pairedWith(LAT_PULLDOWN))
    expect(result.effect).toBe('changed')
    expect(result.sharedDemands).toEqual(['grip'])
  })

  it('reports a station clash as a clash, structurally as well as in words', () => {
    const sameStation = exercise({
      id: 'cable-press',
      name: 'Cable press',
      primaryMuscles: ['mid-chest'],
      trainingRole: 'secondary-hypertrophy',
      equipment: ['cable-machine'],
      locationSuitability: ['gym'],
      supersetCompatibility: {
        eligible: true,
        stationId: 'cable-tower',
        gripHeavy: false,
        competingDemands: [],
      },
    })
    expect(impact(sameStation).stationClash).toBe(true)
  })

  it('reports a pairing the engine blocks as broken, with the engine’s own words', () => {
    const heavy = exercise({
      id: 'heavy-floor-press',
      name: 'Heavy floor press',
      trainingRole: 'primary-strength',
    })
    const result = impact(heavy, pairedWith(BACK_SQUAT))
    expect(result.effect).toBe('broken')
    expect(result.text.length).toBeGreaterThan(0)
  })
})

describe('the differences a person will feel', () => {
  const view = readSession(context())

  function differencesFor(candidate = DUMBBELL_BENCH) {
    const progression = progressionContinuity(candidate, BARBELL_BENCH)
    const superset = supersetImpact(candidate, view, [])
    return describeDifferences(candidate, BARBELL_BENCH, view, progression, superset)
  }

  it('leads with the biggest one, and `keyDifference` is simply the first', () => {
    const differences = differencesFor(CABLE_FLY)
    expect(differences.length).toBeGreaterThan(1)
    expect(differences[0].magnitude).toBe('major')
  })

  it('reports a lost progression, different equipment, and a compound becoming an isolation', () => {
    expect(codes(differencesFor(CABLE_FLY))).toEqual(
      expect.arrayContaining(['progression-resets', 'different-equipment', 'compound-isolation-change']),
    )
  })

  it('reports a change of movement pattern with the pattern named', () => {
    const found = differencesFor(CABLE_FLY).find((entry) => entry.code === 'different-pattern')
    expect(found?.text.toLowerCase()).toContain('fly')
  })

  it('reports a shift of emphasis inside the same muscle group', () => {
    const decline = exercise({ id: 'decline-press', name: 'Decline press', primaryMuscles: ['lower-chest'] })
    expect(codes(differencesFor(decline))).toContain('muscle-emphasis-shift')
  })

  it('reports a machine path as a change in range of motion', () => {
    expect(codes(differencesFor(MACHINE_PRESS))).toContain('range-of-motion-change')
  })

  it('reports a change of unit before a change of range, because they are not comparable', () => {
    const hold = exercise({
      id: 'plank-press',
      name: 'Plank press',
      repUnit: 'seconds',
      typicalRepRange: { min: 30, max: 60 },
    })
    const found = differencesFor(hold)
    expect(codes(found)).toContain('rep-unit-change')
    expect(codes(found)).not.toContain('rep-range-shift')
  })

  it('reports a much higher rep range when the unit is the same', () => {
    expect(codes(differencesFor(PUSH_UP))).toContain('rep-range-shift')
  })

  it('reports a drop set the slot needs and the candidate cannot take', () => {
    const dropSlot = readSession(
      context({ session: [slot({ slotId: 'a', exercise: BARBELL_BENCH, usesDropSet: true })] }),
    )
    const noDrop = exercise({ id: 'no-drop', name: 'No drop', safeForDropSet: false })
    const found = describeDifferences(
      noDrop,
      BARBELL_BENCH,
      dropSlot,
      progressionContinuity(noDrop, BARBELL_BENCH),
      supersetImpact(noDrop, dropSlot, []),
    )
    expect(codes(found)).toContain('drop-set-unavailable')
  })

  it('finds nothing to report when the two entries differ in nothing that matters', () => {
    const twin = exercise({
      ...BARBELL_BENCH,
      id: 'barbell-bench-press-twin',
      name: 'Barbell bench press (twin)',
    })
    expect(differencesFor(twin)).toEqual([])
  })

  it('returns the same order every time', () => {
    expect(codes(differencesFor(BARBELL_ROW))).toEqual(codes(differencesFor(BARBELL_ROW)))
  })
})

describe('the reasons an alternative ranks where it does', () => {
  function factorScore(overrides: Partial<FactorScore>): FactorScore {
    return {
      key: 'primary-muscle',
      weight: 14,
      score: 0.7,
      contribution: 9.8,
      standout: 0,
      code: 'same-primary-muscle',
      text: 'Trains the same muscles',
      ...overrides,
    }
  }

  it('leads with the factor furthest ABOVE its baseline, not the biggest contribution', () => {
    const { primary } = explainReasons([
      factorScore({ key: 'primary-muscle', contribution: 14, standout: 0.5 }),
      factorScore({
        key: 'progression-continuity',
        weight: 6,
        contribution: 6,
        standout: 3.9,
        code: 'keeps-progression',
        text: 'Keeps your progression',
      }),
    ])
    expect(primary.factor).toBe('progression-continuity')
    expect(primary.code).toBe('keeps-progression')
  })

  it('gives at most two supporting reasons and never repeats a reason code', () => {
    const { supporting } = explainReasons([
      factorScore({ key: 'primary-muscle', standout: 4 }),
      factorScore({ key: 'movement-pattern', standout: 3, code: 'same-movement-pattern' }),
      factorScore({ key: 'equipment', standout: 2, code: 'equipment-on-hand' }),
      factorScore({ key: 'setup-time', standout: 1, code: 'quicker-setup' }),
    ])
    expect(supporting).toHaveLength(2)
    expect(new Set(supporting.map((reason) => reason.code)).size).toBe(2)
  })

  it('still names a reason when nothing stands out, rather than returning nothing', () => {
    const { primary, supporting } = explainReasons([
      factorScore({ key: 'primary-muscle', contribution: 9, standout: -1 }),
      factorScore({ key: 'equipment', contribution: 4, standout: -2, code: 'equipment-on-hand' }),
    ])
    expect(primary.factor).toBe('primary-muscle')
    expect(supporting).toEqual([])
  })

  it('reports a strength on 0..1 so a screen can weight what it shows', () => {
    const { primary } = explainReasons([factorScore({ key: 'primary-muscle', score: 1, standout: 4.2 })])
    expect(primary.strength).toBeGreaterThan(0)
    expect(primary.strength).toBeLessThanOrEqual(1)
  })

  it('breaks a standout tie on the factor name, so two runs never disagree', () => {
    const factors = [
      factorScore({ key: 'equipment', standout: 2, code: 'equipment-on-hand' }),
      factorScore({ key: 'movement-pattern', standout: 2, code: 'same-movement-pattern' }),
    ]
    expect(explainReasons(factors).primary.factor).toBe(explainReasons([...factors].reverse()).primary.factor)
  })
})

describe('the one-line summary', () => {
  it('joins the reason and the difference into a sentence a row can show', () => {
    const summary = summarise(
      {
        code: 'keeps-progression',
        text: 'Keeps your progression',
        factor: 'progression-continuity',
        strength: 1,
      },
      { code: 'different-equipment', text: 'Uses dumbbells', magnitude: 'notable' },
    )
    expect(summary).toBe('Keeps your progression. Uses dumbbells.')
  })

  it('stands alone when nothing material differs', () => {
    const summary = summarise(
      { code: 'same-primary-muscle', text: 'Same muscles', factor: 'primary-muscle', strength: 1 },
      null,
    )
    expect(summary).toBe('Same muscles.')
  })
})

describe('a squat is still a squat', () => {
  it('describes an unrelated exercise as differing in the ways that matter', () => {
    const view = readSession(context())
    const found = describeDifferences(
      BACK_SQUAT,
      BARBELL_BENCH,
      view,
      progressionContinuity(BACK_SQUAT, BARBELL_BENCH),
      supersetImpact(BACK_SQUAT, view, []),
    )
    expect(codes(found)).toContain('different-pattern')
    expect(found[0].magnitude).toBe('major')
  })
})
