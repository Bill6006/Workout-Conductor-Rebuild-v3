import { describe, expect, it } from 'vitest'
import { createLocation } from '../../core/validation'
import { createDefaultAnswers } from './answers'
import { ONBOARDING_STEPS, issueFor, stepIndex, stepsForMode, validateStep } from './steps'

const NOW = '2026-09-01T09:00:00.000Z'

describe('the step list', () => {
  it('runs welcome first and review last', () => {
    expect(ONBOARDING_STEPS[0].id).toBe('welcome')
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].id).toBe('review')
  })

  it('gives every step a unique id and a heading', () => {
    const ids = ONBOARDING_STEPS.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const step of ONBOARDING_STEPS) {
      expect(step.heading.length).toBeGreaterThan(0)
      expect(step.name.length).toBeGreaterThan(0)
    }
  })

  it('drops the welcome step on a re-run', () => {
    const rerun = stepsForMode('rerun')
    expect(rerun.map((step) => step.id)).not.toContain('welcome')
    expect(rerun).toHaveLength(ONBOARDING_STEPS.length - 1)
    expect(stepsForMode('first-run')).toHaveLength(ONBOARDING_STEPS.length)
  })

  /**
   * The welcome card promises "Six short questions" in so many words, and the
   * count was wrong once already (it said seven while the flow asked six, and
   * then listed six topics on the next line). Nothing can make prose count
   * itself, so this is the guard: if a question step is ever added or removed,
   * this fails and names the copy that has to move with it.
   */
  it('asks six questions, which is the number the welcome card promises', () => {
    const questions = ONBOARDING_STEPS.filter((step) => step.id !== 'welcome' && step.id !== 'review')

    expect(questions.map((step) => step.id)).toEqual([
      'goals',
      'experience',
      'schedule',
      'locations',
      'training',
      'limits',
    ])
    expect(questions).toHaveLength(6)
  })

  it('falls back to the first step when an id is not in the list', () => {
    expect(stepIndex(stepsForMode('rerun'), 'welcome')).toBe(0)
    expect(stepIndex(stepsForMode('first-run'), 'schedule')).toBe(3)
  })
})

describe('validateStep', () => {
  it('lets the documented defaults through every step', () => {
    const answers = createDefaultAnswers(NOW)
    for (const step of ONBOARDING_STEPS) {
      expect(validateStep(step.id, answers)).toEqual([])
    }
  })

  it('blocks a week with no training days', () => {
    const answers = createDefaultAnswers(NOW)
    answers.schedule = { ...answers.schedule, availableDays: [] }

    const issues = validateStep('schedule', answers)
    expect(issueFor(issues, 'schedule.availableDays')).toBe('Pick at least one day you can train.')
  })

  it('blocks a place with no name', () => {
    const answers = createDefaultAnswers(NOW)
    answers.locations = [{ ...answers.locations[0], name: '   ' }]
    answers.activeLocationId = answers.locations[0].id

    expect(issueFor(validateStep('locations', answers), `locations.${answers.locations[0].id}.name`)).toBe(
      'Give this place a name.',
    )
  })

  it('blocks two places that share a name', () => {
    const answers = createDefaultAnswers(NOW)
    answers.locations = [createLocation('gym', 'Gym'), createLocation('home', 'gym ')]
    answers.activeLocationId = answers.locations[0].id

    expect(issueFor(validateStep('locations', answers), 'locations')).toMatch(/share a name/)
  })

  it('blocks an active location that no longer exists', () => {
    const answers = createDefaultAnswers(NOW)
    answers.activeLocationId = 'loc-deleted'

    expect(issueFor(validateStep('locations', answers), 'activeLocationId')).toMatch(/train at most/)
  })

  it('has nothing to say about steps whose answers all have defaults', () => {
    const answers = createDefaultAnswers(NOW)
    for (const id of ['welcome', 'goals', 'experience', 'training', 'limits', 'review'] as const) {
      expect(validateStep(id, answers)).toEqual([])
    }
  })
})
