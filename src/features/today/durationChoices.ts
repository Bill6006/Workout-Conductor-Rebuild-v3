import type { DurationChoice } from '../../core/validation/workoutSchema'

/**
 * The four lengths the one control offers, mirrored here rather than imported
 * from the schema module.
 *
 * `DurationControl` is on the landing route, and importing the value from
 * `workoutSchema` would put the whole Zod workout model on the boot chunk for
 * the sake of four constants. `DurationControl.test.tsx` asserts this list is
 * exactly `DURATION_CHOICES`, so the two cannot drift apart.
 *
 * It lives in its own module so the component file exports only a component,
 * which is what React Fast Refresh needs.
 */
export const CONTROL_CHOICES: readonly DurationChoice[] = [15, 30, 45, 'default']
