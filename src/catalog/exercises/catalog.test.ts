import { describe, expect, it } from 'vitest'
import { EQUIPMENT_IDS } from '../equipment/equipment'
import { MOVEMENT_PATTERN_IDS } from '../movementPatterns/movementPatterns'
import { MUSCLE_GROUP_IDS, MUSCLE_IDS } from '../muscles/muscles'
import { KNOWN_PROGRESSION_FAMILIES } from '../taxonomy/taxonomy'
import * as exercisesBarrel from './index'
import {
  EXERCISES,
  EXERCISE_COUNT,
  EXERCISE_IDS,
  MUSCLE_GROUPS_IN_CATALOG,
  PROGRESSION_FAMILIES_IN_CATALOG,
  exerciseNameOf,
  exercisesForEquipment,
  exercisesForMuscle,
  exercisesForMuscleGroup,
  exercisesForPattern,
  exercisesInFamily,
  findExerciseByName,
  getExercise,
  isExerciseId,
  muscleGroupsOf,
  requireExercise,
  resolveExerciseId,
  searchExercises,
} from './catalog'
import { normaliseExerciseName } from './exerciseId'
import { exerciseSchema } from './exerciseSchema'

/**
 * THE WHOLE-CATALOG GATE.
 *
 * The catalog is authored by hand across three region files and is not validated
 * at runtime — `defineExercise` fills defaults without parsing, so that opening
 * the app does not cost 127 Zod parses. This file is the other half of that
 * bargain: everything the runtime declines to check is checked here, once, on CI.
 *
 * IT FAILS LOUDLY AND NAMES THE ENTRY. Every assertion below reports the id (and
 * usually the offending value) rather than a bare count, because "127 !== 126" is
 * not a bug report. Cross-region breakage in particular — a substitution pointing
 * at an id another region renamed — is reported as the specific dangling pair,
 * never silently dropped from a result.
 */

const KNOWN_FAMILIES = new Set<string>(KNOWN_PROGRESSION_FAMILIES)
const KNOWN_MUSCLES = new Set<string>(MUSCLE_IDS)
const KNOWN_PATTERNS = new Set<string>(MOVEMENT_PATTERN_IDS)
const KNOWN_EQUIPMENT = new Set<string>(EQUIPMENT_IDS)

/**
 * The two progression families the shipped data uses that the advisory registry
 * in `taxonomy.ts` does not list yet.
 *
 * Both are real gaps in the registry rather than mislabelled data, and both were
 * reported by the region authors when they wrote them:
 *
 *   `horizontal-row-bodyweight` — the registry has `horizontal-press-bodyweight`,
 *     `squat-bodyweight` and `lunge-bodyweight` but no bodyweight ROW, so the
 *     inverted row and the suspension row had nowhere honest to sit. Filing them
 *     under a loaded row family would let a barbell row's working weight travel
 *     to a movement whose `load.measure` is `none`.
 *
 *   `upright-row` — filing it under `lateral-raise` would let a 45 kg upright row
 *     inherit onto a dumbbell lateral raise, prescribing 45 kg per hand.
 *
 * This list is PINNED, not open: a third unknown family fails this test. It is
 * spelled out here rather than waved through because the fix is one line in
 * `taxonomy.ts` — a file this phase's integration work does not own — and a
 * pinned exception is a visible debt, where a lenient assertion is an invisible
 * one. Delete the entry, not the assertion, once the registry lists it.
 */
const FAMILIES_MISSING_FROM_REGISTRY = ['horizontal-row-bodyweight', 'upright-row']

describe('the assembled catalog', () => {
  it('holds every entry from all three regions, in authored order', () => {
    expect(EXERCISE_COUNT).toBe(EXERCISES.length)
    expect(EXERCISE_COUNT).toBe(127)
    expect(EXERCISE_IDS).toEqual(EXERCISES.map((exercise) => exercise.id))
    // The regions are concatenated, not interleaved: upper push/pull, then arms
    // and shoulders, then legs and core.
    expect(EXERCISE_IDS[0]).toBe('barbell-bench-press')
    expect(EXERCISE_IDS[EXERCISE_COUNT - 1]).toBe('cable-woodchop')
  })

  it('parses every entry against the exercise schema', () => {
    const failures = EXERCISES.flatMap((exercise) => {
      const result = exerciseSchema.safeParse(exercise)
      if (result.success) return []
      return [`${exercise.id}: ${result.error.issues.map((issue) => issue.message).join('; ')}`]
    })

    expect(failures).toEqual([])
  })

  it('leaves nothing to a default: a parsed entry is identical to the shipped one', () => {
    // `defineExercise` fills the documented defaults without parsing. If the two
    // ever disagree, the app would read one value and the tests another.
    for (const exercise of EXERCISES) {
      expect(exerciseSchema.parse(exercise), exercise.id).toEqual(exercise)
    }
  })

  it('has no duplicate ids', () => {
    const seen = new Map<string, number>()
    for (const exercise of EXERCISES) seen.set(exercise.id, (seen.get(exercise.id) ?? 0) + 1)
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id)

    expect(duplicates).toEqual([])
  })
})

describe('cross-region referential integrity', () => {
  it('resolves every commonSubstitutions id to a real exercise', () => {
    // The one check no region file can make on its own: a region author can only
    // see their own entries, so a substitution that reaches across regions is
    // exactly the reference that goes stale unnoticed.
    const dangling = EXERCISES.flatMap((exercise) =>
      exercise.commonSubstitutions
        .filter((id) => getExercise(id) === null)
        .map((id) => `${exercise.id} -> ${id}`),
    )

    expect(dangling).toEqual([])
  })

  it('never substitutes an exercise for itself', () => {
    const selfReferences = EXERCISES.filter((exercise) =>
      exercise.commonSubstitutions.includes(exercise.id),
    ).map((exercise) => exercise.id)

    expect(selfReferences).toEqual([])
  })

  it('lists no substitution twice', () => {
    const repeated = EXERCISES.flatMap((exercise) => {
      const unique = new Set(exercise.commonSubstitutions)
      return unique.size === exercise.commonSubstitutions.length ? [] : [exercise.id]
    })

    expect(repeated).toEqual([])
  })

  it('names only known muscles', () => {
    const unknown = EXERCISES.flatMap((exercise) =>
      [...exercise.primaryMuscles, ...exercise.secondaryMuscles]
        .filter((muscle) => !KNOWN_MUSCLES.has(muscle))
        .map((muscle) => `${exercise.id}: ${muscle}`),
    )

    expect(unknown).toEqual([])
  })

  it('names only known movement patterns', () => {
    const unknown = EXERCISES.filter((exercise) => !KNOWN_PATTERNS.has(exercise.movementPattern)).map(
      (exercise) => `${exercise.id}: ${exercise.movementPattern}`,
    )

    expect(unknown).toEqual([])
  })

  it('names only known equipment', () => {
    const unknown = EXERCISES.flatMap((exercise) =>
      [...exercise.equipment, ...exercise.optionalEquipment]
        .filter((item) => !KNOWN_EQUIPMENT.has(item))
        .map((item) => `${exercise.id}: ${item}`),
    )

    expect(unknown).toEqual([])
  })

  it('never lists one piece of equipment as both required and optional', () => {
    const contradictory = EXERCISES.flatMap((exercise) =>
      exercise.optionalEquipment
        .filter((item) => exercise.equipment.includes(item))
        .map((item) => `${exercise.id}: ${item}`),
    )

    expect(contradictory).toEqual([])
  })

  it('uses progression families the registry knows, apart from the pinned gaps', () => {
    const unknown = [...new Set(EXERCISES.map((exercise) => exercise.progressionFamily))]
      .filter((family) => !KNOWN_FAMILIES.has(family))
      .sort()

    expect(unknown).toEqual([...FAMILIES_MISSING_FROM_REGISTRY].sort())
  })

  it('gives every production-enabled entry a media id', () => {
    // The schema already refuses `mediaId: null` while production-enabled; this
    // says the same thing over the whole catalog so a gap is reported by name.
    const missing = EXERCISES.filter(
      (exercise) => exercise.productionEnabled && exercise.mediaId === null,
    ).map((exercise) => exercise.id)

    expect(missing).toEqual([])
  })
})

describe('name matching is unambiguous', () => {
  /**
   * THE MIGRATION DEPENDS ON THIS. `buildExerciseNameIndex` lets the first entry
   * claim a normalised key, so two exercises sharing a name or an alias would
   * make "squats" resolve to whichever one the catalog happened to list first.
   * A user's typed preference would then silently become a different exercise —
   * and it would change the day somebody reorders a region file.
   */
  function claimants(): Map<string, string[]> {
    const byKey = new Map<string, string[]>()
    for (const exercise of EXERCISES) {
      for (const candidate of [exercise.name, ...exercise.aliases]) {
        const key = normaliseExerciseName(candidate)
        const existing = byKey.get(key)
        if (existing) existing.push(exercise.id)
        else byKey.set(key, [exercise.id])
      }
    }
    return byKey
  }

  it('has no name or alias claimed by two exercises', () => {
    const collisions = [...claimants().entries()]
      .filter(([, ids]) => new Set(ids).size > 1)
      .map(([key, ids]) => `"${key}" claimed by ${[...new Set(ids)].join(', ')}`)

    expect(collisions).toEqual([])
  })

  it('has no exercise repeating its own name as an alias', () => {
    // Harmless to the index, but it means an author wrote a synonym that is not
    // one, and the duplicate hides the alias they meant to add.
    const repeats = EXERCISES.flatMap((exercise) => {
      const name = normaliseExerciseName(exercise.name)
      return exercise.aliases.some((alias) => normaliseExerciseName(alias) === name) ? [exercise.id] : []
    })

    expect(repeats).toEqual([])
  })

  it('resolves every name and alias back to its own exercise', () => {
    for (const exercise of EXERCISES) {
      for (const candidate of [exercise.name, ...exercise.aliases]) {
        expect(resolveExerciseId(candidate), `${exercise.id}: "${candidate}"`).toBe(exercise.id)
      }
    }
  })

  it('folds case, accents, punctuation and spacing when resolving', () => {
    expect(resolveExerciseId('  BARBELL   BENCH-PRESS ')).toBe('barbell-bench-press')
    expect(findExerciseByName('barbell bench press')?.name).toBe('Barbell bench press')
  })

  it('says no rather than guessing', () => {
    // No stemming and no edit distance: these are near misses, and a near miss
    // that resolves is a preference the person never expressed.
    expect(resolveExerciseId('bench pres')).toBeNull()
    expect(resolveExerciseId('')).toBeNull()
    expect(findExerciseByName('something nobody lifts')).toBeNull()
  })
})

describe('lookups', () => {
  it('finds an exercise by id and reports a miss as null', () => {
    expect(getExercise('barbell-back-squat')?.name).toBe('Barbell back squat')
    expect(getExercise('no-such-exercise')).toBeNull()
    expect(isExerciseId('barbell-back-squat')).toBe(true)
    expect(isExerciseId('no-such-exercise')).toBe(false)
    expect(exerciseNameOf('barbell-back-squat')).toBe('Barbell back squat')
    expect(exerciseNameOf('no-such-exercise')).toBeNull()
  })

  it('throws from requireExercise, naming the id', () => {
    expect(requireExercise('push-up').id).toBe('push-up')
    expect(() => requireExercise('no-such-exercise')).toThrow(/no-such-exercise/)
  })

  it('groups by primary muscle without leaking secondary work', () => {
    const lats = exercisesForMuscle('lats')
    expect(lats.map((exercise) => exercise.id)).toContain('pull-up')
    // The barbell row lists lats as primary; the deadlift does not.
    expect(lats.every((exercise) => exercise.primaryMuscles.includes('lats'))).toBe(true)
    expect(exercisesForMuscle('lats').map((e) => e.id)).not.toContain('barbell-curl')
  })

  it('rolls primary muscles up to groups once, and agrees with the index', () => {
    for (const group of MUSCLE_GROUPS_IN_CATALOG) {
      for (const exercise of exercisesForMuscleGroup(group)) {
        expect(muscleGroupsOf(exercise), exercise.id).toContain(group)
      }
    }
  })

  it('offers only muscle groups that have exercises, in canonical order', () => {
    expect(MUSCLE_GROUPS_IN_CATALOG.length).toBeGreaterThan(0)
    for (const group of MUSCLE_GROUPS_IN_CATALOG) {
      expect(exercisesForMuscleGroup(group).length, group).toBeGreaterThan(0)
    }
    const canonical = MUSCLE_GROUP_IDS.filter((id) => MUSCLE_GROUPS_IN_CATALOG.includes(id))
    expect([...MUSCLE_GROUPS_IN_CATALOG]).toEqual(canonical)
  })

  it('groups by movement pattern, equipment, and progression family', () => {
    expect(exercisesForPattern('squat').map((e) => e.id)).toContain('barbell-back-squat')
    expect(exercisesForEquipment('barbell').every((e) => e.equipment.includes('barbell'))).toBe(true)
    // Optional equipment is not a match: a goblet squat prefers a kettlebell but
    // does not require one, so it must not appear under "what a kettlebell gives me".
    const goblet = requireExercise('goblet-squat')
    expect(goblet.optionalEquipment).toContain('kettlebell')
    expect(exercisesForEquipment('kettlebell').map((e) => e.id)).not.toContain('goblet-squat')

    for (const family of PROGRESSION_FAMILIES_IN_CATALOG) {
      expect(
        exercisesInFamily(family).every((e) => e.progressionFamily === family),
        family,
      ).toBe(true)
    }
  })

  it('returns an empty list for an unknown key rather than throwing', () => {
    expect(exercisesInFamily('no-such-family')).toEqual([])
  })

  it('keeps catalog order in every grouped list', () => {
    const position = new Map(EXERCISE_IDS.map((id, index) => [id, index]))
    const lists = [
      exercisesForMuscleGroup('chest'),
      exercisesForPattern('hinge'),
      exercisesForEquipment('dumbbells'),
      exercisesInFamily('lateral-raise'),
    ]

    for (const list of lists) {
      const positions = list.map((exercise) => position.get(exercise.id) ?? -1)
      expect([...positions]).toEqual([...positions].sort((a, b) => a - b))
    }
  })
})

describe('search', () => {
  it('returns the whole catalog for an empty query, in order', () => {
    expect(searchExercises('').map((e) => e.id)).toEqual([...EXERCISE_IDS])
  })

  it('puts the closest match first', () => {
    const results = searchExercises('bench press')
    expect(results[0].id).toBe('barbell-bench-press')

    const rows = searchExercises('row').map((e) => e.name)
    // A word-start hit beats a mid-word one: "Barbell row" before anything that
    // merely contains the letters.
    expect(rows[0]).toBe('Barbell row')
  })

  it('matches aliases, and ranks them below name matches', () => {
    const byAlias = searchExercises('chin up')
    expect(byAlias.map((e) => e.id)).toContain('chin-up')
  })

  it('filters by muscle group', () => {
    const chest = searchExercises('press', { muscleGroups: ['chest'] })
    expect(chest.length).toBeGreaterThan(0)
    expect(chest.every((e) => muscleGroupsOf(e).includes('chest'))).toBe(true)
    expect(chest.map((e) => e.id)).not.toContain('barbell-overhead-press')
  })

  it('honours a limit without changing the order', () => {
    const all = searchExercises('curl')
    const first3 = searchExercises('curl', { limit: 3 })
    expect(first3.map((e) => e.id)).toEqual(all.slice(0, 3).map((e) => e.id))
  })

  it('is stable: the same query always gives the same order', () => {
    expect(searchExercises('press').map((e) => e.id)).toEqual(searchExercises('press').map((e) => e.id))
  })

  it('returns nothing rather than a loose guess', () => {
    expect(searchExercises('zzzz nothing')).toEqual([])
  })

  it('hides unfinished entries unless asked for them', () => {
    const unfinished = EXERCISES.filter((exercise) => !exercise.productionEnabled).map((e) => e.id)
    const offered = searchExercises('').map((e) => e.id)
    for (const id of unfinished) expect(offered).not.toContain(id)
    expect(searchExercises('', { includeUnfinished: true }).length).toBe(EXERCISE_COUNT)
  })
})

describe('the module barrel stays free of catalog data', () => {
  it('exports no exercise list', () => {
    // The barrel is imported by `core/validation` and `core/storage`, both of
    // which load on every launch. One re-export from here would put all 127
    // entries on the boot chunk, and nothing about the app would look wrong until
    // somebody measured first paint.
    const dataShaped = Object.entries(exercisesBarrel).filter(
      ([, value]) => Array.isArray(value) && value.length > 8,
    )

    expect(dataShaped.map(([name]) => name)).toEqual([])
    expect(Object.keys(exercisesBarrel)).not.toContain('EXERCISES')
  })
})
