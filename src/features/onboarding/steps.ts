import type { OnboardingAnswers } from './answers'

/**
 * The step order: one subject per step, so a person is never asked about their
 * week and their equipment in the same breath.
 *
 * It does NOT mean every step fits a phone screen — the comment here used to
 * claim that, and it was not true. Measured in the built app at 360x800, in
 * Chromium, on the documented defaults:
 *
 *   welcome     800px  fits
 *   goals      1482px  scrolls (seven main goals, then seven optional second ones)
 *   experience  977px  scrolls
 *   schedule    800px  fits
 *   locations  2492px  scrolls (two places, each with a name, a type and 20 chips)
 *   training   1095px  scrolls
 *   limits     1336px  scrolls
 *   review     1889px  scrolls (it is a summary of all six answers)
 *
 * Six of the eight scroll, and the long ones are long because of how many
 * options the answer genuinely has — shortening them would mean taking choices
 * away, which is a product decision and not a layout tidy-up. What the flow
 * does promise instead is that scrolling never hides the way forward: the
 * action dock is sticky, so "Continue" is on screen at every scroll position.
 */
export type OnboardingStepId =
  'welcome' | 'goals' | 'experience' | 'schedule' | 'locations' | 'training' | 'limits' | 'review'

export interface OnboardingStepDef {
  readonly id: OnboardingStepId
  /** The step's `h1`. Exactly one of these is on screen at a time. */
  readonly heading: string
  /** Short name shown beside "Step 3 of 8". */
  readonly name: string
  readonly subtitle?: string
}

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  {
    id: 'welcome',
    heading: 'Set up Workout Conductor',
    name: 'Welcome',
    subtitle: 'A few short questions. Everything you enter stays on this device.',
  },
  {
    id: 'goals',
    heading: 'What are you training for?',
    name: 'Goals',
    subtitle: 'Pick the one that matters most. You can add a second.',
  },
  {
    id: 'experience',
    heading: 'How you train',
    name: 'Experience',
    subtitle: 'Your experience and the style you lean towards.',
  },
  {
    id: 'schedule',
    heading: 'Your training week',
    name: 'Schedule',
    subtitle: 'How often you train, for how long, and on which days.',
  },
  {
    id: 'locations',
    heading: 'Where you train',
    name: 'Places',
    subtitle: 'Add each place you train and the equipment it has.',
  },
  {
    id: 'training',
    heading: 'Techniques and rest',
    name: 'Training',
    subtitle: 'Which techniques you are happy with, and how you measure things.',
  },
  {
    id: 'limits',
    heading: 'Limits and preferences',
    name: 'Limits',
    subtitle: 'Anything to work around, and exercises you like or would rather skip.',
  },
  {
    id: 'review',
    heading: 'Check your answers',
    name: 'Review',
    subtitle: 'Edit anything that is not right, then finish.',
  },
]

export type OnboardingMode = 'first-run' | 'rerun'

/**
 * A re-run from Settings skips the welcome step: the person already knows what
 * the app is, and re-reading the intro to change one answer is friction.
 */
export function stepsForMode(mode: OnboardingMode): readonly OnboardingStepDef[] {
  return mode === 'rerun' ? ONBOARDING_STEPS.filter((step) => step.id !== 'welcome') : ONBOARDING_STEPS
}

const STEP_IDS = new Set<string>(ONBOARDING_STEPS.map((step) => step.id))

export function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return typeof value === 'string' && STEP_IDS.has(value)
}

/** Index of a step within a mode's list, or `0` when it is not part of that list. */
export function stepIndex(steps: readonly OnboardingStepDef[], id: OnboardingStepId): number {
  const index = steps.findIndex((step) => step.id === id)
  return index < 0 ? 0 : index
}

/** A blocking problem, tied to the field that can fix it. */
export interface StepIssue {
  readonly field: string
  readonly message: string
}

export function issueFor(issues: readonly StepIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message
}

/** What every step body receives. `issues` is empty until forward is attempted. */
export interface StepBodyProps {
  answers: OnboardingAnswers
  onChange: (patch: Partial<OnboardingAnswers>) => void
  issues: readonly StepIssue[]
}

export const MAX_LOCATIONS = 8
export const MAX_LOCATION_NAME = 60

/**
 * What must be answered before a step will let go. Kept small on purpose — a
 * setup flow that argues with people gets abandoned. Everything else has a
 * sensible default already selected.
 */
export function validateStep(id: OnboardingStepId, answers: OnboardingAnswers): StepIssue[] {
  const issues: StepIssue[] = []

  if (id === 'schedule' && answers.schedule.availableDays.length === 0) {
    issues.push({
      field: 'schedule.availableDays',
      message: 'Pick at least one day you can train.',
    })
  }

  if (id === 'locations') {
    if (answers.locations.length === 0) {
      issues.push({ field: 'locations', message: 'Add at least one place you train.' })
    }

    for (const location of answers.locations) {
      const name = location.name.trim()
      if (name === '') {
        issues.push({ field: `locations.${location.id}.name`, message: 'Give this place a name.' })
      } else if (name.length > MAX_LOCATION_NAME) {
        issues.push({
          field: `locations.${location.id}.name`,
          message: `Keep the name under ${MAX_LOCATION_NAME} characters.`,
        })
      }
    }

    const names = answers.locations.map((location) => location.name.trim().toLowerCase())
    const duplicate = names.find((name, index) => name !== '' && names.indexOf(name) !== index)
    if (duplicate) {
      issues.push({ field: 'locations', message: 'Two places share a name. Make them different.' })
    }

    if (!answers.locations.some((location) => location.id === answers.activeLocationId)) {
      issues.push({ field: 'activeLocationId', message: 'Choose which place you train at most.' })
    }
  }

  return issues
}
