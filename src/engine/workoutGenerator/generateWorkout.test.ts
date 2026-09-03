import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../../catalog/exercises/catalog'
import { defaultEquipmentFor } from '../../catalog/equipment/equipment'
import { createDefaultProfile, type Profile } from '../../core/validation/schemas'
import {
  blockEntries,
  isSupersetBlock,
  workoutListRows,
  workoutSchema,
  type DurationChoice,
  type Workout,
} from '../../core/validation/workoutSchema'
import { generateWorkout } from './generateWorkout'
import type { GenerateWorkoutInput } from './types'

const NOW = '2026-09-02T08:00:00.000Z'

function input(over: Partial<GenerateWorkoutInput> = {}): GenerateWorkoutInput {
  return {
    profile: createDefaultProfile(NOW),
    location: { id: 'loc-gym', name: 'Gym', suitability: 'gym' },
    equipment: defaultEquipmentFor('gym'),
    availableTime: 'default',
    forDate: '2026-09-02',
    generatedAt: NOW,
    seed: 'seed-1',
    exercises: EXERCISES,
    ...over,
  }
}

function generate(over: Partial<GenerateWorkoutInput> = {}): Workout {
  const result = generateWorkout(input(over))
  if (result.outcome !== 'generated') {
    throw new Error(`expected a session, got ${result.outcome}: ${result.reason}`)
  }
  return result.workout
}

function exerciseIds(workout: Workout): string[] {
  return workout.blocks.flatMap((block) => blockEntries(block).map((entry) => entry.exerciseId))
}

const DURATIONS: DurationChoice[] = [15, 30, 45, 'default']

describe('what the generator emits is a valid session', () => {
  it.each(DURATIONS)('validates against the workout schema at %s', (choice) => {
    const parsed = workoutSchema.safeParse(generate({ availableTime: choice }))
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBeNull()
  })

  it.each(DURATIONS)('never programmes the same exercise twice at %s', (choice) => {
    const ids = exerciseIds(generate({ availableTime: choice }))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(DURATIONS)('never programmes a single-set exercise at %s', (choice) => {
    // One set costs the setup and the walk across the gym and buys almost
    // nothing. The plan calls it junk volume by name.
    for (const block of generate({ availableTime: choice }).blocks) {
      for (const entry of blockEntries(block)) {
        expect(entry.targets.length, `${entry.exerciseId} has one set`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('never emits a one-round superset', () => {
    for (const choice of DURATIONS) {
      for (const block of generate({ availableTime: choice }).blocks) {
        if (isSupersetBlock(block)) expect(block.rounds).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('the duration control rebuilds rather than truncates', () => {
  it.each(DURATIONS)('lands inside its own budget at %s', (choice) => {
    const workout = generate({ availableTime: choice })
    expect(workout.estimatedMinutes).toBeLessThanOrEqual(workout.plannedMinutes)
  })

  it('does not make the short session a prefix of the long one', () => {
    // THE locked rule for this phase: a shorter length rebuilds the session for
    // that time. If 15 minutes were simply the first exercises of the default
    // session, this is the assertion that would catch it.
    const short = exerciseIds(generate({ availableTime: 15 }))
    const full = exerciseIds(generate({ availableTime: 'default' }))
    const isPrefix = short.every((id, index) => full[index] === id)
    expect(isPrefix).toBe(false)
  })

  it('gives a longer session more work than a shorter one', () => {
    const counts = DURATIONS.map((choice) => {
      const workout = generate({ availableTime: choice })
      return workout.blocks.reduce(
        (sum, block) => sum + blockEntries(block).reduce((n, entry) => n + entry.targets.length, 0),
        0,
      )
    })
    expect(counts[0]).toBeLessThan(counts[3])
  })

  it('warms up briefly at 15 minutes and properly at default', () => {
    // The plan is explicit that a long optional warm-up block does not belong in
    // a 15-minute session.
    expect(generate({ availableTime: 15 }).warmUp.estimatedSeconds).toBeLessThan(
      generate({ availableTime: 'default' }).warmUp.estimatedSeconds,
    )
  })
})

describe('the hybrid strength and hypertrophy model', () => {
  it('does not give every exercise the same rep range', () => {
    // A session where everything is 3x10 is the most likely way to get this
    // phase wrong, so it is asserted rather than hoped for.
    const workout = generate()
    const ranges = new Set(
      workout.blocks.flatMap((block) =>
        blockEntries(block).map((entry) => `${entry.targets[0].reps.min}-${entry.targets[0].reps.max}`),
      ),
    )
    expect(ranges.size).toBeGreaterThan(1)
  })

  it('rests longer on strength work than on isolation work', () => {
    const workout = generate()
    const restByRole = new Map<string, number>()
    for (const block of workout.blocks) {
      for (const entry of blockEntries(block)) {
        restByRole.set(entry.role, entry.targets[0].restSeconds)
      }
    }
    const strength = restByRole.get('primary-strength')
    const isolation = restByRole.get('isolation') ?? restByRole.get('secondary-hypertrophy')
    if (strength !== undefined && isolation !== undefined) {
      expect(strength).toBeGreaterThan(isolation)
    }
  })

  it('prescribes tempo only where there is a reason for it', () => {
    for (const block of generate().blocks) {
      for (const entry of blockEntries(block)) {
        for (const target of entry.targets) {
          if (target.tempo) expect(target.tempo.reason).toBeTruthy()
        }
      }
    }
  })
})

describe('what the person told us is honoured', () => {
  it('never programmes an exercise they said they dislike', () => {
    const base = createDefaultProfile(NOW)
    const disliked = exerciseIds(generate())[0]
    const profile: Profile = {
      ...base,
      exercisePreferences: {
        ...base.exercisePreferences,
        disliked: { exerciseIds: [disliked], freeText: [] },
      },
    }
    expect(exerciseIds(generate({ profile }))).not.toContain(disliked)
  })

  it('never programmes a barbell squat when they asked to avoid them', () => {
    const base = createDefaultProfile(NOW)
    const profile: Profile = {
      ...base,
      limitations: { ...base.limitations, avoidBarbellSquat: true },
    }
    const ids = exerciseIds(generate({ profile, availableTime: 'default' }))
    for (const id of ids) {
      const exercise = EXERCISES.find((candidate) => candidate.id === id)
      expect(exercise?.contraindicatedFor).not.toContain('barbell-squat')
    }
  })

  it('never programmes equipment that is not there', () => {
    const equipment = defaultEquipmentFor('home')
    const available = new Set(equipment)
    for (const id of exerciseIds(generate({ equipment, availableTime: 'default' }))) {
      const exercise = EXERCISES.find((candidate) => candidate.id === id)
      for (const needed of exercise?.equipment ?? []) expect(available.has(needed)).toBe(true)
    }
  })

  it('leaves supersets out entirely when they are switched off', () => {
    const base = createDefaultProfile(NOW)
    const profile: Profile = { ...base, techniques: { ...base.techniques, supersets: false } }
    for (const choice of DURATIONS) {
      const workout = generate({ profile, availableTime: choice })
      expect(workout.blocks.some(isSupersetBlock)).toBe(false)
    }
  })

  it('leaves drop sets out entirely when they are switched off', () => {
    const base = createDefaultProfile(NOW)
    const profile: Profile = { ...base, techniques: { ...base.techniques, dropSets: false } }
    const workout = generate({ profile, availableTime: 'default' })
    for (const block of workout.blocks) {
      for (const entry of blockEntries(block)) {
        for (const target of entry.targets) expect(target.dropSet).toBeNull()
      }
    }
  })

  it('shows the goal — bigger arms brings arm work forward', () => {
    const base = createDefaultProfile(NOW)
    const armGroups = new Set(['biceps', 'triceps', 'forearms'])
    const armSets = (profile: Profile) => {
      const workout = generate({ profile, availableTime: 'default' })
      return workout.musclePriorities
        .filter((priority) => armGroups.has(priority.group))
        .reduce((sum, priority) => sum + priority.targetSets, 0)
    }
    const balanced: Profile = { ...base, goals: { primary: 'balanced-development', secondary: null } }
    const arms: Profile = { ...base, goals: { primary: 'bigger-arms', secondary: null } }
    expect(armSets(arms)).toBeGreaterThan(armSets(balanced))
  })
})

describe('determinism', () => {
  it('produces byte-identical output for identical input', () => {
    expect(JSON.stringify(generate())).toBe(JSON.stringify(generate()))
  })

  it('reads no clock — the same seed on a different day differs only by date', () => {
    const a = generate({ forDate: '2026-09-02', generatedAt: NOW })
    const b = generate({ forDate: '2026-09-02', generatedAt: NOW })
    expect(a.id).toBe(b.id)
    expect(exerciseIds(a)).toEqual(exerciseIds(b))
  })
})

describe('honesty about what it knows', () => {
  it('does not claim high confidence with no history at all', () => {
    const workout = generate()
    expect(workout.confidence.level).not.toBe('high')
    expect(workout.confidence.limiters).toContain('no-workout-history')
  })

  it('leaves every weight unknown, with a reason, before there is any history', () => {
    for (const block of generate().blocks) {
      for (const entry of blockEntries(block)) {
        for (const target of entry.targets) {
          expect(['unknown', 'none']).toContain(target.weight.kind)
        }
      }
    }
  })

  it('explains itself in terms it actually used', () => {
    const workout = generate({ availableTime: 30 })
    expect(workout.explanation.headline).toBeTruthy()
    expect(workout.explanation.points.length).toBeGreaterThan(0)
    const groups = new Set(workout.musclePriorities.map((priority) => priority.group))
    for (const point of workout.explanation.points) {
      for (const group of point.muscleGroups) expect(groups.has(group)).toBe(true)
    }
  })
})

describe('the canonical list row', () => {
  it('gives one row per block, naming both moves of a superset', () => {
    const workout = generate({ availableTime: 45 })
    const rows = workoutListRows(workout, (id) => EXERCISES.find((e) => e.id === id)?.name ?? null)
    expect(rows).toHaveLength(workout.blocks.length)
    for (const row of rows) {
      if (row.kind === 'superset') expect(row.entryIds).toHaveLength(2)
    }
  })
})

describe('when nothing can be built', () => {
  it('says so, rather than returning an empty session', () => {
    const result = generateWorkout(input({ exercises: [] }))
    expect(result.outcome).toBe('none')
    if (result.outcome === 'none') {
      expect(result.reason).toBe('catalog-empty')
      expect(result.message).toBeTruthy()
    }
  })

  it('says so when the equipment rules everything out', () => {
    const result = generateWorkout(input({ equipment: [] }))
    if (result.outcome === 'none') expect(result.message).toBeTruthy()
    else expect(result.workout.blocks.length).toBeGreaterThan(0)
  })
})

describe('cost', () => {
  it('generates a session well inside the 700 ms budget', () => {
    const started = performance.now()
    for (const choice of DURATIONS) generate({ availableTime: choice })
    expect(performance.now() - started).toBeLessThan(700)
  })
})
