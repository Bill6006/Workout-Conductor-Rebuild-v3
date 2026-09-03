import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUP_IDS, getMuscleGroup } from '../../catalog/muscles/muscles'
import { createDefaultProfile } from '../../core/validation/schemas'
import type { Goal } from '../../core/validation/schemas'
import {
  BASE_WEEKLY_BANDS,
  EXPERIENCE_VOLUME_MULTIPLIER,
  GOAL_BIASES,
  MAX_SETS_PER_GROUP_PER_SESSION,
  STYLE_VOLUME_MULTIPLIER,
  goalEmphasisFor,
  planTargetsFrom,
  resolveVolumeTargets,
  volumeTargetsFromProfile,
} from './targets'

const BASE = {
  goals: { primary: 'build-muscle' as Goal, secondary: null },
  trainingStyle: 'hybrid' as const,
  experience: 'intermediate' as const,
  sessionsPerWeek: 4,
}

const targetsFor = (goals: { primary: Goal; secondary: Goal | null }) =>
  resolveVolumeTargets({ ...BASE, goals })

describe('the base bands', () => {
  it('cover every group, and never run backwards', () => {
    for (const group of MUSCLE_GROUP_IDS) {
      const band = BASE_WEEKLY_BANDS[group]
      expect(band.minSets).toBeLessThanOrEqual(band.targetSets)
      expect(band.targetSets).toBeLessThanOrEqual(band.maxSets)
    }
  })

  it('give an indirectly-trained group a floor of zero, so nothing prescribes wrist work', () => {
    for (const group of MUSCLE_GROUP_IDS) {
      if (getMuscleGroup(group).indirectlyTrained) expect(BASE_WEEKLY_BANDS[group].minSets).toBe(0)
    }
  })

  it('are what build-muscle resolves to, unchanged', () => {
    const targets = targetsFor({ primary: 'build-muscle', secondary: null })
    for (const group of MUSCLE_GROUP_IDS) {
      expect(targets.for(group).targetSets).toBe(BASE_WEEKLY_BANDS[group].targetSets)
      expect(targets.for(group).emphasised).toBe(false)
      expect(targets.for(group).multiplier).toBe(1)
    }
  })

  it('resolve every group, in canonical order', () => {
    expect(targetsFor(BASE.goals).byGroup.map((row) => row.group)).toEqual([...MUSCLE_GROUP_IDS])
  })
})

describe('goal bias', () => {
  const base = targetsFor({ primary: 'build-muscle', secondary: null })

  it('visibly raises arm volume for bigger-arms', () => {
    const arms = targetsFor({ primary: 'bigger-arms', secondary: null })
    expect(arms.for('biceps').targetSets).toBeGreaterThan(base.for('biceps').targetSets)
    expect(arms.for('triceps').targetSets).toBeGreaterThan(base.for('triceps').targetSets)
    expect(arms.for('biceps').emphasised).toBe(true)
  })

  it('does not starve anything else to pay for the arms', () => {
    const arms = targetsFor({ primary: 'bigger-arms', secondary: null })
    for (const group of MUSCLE_GROUP_IDS) {
      expect(arms.for(group).targetSets).toBeGreaterThanOrEqual(base.for(group).targetSets)
    }
    expect(arms.totalTargetSets).toBeGreaterThan(base.totalTargetSets)
  })

  it('raises the chest for bigger-chest, and the muscles that press with it', () => {
    const chest = targetsFor({ primary: 'bigger-chest', secondary: null })
    expect(chest.for('chest').targetSets).toBeGreaterThan(base.for('chest').targetSets)
    expect(chest.for('triceps').targetSets).toBeGreaterThanOrEqual(base.for('triceps').targetSets)
    expect(chest.for('biceps').targetSets).toBe(base.for('biceps').targetSets)
  })

  it('spends a strength budget on the big lifts rather than on the arms', () => {
    const strong = targetsFor({ primary: 'get-stronger', secondary: null })
    expect(strong.for('biceps').targetSets).toBeLessThan(base.for('biceps').targetSets)
    expect(strong.for('quads').targetSets).toBeGreaterThanOrEqual(base.for('quads').targetSets)
  })

  it('lowers the whole bar for stay-consistent, because the goal is turning up', () => {
    const easy = targetsFor({ primary: 'stay-consistent', secondary: null })
    expect(easy.totalTargetSets).toBeLessThan(base.totalTargetSets)
  })

  it('raises the floors for balanced-development without raising any target', () => {
    const balanced = targetsFor({ primary: 'balanced-development', secondary: null })
    expect(balanced.for('core').minSets).toBeGreaterThan(base.for('core').minSets)
    for (const group of MUSCLE_GROUP_IDS) {
      expect(balanced.for(group).targetSets).toBe(base.for(group).targetSets)
    }
  })

  it('leaves an indirectly-trained group with a zero floor even under balance', () => {
    const balanced = targetsFor({ primary: 'balanced-development', secondary: null })
    expect(balanced.for('forearms').minSets).toBe(0)
  })

  it('gives a secondary goal half the pull of a primary one', () => {
    const primaryArms = targetsFor({ primary: 'bigger-arms', secondary: null })
    const secondaryArms = targetsFor({ primary: 'build-muscle', secondary: 'bigger-arms' })
    expect(secondaryArms.for('biceps').targetSets).toBeGreaterThan(base.for('biceps').targetSets)
    expect(secondaryArms.for('biceps').targetSets).toBeLessThan(primaryArms.for('biceps').targetSets)
  })

  it('never runs a band backwards, for any goal pairing', () => {
    for (const primary of Object.keys(GOAL_BIASES) as Goal[]) {
      for (const secondary of [null, ...(Object.keys(GOAL_BIASES) as Goal[])]) {
        const targets = targetsFor({ primary, secondary })
        for (const row of targets.byGroup) {
          expect(row.minSets).toBeLessThanOrEqual(row.targetSets)
          expect(row.targetSets).toBeLessThanOrEqual(row.maxSets)
          expect(Number.isInteger(row.targetSets)).toBe(true)
        }
      }
    }
  })
})

describe('style and experience', () => {
  it('trades sets for load under a strength style', () => {
    const strength = resolveVolumeTargets({ ...BASE, trainingStyle: 'strength' })
    const hypertrophy = resolveVolumeTargets({ ...BASE, trainingStyle: 'hypertrophy' })
    expect(strength.totalTargetSets).toBeLessThan(hypertrophy.totalTargetSets)
    expect(STYLE_VOLUME_MULTIPLIER.strength).toBeLessThan(STYLE_VOLUME_MULTIPLIER.hypertrophy)
  })

  it('gives a beginner less and an advanced lifter more', () => {
    const beginner = resolveVolumeTargets({ ...BASE, experience: 'beginner' })
    const advanced = resolveVolumeTargets({ ...BASE, experience: 'advanced' })
    expect(beginner.totalTargetSets).toBeLessThan(advanced.totalTargetSets)
    expect(EXPERIENCE_VOLUME_MULTIPLIER.beginner).toBeLessThan(1)
  })

  it('treats a missing experience as intermediate', () => {
    const stated = resolveVolumeTargets({ ...BASE, experience: 'intermediate' })
    const omitted = resolveVolumeTargets({
      goals: BASE.goals,
      trainingStyle: BASE.trainingStyle,
      sessionsPerWeek: BASE.sessionsPerWeek,
    })
    expect(omitted.totalTargetSets).toBe(stated.totalTargetSets)
  })
})

describe('reachability', () => {
  it('never sets a target the week could not physically deliver', () => {
    const once = resolveVolumeTargets({ ...BASE, sessionsPerWeek: 1, experience: 'advanced' })
    for (const row of once.byGroup) {
      expect(row.targetSets).toBeLessThanOrEqual(MAX_SETS_PER_GROUP_PER_SESSION)
    }
  })

  it('treats a nonsense session count as one session rather than dividing by zero', () => {
    const targets = resolveVolumeTargets({ ...BASE, sessionsPerWeek: 0 })
    expect(targets.for('back').targetSets).toBeLessThanOrEqual(MAX_SETS_PER_GROUP_PER_SESSION)
    expect(targets.for('back').targetSets).toBeGreaterThan(0)
  })
})

describe('a weekly plan', () => {
  it('wins over the inferred band, and says so', () => {
    const targets = resolveVolumeTargets({ ...BASE, planTargets: { chest: 21 } })
    expect(targets.for('chest').targetSets).toBe(21)
    expect(targets.for('chest').fromPlan).toBe(true)
    expect(targets.for('back').fromPlan).toBe(false)
  })

  it('keeps the band consistent around a plan target above the base ceiling', () => {
    const targets = resolveVolumeTargets({ ...BASE, planTargets: { chest: 30 } })
    expect(targets.for('chest').maxSets).toBeGreaterThanOrEqual(30)
    expect(targets.for('chest').minSets).toBeLessThanOrEqual(30)
  })

  it('reads only the groups it recognises out of a raw record', () => {
    expect(planTargetsFrom({ chest: 12, nonsense: 4 })).toEqual({ chest: 12 })
  })
})

describe('goal emphasis for ranking', () => {
  it('sits at no-opinion for a goal with no emphasis', () => {
    for (const group of MUSCLE_GROUP_IDS) {
      expect(goalEmphasisFor(group, { primary: 'build-muscle', secondary: null })).toBe(0.5)
    }
  })

  it('rises for the group a goal is about and stays put for the others', () => {
    const goals = { primary: 'bigger-arms' as Goal, secondary: null }
    expect(goalEmphasisFor('biceps', goals)).toBeGreaterThan(0.5)
    expect(goalEmphasisFor('quads', goals)).toBe(0.5)
  })

  it('reads the same table the bands do, so a group cannot be emphasised in one and not the other', () => {
    const goals = { primary: 'bigger-chest' as Goal, secondary: null }
    const targets = targetsFor(goals)
    for (const group of MUSCLE_GROUP_IDS) {
      const raised = targets.for(group).targetSets > BASE_WEEKLY_BANDS[group].targetSets
      if (raised) expect(goalEmphasisFor(group, goals)).toBeGreaterThan(0.5)
    }
  })
})

describe('reading a profile', () => {
  it('takes goals, style, experience and schedule off it', () => {
    const profile = createDefaultProfile('2026-09-02T08:00:00.000Z')
    const fromProfile = volumeTargetsFromProfile(profile)
    const direct = resolveVolumeTargets({
      goals: { primary: profile.goals.primary, secondary: profile.goals.secondary },
      trainingStyle: profile.trainingStyle,
      experience: profile.experience,
      sessionsPerWeek: profile.schedule.sessionsPerWeek,
    })
    expect(fromProfile.byGroup).toEqual(direct.byGroup)
  })
})
