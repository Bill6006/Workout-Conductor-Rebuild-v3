/** The five Phase 0 tabs, as hash routes plus the heading each one renders. */
export const ROUTES = [
  { tab: 'Today', hash: '#/', heading: 'Today' },
  { tab: 'Workout', hash: '#/workout', heading: 'Workout' },
  { tab: 'Progress', hash: '#/progress', heading: 'Progress' },
  { tab: 'Plan', hash: '#/plan', heading: 'Plan' },
  { tab: 'Settings', hash: '#/settings', heading: 'Settings' },
] as const

/** Widths that matter on Android: small, common, large, and phablet. */
export const MOBILE_WIDTHS = [360, 375, 412, 430] as const

/**
 * 150% browser zoom on a 360px handset leaves this many CSS pixels of layout
 * width. It is the tightest case the app has to survive.
 */
export const NARROW_WIDTH = 240

/**
 * Setup is not a tab — the gate owns it, and it is only reachable while a device
 * has not finished it.
 */
export const SETUP_ROUTE = { hash: '#/onboarding', heading: 'Set up Workout Conductor' } as const

/**
 * Every step of a first run, in order, with the `h1` it renders and the label on
 * the control that moves forward from it.
 */
export const SETUP_STEPS = [
  { name: 'Welcome', heading: 'Set up Workout Conductor', forward: 'Start setup' },
  { name: 'Goals', heading: 'What are you training for?', forward: 'Continue' },
  { name: 'Experience', heading: 'How you train', forward: 'Continue' },
  { name: 'Schedule', heading: 'Your training week', forward: 'Continue' },
  { name: 'Places', heading: 'Where you train', forward: 'Continue' },
  { name: 'Training', heading: 'Techniques and rest', forward: 'Continue' },
  { name: 'Limits', heading: 'Limits and preferences', forward: 'Continue' },
  { name: 'Review', heading: 'Check your answers', forward: 'Finish setup' },
] as const

export type SetupStepIndex = number
