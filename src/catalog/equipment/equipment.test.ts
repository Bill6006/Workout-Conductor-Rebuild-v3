import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT,
  EQUIPMENT_IDS,
  defaultEquipmentFor,
  equipmentIdSchema,
  equipmentLabel,
  getEquipment,
  isConstraintOnlyEquipment,
  isEquipmentId,
  sortEquipmentIds,
} from './equipment'

describe('EQUIPMENT', () => {
  it('covers the Phase 1 seed', () => {
    expect(EQUIPMENT_IDS).toEqual([
      'barbell',
      'ez-bar',
      'dumbbells',
      'adjustable-dumbbells',
      'kettlebell',
      'flat-bench',
      'adjustable-bench',
      'squat-rack',
      'smith-machine',
      'cable-machine',
      'lat-pulldown',
      'leg-press',
      'selectorised-machines',
      'pull-up-bar',
      'dip-bars',
      'resistance-bands',
      'bodyweight-only',
    ])
  })

  it('lists one item per id, in the same order', () => {
    expect(EQUIPMENT.map((item) => item.id)).toEqual([...EQUIPMENT_IDS])
  })

  it('has a unique, kebab-case id and a non-empty label for every item', () => {
    const ids = EQUIPMENT.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of EQUIPMENT) {
      expect(item.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(typeof item.homeLikely).toBe('boolean')
    }
  })

  it('has labels short enough for a chip', () => {
    for (const item of EQUIPMENT) {
      expect(item.label.length).toBeLessThanOrEqual(24)
    }
  })

  it('marks a believable home subset', () => {
    const home = EQUIPMENT.filter((item) => item.homeLikely).map((item) => item.id)
    expect(home).toContain('dumbbells')
    expect(home).toContain('resistance-bands')
    expect(home).toContain('bodyweight-only')
    expect(home).not.toContain('leg-press')
    expect(home).not.toContain('smith-machine')
  })
})

describe('equipmentIdSchema', () => {
  it('accepts every canonical id', () => {
    for (const id of EQUIPMENT_IDS) {
      expect(equipmentIdSchema.safeParse(id).success).toBe(true)
    }
  })

  it('rejects anything not in the catalog', () => {
    expect(equipmentIdSchema.safeParse('trampoline').success).toBe(false)
    expect(equipmentIdSchema.safeParse('').success).toBe(false)
    expect(equipmentIdSchema.safeParse(3).success).toBe(false)
  })

  it('stays in step with EQUIPMENT_IDS', () => {
    expect(equipmentIdSchema.options).toEqual([...EQUIPMENT_IDS])
  })
})

describe('lookup helpers', () => {
  it('recognises ids', () => {
    expect(isEquipmentId('barbell')).toBe(true)
    expect(isEquipmentId('barbells')).toBe(false)
    expect(isEquipmentId(null)).toBe(false)
  })

  it('returns the item for a known id', () => {
    expect(getEquipment('kettlebell').label).toBe('Kettlebell')
  })

  it('falls back to the raw id rather than rendering blank', () => {
    expect(equipmentLabel('dip-bars')).toBe('Dip bars')
    expect(equipmentLabel('from-a-future-version')).toBe('from-a-future-version')
  })

  it('sorts a saved selection back into canonical order and drops strangers', () => {
    expect(sortEquipmentIds(['dumbbells', 'barbell', 'not-real'])).toEqual(['barbell', 'dumbbells'])
  })
})

describe('defaultEquipmentFor', () => {
  it('gives a gym every real piece of equipment', () => {
    expect(defaultEquipmentFor('gym')).toEqual(EQUIPMENT_IDS.filter((id) => id !== 'bodyweight-only'))
    expect(defaultEquipmentFor('gym')).toHaveLength(EQUIPMENT_IDS.length - 1)
  })

  it('never seeds a gym with the bodyweight-only constraint', () => {
    // A rack and "bodyweight only" cannot both be true of the same room, and
    // this seed is what a default setup writes straight into IndexedDB.
    const gym = defaultEquipmentFor('gym')
    expect(gym).not.toContain('bodyweight-only')
    expect(gym).toContain('squat-rack')
  })

  it('gives a home only the home-likely items', () => {
    expect(defaultEquipmentFor('home')).toEqual(
      EQUIPMENT.filter((item) => item.homeLikely).map((item) => item.id),
    )
  })

  it('gives travel a minimal kit and a custom location nothing', () => {
    expect(defaultEquipmentFor('travel')).toEqual(['resistance-bands', 'bodyweight-only'])
    expect(defaultEquipmentFor('custom')).toEqual([])
  })

  it('returns only canonical ids, in canonical order, with no duplicates, for every kind', () => {
    for (const kind of ['home', 'gym', 'travel', 'custom'] as const) {
      const seed = defaultEquipmentFor(kind)
      expect(new Set(seed).size, `${kind} has duplicates`).toBe(seed.length)
      for (const id of seed) expect(isEquipmentId(id), `${kind} seeds unknown id ${id}`).toBe(true)
      expect(seed, `${kind} is out of catalogue order`).toEqual(sortEquipmentIds(seed))
    }
  })

  it('returns a fresh array each call, so a caller cannot mutate the seed', () => {
    for (const kind of ['home', 'gym', 'travel', 'custom'] as const) {
      const first = defaultEquipmentFor(kind)
      first.push('barbell')
      expect(defaultEquipmentFor(kind)).not.toEqual(first)
    }
  })
})

describe('isConstraintOnlyEquipment', () => {
  it('names bodyweight-only and nothing else', () => {
    expect(isConstraintOnlyEquipment('bodyweight-only')).toBe(true)
    for (const id of EQUIPMENT_IDS) {
      if (id === 'bodyweight-only') continue
      expect(isConstraintOnlyEquipment(id), `${id} must be real equipment`).toBe(false)
    }
    expect(isConstraintOnlyEquipment('not-an-id')).toBe(false)
  })
})
