import { describe, expect, it } from 'vitest'
import { DURATION_CHOICES } from '../../core/validation/workoutSchema'
import { CONTROL_CHOICES } from './durationChoices'

describe('the one workout-length control', () => {
  // The control mirrors the schema's four values rather than importing them, to
  // keep the Zod workout schema off the boot chunk. That is only safe while the
  // two lists are identical, so this is the assertion that keeps it safe.
  it('offers exactly the lengths the schema defines, in the same order', () => {
    expect(CONTROL_CHOICES).toEqual([...DURATION_CHOICES])
  })
})
