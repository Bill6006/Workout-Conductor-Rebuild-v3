import { describe, expect, it } from 'vitest'
import {
  JOINT_IDS,
  JOINT_STRESS_TAG_IDS,
  STRESS_INTENSITIES,
  STRESS_WEIGHTS,
  jointIdSchema,
  jointStressLoad,
  jointStressTagIdSchema,
  jointStressTagSchema,
  stressIntensitySchema,
  stressRank,
  tagForJoint,
  type JointStressTag,
} from './joints'

describe('the joint vocabulary', () => {
  it('gives every id exactly once, in lowercase kebab-case', () => {
    expect(new Set(JOINT_IDS).size).toBe(JOINT_IDS.length)
    expect(new Set(JOINT_STRESS_TAG_IDS).size).toBe(JOINT_STRESS_TAG_IDS.length)
    for (const id of JOINT_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    }
  })

  it('keeps the taggable joints a subset of the joints, so the two cannot drift', () => {
    for (const id of JOINT_STRESS_TAG_IDS) {
      expect(JOINT_IDS).toContain(id)
    }
  })

  it('omits the ankle from the taggable joints, because nothing reads an ankle tag', () => {
    expect(JOINT_IDS).toContain('ankle')
    expect(JOINT_STRESS_TAG_IDS).not.toContain('ankle')
    expect(JOINT_STRESS_TAG_IDS.length).toBe(JOINT_IDS.length - 1)
  })

  it('exposes the same values through its Zod enums as through its arrays', () => {
    expect(jointIdSchema.options).toEqual([...JOINT_IDS])
    expect(jointStressTagIdSchema.options).toEqual([...JOINT_STRESS_TAG_IDS])
    expect(stressIntensitySchema.options).toEqual([...STRESS_INTENSITIES])
  })
})

describe('stress intensity', () => {
  it('is ordered low to high, and exposes the order', () => {
    expect(STRESS_INTENSITIES).toEqual(['low', 'moderate', 'high'])
    expect(stressRank('low')).toBe(0)
    expect(stressRank('moderate')).toBe(1)
    expect(stressRank('high')).toBe(2)
  })

  it('doubles at every rung, so a total rises with how heavy the work is', () => {
    for (const intensity of STRESS_INTENSITIES) {
      expect(STRESS_WEIGHTS[intensity]).toBeGreaterThan(0)
    }
    expect(STRESS_WEIGHTS.moderate).toBe(STRESS_WEIGHTS.low * 2)
    expect(STRESS_WEIGHTS.high).toBe(STRESS_WEIGHTS.moderate * 2)
  })

  it('rises with the intensity rung, so a heavier tag never scores lower', () => {
    const ascending = STRESS_INTENSITIES.map((intensity) => STRESS_WEIGHTS[intensity])
    expect([...ascending].sort((a, b) => a - b)).toEqual(ascending)
  })
})

describe('the joint stress tag schema', () => {
  it('takes a joint and an intensity, and nothing else', () => {
    expect(jointStressTagSchema.safeParse({ joint: 'knee', intensity: 'high' }).success).toBe(true)
    expect(jointStressTagSchema.safeParse({ joint: 'ankle', intensity: 'high' }).success).toBe(false)
    expect(jointStressTagSchema.safeParse({ joint: 'knee', intensity: 'extreme' }).success).toBe(false)
    expect(jointStressTagSchema.safeParse({ joint: 'knee' }).success).toBe(false)
    expect(jointStressTagSchema.safeParse({ intensity: 'high' }).success).toBe(false)
    expect(
      jointStressTagSchema.safeParse({ joint: 'knee', intensity: 'high', because: 'deep bend' }).success,
    ).toBe(false)
  })
})

describe('accumulating stress through a joint', () => {
  const tags: JointStressTag[] = [
    { joint: 'knee', intensity: 'high' },
    { joint: 'lower-back', intensity: 'moderate' },
  ]

  it('adds only the tags for the joint asked about', () => {
    expect(jointStressLoad(tags, 'knee')).toBe(STRESS_WEIGHTS.high)
    expect(jointStressLoad(tags, 'lower-back')).toBe(STRESS_WEIGHTS.moderate)
  })

  it('reports nothing through a joint no tag names', () => {
    expect(jointStressLoad(tags, 'shoulder')).toBe(0)
    expect(jointStressLoad([], 'knee')).toBe(0)
  })

  it('sums across the tags a whole session brings, which is the point of the weights', () => {
    const session: JointStressTag[] = [
      { joint: 'lower-back', intensity: 'high' },
      { joint: 'lower-back', intensity: 'moderate' },
      { joint: 'lower-back', intensity: 'moderate' },
    ]
    expect(jointStressLoad(session, 'lower-back')).toBe(STRESS_WEIGHTS.high + STRESS_WEIGHTS.moderate * 2)
  })

  it('finds the tag for a joint, and says null rather than guessing when there is none', () => {
    expect(tagForJoint(tags, 'knee')).toEqual({ joint: 'knee', intensity: 'high' })
    expect(tagForJoint(tags, 'wrist')).toBeNull()
    expect(tagForJoint([], 'wrist')).toBeNull()
  })
})
