import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SETTING_NAMES, readSetting, writeSetting } from '../../core/storage/settings'
import { setClock, fixedClock } from '../../core/time/clock'
import { createDefaultAnswers } from './answers'
import { DRAFT_VERSION, ONBOARDING_DRAFT_SETTING, clearDraft, readDraft, saveDraft } from './draft'

const NOW = '2026-09-01T09:00:00.000Z'

beforeEach(() => {
  localStorage.clear()
  setClock(fixedClock(NOW))
})

afterEach(() => {
  setClock(null)
  localStorage.clear()
})

describe('the onboarding draft', () => {
  it('round-trips answers and the step the person reached', () => {
    const answers = createDefaultAnswers(NOW)
    answers.goals = { primary: 'get-stronger', secondary: 'bigger-arms' }

    expect(saveDraft('schedule', answers)).toBe(true)

    const restored = readDraft()
    expect(restored?.stepId).toBe('schedule')
    expect(restored?.answers.goals).toEqual({ primary: 'get-stronger', secondary: 'bigger-arms' })
    expect(restored?.savedAt).toBe(NOW)
  })

  it('writes under the wc: namespace only', () => {
    saveDraft('goals', createDefaultAnswers(NOW))

    const keys = Object.keys(localStorage)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key.startsWith('wc:')).toBe(true)
    expect(localStorage.getItem(`wc:${ONBOARDING_DRAFT_SETTING}`)).not.toBeNull()
  })

  it('reads nothing when there is nothing saved', () => {
    expect(readDraft()).toBeNull()
  })

  it('needs both halves — answers alone are not a setup in progress', () => {
    saveDraft('limits', createDefaultAnswers(NOW))
    // This is exactly what Settings' "Re-run setup" fallback does.
    localStorage.removeItem(`wc:${SETTING_NAMES.onboardingStep}`)

    expect(readDraft()).toBeNull()
  })

  it('ignores a step id it does not recognise', () => {
    saveDraft('goals', createDefaultAnswers(NOW))
    writeSetting(SETTING_NAMES.onboardingStep, 'nutrition')

    expect(readDraft()).toBeNull()
  })

  it('rejects a corrupt record rather than half-restoring it', () => {
    writeSetting(SETTING_NAMES.onboardingStep, 'goals')
    writeSetting(ONBOARDING_DRAFT_SETTING, {
      version: DRAFT_VERSION,
      savedAt: NOW,
      answers: { goals: { primary: 'become-a-wizard', secondary: null } },
    })

    expect(readDraft()).toBeNull()
  })

  it('rejects a record written by a newer draft format', () => {
    saveDraft('goals', createDefaultAnswers(NOW))
    const stored = readSetting<{ version: number }>(ONBOARDING_DRAFT_SETTING, { version: 0 })
    writeSetting(ONBOARDING_DRAFT_SETTING, { ...stored, version: DRAFT_VERSION + 1 })

    expect(readDraft()).toBeNull()
  })

  it('keeps unknown fields a later build may have written', () => {
    const answers = createDefaultAnswers(NOW)
    writeSetting(SETTING_NAMES.onboardingStep, 'goals')
    writeSetting(ONBOARDING_DRAFT_SETTING, {
      version: DRAFT_VERSION,
      savedAt: NOW,
      answers: { ...answers, goals: { ...answers.goals, tertiary: 'mobility' } },
    })

    const restored = readDraft()
    expect(restored).not.toBeNull()
    expect((restored?.answers.goals as Record<string, unknown>).tertiary).toBe('mobility')
  })

  it('removes both keys when setup is done with', () => {
    saveDraft('review', createDefaultAnswers(NOW))
    clearDraft()

    expect(readDraft()).toBeNull()
    expect(localStorage.getItem(`wc:${ONBOARDING_DRAFT_SETTING}`)).toBeNull()
    expect(localStorage.getItem(`wc:${SETTING_NAMES.onboardingStep}`)).toBeNull()
  })
})
