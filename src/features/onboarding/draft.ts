import { z } from 'zod'
import {
  SETTING_NAMES,
  isSettingsStorageAvailable,
  readSetting,
  removeSetting,
  writeSetting,
} from '../../core/storage/settings'
import { nowIso } from '../../core/time/clock'
import {
  bodyweightSchema,
  exercisePreferencesSchema,
  experienceSchema,
  goalsSchema,
  limitationsSchema,
  locationProfileSchema,
  restStyleSchema,
  scheduleSchema,
  techniquesSchema,
  trainingStyleSchema,
  unitsSchema,
} from '../../core/validation'
import type { OnboardingAnswers } from './answers'
import { isOnboardingStepId, type OnboardingStepId } from './steps'

/**
 * The in-progress draft.
 *
 * Setup is the one place where losing typed answers to a closed tab is likely, so
 * the answers-so-far live in localStorage until the profile is written. This is
 * exactly what the settings module is for: small, regenerable, and unimportant if
 * it vanishes. The finished profile goes to IndexedDB through the store — never
 * here.
 *
 * Two keys, one owner each: the step id uses the setting the storage module already
 * documents for it, and the answers use their own key. `saveDraft` writes both;
 * `clearDraft` removes both.
 */

/**
 * Not in `SETTING_NAMES` because that constant lives in `src/core`, which this
 * feature does not own. It follows the same `wc:`-prefixed convention.
 */
export const ONBOARDING_DRAFT_SETTING = 'onboarding-draft'

export const DRAFT_VERSION = 1

/**
 * Field-by-field reuse of the canonical schemas — this validates a partial patch,
 * not a profile, so it is deliberately not a rival profile schema. Loose objects
 * throughout, so a draft written by a later build keeps its unknown fields.
 */
const draftAnswersSchema = z.looseObject({
  goals: goalsSchema,
  experience: experienceSchema,
  trainingStyle: trainingStyleSchema,
  schedule: scheduleSchema,
  techniques: techniquesSchema,
  restStyle: restStyleSchema,
  units: unitsSchema,
  bodyweight: bodyweightSchema.nullable(),
  limitations: limitationsSchema,
  exercisePreferences: exercisePreferencesSchema,
  locations: z.array(locationProfileSchema).min(1).max(50),
  activeLocationId: z.string().min(1),
})

const draftRecordSchema = z.looseObject({
  version: z.number().int().min(1),
  savedAt: z.string().min(1),
  answers: draftAnswersSchema,
})

export interface OnboardingDraft {
  readonly stepId: OnboardingStepId
  readonly answers: OnboardingAnswers
  readonly savedAt: string
}

/** True when a draft will actually survive a closed tab. */
export function isDraftStorageAvailable(): boolean {
  return isSettingsStorageAvailable()
}

/**
 * Reads the draft back. Anything missing, corrupt, or written by a newer draft
 * format yields `null` — a half-restored setup is worse than starting the step
 * again with the stored defaults.
 *
 * BOTH halves are required. Settings' "Re-run setup" resets the flow by removing
 * the remembered step, so a step id with no matching answers — or answers with no
 * step — means there is no setup in progress.
 */
export function readDraft(): OnboardingDraft | null {
  const storedStep = readSetting<unknown>(SETTING_NAMES.onboardingStep, null)
  if (!isOnboardingStepId(storedStep)) return null

  const raw = readSetting<unknown>(ONBOARDING_DRAFT_SETTING, null)
  if (raw === null) return null

  const parsed = draftRecordSchema.safeParse(raw)
  if (!parsed.success || parsed.data.version !== DRAFT_VERSION) return null

  return {
    stepId: storedStep,
    answers: parsed.data.answers as OnboardingAnswers,
    savedAt: parsed.data.savedAt,
  }
}

/** Returns false when storage refused, so the UI can say answers will not be kept. */
export function saveDraft(stepId: OnboardingStepId, answers: OnboardingAnswers): boolean {
  const wroteAnswers = writeSetting(ONBOARDING_DRAFT_SETTING, {
    version: DRAFT_VERSION,
    savedAt: nowIso(),
    answers,
  })
  const wroteStep = writeSetting(SETTING_NAMES.onboardingStep, stepId)
  return wroteAnswers && wroteStep
}

/** Called once setup has finished or been skipped. The draft has no life after that. */
export function clearDraft(): void {
  removeSetting(ONBOARDING_DRAFT_SETTING)
  removeSetting(SETTING_NAMES.onboardingStep)
}
