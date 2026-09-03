import type { LoadModel } from '../../catalog/taxonomy/taxonomy'
import type { WeightUnit } from '../../core/validation/workoutSchema'

/**
 * PLATE MATH — the arithmetic, with no React in it.
 *
 * "What do I put on the bar for 60 kg?" is a question with an honest answer and a
 * dishonest one. The dishonest answer is to round the target silently and print a
 * clean breakdown; the person then loads 57.5 kg and logs 60. Everything here is
 * built so that cannot happen: a solve returns the weight it can ACTUALLY reach
 * and the signed difference from what was asked, and the caller is expected to
 * show both.
 *
 * THREE FACTS FROM THE CATALOG DECIDE WHETHER PLATE MATH APPLIES AT ALL, and this
 * module reads all three rather than guessing from the exercise name:
 *   `plateMath: false` — a pin stack, a band, a fixed dumbbell. There is no
 *     breakdown to give, and inventing one would be worse than silence.
 *   `measure: 'per-hand'` — the number is what is in ONE hand. Not a plate
 *     calculation, and the one thing that must be said out loud, because a person
 *     reading "20 kg" for a dumbbell press and loading 20 kg total has halved the
 *     session.
 *   `usesBar: true` — the bar's own weight is part of the total and comes off
 *     before anything is divided. The bar weight is supplied by the caller:
 *     a 20 kg bar, a 15 kg women's bar, a 45 lb bar, and an EZ-bar all exist, and
 *     hard-coding any of them is how you get a breakdown that is 5 kg wrong every
 *     single set.
 *
 * ARITHMETIC IS IN INTEGER HUNDREDTHS. 1.25 + 1.25 + 2.5 is not 5 in binary
 * floating point, and a plate breakdown that fails an equality check by 4e-16 is
 * a bug report about a "near miss" on an exact load. Everything internal is
 * `Math.round(value * 100)`, and only the returned numbers come back to decimals.
 *
 * THE SOLVE IS NOT GREEDY. Greedy is wrong with a finite inventory: for 20 kg per
 * side from one 15 and two 10s, greedy takes the 15 and lands 5 short of a load
 * that two 10s hit exactly. This searches every reachable per-side total instead,
 * which is cheap — a real inventory has fewer than ten denominations.
 */

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

/** One denomination of plate, and how many of it are available PER SIDE. */
export interface PlateStock {
  /** The weight of a single plate, in the inventory's unit. */
  readonly weight: number
  /**
   * How many of this plate can go on ONE side. Four 25s per side means the rack
   * holds eight; the count is per side because that is the number the solver and
   * the person standing at the bar both work in.
   */
  readonly perSide: number
}

export type PlateInventory = readonly PlateStock[]

/**
 * What a commercial gym in kilos actually has on the rack.
 *
 * Exported so a settings surface can replace it: a home rack with two 20s and
 * nothing else produces very different answers, and the honest ones only come out
 * if the inventory is honest.
 */
export const DEFAULT_KG_PLATES: PlateInventory = [
  { weight: 25, perSide: 4 },
  { weight: 20, perSide: 4 },
  { weight: 15, perSide: 2 },
  { weight: 10, perSide: 2 },
  { weight: 5, perSide: 2 },
  { weight: 2.5, perSide: 2 },
  { weight: 1.25, perSide: 2 },
]

/** The same rack in pounds. */
export const DEFAULT_LB_PLATES: PlateInventory = [
  { weight: 45, perSide: 4 },
  { weight: 35, perSide: 2 },
  { weight: 25, perSide: 2 },
  { weight: 10, perSide: 2 },
  { weight: 5, perSide: 2 },
  { weight: 2.5, perSide: 2 },
]

/**
 * The bar a caller gets when it has not been told which bar is in use.
 *
 * A FALLBACK, NOT A CONSTANT. The whole point of `barWeight` being a parameter is
 * that these two numbers are wrong for an EZ-bar, a women's bar, a trap bar, and
 * a Smith machine carriage. A settings surface supplies the real one.
 */
export const DEFAULT_BAR_WEIGHT: Readonly<Record<WeightUnit, number>> = { kg: 20, lb: 45 }

/** The default rack for a unit. */
export function defaultPlateInventory(unit: WeightUnit): PlateInventory {
  return unit === 'kg' ? DEFAULT_KG_PLATES : DEFAULT_LB_PLATES
}

/* ------------------------------------------------------------------ *
 * The solve
 * ------------------------------------------------------------------ */

/** A run of identical plates on one side. */
export interface PlateStack {
  readonly weight: number
  readonly count: number
}

/**
 * How the achievable weight relates to what was asked.
 *   `exact`     — the target is loadable, difference is 0.
 *   `closest`   — it is not, and `achievableWeight` is the nearest thing that is.
 *   `below-bar` — the target is under the empty bar. Nothing to add, and the
 *                 person needs to be told the bar alone already outweighs it.
 *   `unloadable`— there is no bar and nothing to load. No number to offer.
 */
export type PlateLoadStatus = 'exact' | 'closest' | 'below-bar' | 'unloadable'

export interface PlateLoad {
  readonly status: PlateLoadStatus
  /** What was asked for, echoed back so a display never has to re-derive it. */
  readonly targetWeight: number
  /** The bar counted into `achievableWeight`. 0 when the exercise uses no bar. */
  readonly barWeight: number
  /** Plates for ONE side, heaviest first. Empty for a bar-only or unloadable result. */
  readonly platesPerSide: readonly PlateStack[]
  /** Bar plus every plate on both sides. What the person will actually lift. */
  readonly achievableWeight: number
  /** Everything on ONE side. `achievableWeight === barWeight + sides * perSideWeight`. */
  readonly perSideWeight: number
  /** `achievableWeight - targetWeight`. Negative is short of target, positive is over. */
  readonly differenceFromTarget: number
  /** How many sides were loaded — 2 for a bar or a plate-loaded machine. */
  readonly sides: number
  readonly unit: WeightUnit
}

export interface PlateSolveRequest {
  /** The working weight the session asks for, as a TOTAL. */
  readonly targetWeight: number
  /** The bar's own weight, or 0 for a plate-loaded machine with no bar. */
  readonly barWeight: number
  readonly unit: WeightUnit
  readonly inventory: PlateInventory
  /** Loaded sides. Defaults to 2 — a bar and a plate-loaded machine both have two. */
  readonly sides?: number
}

const SCALE = 100

function toHundredths(value: number): number {
  return Number.isFinite(value) ? Math.round(value * SCALE) : 0
}

function fromHundredths(value: number): number {
  return value / SCALE
}

interface Denomination {
  readonly weight: number
  readonly units: number
  readonly count: number
}

/**
 * Drops what cannot be loaded and merges duplicates, heaviest first.
 *
 * A plate of 0, a negative count, and a `NaN` that arrived from a settings field
 * are all "not a plate on the rack", and the solver should never see them.
 */
function normaliseInventory(inventory: PlateInventory): Denomination[] {
  const byUnits = new Map<number, number>()
  for (const stock of inventory) {
    const units = toHundredths(stock.weight)
    const count = Number.isFinite(stock.perSide) ? Math.floor(stock.perSide) : 0
    if (units <= 0 || count <= 0) continue
    byUnits.set(units, Math.min((byUnits.get(units) ?? 0) + count, 99))
  }
  return [...byUnits.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 40)
    .map(([units, count]) => ({ weight: fromHundredths(units), units, count }))
}

interface Candidate {
  readonly units: number
  readonly stacks: readonly PlateStack[]
  readonly plateCount: number
}

/**
 * Which of two equal-weight, equal-count breakdowns a person would rather load.
 *
 * The heavier plate first, every time: 25 + 25 + 5 is one trip to the rack with
 * the big plates, 25 + 20 + 10 is three different plates for the same 55. Both
 * are correct arithmetic; only one is how anybody loads a bar.
 */
function isHeavierRun(candidate: readonly PlateStack[], incumbent: readonly PlateStack[]): boolean {
  const left = expandRun(candidate)
  const right = expandRun(incumbent)
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index]
  }
  return false
}

function expandRun(stacks: readonly PlateStack[]): number[] {
  const plates: number[] = []
  for (const stack of stacks) {
    for (let index = 0; index < stack.count; index += 1) plates.push(stack.weight)
  }
  return plates
}

/**
 * Every per-side total the inventory can reach, up to `capUnits`.
 *
 * Keyed by the total, so the map can never be larger than the number of distinct
 * loadable weights; where two combinations reach the same total, the one using
 * fewer plates wins, because loading four 5s when a 20 is on the rack is a worse
 * answer to the same question.
 */
function reachableTotals(denominations: readonly Denomination[], capUnits: number): Map<number, Candidate> {
  let frontier = new Map<number, Candidate>([[0, { units: 0, stacks: [], plateCount: 0 }]])

  for (const denomination of denominations) {
    const next = new Map(frontier)
    for (const candidate of frontier.values()) {
      for (let taken = 1; taken <= denomination.count; taken += 1) {
        const units = candidate.units + denomination.units * taken
        if (units > capUnits) break
        const plateCount = candidate.plateCount + taken
        const stacks = [...candidate.stacks, { weight: denomination.weight, count: taken }]
        const existing = next.get(units)
        if (existing !== undefined) {
          const better =
            plateCount < existing.plateCount ||
            (plateCount === existing.plateCount && isHeavierRun(stacks, existing.stacks))
          if (!better) continue
        }
        next.set(units, { units, stacks, plateCount })
      }
    }
    frontier = next
  }

  return frontier
}

/**
 * THE solve: target in, plates per side and the weight they really make out.
 *
 * When the target is not loadable it returns the nearest loadable weight and says
 * so in `status` and `differenceFromTarget`. Ties go DOWN: asked for 61 kg with a
 * 2.5 kg jump either way, a person is better served by 60 than by 62.5, and the
 * difference is reported either way so nothing is hidden.
 */
export function solvePlateLoad(request: PlateSolveRequest): PlateLoad {
  const { unit } = request
  const requestedSides = request.sides ?? 2
  const sides = Number.isFinite(requestedSides) ? Math.max(1, Math.floor(requestedSides)) : 2
  const targetUnits = Math.max(0, toHundredths(request.targetWeight))
  const barUnits = Math.max(0, toHundredths(request.barWeight))
  const denominations = normaliseInventory(request.inventory)

  const base = {
    targetWeight: fromHundredths(targetUnits),
    barWeight: fromHundredths(barUnits),
    sides,
    unit,
  } as const

  if (barUnits > 0 && targetUnits < barUnits) {
    return {
      ...base,
      status: 'below-bar',
      platesPerSide: [],
      achievableWeight: fromHundredths(barUnits),
      perSideWeight: 0,
      differenceFromTarget: fromHundredths(barUnits - targetUnits),
    }
  }

  const inventoryUnits = denominations.reduce((sum, plate) => sum + plate.units * plate.count, 0)
  const heaviestUnits = denominations[0]?.units ?? 0
  const wantedPerSide = Math.ceil((targetUnits - barUnits) / sides)
  const capUnits = Math.max(0, Math.min(wantedPerSide + heaviestUnits, inventoryUnits))

  let best: Candidate = { units: 0, stacks: [], plateCount: 0 }
  let bestGap = Math.abs(barUnits - targetUnits)
  for (const candidate of reachableTotals(denominations, capUnits).values()) {
    const gap = Math.abs(barUnits + candidate.units * sides - targetUnits)
    const better =
      gap < bestGap ||
      (gap === bestGap && candidate.units < best.units) ||
      (gap === bestGap && candidate.units === best.units && candidate.plateCount < best.plateCount)
    if (better) {
      best = candidate
      bestGap = gap
    }
  }

  const achievableUnits = barUnits + best.units * sides
  const differenceUnits = achievableUnits - targetUnits
  const status: PlateLoadStatus =
    barUnits === 0 && best.units === 0 ? 'unloadable' : differenceUnits === 0 ? 'exact' : 'closest'

  return {
    ...base,
    status,
    platesPerSide: best.stacks,
    achievableWeight: fromHundredths(achievableUnits),
    perSideWeight: fromHundredths(best.units),
    differenceFromTarget: fromHundredths(differenceUnits),
  }
}

/* ------------------------------------------------------------------ *
 * The plan — what the catalog's load model says to show
 * ------------------------------------------------------------------ */

/** Why an exercise gets no plate breakdown. */
export type NoPlateMathReason = 'no-load' | 'not-plate-loaded'

export type LoadPlan =
  | { readonly kind: 'plates'; readonly load: PlateLoad }
  | { readonly kind: 'per-hand'; readonly weightPerHand: number; readonly unit: WeightUnit }
  | { readonly kind: 'none'; readonly reason: NoPlateMathReason; readonly unit: WeightUnit }

/** The catalog facts this module reads. Narrow, so a test needs no full Exercise. */
export type PlateMathLoadModel = Pick<LoadModel, 'basis' | 'measure' | 'usesBar' | 'plateMath'>

export interface LoadPlanRequest {
  readonly targetWeight: number
  readonly unit: WeightUnit
  readonly load: PlateMathLoadModel
  /**
   * The bar in use. Only read when `load.usesBar`; falls back to
   * `DEFAULT_BAR_WEIGHT` so a caller that has not wired settings yet still gets a
   * plausible answer rather than a bar of zero.
   */
  readonly barWeight?: number
  /** Defaults to `defaultPlateInventory(unit)`. */
  readonly inventory?: PlateInventory
}

/**
 * Reads the catalog's load model and returns what may honestly be shown.
 *
 * The order of the checks is the point. `measure` is asked about BEFORE
 * `plateMath`, because "per hand" is a fact about what the number means and has
 * to be said whether or not plates are involved; `plateMath` is asked about
 * before any arithmetic, because a pin stack has no breakdown at any target.
 */
export function planLoad(request: LoadPlanRequest): LoadPlan {
  const { unit, load } = request

  if (load.measure === 'none') return { kind: 'none', reason: 'no-load', unit }
  if (load.measure === 'per-hand') {
    return { kind: 'per-hand', weightPerHand: request.targetWeight, unit }
  }
  if (!load.plateMath) return { kind: 'none', reason: 'not-plate-loaded', unit }

  return {
    kind: 'plates',
    load: solvePlateLoad({
      targetWeight: request.targetWeight,
      barWeight: load.usesBar ? (request.barWeight ?? DEFAULT_BAR_WEIGHT[unit]) : 0,
      unit,
      inventory: request.inventory ?? defaultPlateInventory(unit),
      // A single plate held in both hands is loaded once; a bar and a plate-loaded
      // machine are both loaded symmetrically on two sides.
      sides: load.basis === 'weight-plate' ? 1 : 2,
    }),
  }
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * A weight as a person writes it: `20 kg`, `2.5 kg`, `1.25 kg` — never `20.00`.
 *
 * Lives here rather than in the component because "how many decimals does a plate
 * have" is arithmetic, and the display and the tests must agree on it exactly.
 */
export function formatWeight(value: number, unit: WeightUnit): string {
  return `${formatNumber(value)} ${unit}`
}

/** The number alone, trimmed. Plates run to two decimals at most (1.25). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Number(value.toFixed(2)))
}

/**
 * The plate run as it is read aloud at the rack: `20 + 20 + 5`.
 *
 * Repeated rather than multiplied, because a person loading a bar counts plates
 * one at a time and `20 x 2 + 5` is a sum to do while out of breath.
 */
export function formatPlateRun(platesPerSide: readonly PlateStack[]): string {
  const parts: string[] = []
  for (const stack of platesPerSide) {
    for (let index = 0; index < stack.count; index += 1) parts.push(formatNumber(stack.weight))
  }
  return parts.join(' + ')
}
