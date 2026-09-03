import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BAR_WEIGHT,
  DEFAULT_KG_PLATES,
  DEFAULT_LB_PLATES,
  defaultPlateInventory,
  formatNumber,
  formatPlateRun,
  formatWeight,
  planLoad,
  solvePlateLoad,
  type PlateInventory,
  type PlateMathLoadModel,
  type PlateStack,
} from './plateLoad'

const BARBELL: PlateMathLoadModel = {
  basis: 'barbell',
  measure: 'total',
  usesBar: true,
  plateMath: true,
}

const PLATE_MACHINE: PlateMathLoadModel = {
  basis: 'plate-loaded-machine',
  measure: 'total',
  usesBar: false,
  plateMath: true,
}

const DUMBBELL: PlateMathLoadModel = {
  basis: 'dumbbell',
  measure: 'per-hand',
  usesBar: false,
  plateMath: false,
}

const CABLE_STACK: PlateMathLoadModel = {
  basis: 'cable-stack',
  measure: 'total',
  usesBar: false,
  plateMath: false,
}

const BODYWEIGHT: PlateMathLoadModel = {
  basis: 'bodyweight',
  measure: 'none',
  usesBar: false,
  plateMath: false,
}

/** Sums a per-side breakdown the way a person stacking the plates would. */
function sumPerSide(plates: readonly PlateStack[]): number {
  return round2(plates.reduce((total, stack) => total + stack.weight * stack.count, 0))
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

describe('solvePlateLoad — exact loads', () => {
  it('loads a 60 kg squat as one 20 per side on a 20 kg bar', () => {
    const load = solvePlateLoad({
      targetWeight: 60,
      barWeight: 20,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    expect(load.status).toBe('exact')
    expect(load.platesPerSide).toEqual([{ weight: 20, count: 1 }])
    expect(load.achievableWeight).toBe(60)
    expect(load.perSideWeight).toBe(20)
    expect(load.differenceFromTarget).toBe(0)
  })

  it('loads 135 lb as one 45 per side on a 45 lb bar', () => {
    const load = solvePlateLoad({
      targetWeight: 135,
      barWeight: 45,
      unit: 'lb',
      inventory: DEFAULT_LB_PLATES,
    })

    expect(load.status).toBe('exact')
    expect(load.platesPerSide).toEqual([{ weight: 45, count: 1 }])
    expect(load.achievableWeight).toBe(135)
  })

  it('treats a target equal to the bar as an exact bar-only load', () => {
    const load = solvePlateLoad({ targetWeight: 20, barWeight: 20, unit: 'kg', inventory: DEFAULT_KG_PLATES })

    expect(load.status).toBe('exact')
    expect(load.platesPerSide).toEqual([])
    expect(load.achievableWeight).toBe(20)
    expect(load.differenceFromTarget).toBe(0)
  })

  it('hits a fractional target exactly rather than drifting on binary floating point', () => {
    // 21.25 per side is 20 + 1.25, which does not sum to 21.25 in IEEE doubles.
    const load = solvePlateLoad({
      targetWeight: 62.5,
      barWeight: 20,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    expect(load.status).toBe('exact')
    expect(load.differenceFromTarget).toBe(0)
    expect(load.achievableWeight).toBe(62.5)
    expect(sumPerSide(load.platesPerSide)).toBe(21.25)
  })

  it('prefers the fewest plates among combinations reaching the same weight', () => {
    const load = solvePlateLoad({
      targetWeight: 60,
      barWeight: 20,
      unit: 'kg',
      inventory: [
        { weight: 20, perSide: 2 },
        { weight: 10, perSide: 4 },
        { weight: 5, perSide: 4 },
      ],
    })

    expect(load.platesPerSide).toEqual([{ weight: 20, count: 1 }])
  })

  it('is not greedy: it takes two 10s over a 15 that cannot be completed', () => {
    const load = solvePlateLoad({
      targetWeight: 40,
      barWeight: 0,
      unit: 'kg',
      inventory: [
        { weight: 15, perSide: 1 },
        { weight: 10, perSide: 2 },
      ],
    })

    expect(load.status).toBe('exact')
    expect(load.platesPerSide).toEqual([{ weight: 10, count: 2 }])
    expect(load.achievableWeight).toBe(40)
  })

  it('loads a plate-loaded machine with no bar in the total', () => {
    const load = solvePlateLoad({
      targetWeight: 60,
      barWeight: 0,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    expect(load.status).toBe('exact')
    expect(load.barWeight).toBe(0)
    expect(sumPerSide(load.platesPerSide)).toBe(30)
    expect(load.achievableWeight).toBe(60)
  })

  it('loads a single side when the exercise is one plate, not a pair', () => {
    const load = solvePlateLoad({
      targetWeight: 10,
      barWeight: 0,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
      sides: 1,
    })

    expect(load.sides).toBe(1)
    expect(load.achievableWeight).toBe(10)
    expect(load.platesPerSide).toEqual([{ weight: 10, count: 1 }])
  })
})

describe('solvePlateLoad — near misses are reported, never rounded away', () => {
  it('returns the closest loadable weight and how far short it falls', () => {
    const load = solvePlateLoad({
      targetWeight: 61,
      barWeight: 20,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    expect(load.status).toBe('closest')
    expect(load.achievableWeight).toBe(60)
    expect(load.differenceFromTarget).toBe(-1)
    expect(load.targetWeight).toBe(61)
  })

  it('reports an overshoot as a positive difference', () => {
    const load = solvePlateLoad({
      targetWeight: 28,
      barWeight: 20,
      unit: 'kg',
      inventory: [{ weight: 5, perSide: 2 }],
    })

    expect(load.status).toBe('closest')
    expect(load.achievableWeight).toBe(30)
    expect(load.differenceFromTarget).toBe(2)
  })

  it('breaks a tie downwards, because the lighter miss is the safer one', () => {
    const load = solvePlateLoad({
      targetWeight: 22.5,
      barWeight: 20,
      unit: 'kg',
      inventory: [{ weight: 2.5, perSide: 2 }],
    })

    expect(load.achievableWeight).toBe(20)
    expect(load.differenceFromTarget).toBe(-2.5)
    expect(load.platesPerSide).toEqual([])
  })

  it('near-misses in pounds too', () => {
    const load = solvePlateLoad({
      targetWeight: 137,
      barWeight: 45,
      unit: 'lb',
      inventory: DEFAULT_LB_PLATES,
    })

    expect(load.status).toBe('closest')
    expect(load.achievableWeight).toBe(135)
    expect(load.differenceFromTarget).toBe(-2)
    expect(load.unit).toBe('lb')
  })

  it('stops at the heaviest thing the rack can build', () => {
    const load = solvePlateLoad({
      targetWeight: 500,
      barWeight: 20,
      unit: 'kg',
      inventory: [{ weight: 20, perSide: 2 }],
    })

    expect(load.status).toBe('closest')
    expect(load.achievableWeight).toBe(100)
    expect(load.differenceFromTarget).toBe(-400)
    expect(load.platesPerSide).toEqual([{ weight: 20, count: 2 }])
  })
})

describe('solvePlateLoad — targets under the bar', () => {
  it('says the bar alone already outweighs the target', () => {
    const load = solvePlateLoad({
      targetWeight: 15,
      barWeight: 20,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    expect(load.status).toBe('below-bar')
    expect(load.platesPerSide).toEqual([])
    expect(load.achievableWeight).toBe(20)
    expect(load.differenceFromTarget).toBe(5)
  })

  it('uses the bar it is given, not a hard-coded 20 kg', () => {
    const load = solvePlateLoad({
      targetWeight: 17,
      barWeight: 15,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    // A 15 kg women's bar makes 17 kg a near miss, not a below-bar target.
    expect(load.status).toBe('closest')
    expect(load.barWeight).toBe(15)
    expect(load.achievableWeight).toBe(17.5)
  })

  it('treats a nonsensical target as zero rather than inventing plates', () => {
    const load = solvePlateLoad({
      targetWeight: Number.NaN,
      barWeight: 20,
      unit: 'kg',
      inventory: DEFAULT_KG_PLATES,
    })

    expect(load.status).toBe('below-bar')
    expect(load.targetWeight).toBe(0)
    expect(load.achievableWeight).toBe(20)
  })
})

describe('solvePlateLoad — an empty or unusable rack', () => {
  it('falls back to the empty bar and reports the whole shortfall', () => {
    const load = solvePlateLoad({ targetWeight: 60, barWeight: 20, unit: 'kg', inventory: [] })

    expect(load.status).toBe('closest')
    expect(load.platesPerSide).toEqual([])
    expect(load.achievableWeight).toBe(20)
    expect(load.differenceFromTarget).toBe(-40)
  })

  it('is unloadable when there is no bar and no plate', () => {
    const load = solvePlateLoad({ targetWeight: 60, barWeight: 0, unit: 'kg', inventory: [] })

    expect(load.status).toBe('unloadable')
    expect(load.achievableWeight).toBe(0)
    expect(load.differenceFromTarget).toBe(-60)
  })

  it('ignores plates that are not plates', () => {
    const junk: PlateInventory = [
      { weight: 0, perSide: 4 },
      { weight: -5, perSide: 2 },
      { weight: 20, perSide: 0 },
      { weight: Number.NaN, perSide: 2 },
      { weight: 10, perSide: 2 },
    ]
    const load = solvePlateLoad({ targetWeight: 40, barWeight: 20, unit: 'kg', inventory: junk })

    expect(load.status).toBe('exact')
    expect(load.platesPerSide).toEqual([{ weight: 10, count: 1 }])
  })

  it('merges duplicate denominations instead of double-counting them', () => {
    const load = solvePlateLoad({
      targetWeight: 100,
      barWeight: 20,
      unit: 'kg',
      inventory: [
        { weight: 20, perSide: 1 },
        { weight: 20, perSide: 1 },
      ],
    })

    expect(load.platesPerSide).toEqual([{ weight: 20, count: 2 }])
    expect(load.achievableWeight).toBe(100)
  })

  it('never proposes more plates than the rack holds', () => {
    const load = solvePlateLoad({
      targetWeight: 200,
      barWeight: 20,
      unit: 'kg',
      inventory: [{ weight: 20, perSide: 3 }],
    })

    expect(load.platesPerSide).toEqual([{ weight: 20, count: 3 }])
    expect(load.achievableWeight).toBe(140)
  })
})

describe('planLoad — the catalog decides whether plate math applies', () => {
  it('offers no plate math at all when the load model says plateMath: false', () => {
    expect(planLoad({ targetWeight: 60, unit: 'kg', load: CABLE_STACK })).toEqual({
      kind: 'none',
      reason: 'not-plate-loaded',
      unit: 'kg',
    })
  })

  it('offers no plate math for an unloaded exercise', () => {
    expect(planLoad({ targetWeight: 0, unit: 'kg', load: BODYWEIGHT })).toEqual({
      kind: 'none',
      reason: 'no-load',
      unit: 'kg',
    })
  })

  it('reads a per-hand measure as a per-hand weight, not a plate calculation', () => {
    expect(planLoad({ targetWeight: 22.5, unit: 'kg', load: DUMBBELL })).toEqual({
      kind: 'per-hand',
      weightPerHand: 22.5,
      unit: 'kg',
    })
  })

  it('keeps per-hand ahead of plate math even when a per-hand load could be built', () => {
    const plan = planLoad({
      targetWeight: 20,
      unit: 'kg',
      load: { basis: 'dumbbell', measure: 'per-hand', usesBar: false, plateMath: true },
    })

    expect(plan.kind).toBe('per-hand')
  })

  it('subtracts the caller’s bar, and defaults to a standard bar per unit', () => {
    const metric = planLoad({ targetWeight: 60, unit: 'kg', load: BARBELL })
    const imperial = planLoad({ targetWeight: 135, unit: 'lb', load: BARBELL })

    expect(metric.kind === 'plates' && metric.load.barWeight).toBe(20)
    expect(imperial.kind === 'plates' && imperial.load.barWeight).toBe(45)
    expect(DEFAULT_BAR_WEIGHT).toEqual({ kg: 20, lb: 45 })
  })

  it('honours an EZ-bar or a women’s bar supplied by settings', () => {
    const plan = planLoad({ targetWeight: 40, unit: 'kg', load: BARBELL, barWeight: 10 })

    expect(plan.kind === 'plates' && plan.load.barWeight).toBe(10)
    expect(plan.kind === 'plates' && plan.load.platesPerSide).toEqual([{ weight: 15, count: 1 }])
  })

  it('ignores a bar weight for an exercise that uses no bar', () => {
    const plan = planLoad({ targetWeight: 60, unit: 'kg', load: PLATE_MACHINE, barWeight: 20 })

    expect(plan.kind === 'plates' && plan.load.barWeight).toBe(0)
    expect(plan.kind === 'plates' && plan.load.achievableWeight).toBe(60)
  })

  it('loads a single hand-held plate on one side', () => {
    const plan = planLoad({
      targetWeight: 15,
      unit: 'kg',
      load: { basis: 'weight-plate', measure: 'total', usesBar: false, plateMath: true },
    })

    expect(plan.kind === 'plates' && plan.load.sides).toBe(1)
    expect(plan.kind === 'plates' && plan.load.achievableWeight).toBe(15)
  })

  it('defaults to the rack for the unit it is asked about', () => {
    expect(defaultPlateInventory('kg')).toBe(DEFAULT_KG_PLATES)
    expect(defaultPlateInventory('lb')).toBe(DEFAULT_LB_PLATES)
  })
})

describe('formatting', () => {
  it('writes weights the way a person does', () => {
    expect(formatWeight(20, 'kg')).toBe('20 kg')
    expect(formatWeight(2.5, 'kg')).toBe('2.5 kg')
    expect(formatWeight(1.25, 'kg')).toBe('1.25 kg')
    expect(formatWeight(45, 'lb')).toBe('45 lb')
    expect(formatNumber(20.0)).toBe('20')
  })

  it('reads a run of plates one plate at a time', () => {
    expect(
      formatPlateRun([
        { weight: 20, count: 2 },
        { weight: 5, count: 1 },
      ]),
    ).toBe('20 + 20 + 5')
    expect(formatPlateRun([])).toBe('')
  })
})

describe('solvePlateLoad — properties that must hold for every target', () => {
  const cases = [
    { unit: 'kg' as const, bar: 20, inventory: DEFAULT_KG_PLATES, step: 0.25, from: 20, to: 220, jump: 2.5 },
    { unit: 'lb' as const, bar: 45, inventory: DEFAULT_LB_PLATES, step: 0.5, from: 45, to: 400, jump: 5 },
  ]

  for (const testCase of cases) {
    it(`the plates sum to the achievable weight for every ${testCase.unit} target`, () => {
      for (let target = testCase.from; target <= testCase.to; target = round2(target + testCase.step)) {
        const load = solvePlateLoad({
          targetWeight: target,
          barWeight: testCase.bar,
          unit: testCase.unit,
          inventory: testCase.inventory,
        })

        expect(sumPerSide(load.platesPerSide)).toBe(round2(load.perSideWeight))
        expect(load.achievableWeight).toBe(round2(testCase.bar + load.perSideWeight * 2))
        expect(round2(load.achievableWeight - target)).toBe(load.differenceFromTarget)
      }
    })

    it(`never misses by more than half a plate jump for a ${testCase.unit} target`, () => {
      for (let target = testCase.from; target <= testCase.to; target = round2(target + testCase.step)) {
        const load = solvePlateLoad({
          targetWeight: target,
          barWeight: testCase.bar,
          unit: testCase.unit,
          inventory: testCase.inventory,
        })

        expect(Math.abs(load.differenceFromTarget)).toBeLessThanOrEqual(testCase.jump / 2)
        expect(load.status).toBe(load.differenceFromTarget === 0 ? 'exact' : 'closest')
      }
    })

    it(`never proposes more of a plate than the ${testCase.unit} rack holds`, () => {
      const stock = new Map(testCase.inventory.map((entry) => [entry.weight, entry.perSide]))

      for (let target = testCase.from; target <= testCase.to; target = round2(target + testCase.step)) {
        const load = solvePlateLoad({
          targetWeight: target,
          barWeight: testCase.bar,
          unit: testCase.unit,
          inventory: testCase.inventory,
        })

        for (const stack of load.platesPerSide) {
          expect(stack.count).toBeLessThanOrEqual(stock.get(stack.weight) ?? 0)
          expect(stack.count).toBeGreaterThan(0)
        }
        const weights = load.platesPerSide.map((stack) => stack.weight)
        expect(weights).toEqual([...weights].sort((a, b) => b - a))
        expect(new Set(weights).size).toBe(weights.length)
      }
    })
  }
})
