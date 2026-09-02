import { describe, expect, it } from 'vitest'
import {
  MOVEMENT_CHAINS,
  MOVEMENT_PATTERNS,
  MOVEMENT_PATTERN_IDS,
  MOVEMENT_PLANES,
  getMovementPattern,
  isMovementPatternId,
  movementChainSchema,
  movementPatternIdSchema,
  movementPlaneSchema,
  patternsInChain,
  patternsOverlap,
} from './movementPatterns'
import { JOINT_IDS } from '../taxonomy/joints'

describe('the movement-pattern vocabulary', () => {
  it('gives every id exactly once', () => {
    expect(new Set(MOVEMENT_PATTERN_IDS).size).toBe(MOVEMENT_PATTERN_IDS.length)
  })

  it('lists one entry per id, in the same order', () => {
    expect(MOVEMENT_PATTERNS.map((pattern) => pattern.id)).toEqual([...MOVEMENT_PATTERN_IDS])
  })

  it('writes every id in lowercase kebab-case', () => {
    for (const id of MOVEMENT_PATTERN_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    }
  })

  it('exposes the same values through its Zod enums as through its arrays', () => {
    expect(movementPatternIdSchema.options).toEqual([...MOVEMENT_PATTERN_IDS])
    expect(movementPlaneSchema.options).toEqual([...MOVEMENT_PLANES])
    expect(movementChainSchema.options).toEqual([...MOVEMENT_CHAINS])
  })

  it('gives every pattern a plane, a chain, and a joint that all exist', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(MOVEMENT_PLANES).toContain(pattern.plane)
      expect(MOVEMENT_CHAINS).toContain(pattern.chain)
      expect(JOINT_IDS).toContain(pattern.primaryJoint)
      expect(typeof pattern.compound).toBe('boolean')
    }
  })

  it('leaves no chain without a pattern in it', () => {
    for (const chain of MOVEMENT_CHAINS) {
      expect(patternsInChain(chain).length).toBeGreaterThan(0)
    }
  })

  it('keeps the arm and leg isolations apart, so a curl is not a leg curl', () => {
    // One `isolation-curl` id for both would make the duplicate-pattern check
    // read a biceps curl and a leg curl as the same movement.
    expect(getMovementPattern('isolation-curl').primaryJoint).toBe('elbow')
    expect(getMovementPattern('knee-flexion').primaryJoint).toBe('knee')
    expect(patternsOverlap('isolation-curl', 'knee-flexion')).toBe(false)
  })
})

describe('overlap between patterns', () => {
  it('names only patterns that exist', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const other of pattern.overlaps) {
        expect(MOVEMENT_PATTERN_IDS).toContain(other)
      }
    }
  })

  it('never declares a pattern as overlapping itself', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(pattern.overlaps).not.toContain(pattern.id)
    }
  })

  it('lists each overlap once', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(new Set(pattern.overlaps).size).toBe(pattern.overlaps.length)
    }
  })

  it('is symmetric — overlap is a property of the pair, not of the comparison order', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const other of pattern.overlaps) {
        expect(
          getMovementPattern(other).overlaps,
          `${other} does not declare its overlap with ${pattern.id}`,
        ).toContain(pattern.id)
      }
    }
  })

  it('holds for every pair through the public check, in both directions', () => {
    for (const a of MOVEMENT_PATTERN_IDS) {
      for (const b of MOVEMENT_PATTERN_IDS) {
        expect(patternsOverlap(a, b)).toBe(patternsOverlap(b, a))
      }
    }
  })

  it('counts identity as overlap', () => {
    expect(patternsOverlap('squat', 'squat')).toBe(true)
  })

  it('reads a declared overlap as overlap and an unrelated pair as not', () => {
    expect(patternsOverlap('horizontal-push', 'isolation-fly')).toBe(true)
    expect(patternsOverlap('squat', 'lunge')).toBe(true)
    expect(patternsOverlap('squat', 'vertical-pull')).toBe(false)
  })
})

describe('the movement-pattern lookups', () => {
  it('recognises an id it owns and refuses everything else', () => {
    expect(isMovementPatternId('hinge')).toBe(true)
    expect(isMovementPatternId('Hinge')).toBe(false)
    expect(isMovementPatternId('deadlift')).toBe(false)
    expect(isMovementPatternId(null)).toBe(false)
  })

  it('throws rather than inventing an answer for a pattern that does not exist', () => {
    expect(() => getMovementPattern('deadlift' as never)).toThrow(/Unknown movement pattern id/)
  })

  it('returns a chain’s patterns in canonical order', () => {
    expect(patternsInChain('trunk')).toEqual([
      'rotation',
      'anti-extension',
      'anti-rotation',
      'anti-lateral-flexion',
    ])
  })
})
