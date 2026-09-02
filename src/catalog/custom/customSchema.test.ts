import { describe, expect, it } from 'vitest'
import {
  CUSTOM_CONTENT_SCHEMA_VERSION,
  CUSTOM_ID_PREFIX,
  CUSTOM_MEDIA_ID_PREFIX,
  CUSTOM_MEDIA_SOURCES,
  SCHEDULING_REQUIRED_FIELDS,
  applyInstructionOverride,
  createCustomExercise,
  customExerciseSchema,
  customInstructionOverrideSchema,
  customMediaSchema,
  isSchedulableCustomExercise,
  missingSchedulingFields,
  type CustomExercise,
} from './customSchema'

const NOW = '2026-09-01T12:00:00.000Z'

function blank(overrides: Record<string, unknown> = {}): CustomExercise {
  return customExerciseSchema.parse({
    schemaVersion: CUSTOM_CONTENT_SCHEMA_VERSION,
    id: 'custom:the-weird-machine',
    name: 'The weird machine',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  })
}

/** Everything generation cannot work without, filled in. */
const SCHEDULABLE = {
  primaryMuscles: ['lats'],
  movementPattern: 'horizontal-pull',
  trainingRole: 'secondary-hypertrophy',
  locationSuitability: ['gym'],
  setupTimeSeconds: 30,
  typicalRepRange: { min: 8, max: 12 },
  load: { basis: 'machine-stack', measure: 'total', usesBar: false, plateMath: false },
} as const

describe('the custom exercise schema', () => {
  it('takes a name and a timestamp and asks nothing else of a person', () => {
    // Somebody adding "the weird machine in the corner" should not have to answer
    // twenty questions before they can log it.
    const exercise = blank()

    expect(exercise.id).toBe('custom:the-weird-machine')
    expect(exercise.name).toBe('The weird machine')
    expect(exercise.primaryMuscles).toEqual([])
    expect(exercise.movementPattern).toBeNull()
    expect(exercise.load).toBeNull()
    expect(exercise.notes).toBe('')
    expect(exercise.mediaIds).toEqual([])
    expect(exercise.basedOnExerciseId).toBeNull()
  })

  it('requires the namespaced id, so a user entry can never collide with a built-in', () => {
    expect(CUSTOM_ID_PREFIX).toBe('custom:')
    expect(customExerciseSchema.safeParse({ ...blank(), id: 'the-weird-machine' }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), id: 'custom:' }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), id: 'custom:Weird Machine' }).success).toBe(false)
  })

  it('carries its own schema version, so it can be migrated on its own timetable', () => {
    expect(blank().schemaVersion).toBe(CUSTOM_CONTENT_SCHEMA_VERSION)
    expect(customExerciseSchema.safeParse({ ...blank(), schemaVersion: 0 }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), schemaVersion: '1' }).success).toBe(false)
  })

  it('is loose, so a field written by a later build survives a read and a write', () => {
    const parsed = customExerciseSchema.parse({ ...blank(), tempoNotes: 'three seconds down' })
    expect((parsed as Record<string, unknown>).tempoNotes).toBe('three seconds down')
  })

  it('refuses a value outside a catalog vocabulary', () => {
    expect(customExerciseSchema.safeParse({ ...blank(), primaryMuscles: ['pectorals'] }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), movementPattern: 'pressing' }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), equipment: ['sandbag'] }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), difficulty: 'expert' }).success).toBe(false)
  })

  it('bounds the free text a person can write', () => {
    expect(customExerciseSchema.safeParse({ ...blank(), name: '' }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), name: 'x'.repeat(81) }).success).toBe(false)
    expect(customExerciseSchema.safeParse({ ...blank(), notes: 'x'.repeat(1000) }).success).toBe(true)
    expect(customExerciseSchema.safeParse({ ...blank(), notes: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('points at a built-in it was started from, without becoming a copy of it', () => {
    expect(
      customExerciseSchema.safeParse({ ...blank(), basedOnExerciseId: 'barbell-back-squat' }).success,
    ).toBe(true)
    expect(
      customExerciseSchema.safeParse({ ...blank(), basedOnExerciseId: 'custom:another-one' }).success,
    ).toBe(true)
    expect(
      customExerciseSchema.safeParse({ ...blank(), basedOnExerciseId: 'Barbell Back Squat' }).success,
    ).toBe(false)
  })

  it('takes only user-owned media ids, never a production one', () => {
    expect(customExerciseSchema.safeParse({ ...blank(), mediaIds: ['custom-media:clip-1'] }).success).toBe(
      true,
    )
    expect(customExerciseSchema.safeParse({ ...blank(), mediaIds: ['clip-1'] }).success).toBe(false)
  })

  it('creates a blank entry that parses, named and timestamped and knowing nothing else', () => {
    const created = createCustomExercise('custom:my-thing', 'My thing', NOW)

    expect(created.id).toBe('custom:my-thing')
    expect(created.createdAt).toBe(NOW)
    expect(created.updatedAt).toBe(NOW)
    expect(customExerciseSchema.safeParse(created).success).toBe(true)
  })
})

describe('whether a custom exercise can be scheduled', () => {
  it('names every missing field on a blank entry', () => {
    expect(missingSchedulingFields(blank())).toEqual([...SCHEDULING_REQUIRED_FIELDS])
    expect(isSchedulableCustomExercise(blank())).toBe(false)
  })

  it('says yes once the fields generation needs are all answered', () => {
    const ready = blank(SCHEDULABLE)
    expect(missingSchedulingFields(ready)).toEqual([])
    expect(isSchedulableCustomExercise(ready)).toBe(true)
  })

  it('names exactly the field that is still missing', () => {
    // The two list-valued fields go missing by being empty; the rest by being null.
    const EMPTIED: readonly string[] = ['primaryMuscles', 'locationSuitability']

    for (const field of SCHEDULING_REQUIRED_FIELDS) {
      const partial = blank({ ...SCHEDULABLE, [field]: EMPTIED.includes(field) ? [] : null })
      expect(missingSchedulingFields(partial), `${field} should be reported missing`).toEqual([field])
      expect(isSchedulableCustomExercise(partial)).toBe(false)
    }
  })

  it('treats an empty equipment list as a real answer, not a missing one', () => {
    // "I need nothing" is an answer. Requiring equipment would make a bodyweight
    // movement permanently unschedulable.
    const ready = blank({ ...SCHEDULABLE, equipment: [] })
    expect(isSchedulableCustomExercise(ready)).toBe(true)
  })
})

describe('the custom instruction override', () => {
  const override = customInstructionOverrideSchema.parse({
    schemaVersion: CUSTOM_CONTENT_SCHEMA_VERSION,
    exerciseId: 'barbell-back-squat',
    createdAt: NOW,
    updatedAt: NOW,
  })

  const base = { instructionSteps: ['Built-in one.', 'Built-in two.'], commonMistakes: ['A mistake.'] }

  it('defaults every override to absent, which means the built-in shows through', () => {
    expect(override.instructionSteps).toBeNull()
    expect(override.commonMistakes).toBeNull()
    expect(override.personalNotes).toBe('')
    expect(applyInstructionOverride(base, override)).toEqual({ ...base, personalNotes: '' })
  })

  it('shows the built-in when there is no override at all', () => {
    expect(applyInstructionOverride(base, null)).toEqual({ ...base, personalNotes: '' })
  })

  it('replaces the built-in steps when a person has written their own', () => {
    const rewritten = { ...override, instructionSteps: ['My cue.', 'My second cue.'] }
    expect(applyInstructionOverride(base, rewritten)).toEqual({
      instructionSteps: ['My cue.', 'My second cue.'],
      commonMistakes: ['A mistake.'],
      personalNotes: '',
    })
  })

  it('keeps a deliberately emptied list as empty, which is not the same as absent', () => {
    const cleared = { ...override, commonMistakes: [] }
    expect(applyInstructionOverride(base, cleared).commonMistakes).toEqual([])
  })

  it('carries a personal note alongside the built-in rather than instead of it', () => {
    const noted = { ...override, personalNotes: 'The left knee tracks in.' }
    const applied = applyInstructionOverride(base, noted)
    expect(applied.personalNotes).toBe('The left knee tracks in.')
    expect(applied.instructionSteps).toEqual(base.instructionSteps)
  })

  it('points at either kind of exercise id, and nothing else', () => {
    expect(customInstructionOverrideSchema.safeParse({ ...override, exerciseId: 'custom:x-y' }).success).toBe(
      true,
    )
    expect(customInstructionOverrideSchema.safeParse({ ...override, exerciseId: 'Back Squat' }).success).toBe(
      false,
    )
  })
})

describe('user-owned media', () => {
  const media = {
    schemaVersion: CUSTOM_CONTENT_SCHEMA_VERSION,
    id: 'custom-media:my-clip',
    exerciseId: 'custom:the-weird-machine',
    kind: 'demonstration',
    source: 'user-recorded',
    mimeType: 'video/mp4',
    byteSize: 240_000,
    blobKey: 'media/my-clip',
    createdAt: NOW,
  }

  it('takes a record that references its bytes rather than embedding them', () => {
    const parsed = customMediaSchema.parse(media)
    expect(parsed.blobKey).toBe('media/my-clip')
    expect(parsed.width).toBeNull()
    expect(parsed.height).toBeNull()
    expect(parsed.durationMs).toBeNull()
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
  })

  it('requires the user media namespace on its own id', () => {
    expect(CUSTOM_MEDIA_ID_PREFIX).toBe('custom-media:')
    expect(customMediaSchema.safeParse({ ...media, id: 'my-clip' }).success).toBe(false)
    expect(customMediaSchema.safeParse({ ...media, id: 'custom:my-clip' }).success).toBe(false)
  })

  it('takes only the sources a person can actually be', () => {
    expect(CUSTOM_MEDIA_SOURCES).toEqual(['user-recorded', 'user-supplied'])
    for (const source of CUSTOM_MEDIA_SOURCES) {
      expect(customMediaSchema.safeParse({ ...media, source }).success).toBe(true)
    }
    expect(customMediaSchema.safeParse({ ...media, source: 'downloaded' }).success).toBe(false)
  })

  it('carries no licence question, because the rights are the user’s', () => {
    const parsed = customMediaSchema.parse(media) as Record<string, unknown>
    expect(parsed.provenance).toBeUndefined()
    expect(parsed.redistributionPermitted).toBeUndefined()
  })

  it('refuses an impossible size or duration', () => {
    expect(customMediaSchema.safeParse({ ...media, byteSize: 0 }).success).toBe(false)
    expect(customMediaSchema.safeParse({ ...media, durationMs: 0 }).success).toBe(false)
    expect(customMediaSchema.safeParse({ ...media, width: 0 }).success).toBe(false)
    expect(customMediaSchema.safeParse({ ...media, blobKey: '' }).success).toBe(false)
  })

  it('takes only the two kinds a user’s own media can be', () => {
    expect(customMediaSchema.safeParse({ ...media, kind: 'poster' }).success).toBe(true)
    expect(customMediaSchema.safeParse({ ...media, kind: 'icon' }).success).toBe(false)
  })
})
