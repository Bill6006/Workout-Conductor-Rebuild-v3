import { nowIso } from '../../core/time/clock'
import type { ProfilePatch } from '../../core/state'
import {
  createDefaultProfile,
  type Bodyweight,
  type Experience,
  type LocationProfile,
  type Profile,
  type RestStyle,
  type TrainingStyle,
  type Units,
} from '../../core/validation'

/**
 * The answers setup collects — every profile field a person can set, and nothing
 * else. `schemaVersion`, `id`, `createdAt`, `updatedAt`, and `onboardingCompletedAt`
 * belong to the store, so they are deliberately absent.
 *
 * This is NOT a second profile schema. It is the shape of a patch in progress: it
 * is built from an existing profile, and it is applied back through
 * `updateProfile()`, which spreads it onto the stored record. Fields this build has
 * never heard of survive that round trip untouched.
 */
export interface OnboardingAnswers {
  goals: Profile['goals']
  experience: Experience
  trainingStyle: TrainingStyle
  schedule: Profile['schedule']
  techniques: Profile['techniques']
  restStyle: RestStyle
  units: Units
  bodyweight: Bodyweight | null
  limitations: Profile['limitations']
  exercisePreferences: Profile['exercisePreferences']
  locations: LocationProfile[]
  activeLocationId: string
}

/**
 * Copies the editable fields out of a profile. Every group and array is cloned so
 * that editing a draft never mutates the record held by the store, and spreads
 * rather than lists keys, so unknown fields on a group ride along.
 */
export function answersFromProfile(profile: Profile): OnboardingAnswers {
  return {
    goals: { ...profile.goals },
    experience: profile.experience,
    trainingStyle: profile.trainingStyle,
    schedule: { ...profile.schedule, availableDays: [...profile.schedule.availableDays] },
    techniques: { ...profile.techniques },
    restStyle: profile.restStyle,
    units: profile.units,
    bodyweight: profile.bodyweight ? { ...profile.bodyweight } : null,
    limitations: { ...profile.limitations },
    exercisePreferences: {
      preferred: {
        ...profile.exercisePreferences.preferred,
        exerciseIds: [...profile.exercisePreferences.preferred.exerciseIds],
        freeText: [...profile.exercisePreferences.preferred.freeText],
      },
      disliked: {
        ...profile.exercisePreferences.disliked,
        exerciseIds: [...profile.exercisePreferences.disliked.exerciseIds],
        freeText: [...profile.exercisePreferences.disliked.freeText],
      },
    },
    locations: profile.locations.map((location) => ({ ...location, equipment: [...location.equipment] })),
    activeLocationId: profile.activeLocationId,
  }
}

/** The documented Phase 1 defaults, as setup's starting point. */
export function createDefaultAnswers(now: string = nowIso()): OnboardingAnswers {
  return answersFromProfile(createDefaultProfile(now))
}

/**
 * The patch `updateProfile()` receives. `activeLocationId` travels with
 * `locations` in the same call, because a profile whose active id names no saved
 * location is rejected by validation.
 */
export function answersToPatch(answers: OnboardingAnswers): ProfilePatch {
  return {
    goals: answers.goals,
    experience: answers.experience,
    trainingStyle: answers.trainingStyle,
    schedule: answers.schedule,
    techniques: answers.techniques,
    restStyle: answers.restStyle,
    units: answers.units,
    bodyweight: answers.bodyweight,
    limitations: answers.limitations,
    exercisePreferences: answers.exercisePreferences,
    locations: answers.locations,
    activeLocationId: answers.activeLocationId,
  }
}
