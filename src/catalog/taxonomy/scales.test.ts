import { describe, expect, it } from 'vitest'
import {
  DIFFICULTY_SCALE,
  GRIP_DEMAND_SCALE,
  STABILITY_DEMAND_SCALE,
  SUITABILITY_SCALE,
  TRANSITION_COST_SCALE,
  WARM_UP_SUITABILITY_SCALE,
  orderedScale,
  type OrderedScale,
} from './scales'

/** Every ordered scale the catalog ships, so a new one cannot skip these rules. */
const SCALES: readonly { name: string; scale: OrderedScale<string> }[] = [
  { name: 'Suitability', scale: SUITABILITY_SCALE },
  { name: 'GripDemand', scale: GRIP_DEMAND_SCALE },
  { name: 'StabilityDemand', scale: STABILITY_DEMAND_SCALE },
  { name: 'Difficulty', scale: DIFFICULTY_SCALE },
  { name: 'TransitionCost', scale: TRANSITION_COST_SCALE },
  { name: 'WarmUpSuitability', scale: WARM_UP_SUITABILITY_SCALE },
]

describe('every ordered scale', () => {
  it.each(SCALES)('$name exposes its order rather than leaving it to string comparison', ({ scale }) => {
    expect(scale.values.length).toBeGreaterThan(1)
    scale.values.forEach((value, index) => {
      expect(scale.rank(value)).toBe(index)
    })
  })

  it.each(SCALES)('$name lists each value once', ({ scale }) => {
    expect(new Set(scale.values).size).toBe(scale.values.length)
  })

  it.each(SCALES)('$name accepts its own values and refuses anything else', ({ scale }) => {
    for (const value of scale.values) {
      expect(scale.schema.safeParse(value).success).toBe(true)
      expect(scale.is(value)).toBe(true)
    }
    expect(scale.schema.safeParse('not-on-this-scale').success).toBe(false)
    expect(scale.is('not-on-this-scale')).toBe(false)
    expect(scale.is(3)).toBe(false)
  })

  it.each(SCALES)('$name exposes the same values through its schema as through its array', ({ scale }) => {
    expect(scale.schema.options).toEqual([...scale.values])
  })

  it.each(SCALES)('$name compares in its own order, not alphabetically', ({ scale }) => {
    const first = scale.values[0]
    const last = scale.values[scale.values.length - 1]

    expect(scale.compare(first, last)).toBeLessThan(0)
    expect(scale.compare(last, first)).toBeGreaterThan(0)
    expect(scale.compare(first, first)).toBe(0)
    expect(scale.highest(first, last)).toBe(last)
    expect(scale.lowest(first, last)).toBe(first)
    expect(scale.atLeast(last, first)).toBe(true)
    expect(scale.atLeast(first, last)).toBe(false)
    expect(scale.atMost(first, last)).toBe(true)
    expect(scale.atMost(last, first)).toBe(false)
  })

  it.each(SCALES)('$name sorts a shuffled copy back into its own order', ({ scale }) => {
    const shuffled = [...scale.values].reverse()
    expect([...shuffled].sort(scale.compare)).toEqual([...scale.values])
  })

  it.each(SCALES)('$name throws on a value it does not hold rather than ranking it 0', ({ scale }) => {
    expect(() => scale.rank('not-on-this-scale')).toThrow(/is not on this scale/)
  })
})

describe('the documented rungs', () => {
  it('reads a suitability the way the product talks about one', () => {
    expect(SUITABILITY_SCALE.values).toEqual(['unsuitable', 'limited', 'moderate', 'good', 'excellent'])
    expect(SUITABILITY_SCALE.atLeast('good', 'moderate')).toBe(true)
    expect(SUITABILITY_SCALE.atLeast('limited', 'moderate')).toBe(false)
  })

  it('puts "none" at the bottom of the grip scale, where a strapped-in machine sits', () => {
    expect(GRIP_DEMAND_SCALE.values[0]).toBe('none')
    expect(GRIP_DEMAND_SCALE.highest('none', 'high')).toBe('high')
  })

  it('matches the profile’s experience rungs on the difficulty scale', () => {
    expect(DIFFICULTY_SCALE.values).toEqual(['beginner', 'intermediate', 'advanced'])
  })

  it('orders warm-up suitability from "never" up to "general"', () => {
    expect(WARM_UP_SUITABILITY_SCALE.values).toEqual(['unsuitable', 'specific-ramp', 'general'])
    expect(WARM_UP_SUITABILITY_SCALE.atLeast('specific-ramp', 'specific-ramp')).toBe(true)
    expect(WARM_UP_SUITABILITY_SCALE.atLeast('unsuitable', 'specific-ramp')).toBe(false)
  })

  it('orders stability demand from stable up to very unstable', () => {
    expect(STABILITY_DEMAND_SCALE.values).toEqual(['low', 'moderate', 'high', 'very-high'])
  })

  it('orders transition cost from quick up to slow', () => {
    expect(TRANSITION_COST_SCALE.values).toEqual(['low', 'moderate', 'high'])
  })
})

describe('orderedScale', () => {
  it('builds a scale over any ordered list, without the caller writing a comparison', () => {
    const scale = orderedScale(['one', 'two', 'three'] as const)

    expect(scale.rank('one')).toBe(0)
    expect(scale.rank('three')).toBe(2)
    expect(scale.highest('two', 'three')).toBe('three')
    expect(scale.lowest('two', 'three')).toBe('two')
    // 'three' < 'two' alphabetically; on this scale it is above it.
    expect(scale.compare('three', 'two')).toBeGreaterThan(0)
  })

  it('holds a single-value scale without breaking', () => {
    const scale = orderedScale(['only'] as const)
    expect(scale.rank('only')).toBe(0)
    expect(scale.compare('only', 'only')).toBe(0)
    expect(scale.is('only')).toBe(true)
  })
})
