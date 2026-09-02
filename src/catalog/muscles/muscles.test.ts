import { describe, expect, it } from 'vitest'
import {
  BODY_REGIONS,
  MUSCLES,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_IDS,
  MUSCLE_IDS,
  bodyRegionSchema,
  getMuscle,
  getMuscleGroup,
  isMuscleGroupId,
  isMuscleId,
  muscleGroupIdSchema,
  muscleGroupOf,
  muscleIdSchema,
  musclesInGroup,
  regionOfMuscle,
  rollUpMuscles,
  sharesMuscleGroup,
  sortMuscleIds,
} from './muscles'

describe('the muscle vocabulary', () => {
  it('gives every id exactly once', () => {
    expect(new Set(MUSCLE_IDS).size).toBe(MUSCLE_IDS.length)
    expect(new Set(MUSCLE_GROUP_IDS).size).toBe(MUSCLE_GROUP_IDS.length)
  })

  it('lists one entry per id, in the same order', () => {
    expect(MUSCLES.map((muscle) => muscle.id)).toEqual([...MUSCLE_IDS])
    expect(MUSCLE_GROUPS.map((group) => group.id)).toEqual([...MUSCLE_GROUP_IDS])
  })

  it('writes every id in lowercase kebab-case, so a stored id is never ambiguous', () => {
    for (const id of [...MUSCLE_IDS, ...MUSCLE_GROUP_IDS]) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    }
  })

  it('exposes the same ids through its Zod enums as through its arrays', () => {
    expect(muscleIdSchema.options).toEqual([...MUSCLE_IDS])
    expect(muscleGroupIdSchema.options).toEqual([...MUSCLE_GROUP_IDS])
    expect(bodyRegionSchema.options).toEqual([...BODY_REGIONS])
  })

  it('gives every muscle a group that exists and a region that exists', () => {
    for (const muscle of MUSCLES) {
      expect(MUSCLE_GROUP_IDS).toContain(muscle.group)
      expect(BODY_REGIONS).toContain(muscle.region)
    }
    for (const group of MUSCLE_GROUPS) {
      expect(BODY_REGIONS).toContain(group.region)
    }
  })

  it('leaves no group without a muscle in it', () => {
    for (const group of MUSCLE_GROUP_IDS) {
      expect(musclesInGroup(group).length).toBeGreaterThan(0)
    }
  })
})

describe('the rollup from heads to groups', () => {
  it('takes a head to its own group', () => {
    expect(muscleGroupOf('biceps-long-head')).toBe('biceps')
    expect(muscleGroupOf('gastrocnemius')).toBe('calves')
    expect(muscleGroupOf('glute-medius-minimus')).toBe('glutes')
  })

  it('rolls several heads of one group up to a single entry', () => {
    expect(rollUpMuscles(['triceps-long-head', 'triceps-lateral-head', 'triceps-medial-head'])).toEqual([
      'triceps',
    ])
  })

  it('returns groups in canonical order, whatever order the muscles arrived in', () => {
    expect(rollUpMuscles(['soleus', 'mid-chest', 'lats'])).toEqual(['chest', 'back', 'calves'])
  })

  it('drops an id it does not recognise rather than guessing a group from the name', () => {
    expect(rollUpMuscles(['mid-chest', 'pectoralis-tertius', ''])).toEqual(['chest'])
  })

  it('takes an empty list to an empty list', () => {
    expect(rollUpMuscles([])).toEqual([])
  })

  it('reports the region the work lands in, which is not always the group’s', () => {
    // The one place the two axes disagree: a loaded hinge is trunk work, but a
    // person looks for the lower back under "back".
    expect(muscleGroupOf('lower-back')).toBe('back')
    expect(regionOfMuscle('lower-back')).toBe('core')
    expect(getMuscleGroup('back').region).toBe('upper')
  })
})

describe('the muscle lookups', () => {
  it('recognises an id it owns and refuses everything else', () => {
    expect(isMuscleId('lats')).toBe(true)
    expect(isMuscleId('back')).toBe(false)
    expect(isMuscleId('Lats')).toBe(false)
    expect(isMuscleId(7)).toBe(false)
    expect(isMuscleId(undefined)).toBe(false)

    expect(isMuscleGroupId('back')).toBe(true)
    expect(isMuscleGroupId('lats')).toBe(false)
  })

  it('throws rather than inventing an answer for an id that does not exist', () => {
    // The typed signature keeps this out of product code; a corrupt record could
    // still reach it, and a silent default would be a wrong muscle in a report.
    expect(() => getMuscle('pectoralis-tertius' as never)).toThrow(/Unknown muscle id/)
    expect(() => getMuscleGroup('thighs' as never)).toThrow(/Unknown muscle group id/)
  })

  it('sorts into canonical order and drops what it does not know', () => {
    expect(sortMuscleIds(['soleus', 'lats', 'nope', 'mid-chest'])).toEqual(['mid-chest', 'lats', 'soleus'])
    expect(sortMuscleIds([])).toEqual([])
  })

  it('answers whether two muscle lists touch the same group', () => {
    expect(sharesMuscleGroup(['biceps-long-head'], ['brachialis'])).toBe(true)
    expect(sharesMuscleGroup(['biceps-long-head'], ['soleus'])).toBe(false)
    expect(sharesMuscleGroup([], ['soleus'])).toBe(false)
    expect(sharesMuscleGroup(['nonsense'], ['soleus'])).toBe(false)
  })
})

describe('the muscle Zod enums', () => {
  it('accept a value on the list and reject one that is not', () => {
    expect(muscleIdSchema.safeParse('lats').success).toBe(true)
    expect(muscleIdSchema.safeParse('lat').success).toBe(false)
    expect(muscleGroupIdSchema.safeParse('core').success).toBe(true)
    expect(muscleGroupIdSchema.safeParse('deep-core').success).toBe(false)
    expect(bodyRegionSchema.safeParse('core').success).toBe(true)
    expect(bodyRegionSchema.safeParse('middle').success).toBe(false)
  })
})
