import { describe, expect, it } from 'vitest'
import {
  DURATION_CHOICES,
  SUPERSET_TITLE_SEPARATOR,
  WORKOUT_SCHEMA_VERSION,
  blockEntries,
  blockForEntry,
  durationChoiceSchema,
  entryHasDropSet,
  findEntry,
  findTarget,
  fixedDurationMinutes,
  generatedWorkoutRecordSchema,
  isFixedDurationChoice,
  isSupersetBlock,
  isTargetResolved,
  isWarmUpSet,
  parseWorkout,
  resolvedTargetCount,
  rowForEntry,
  setRecordSchema,
  setTargetSchema,
  toWorkoutRecord,
  totalWorkingSets,
  workingSets,
  workoutListRows,
  workoutRecordValidator,
  workoutSchema,
  type DurationChoice,
  type SetTarget,
  type SupersetBlock,
  type Workout,
} from './workoutSchema'
import {
  DURATION_CHOICE_LABELS,
  durationChoiceLabel,
  durationChoiceOptions,
  durationChoiceShortLabel,
  durationSummary,
} from '../../catalog/labels'
import {
  FIXTURE_DATE,
  FIXTURE_TIME,
  makeEntry,
  makeRampedEntry,
  makeSetRecord,
  makeSetTarget,
  makeSingleBlock,
  makeSupersetBlock,
  makeWorkout,
} from './testFixtures'

/**
 * The session model's contract, tested where it is load-bearing:
 *
 *   - the duration control is exactly four values and nothing else parses;
 *   - a set TARGET and a set RECORD are different shapes and cannot be swapped;
 *   - a superset is two moves, round for round, with separate records — and it
 *     renders as ONE canonical list row naming both;
 *   - the workout's cross-field rules reject the sessions that would break
 *     Phase 5, rather than storing them and failing later.
 */

/* ------------------------------------------------------------------ *
 * Duration choice
 * ------------------------------------------------------------------ */

describe('DurationChoice', () => {
  it('accepts exactly 15, 30, 45 and "default"', () => {
    for (const value of DURATION_CHOICES) {
      expect(durationChoiceSchema.parse(value)).toBe(value)
    }
    expect(DURATION_CHOICES).toHaveLength(4)
  })

  it('rejects every other length, including plausible ones', () => {
    for (const value of [0, 10, 20, 25, 40, 60, 90, '15', '45', 'full', 'lazy', 'short', null, undefined]) {
      expect(durationChoiceSchema.safeParse(value).success, `${String(value)} must not parse`).toBe(false)
    }
  })

  it('says which choices pin a number of minutes, and which does not', () => {
    expect(isFixedDurationChoice(15)).toBe(true)
    expect(isFixedDurationChoice('default')).toBe(false)
    expect(fixedDurationMinutes(30)).toBe(30)
    expect(fixedDurationMinutes('default')).toBeNull()
  })
})

describe('duration labels', () => {
  it('labels every choice exactly once, through the one catalogue', () => {
    expect(DURATION_CHOICE_LABELS.map((entry) => entry.value)).toEqual([...DURATION_CHOICES])
    expect(new Set(DURATION_CHOICE_LABELS.map((entry) => entry.label)).size).toBe(4)
  })

  it('never renders "default" as a number of minutes', () => {
    expect(durationChoiceLabel('default')).toBe('Default time')
    expect(durationChoiceShortLabel('default')).toBe('Default')
    expect(durationChoiceLabel('default')).not.toMatch(/\d/)
    for (const entry of DURATION_CHOICE_LABELS) {
      if (entry.value === 'default') expect(entry.description).not.toMatch(/\d+\s*min/i)
    }
  })

  it('names no competing workout mode', () => {
    const competing = /^(full|lazy|short|density|recovery)\b/i
    for (const entry of DURATION_CHOICE_LABELS) {
      expect(entry.label).not.toMatch(competing)
      expect(entry.shortLabel ?? '').not.toMatch(competing)
      expect(entry.description ?? '').not.toMatch(competing)
    }
  })

  it('summarises a fixed choice by itself and "default" only once generated', () => {
    expect(durationSummary(30)).toBe('30 min')
    expect(durationSummary('default')).toBe('Default time')
    expect(durationSummary('default', 52)).toBe('52 min')
  })

  it('offers the four options a segmented control renders, in order', () => {
    expect(durationChoiceOptions().map((option) => option.value)).toEqual([...DURATION_CHOICES])
    expect(durationChoiceOptions().map((option) => option.label)).toEqual([
      '15 min',
      '30 min',
      '45 min',
      'Default',
    ])
  })
})

/* ------------------------------------------------------------------ *
 * Set target vs set record
 * ------------------------------------------------------------------ */

describe('a set target is not a set record', () => {
  it('parses a target and rejects a record fed to it', () => {
    const target = makeSetTarget({ setId: 's1' })
    expect(setTargetSchema.safeParse(target).success).toBe(true)
    expect(setTargetSchema.safeParse(makeSetRecord({ setId: 's1' })).success).toBe(false)
  })

  it('parses a record and rejects a target fed to it', () => {
    const record = makeSetRecord({ setId: 's1' })
    expect(setRecordSchema.safeParse(record).success).toBe(true)
    expect(setRecordSchema.safeParse(makeSetTarget({ setId: 's1' })).success).toBe(false)
  })

  it('lets a target say the weight is legitimately unknown', () => {
    const target = makeSetTarget({ setId: 's1', weight: { kind: 'unknown', reason: 'first-session' } })
    const parsed = setTargetSchema.parse(target)
    expect(parsed.weight).toEqual({ kind: 'unknown', reason: 'first-session' })
  })

  it('requires the measure alongside a numeric load, in both directions', () => {
    const noMeasure = { kind: 'load', value: 60, unit: 'kg' }
    expect(
      setTargetSchema.safeParse(makeSetTarget({ setId: 's1', weight: noMeasure as never })).success,
    ).toBe(false)
    expect(
      setRecordSchema.safeParse(makeSetRecord({ setId: 's1', load: { value: 20, unit: 'kg' } as never }))
        .success,
    ).toBe(false)
  })

  it('rejects a rep range that runs backwards', () => {
    const target = makeSetTarget({ setId: 's1', reps: { min: 12, max: 8, unit: 'reps' } })
    expect(setTargetSchema.safeParse(target).success).toBe(false)
  })

  it('carries a tempo only with a stated reason', () => {
    const base = { eccentricSeconds: 3, bottomPauseSeconds: 1, concentricSeconds: 1, topPauseSeconds: 0 }
    expect(setTargetSchema.safeParse(makeSetTarget({ setId: 's1', tempo: base as never })).success).toBe(
      false,
    )
    expect(
      setTargetSchema.safeParse(
        makeSetTarget({ setId: 's1', tempo: { ...base, reason: 'control-eccentric' } }),
      ).success,
    ).toBe(true)
  })

  it('separates warm-up sets from the sets that count as volume', () => {
    const entry = makeRampedEntry('e1')
    expect(entry.targets.filter(isWarmUpSet)).toHaveLength(1)
    expect(workingSets(entry.targets)).toHaveLength(2)
  })

  it('reports drop-set intent from the set it hangs off', () => {
    const plain = makeEntry({ entryId: 'e1' })
    expect(entryHasDropSet(plain)).toBe(false)

    const withDrop = makeEntry({
      entryId: 'e1',
      targets: [
        makeSetTarget({ setId: 'e1-s1' }),
        makeSetTarget({
          setId: 'e1-s2',
          dropSet: { drops: 2, loadReductionPercent: 20, transitionSeconds: 10 },
        }),
        makeSetTarget({ setId: 'e1-s3', kind: 'drop' }),
      ],
    })
    expect(entryHasDropSet(withDrop)).toBe(true)
  })
})

describe('records answer targets by id', () => {
  const entry = makeEntry({
    entryId: 'e1',
    records: [makeSetRecord({ setId: 'e1-s1' }), makeSetRecord({ setId: 'e1-s2', outcome: 'skipped' })],
  })

  it('resolves a target by its id', () => {
    expect(findTarget(entry, 'e1-s2')?.setId).toBe('e1-s2')
    expect(findTarget(entry, 'nope')).toBeUndefined()
  })

  it('counts a skipped set as answered — "skipped" is data, not silence', () => {
    expect(isTargetResolved(entry, 'e1-s2')).toBe(true)
    expect(isTargetResolved(entry, 'e1-s3')).toBe(false)
    expect(resolvedTargetCount(entry)).toBe(2)
  })

  it('refuses a workout whose entry logs a set it never programmed', () => {
    const stray = makeSingleBlock({
      blockId: 'b1',
      entry: makeEntry({ entryId: 'e1', records: [makeSetRecord({ setId: 'not-programmed' })] }),
    })
    const result = workoutSchema.safeParse(makeWorkout({ blocks: [stray], warmUp: noRampWarmUp() }))
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/logs set "not-programmed"/)
  })
})

/* ------------------------------------------------------------------ *
 * The superset contract
 * ------------------------------------------------------------------ */

describe('the superset block', () => {
  it('is one block of exactly two moves, each with its own record', () => {
    const block = makeSupersetBlock({ blockId: 'b2' })
    expect(block.moves).toHaveLength(2)
    expect(blockEntries(block)).toHaveLength(2)
    expect(block.moves[0].records).not.toBe(block.moves[1].records)
    expect(block.moves[0].replacements).not.toBe(block.moves[1].replacements)
  })

  it('keeps one move’s logged work and swaps out of the other’s', () => {
    const base = makeSupersetBlock({ blockId: 'b2' })
    const swapped: SupersetBlock = {
      ...base,
      moves: [
        { ...base.moves[0], records: [makeSetRecord({ setId: 'b2-a-r1' })] },
        {
          ...base.moves[1],
          exerciseId: 'dumbbell-triceps-extension',
          replacements: [
            {
              fromExerciseId: 'cable-triceps-pushdown',
              toExerciseId: 'dumbbell-triceps-extension',
              at: FIXTURE_TIME,
              reason: 'equipment-unavailable',
              preservedProgression: false,
            },
          ],
        },
      ],
    }

    const workout = parseWorkout(makeWorkout({ blocks: [makeRampedSingle(), swapped] }))
    expect(workout.ok).toBe(true)
    if (!workout.ok) return

    const stored = workout.value.blocks[1] as SupersetBlock
    // The first move's history is untouched by what happened to the second.
    expect(stored.moves[0].records).toHaveLength(1)
    expect(stored.moves[0].replacements).toHaveLength(0)
    expect(stored.moves[1].records).toHaveLength(0)
    expect(stored.moves[1].replacements).toHaveLength(1)
  })

  it('rejects a third move', () => {
    const block = makeSupersetBlock({ blockId: 'b2' })
    const three = { ...block, moves: [...block.moves, makeEntry({ entryId: 'b2-c' })] }
    expect(
      workoutSchema.safeParse(makeWorkout({ blocks: [makeRampedSingle(), three as never] })).success,
    ).toBe(false)
  })

  it('rejects a pairing of one exercise with itself', () => {
    const block = makeSupersetBlock({ blockId: 'b2' })
    const same: SupersetBlock = {
      ...block,
      moves: [block.moves[0], { ...block.moves[1], exerciseId: block.moves[0].exerciseId }],
    }
    const result = workoutSchema.safeParse(makeWorkout({ blocks: [makeRampedSingle(), same] }))
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/two different exercises/)
  })

  it('advances both moves together: rounds and targets must agree', () => {
    const block = makeSupersetBlock({ blockId: 'b2', rounds: 3 })
    const lopsided: SupersetBlock = {
      ...block,
      moves: [block.moves[0], { ...block.moves[1], targets: block.moves[1].targets.slice(0, 2) }],
    }
    const result = workoutSchema.safeParse(makeWorkout({ blocks: [makeRampedSingle(), lopsided] }))
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/A round advances both moves/)
  })

  it('carries no ramp sets inside — those belong to the warm-up plan', () => {
    const block = makeSupersetBlock({ blockId: 'b2', rounds: 3 })
    const ramped: SupersetBlock = {
      ...block,
      moves: [
        {
          ...block.moves[0],
          targets: [
            { ...block.moves[0].targets[0], kind: 'warm-up' } as SetTarget,
            ...block.moves[0].targets.slice(1),
          ],
        },
        block.moves[1],
      ],
    }
    const result = workoutSchema.safeParse(makeWorkout({ blocks: [makeRampedSingle(), ramped] }))
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/no warm-up sets/)
  })
})

/* ------------------------------------------------------------------ *
 * The canonical list row
 * ------------------------------------------------------------------ */

describe('workoutListRows — one readable row per block', () => {
  const workout = makeWorkout()
  const rows = workoutListRows(workout)

  it('yields one row per block, not one per exercise', () => {
    expect(workout.blocks).toHaveLength(2)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.rowId)).toEqual(['b1', 'b2'])
    expect(rows.map((row) => row.position)).toEqual([1, 2])
  })

  it('gives a superset ONE row naming BOTH moves', () => {
    const supersetRow = rows[1]
    expect(supersetRow.kind).toBe('superset')
    expect(supersetRow.entryIds).toEqual(['b2-a', 'b2-b'])
    expect(supersetRow.exerciseIds).toEqual(['dumbbell-lateral-raise', 'cable-triceps-pushdown'])
    expect(supersetRow.title).toBe(`Dumbbell lateral raise${SUPERSET_TITLE_SEPARATOR}Cable triceps pushdown`)
    expect(supersetRow.detail).toMatch(/^3 rounds/)
  })

  it('uses real names when a screen has the catalog loaded', () => {
    const named = workoutListRows(workout, (id) => (id === 'dumbbell-lateral-raise' ? 'Lateral raise' : null))
    expect(named[1].title).toBe(`Lateral raise${SUPERSET_TITLE_SEPARATOR}Cable triceps pushdown`)
  })

  it('finds the one row a superset move belongs to', () => {
    expect(rowForEntry(rows, 'b2-a')?.rowId).toBe('b2')
    expect(rowForEntry(rows, 'b2-b')?.rowId).toBe('b2')
    expect(rowForEntry(rows, 'e1')?.rowId).toBe('b1')
  })

  it('never marks a superset row complete while either move is outstanding', () => {
    const block = makeSupersetBlock({ blockId: 'b2' })
    const halfDone: SupersetBlock = {
      ...block,
      moves: [
        {
          ...block.moves[0],
          records: block.moves[0].targets.map((target) => makeSetRecord({ setId: target.setId })),
        },
        block.moves[1],
      ],
    }
    const [, row] = workoutListRows(makeWorkout({ blocks: [makeRampedSingle(), halfDone] }))

    // The first move is finished; the row is not, and the round count is the
    // SLOWER move's. This is the defect the single-row model exists to prevent.
    expect(row.progress.status).toBe('in-progress')
    expect(row.progress.roundsPlanned).toBe(3)
    expect(row.progress.roundsComplete).toBe(0)
    expect(row.progress.resolvedCount).toBe(3)
    expect(row.progress.targetCount).toBe(6)
  })

  it('is complete only once both moves are', () => {
    const block = makeSupersetBlock({ blockId: 'b2' })
    const done: SupersetBlock = {
      ...block,
      moves: [
        {
          ...block.moves[0],
          records: block.moves[0].targets.map((target) => makeSetRecord({ setId: target.setId })),
        },
        {
          ...block.moves[1],
          records: block.moves[1].targets.map((target) => makeSetRecord({ setId: target.setId })),
        },
      ],
    }
    const [, row] = workoutListRows(makeWorkout({ blocks: [makeRampedSingle(), done] }))
    expect(row.progress.status).toBe('complete')
    expect(row.progress.roundsComplete).toBe(3)
  })

  it('describes a single block by its sets, and notes its ramp', () => {
    expect(rows[0].kind).toBe('single')
    expect(rows[0].entryIds).toEqual(['e1'])
    expect(rows[0].detail).toBe('2 sets · 8-12 reps · 1 warm-up')
    expect(rows[0].progress.roundsPlanned).toBeNull()
    expect(rows[0].progress.status).toBe('not-started')
  })

  it('reads a held movement in seconds rather than reps', () => {
    const plank = makeSingleBlock({
      blockId: 'b1',
      entry: makeEntry({
        entryId: 'e1',
        exerciseId: 'front-plank',
        role: 'isolation',
        progressionFamily: 'anti-extension',
        targets: [
          makeSetTarget({ setId: 'e1-s1', reps: { min: 45, max: 45, unit: 'seconds' } }),
          makeSetTarget({ setId: 'e1-s2', reps: { min: 45, max: 45, unit: 'seconds' } }),
        ],
      }),
    })
    const [row] = workoutListRows(makeWorkout({ blocks: [plank], warmUp: noRampWarmUp() }))
    expect(row.detail).toBe('2 sets · 45 sec')
  })
})

describe('navigation helpers', () => {
  const workout = makeWorkout()

  it('walks every entry in performance order', () => {
    expect(findEntry(workout, 'b2-b')?.exerciseId).toBe('cable-triceps-pushdown')
    expect(findEntry(workout, 'missing')).toBeUndefined()
    expect(blockForEntry(workout, 'b2-a')?.blockId).toBe('b2')
    expect(isSupersetBlock(workout.blocks[1])).toBe(true)
  })

  it('counts working sets, warm-ups excluded', () => {
    // Two working sets on the ramped single, three rounds on each superset move.
    expect(totalWorkingSets(workout)).toBe(8)
  })
})

/* ------------------------------------------------------------------ *
 * Workout-level rules
 * ------------------------------------------------------------------ */

describe('workoutSchema boundaries', () => {
  it('accepts the fixture unchanged', () => {
    expect(workoutSchema.safeParse(makeWorkout()).success).toBe(true)
  })

  it('pins plannedMinutes to a fixed duration choice', () => {
    expect(workoutSchema.safeParse(makeWorkout({ durationChoice: 30, plannedMinutes: 45 })).success).toBe(
      false,
    )
    expect(workoutSchema.safeParse(makeWorkout({ durationChoice: 30, plannedMinutes: 30 })).success).toBe(
      true,
    )
  })

  it('lets "default" plan any length, because that is what it means', () => {
    for (const minutes of [22, 45, 71]) {
      const parsed = workoutSchema.safeParse(
        makeWorkout({ durationChoice: 'default', plannedMinutes: minutes }),
      )
      expect(parsed.success, `default at ${minutes} minutes`).toBe(true)
    }
  })

  it('requires a calendar day, not a timestamp', () => {
    expect(workoutSchema.safeParse(makeWorkout({ forDate: '2026-09-02' })).success).toBe(true)
    expect(workoutSchema.safeParse(makeWorkout({ forDate: '2026-09-02T09:00:00.000Z' })).success).toBe(false)
    expect(workoutSchema.safeParse(makeWorkout({ forDate: '2026-02-30' })).success).toBe(false)
    expect(workoutSchema.safeParse(makeWorkout({ forDate: '02/09/2026' })).success).toBe(false)
  })

  it('needs at least one block', () => {
    expect(workoutSchema.safeParse(makeWorkout({ blocks: [] })).success).toBe(false)
  })

  it('refuses a duplicated block or entry id', () => {
    const duplicateBlock = makeSingleBlock({ blockId: 'b1', entry: makeEntry({ entryId: 'e2' }) })
    const result = workoutSchema.safeParse(makeWorkout({ blocks: [makeRampedSingle(), duplicateBlock] }))
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/Block id "b1" is used twice/)

    const duplicateEntry = makeSingleBlock({ blockId: 'b3', entry: makeRampedEntry('e1') })
    const second = workoutSchema.safeParse(
      makeWorkout({
        blocks: [makeRampedSingle(), duplicateEntry],
        warmUp: { ...makeWorkout().warmUp, rampedEntryIds: ['e1'] },
      }),
    )
    expect(second.success).toBe(false)
    expect(issueText(second)).toMatch(/Entry id "e1" is used twice/)
  })

  it('refuses an explanation or a compromise that names something absent', () => {
    const badPoint = workoutSchema.safeParse(
      makeWorkout({
        explanation: {
          headline: 'Something',
          points: [
            {
              code: 'time-budget',
              text: 'Time was short.',
              weight: 'major',
              muscleGroups: [],
              entryIds: ['ghost'],
              blockIds: [],
            },
          ],
        },
      }),
    )
    expect(badPoint.success).toBe(false)
    expect(issueText(badPoint)).toMatch(/Explanation point names entry "ghost"/)

    const badCompromise = workoutSchema.safeParse(
      makeWorkout({
        knownCompromises: [
          {
            code: 'fewer-sets',
            severity: 'notable',
            text: 'Two sets came off chest.',
            muscleGroups: ['chest'],
            entryIds: [],
            blockIds: ['ghost-block'],
            secondsSaved: 240,
          },
        ],
      }),
    )
    expect(badCompromise.success).toBe(false)
    expect(issueText(badCompromise)).toMatch(/Compromise names block "ghost-block"/)
  })

  it('accepts a compromise that names real parts of the session', () => {
    const parsed = workoutSchema.safeParse(
      makeWorkout({
        knownCompromises: [
          {
            code: 'shorter-rest',
            severity: 'minor',
            text: 'Rests are 30 seconds shorter than ideal.',
            muscleGroups: ['chest'],
            entryIds: ['e1'],
            blockIds: ['b1'],
            secondsSaved: 180,
          },
        ],
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('refuses a warm-up that claims a ramp the entry does not carry', () => {
    const result = workoutSchema.safeParse(
      makeWorkout({
        blocks: [makeSingleBlock({ blockId: 'b1', entry: makeEntry({ entryId: 'e1' }) })],
      }),
    )
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/listed as ramped but programs no warm-up sets/)
  })

  it('keeps unknown fields written by a later build', () => {
    const parsed = workoutSchema.parse({ ...makeWorkout(), somethingNewer: { fromTheFuture: true } })
    expect((parsed as Record<string, unknown>).somethingNewer).toEqual({ fromTheFuture: true })
  })
})

describe('circuits sit over blocks, never inside one', () => {
  function circuitWorkout(overrides: Partial<Workout> = {}): Workout {
    const a = makeSingleBlock({
      blockId: 'c1',
      entry: makeEntry({ entryId: 'ce1', targets: twoWorkingSets('ce1') }),
    })
    const b = makeSingleBlock({
      blockId: 'c2',
      entry: makeEntry({ entryId: 'ce2', targets: twoWorkingSets('ce2') }),
    })
    return makeWorkout({
      blocks: [makeRampedSingle(), a, b],
      circuits: [
        {
          circuitId: 'circuit-1',
          blockIds: ['c1', 'c2'],
          rounds: 2,
          restBetweenStationsSeconds: 15,
          restAfterRoundSeconds: 90,
        },
      ],
      ...overrides,
    })
  }

  it('accepts a circuit whose stations run its round count', () => {
    expect(workoutSchema.safeParse(circuitWorkout()).success).toBe(true)
  })

  it('tags each member row with the circuit it belongs to', () => {
    const rows = workoutListRows(circuitWorkout())
    expect(rows.map((row) => row.circuitId)).toEqual([null, 'circuit-1', 'circuit-1'])
  })

  it('refuses a station whose set count disagrees with the rounds', () => {
    const result = workoutSchema.safeParse(
      circuitWorkout({
        circuits: [
          {
            circuitId: 'circuit-1',
            blockIds: ['c1', 'c2'],
            rounds: 4,
            restBetweenStationsSeconds: 15,
            restAfterRoundSeconds: 90,
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/programs 2 working sets, but the circuit runs 4 rounds/)
  })

  it('refuses a superset as a circuit station', () => {
    const result = workoutSchema.safeParse(
      makeWorkout({
        circuits: [
          {
            circuitId: 'circuit-1',
            blockIds: ['b1', 'b2'],
            rounds: 3,
            restBetweenStationsSeconds: 15,
            restAfterRoundSeconds: 90,
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/is a superset/)
  })

  it('refuses a block claimed by two circuits', () => {
    const base = circuitWorkout()
    const result = workoutSchema.safeParse({
      ...base,
      circuits: [
        base.circuits[0],
        {
          circuitId: 'circuit-2',
          blockIds: ['c1', 'c2'],
          rounds: 2,
          restBetweenStationsSeconds: 15,
          restAfterRoundSeconds: 90,
        },
      ],
    })
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/already in another circuit/)
  })
})

/* ------------------------------------------------------------------ *
 * The durable record
 * ------------------------------------------------------------------ */

describe('generatedWorkoutRecordSchema', () => {
  it('wraps a workout with a key and a date that mirror it', () => {
    const record = toWorkoutRecord(makeWorkout(), FIXTURE_TIME)
    expect(record.id).toBe('workout-1')
    expect(record.forDate).toBe(FIXTURE_DATE)
    expect(record.schemaVersion).toBe(WORKOUT_SCHEMA_VERSION)
    expect(record.recalibration).toBeNull()
    expect(generatedWorkoutRecordSchema.safeParse(record).success).toBe(true)
    expect(workoutRecordValidator.validate(record).ok).toBe(true)
  })

  it('refuses a key or a date that disagrees with the workout it holds', () => {
    const record = toWorkoutRecord(makeWorkout(), FIXTURE_TIME)
    expect(generatedWorkoutRecordSchema.safeParse({ ...record, id: 'other' }).success).toBe(false)
    expect(generatedWorkoutRecordSchema.safeParse({ ...record, forDate: '2026-09-03' }).success).toBe(false)
  })

  it('refuses a record from a future schema version rather than half-reading it', () => {
    const record = toWorkoutRecord(makeWorkout(), FIXTURE_TIME)
    const result = generatedWorkoutRecordSchema.safeParse({
      ...record,
      schemaVersion: WORKOUT_SCHEMA_VERSION + 1,
    })
    expect(result.success).toBe(false)
    expect(issueText(result)).toMatch(/this build understands/)
  })
})

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function makeRampedSingle() {
  return makeSingleBlock({ blockId: 'b1', entry: makeRampedEntry('e1') })
}

function twoWorkingSets(entryId: string): SetTarget[] {
  return [makeSetTarget({ setId: `${entryId}-s1` }), makeSetTarget({ setId: `${entryId}-s2` })]
}

/** A warm-up plan that claims no ramp sets, for fixtures whose entries carry none. */
function noRampWarmUp() {
  return { ...makeWorkout().warmUp, rampedEntryIds: [] }
}

function issueText(result: { success: boolean; error?: { issues: readonly { message: string }[] } }): string {
  return result.error ? result.error.issues.map((issue) => issue.message).join(' | ') : ''
}

/** Compile-time proof that the union is exactly the four values, and no wider. */
const _exhaustive: readonly DurationChoice[] = DURATION_CHOICES
void _exhaustive
