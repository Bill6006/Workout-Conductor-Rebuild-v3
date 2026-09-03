import {
  WORKOUT_SCHEMA_VERSION,
  type ExerciseEntry,
  type SetRecord,
  type SetTarget,
  type SingleBlock,
  type SupersetBlock,
  type Workout,
  type WorkoutBlock,
} from './workoutSchema'

/**
 * Hand-built, VALID session pieces, so a test states only the thing it is testing.
 *
 * Every builder returns something `workoutSchema` accepts, which is what makes a
 * rejection test meaningful: the fixture is changed in exactly one way and the
 * failure can only have come from that change. Following
 * `engine/conflicts/testFixtures.ts`, this is a plain source module rather than a
 * `.test.ts` so more than one test file can use it; nothing in the app imports it.
 */

export const FIXTURE_TIME = '2026-09-02T09:00:00.000Z'
export const FIXTURE_DATE = '2026-09-02'

export function makeSetTarget(overrides: Partial<SetTarget> & { setId: string }): SetTarget {
  return {
    kind: 'working',
    reps: { min: 8, max: 12, unit: 'reps' },
    rirTarget: 2,
    restSeconds: 120,
    weight: { kind: 'unknown', reason: 'no-history' },
    tempo: null,
    dropSet: null,
    estimatedSeconds: 165,
    ...overrides,
  }
}

export function makeSetRecord(overrides: Partial<SetRecord> & { setId: string }): SetRecord {
  return {
    outcome: 'completed',
    reps: 10,
    repUnit: 'reps',
    load: { value: 60, unit: 'kg', measure: 'total' },
    rir: 2,
    loggedAt: FIXTURE_TIME,
    drops: [],
    note: '',
    ...overrides,
  }
}

export function makeEntry(overrides: Partial<ExerciseEntry> & { entryId: string }): ExerciseEntry {
  const entryId = overrides.entryId
  return {
    exerciseId: 'barbell-bench-press',
    role: 'primary-strength',
    priority: 'priority',
    targets: [
      makeSetTarget({ setId: `${entryId}-s1` }),
      makeSetTarget({ setId: `${entryId}-s2` }),
      makeSetTarget({ setId: `${entryId}-s3` }),
    ],
    records: [],
    replacements: [],
    progressionFamily: 'horizontal-press-barbell',
    estimatedSeconds: 555,
    note: '',
    ...overrides,
  }
}

/** An entry that opens with two ramp sets, for the warm-up paths. */
export function makeRampedEntry(entryId: string): ExerciseEntry {
  return makeEntry({
    entryId,
    targets: [
      makeSetTarget({
        setId: `${entryId}-w1`,
        kind: 'warm-up',
        reps: { min: 8, max: 8, unit: 'reps' },
        rirTarget: null,
        restSeconds: 45,
        estimatedSeconds: 75,
      }),
      makeSetTarget({ setId: `${entryId}-s1` }),
      makeSetTarget({ setId: `${entryId}-s2` }),
    ],
  })
}

export function makeSingleBlock(overrides: Partial<SingleBlock> & { blockId: string }): SingleBlock {
  return {
    kind: 'single',
    entry: makeEntry({ entryId: `${overrides.blockId}-e1` }),
    estimatedSeconds: 555,
    ...overrides,
  }
}

/**
 * A valid two-move superset: three rounds, three targets on each move, no ramp
 * sets inside, two different exercises.
 */
export function makeSupersetBlock(
  overrides: Partial<Omit<SupersetBlock, 'moves'>> & {
    blockId: string
    moves?: readonly [ExerciseEntry, ExerciseEntry]
  } = { blockId: 'block-superset' },
): SupersetBlock {
  const rounds = overrides.rounds ?? 3
  const roundTargets = (entryId: string) =>
    Array.from({ length: rounds }, (_, index) => makeSetTarget({ setId: `${entryId}-r${index + 1}` }))

  const moves: readonly [ExerciseEntry, ExerciseEntry] = overrides.moves ?? [
    makeEntry({
      entryId: `${overrides.blockId}-a`,
      exerciseId: 'dumbbell-lateral-raise',
      role: 'isolation',
      priority: 'normal',
      progressionFamily: 'lateral-raise',
      targets: roundTargets(`${overrides.blockId}-a`),
    }),
    makeEntry({
      entryId: `${overrides.blockId}-b`,
      exerciseId: 'cable-triceps-pushdown',
      role: 'isolation',
      priority: 'accessory',
      progressionFamily: 'triceps-extension-cable',
      targets: roundTargets(`${overrides.blockId}-b`),
    }),
  ]

  return {
    kind: 'superset',
    rounds,
    restBetweenMovesSeconds: 20,
    restAfterRoundSeconds: 90,
    rationale: 'accessory-efficiency',
    estimatedSeconds: 480,
    ...overrides,
    blockId: overrides.blockId,
    moves,
  }
}

/**
 * A complete, valid workout: one ramped single block and one two-move superset,
 * planned at 45 minutes.
 */
export function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  const single = makeSingleBlock({ blockId: 'b1', entry: makeRampedEntry('e1') })
  const superset = makeSupersetBlock({ blockId: 'b2' })
  const blocks: readonly WorkoutBlock[] = overrides.blocks ?? [single, superset]

  return {
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    id: 'workout-1',
    generatedAt: FIXTURE_TIME,
    forDate: FIXTURE_DATE,
    title: 'Upper body',
    goal: 'build-muscle',
    trainingStyle: 'hybrid',
    durationChoice: 45,
    plannedMinutes: 45,
    estimatedMinutes: 43,
    musclePriorities: [{ group: 'chest', level: 'primary', reason: 'goal', targetSets: 6 }],
    circuits: [],
    warmUp: {
      steps: [
        {
          stepId: 'wu1',
          kind: 'raise',
          exerciseId: null,
          instruction: 'Three minutes of easy cardio.',
          seconds: 180,
          targetGroups: ['chest', 'shoulders'],
        },
      ],
      rampedEntryIds: ['e1'],
      estimatedSeconds: 255,
      rationale: 'Heavy pressing opens the session.',
    },
    explanation: {
      headline: 'Chest leads, because it is the group furthest behind this week.',
      points: [
        {
          code: 'muscle-priority',
          text: 'Chest is six sets short of its weekly target.',
          weight: 'major',
          muscleGroups: ['chest'],
          entryIds: ['e1'],
          blockIds: ['b1'],
        },
      ],
    },
    confidence: { level: 'moderate', score: 0.6, limiters: ['no-workout-history'] },
    knownCompromises: [],
    generatorVersion: '3.0.0',
    seed: 'primary:2026-09-02',
    ...overrides,
    blocks,
  }
}
