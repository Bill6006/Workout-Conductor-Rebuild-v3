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
