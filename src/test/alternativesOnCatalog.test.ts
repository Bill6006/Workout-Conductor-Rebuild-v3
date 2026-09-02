import { describe, expect, it } from 'vitest'
import { defaultEquipmentFor, type EquipmentId } from '../catalog/equipment/equipment'
import { EXERCISES, getExercise, requireExercise } from '../catalog/exercises/catalog'
import { rollUpMuscles } from '../catalog/muscles/muscles'
import {
  buildAlternativesIndex,
  defineSessionSlot,
  isRanked,
  rankAlternatives,
  type AlternativesContext,
  type AlternativesIndex,
  type ExcludedCandidate,
  type SessionSlot,
} from '../engine/alternatives'
import type { ExercisePreferences } from '../core/validation/schemas'
import type { Exercise } from '../catalog/exercises/exerciseSchema'

/**
 * THE ALTERNATIVES RANKER, AGAINST THE EXERCISES THAT ACTUALLY SHIP.
 *
 * `engine/alternatives/*.test.ts` proves the ranker's LOGIC using fixtures built
 * one field apart, which is the right way to test a scoring function: when the
 * order changes there is exactly one thing it can be about. What those tests
 * cannot do — deliberately, because the data was being authored at the same time —
 * is answer the question a person actually asks, which is "if I tap swap on this
 * lift, in this gym, does something sensible come back?"
 *
 * That question can only be asked of the real catalog, and its answers depend on
 * data no fixture models: how granular `primaryMuscles` really is, whether a
 * `commonSubstitutions` link exists, whether enough entries survive a limitation
 * to leave a pool. A ranker can be perfectly correct and still return nothing for
 * half the catalog, and nothing in either module's own tests would notice.
 *
 * WHAT IS ASSERTED AND WHAT IS NOT. This file asserts properties that must hold
 * for EVERY entry — an answer comes back, it trains the same thing, nothing
 * impossible is offered, the order does not move between runs. It does not pin
 * "the best alternative to a bench press is X", because that is a judgement the
 * weights own and a test that pins it would fail every time somebody legitimately
 * retunes them. The one exception is a handful of pairs where a wrong answer would
 * be obviously wrong to anybody who lifts, and those are asserted as membership in
 * the returned list rather than as a position in it.
 */

/* ------------------------------------------------------------------ *
 * Fixtures made of real data
 * ------------------------------------------------------------------ */

/** Built once. Every ranking call in this file reuses it, as the app does. */
const INDEX: AlternativesIndex = buildAlternativesIndex(EXERCISES)

const FULL_GYM: readonly EquipmentId[] = defaultEquipmentFor('gym')
const HOME_KIT: readonly EquipmentId[] = defaultEquipmentFor('home')
const TRAVEL_KIT: readonly EquipmentId[] = defaultEquipmentFor('travel')

const NO_PREFERENCES: ExercisePreferences = {
  preferred: { exerciseIds: [], freeText: [] },
  disliked: { exerciseIds: [], freeText: [] },
}

function slot(id: string, exercise: Exercise, overrides: Partial<SessionSlot> = {}): SessionSlot {
  return defineSessionSlot({ slotId: id, exercise, ...overrides })
}

/**
 * The simplest honest request: one exercise in the session, and a swap on it.
 * Everything a test does not care about is spelled out here once, so a scenario
 * below states only the thing it is about.
 */
function contextFor(current: Exercise, overrides: Partial<AlternativesContext> = {}): AlternativesContext {
  return {
    session: [slot('slot-1', current)],
    targetSlotId: 'slot-1',
    availableEquipment: FULL_GYM,
    location: 'gym',
    limitations: [],
    preferences: NO_PREFERENCES,
    goal: 'hybrid',
    remainingSeconds: null,
    fatigue: null,
    ...overrides,
  }
}

function groupsOf(exercise: Exercise): readonly string[] {
  return rollUpMuscles(exercise.primaryMuscles)
}

function sharesAGroup(a: Exercise, b: Exercise): boolean {
  const left = new Set(groupsOf(a))
  return groupsOf(b).some((group) => left.has(group))
}

function exclusionOf(excluded: readonly ExcludedCandidate[], id: string): ExcludedCandidate | undefined {
  return excluded.find((entry) => entry.exerciseId === id)
}

/* ------------------------------------------------------------------ *
 * Every exercise, swept
 * ------------------------------------------------------------------ */

describe('every exercise in the catalog has usable alternatives at a full gym', () => {
  const results = EXERCISES.map((exercise) => ({
    exercise,
    result: (() => {
      const context = contextFor(exercise)
      return { context, value: (0, INDEX.candidatesFor)(exercise), ranked: rank(exercise) }
    })(),
  }))

  function rank(exercise: Exercise) {
    return rankFor(exercise, {})
  }

  it('returns at least one alternative for every entry', () => {
    // A person can tap "swap" on any exercise the app programmes. An entry with
    // no alternative is a dead end they reach with no warning, and — because the
    // pool is seeded from muscle group, pattern, family and substitutions — it
    // means the entry is isolated in the data rather than that the ranker failed.
    const stranded = results
      .filter(({ result }) => !isRanked(result.ranked))
      .map(({ exercise, result }) =>
        isRanked(result.ranked) ? '' : `${exercise.id}: ${result.ranked.reason} — ${result.ranked.message}`,
      )

    expect(stranded, 'exercises with nowhere to go at a fully equipped gym').toEqual([])
  })

  it('never offers something that trains a different muscle group', () => {
    const wrong: string[] = []

    for (const { exercise, result } of results) {
      if (!isRanked(result.ranked)) continue
      for (const alternative of result.ranked.alternatives) {
        const candidate = requireExercise(alternative.exerciseId)
        if (!sharesAGroup(candidate, exercise)) {
          wrong.push(`${exercise.id} -> ${candidate.id} (${groupsOf(exercise)} vs ${groupsOf(candidate)})`)
        }
      }
    }

    expect(wrong).toEqual([])
  })

  it('leads with something that shares a primary muscle group', () => {
    // The top row is the one a person taps without reading. It has to be the
    // closest thing the catalog has, not merely a legal one.
    for (const { exercise, result } of results) {
      if (!isRanked(result.ranked)) continue
      const top = requireExercise(result.ranked.alternatives[0].exerciseId)
      expect(sharesAGroup(top, exercise), `${exercise.id} -> ${top.id} share no muscle group`).toBe(true)
    }
  })

  it('never offers the exercise being replaced, or one that is not production-ready', () => {
    const wrong: string[] = []

    for (const { exercise, result } of results) {
      if (!isRanked(result.ranked)) continue
      for (const alternative of result.ranked.alternatives) {
        if (alternative.exerciseId === exercise.id) wrong.push(`${exercise.id} offered itself`)
        const candidate = requireExercise(alternative.exerciseId)
        if (!candidate.productionEnabled) wrong.push(`${exercise.id} -> unfinished ${candidate.id}`)
      }
    }

    expect(wrong).toEqual([])
  })

  it('scores every alternative inside 0..100, in descending order', () => {
    for (const { exercise, result } of results) {
      if (!isRanked(result.ranked)) continue
      const scores = result.ranked.alternatives.map((alternative) => alternative.matchScore)

      for (const score of scores) {
        expect(Number.isInteger(score), `${exercise.id}: non-integer score ${score}`).toBe(true)
        expect(score, exercise.id).toBeGreaterThanOrEqual(0)
        expect(score, exercise.id).toBeLessThanOrEqual(100)
      }
      expect(
        [...scores].sort((a, b) => b - a),
        `${exercise.id} is not in descending order`,
      ).toEqual(scores)
    }
  })

  it('gives every alternative a reason and a summary a screen can render', () => {
    const silent: string[] = []

    for (const { exercise, result } of results) {
      if (!isRanked(result.ranked)) continue
      for (const alternative of result.ranked.alternatives) {
        if (alternative.primaryReason.text.trim() === '')
          silent.push(`${exercise.id} -> ${alternative.exerciseId}: no reason`)
        if (alternative.summary.trim() === '')
          silent.push(`${exercise.id} -> ${alternative.exerciseId}: no summary`)
        if (alternative.name.trim() === '')
          silent.push(`${exercise.id} -> ${alternative.exerciseId}: no name`)
      }
    }

    expect(silent).toEqual([])
  })
})

function rankFor(current: Exercise, overrides: Partial<AlternativesContext>) {
   
  return rankAlternativesReal(current, overrides)
}

/* ------------------------------------------------------------------ *
 * Scenarios a person would recognise
 * ------------------------------------------------------------------ */

describe('the alternatives a lifter would expect', () => {
  it('offers other chest presses in place of a barbell bench press', () => {
    const result = rankFor(requireExercise('barbell-bench-press'), {})
    expect(isRanked(result)).toBe(true)
    if (!isRanked(result)) return

    const offered = result.alternatives.map((alternative) => alternative.exerciseId)

    // Not an ordering assertion — the weights own that. What must be true is that
    // the obvious neighbours are in the list at all.
    expect(offered).toContain('dumbbell-bench-press')
    expect(offered.some((id) => id === 'machine-chest-press' || id === 'smith-machine-bench-press')).toBe(
      true,
    )
  })

  it('offers another vertical pull in place of a lat pulldown', () => {
    const result = rankFor(requireExercise('lat-pulldown'), {})
    expect(isRanked(result)).toBe(true)
    if (!isRanked(result)) return

    const offered = result.alternatives.map((alternative) => alternative.exerciseId)
    expect(
      offered.some((id) => ['pull-up', 'chin-up', 'neutral-grip-pull-up', 'assisted-pull-up'].includes(id)),
    ).toBe(true)
  })

  it('offers another hamstring hinge in place of a Romanian deadlift', () => {
    const result = rankFor(requireExercise('barbell-romanian-deadlift'), {})
    expect(isRanked(result)).toBe(true)
    if (!isRanked(result)) return

    const offered = result.alternatives.map((alternative) => alternative.exerciseId)
    expect(offered).toContain('dumbbell-romanian-deadlift')
  })
})

/* ------------------------------------------------------------------ *
 * The three exclusions that must really exclude
 * ------------------------------------------------------------------ */

describe('what the ranker refuses to offer', () => {
  it('drops everything the equipment at hand cannot do', () => {
    const current = requireExercise('lat-pulldown')
    const result = rankFor(current, { availableEquipment: HOME_KIT })

    // A lat pulldown itself is a gym machine, so the home list has to come from
    // the bar. Every returned alternative must be doable with the home kit.
    const kit = new Set<string>(HOME_KIT)
    if (isRanked(result)) {
      for (const alternative of result.alternatives) {
        const candidate = requireExercise(alternative.exerciseId)
        const missing = candidate.equipment.filter((id) => !kit.has(id))
        expect(missing, `${candidate.id} needs ${missing.join(', ')} which home does not have`).toEqual([])
      }
    }

    // And the ones that were dropped say so by name, with the missing kit
    // attached — a refusal a screen can turn into a sentence.
    const blocked = exclusionOf(result.excluded, 'close-grip-lat-pulldown')
    expect(blocked?.code).toBe('equipment-unavailable')
    expect(blocked?.missingEquipment).toEqual(['lat-pulldown'])
  })

  it('reports a candidate that only needs a different location as exactly that', () => {
    const current = requireExercise('lat-pulldown')
    const result = rankFor(current, {
      availableEquipment: HOME_KIT,
      otherLocations: [{ id: 'loc-gym', name: 'Ironworks Gym', equipment: [...FULL_GYM] }],
    })

    const blocked = exclusionOf(result.excluded, 'close-grip-lat-pulldown')
    expect(blocked?.code).toBe('requires-location-change')
    expect(blocked?.availableAt.map((location) => location.name)).toEqual(['Ironworks Gym'])
  })

  it('drops a barbell squat once the barbell-squat limitation is declared', () => {
    const current = requireExercise('barbell-back-squat')
    const result = rankFor(current, { limitations: ['barbell-squat'] })

    const blocked = exclusionOf(result.excluded, 'barbell-front-squat')
    expect(blocked?.code).toBe('limitation-contraindicated')

    // The point of the limitation is that quad work continues, so the list must
    // not be empty — the catalog carries a dozen non-barbell quad options.
    expect(isRanked(result)).toBe(true)
    if (!isRanked(result)) return
    for (const alternative of result.alternatives) {
      expect(requireExercise(alternative.exerciseId).contraindicatedFor).not.toContain('barbell-squat')
    }
  })

  it('drops a shoulder-contraindicated press once a shoulder is declared', () => {
    const current = requireExercise('dumbbell-bench-press')
    const result = rankFor(current, { limitations: ['shoulder'] })

    // Chest dip is contraindicated for the shoulder and is in the chest pool.
    const blocked = exclusionOf(result.excluded, 'chest-dip')
    expect(blocked?.code).toBe('limitation-contraindicated')

    if (isRanked(result)) {
      for (const alternative of result.alternatives) {
        expect(
          requireExercise(alternative.exerciseId).contraindicatedFor,
          `${alternative.exerciseId} is contraindicated for the shoulder and was offered anyway`,
        ).not.toContain('shoulder')
      }
    }
  })

  it('drops an exercise the person listed as one to avoid, by id', () => {
    const current = requireExercise('barbell-bench-press')
    const result = rankFor(current, {
      preferences: {
        preferred: { exerciseIds: [], freeText: [] },
        disliked: { exerciseIds: ['dumbbell-bench-press'], freeText: [] },
      },
    })

    expect(exclusionOf(result.excluded, 'dumbbell-bench-press')?.code).toBe('disliked')
    if (isRanked(result)) {
      expect(result.alternatives.map((alternative) => alternative.exerciseId)).not.toContain(
        'dumbbell-bench-press',
      )
    }
  })

  it('drops one listed in the person’s own words, through the catalog’s own resolver', () => {
    // This is the Phase 1 profile: every dislike is free text, because there was
    // no catalog to pick from. Honouring only the ids would ignore all of them.
    const current = requireExercise('barbell-bench-press')
    const result = rankFor(current, {
      preferences: {
        preferred: { exerciseIds: [], freeText: [] },
        // An alias, not the display name — 'db bench press' is an alias of
        // `dumbbell-bench-press`, and the exercise the person means is obvious.
        disliked: { exerciseIds: [], freeText: ['db bench press'] },
      },
    })

    expect(exclusionOf(result.excluded, 'dumbbell-bench-press')?.code).toBe('disliked')
  })

  it('offers nothing at all, and says why, when a travel bag cannot cover the muscle', () => {
    // The catalog has no band or bodyweight biceps work, so a travelling person
    // asking to swap a curl has to be told plainly rather than shown an empty list.
    const current = requireExercise('barbell-curl')
    const result = rankFor(current, { availableEquipment: TRAVEL_KIT, location: 'travel' })

    expect(isRanked(result)).toBe(false)
    if (isRanked(result)) return
    expect(result.alternatives).toEqual([])
    expect(result.message.trim()).not.toBe('')
    expect(result.reason).toBe('location-unsuitable')
  })
})

/* ------------------------------------------------------------------ *
 * Determinism and cost
 * ------------------------------------------------------------------ */

describe('ranking the real catalog is deterministic', () => {
  const SAMPLE = [
    'barbell-bench-press',
    'lat-pulldown',
    'barbell-back-squat',
    'dumbbell-lateral-raise',
    'plank',
    'triceps-rope-pushdown',
  ]

  it('produces byte-identical results on repeated calls', () => {
    for (const id of SAMPLE) {
      const current = requireExercise(id)
      const first = JSON.stringify(rankFor(current, {}))
      const second = JSON.stringify(rankFor(current, {}))
      expect(second, `${id} ranked differently on the second call`).toBe(first)
    }
  })

  it('produces the same ranking whatever order the catalog was indexed in', () => {
    // Catalog order is the last tie-break inside the pool, so an index built from
    // the reversed list is the sharpest available test that ordering comes from
    // the score and not from the file the entry happens to live in.
    const reversed = buildAlternativesIndex([...EXERCISES].reverse())

    for (const id of SAMPLE) {
      const current = requireExercise(id)
      const forward = rankFor(current, {})
      const backward = rankAlternativesWith(reversed, current, {})

      expect(JSON.stringify(backward), `${id} ranks differently when the catalog is indexed backwards`).toBe(
        JSON.stringify(forward),
      )
    }
  })

  it('does not mutate the catalog', () => {
    const before = JSON.stringify(EXERCISES)
    for (const id of SAMPLE) rankFor(requireExercise(id), {})
    expect(JSON.stringify(EXERCISES)).toBe(before)
  })
})

describe('ranking the real catalog stays inside its budget', () => {
  it('builds the index over 127 entries quickly', () => {
    const started = performance.now()
    buildAlternativesIndex(EXERCISES)
    const elapsed = performance.now() - started

    // Measured at a few milliseconds. The budget is loose because CI machines are
    // shared; what it catches is an accidentally quadratic index build, which
    // would be two orders of magnitude out rather than a few percent.
    expect(elapsed, `index build took ${elapsed.toFixed(1)}ms`).toBeLessThan(500)
  })

  it('ranks every exercise in the catalog well inside a frame budget each', () => {
    const started = performance.now()
    for (const exercise of EXERCISES) rankFor(exercise, {})
    const elapsed = performance.now() - started
    const perCall = elapsed / EXERCISES.length

    // ~8 ms per call when measured. The 40 ms average allows a 5x slowdown on a
    // loaded runner before failing, which is still far short of the 200 ms a tap
    // may take without feeling broken.
    expect(perCall, `${perCall.toFixed(1)}ms per ranking call over ${EXERCISES.length} entries`).toBeLessThan(
      40,
    )
  })
})

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

// Declared after use so the scenarios above read top-down. Both wrappers exist
// only to keep `rankAlternatives(index, context, options)` from being repeated
// forty times with the same first argument.
function rankAlternativesReal(current: Exercise, overrides: Partial<AlternativesContext>) {
  return rankAlternativesWith(INDEX, current, overrides)
}

function rankAlternativesWith(
  index: AlternativesIndex,
  current: Exercise,
  overrides: Partial<AlternativesContext>,
) {
  const found = getExercise(current.id)
  expect(found, `${current.id} is not in the catalog`).not.toBeNull()
  return rankAlternatives(index, contextFor(current, overrides))
}
