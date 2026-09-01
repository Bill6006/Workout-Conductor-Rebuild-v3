export interface DayOption {
  id: string
  /** Full name — this is the accessible name, so it is what gets announced. */
  label: string
  /** Two letters, shown on the button. Kept a prefix of `label` for voice control. */
  short: string
}

/**
 * The shared week. One list, so no two screens disagree about day ids.
 * Monday-first: the training week people describe starts there.
 */
export const WEEK_DAYS: DayOption[] = [
  { id: 'mon', label: 'Monday', short: 'Mo' },
  { id: 'tue', label: 'Tuesday', short: 'Tu' },
  { id: 'wed', label: 'Wednesday', short: 'We' },
  { id: 'thu', label: 'Thursday', short: 'Th' },
  { id: 'fri', label: 'Friday', short: 'Fr' },
  { id: 'sat', label: 'Saturday', short: 'Sa' },
  { id: 'sun', label: 'Sunday', short: 'Su' },
]
