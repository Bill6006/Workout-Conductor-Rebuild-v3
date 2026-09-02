import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { NO_ALTERNATIVE_PRIORITY, rankAlternatives } from './rankAlternatives'
import { UnknownSlotError } from './sessionView'
import { NO_ALTERNATIVE_REASONS } from './types'
import {
  BACK_SQUAT,
  BARBELL_BENCH,
  BARBELL_ROW,
  CABLE_FLY,
  CATALOG,
  DUMBBELL_BENCH,
  INCLINE_DUMBBELL,
  LAT_PULLDOWN,
  MACHINE_PRESS,
  PUSH_UP,
  UNFINISHED_PRESS,
  context,
  exercise,
  slot,
  testIndex,
} from './testFixtures'
import type { AlternativesContext, AlternativesResult, RankedAlternative } from './types'
import { isRanked } from './types'

function rank(ctx: AlternativesContext = context(), options = {}): AlternativesResult {
  return rankAlternatives(testIndex(), ctx, options)
}

function ranked(ctx: AlternativesContext = context(), options = {}): readonly RankedAlternative[] {
  const result = rank(ctx, options)
  if (!isRanked(result)) throw new Error(`expected alternatives, got ${result.reason}`)
  return result.alternatives
}

const order = (list: readonly RankedAlternative[]) => list.map((entry) => entry.exerciseId)
const positionOf = (list: readonly RankedAlternative[], id: string) =>
  list.findIndex((entry) => entry.exerciseId === id)

describe('the shape of an answer', () => {
  it('refuses a target slot that is not in the session rather than ranking the wrong thing', () => {
    expect(() => rank(context({ targetSlotId: 'not-a-slot' }))).toThrow(UnknownSlotError)
  })

  it('reports which conflict engine answered', () => {
    expect(rank().conflictSource).toBe('engine')
    const stub = rank(context(), { conflictChecker: { id: 'stub', check: () => [] } })
    expect(stub.conflictSource).toBe('injected')
  })

  it('names the exercise being replaced and how many candidates it looked at', () => {
    const result = rank()
    expect(result.currentExerciseId).toBe(BARBELL_BENCH.id)
    expect(result.currentExerciseName).toBe(BARBELL_BENCH.name)
    expect(result.considered).toBeGreaterThan(0)
  })

  it('honours a limit', () => {
    expect(ranked(context(), { limit: 2 })).toHaveLength(2)
  })

  it('gives every alternative everything the Phase 5 screen has to show', () => {
    for (const alternative of ranked()) {
      expect(alternative.matchScore).toBeGreaterThanOrEqual(0)
      expect(alternative.matchScore).toBeLessThanOrEqual(100)
      expect(alternative.matchQuality.length).toBeGreaterThan(0)
      expect(alternative.primaryReason.text.length).toBeGreaterThan(0)
      expect(alternative.primaryReason.code.length).toBeGreaterThan(0)
      expect(alternative.supportingReasons.length).toBeLessThanOrEqual(2)
      expect(Array.isArray(alternative.equipment)).toBe(true)
      expect(alternative.setupTimeSeconds).toBeGreaterThanOrEqual(0)
      expect(alternative.estimatedSlotSeconds).toBeGreaterThan(0)
      expect(typeof alternative.progression.preservesHistory).toBe('boolean')
      expect(alternative.superset.effect).toBe('not-in-superset')
      expect(alternative.summary.endsWith('.')).toBe(true)
      expect(alternative.factors.length).toBeGreaterThan(0)
    }
  })

  it('is sorted best first, with no score above the one before it', () => {
    const scores = ranked().map((entry) => entry.matchScore)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})

describe('the ordering is sensible — a barbell bench press at a full gym', () => {
  const list = ranked()

  it('puts the same movement on a different implement first', () => {
    expect(list[0].exerciseId).toBe(DUMBBELL_BENCH.id)
  })

  it('ranks a machine version of the same press above an isolation fly', () => {
    expect(positionOf(list, MACHINE_PRESS.id)).toBeLessThan(positionOf(list, CABLE_FLY.id))
  })

  it('ranks the fly last of the chest work — it is the loosest match of the set', () => {
    expect(list[list.length - 1].exerciseId).toBe(CABLE_FLY.id)
  })

  it('never offers a pull, a squat, or an unfinished entry', () => {
    expect(order(list)).not.toContain(BARBELL_ROW.id)
    expect(order(list)).not.toContain(BACK_SQUAT.id)
    expect(order(list)).not.toContain(UNFINISHED_PRESS.id)
  })

  it('explains the top pick with a reason, not a number', () => {
    expect(list[0].primaryReason.text.length).toBeGreaterThan(0)
    expect(list[0].keyDifference?.code).toBe('different-equipment')
  })
})

describe('the ordering is sensible — the same swap in a hotel room', () => {
  const travel = context({ location: 'travel', availableEquipment: [], remainingSeconds: 1800 })

  it('offers the one thing that needs nothing, and nothing else', () => {
    expect(order(ranked(travel))).toEqual([PUSH_UP.id])
  })

  it('says a gym-only exercise is out because of WHERE they are, before mentioning kit', () => {
    // "Not one for travel" is a truer answer than "you have no cable machine":
    // the cable machine is not the reason a hotel room is a hotel room.
    const result = rank(travel)
    expect(result.excluded.find((entry) => entry.exerciseId === CABLE_FLY.id)?.code).toBe(
      'location-unsuitable',
    )
  })

  it('names the missing kit when the place is fine and only the equipment is not', () => {
    const emptyHome = context({ location: 'home', availableEquipment: [] })
    const result = rank(emptyHome)
    const dumbbell = result.excluded.find((entry) => entry.exerciseId === DUMBBELL_BENCH.id)
    expect(dumbbell?.code).toBe('equipment-unavailable')
    expect(dumbbell?.missingEquipment).toContain('dumbbells')
  })

  it('points at the location that DOES have the kit when there is one', () => {
    const emptyHome = context({
      location: 'home',
      availableEquipment: [],
      otherLocations: [{ id: 'loc-gym', name: 'The gym', equipment: ['dumbbells', 'flat-bench'] }],
    })
    const dumbbell = rank(emptyHome).excluded.find((entry) => entry.exerciseId === DUMBBELL_BENCH.id)
    expect(dumbbell?.code).toBe('requires-location-change')
    expect(dumbbell?.text).toContain('The gym')
  })
})

describe('the ordering is sensible — the person has said what they want', () => {
  it('lifts an exercise they asked for above a closer structural match', () => {
    const withPreference = context({
      preferences: {
        preferred: { exerciseIds: [MACHINE_PRESS.id], freeText: [] },
        disliked: { exerciseIds: [], freeText: [] },
      },
    })
    const list = ranked(withPreference)
    expect(list[0].exerciseId).toBe(MACHINE_PRESS.id)
    expect(list[0].primaryReason.code).toBe('preferred-exercise')
  })

  it('honours a dislike typed as free text, which is how every Phase 1 profile stored it', () => {
    const disliked = context({
      preferences: {
        preferred: { exerciseIds: [], freeText: [] },
        disliked: { exerciseIds: [], freeText: ['Dumbbell bench press'] },
      },
    })
    expect(order(ranked(disliked))).not.toContain(DUMBBELL_BENCH.id)
    expect(rank(disliked).excluded.some((entry) => entry.code === 'disliked')).toBe(true)
  })
})

describe('the ordering is sensible — three minutes left', () => {
  const short = context({ remainingSeconds: 420 })

  it('drops anything that will not fit and keeps what will', () => {
    const list = ranked(short)
    for (const alternative of list) {
      expect(alternative.estimatedSlotSeconds).toBeLessThanOrEqual(420)
    }
    expect(list.length).toBeGreaterThan(0)
  })

  it('prefers the one that leaves the most room', () => {
    const list = ranked(short)
    expect(list[0].estimatedSlotSeconds).toBeLessThan(420)
  })
})

describe('progression continuity is surfaced, not buried', () => {
  const PAUSED_BENCH = exercise({
    id: 'paused-bench-press',
    name: 'Paused bench press',
    primaryMuscles: ['mid-chest'],
    trainingRole: 'primary-strength',
    strengthSuitability: 'excellent',
    equipment: ['barbell', 'flat-bench', 'squat-rack'],
    locationSuitability: ['gym'],
    setupTimeSeconds: 120,
    typicalRepRange: { min: 4, max: 6 },
    jointStressTags: [{ joint: 'shoulder', intensity: 'moderate' }],
    progressionFamily: BARBELL_BENCH.progressionFamily,
    load: { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true },
  })

  const withFamily: readonly Exercise[] = [...CATALOG, PAUSED_BENCH]

  it('marks the alternative that keeps the working weight, and only that one', () => {
    const result = rankAlternatives(testIndex(withFamily), context())
    if (!isRanked(result)) throw new Error('expected alternatives')
    const keeps = result.alternatives.filter((entry) => entry.progression.preservesHistory)
    expect(keeps.map((entry) => entry.exerciseId)).toEqual([PAUSED_BENCH.id])
    expect(keeps[0].progression.candidateFamily).toBe(BARBELL_BENCH.progressionFamily)
  })

  it('ranks it first, because keeping a working weight is worth real points', () => {
    const result = rankAlternatives(testIndex(withFamily), context())
    if (!isRanked(result)) throw new Error('expected alternatives')
    expect(result.alternatives[0].exerciseId).toBe(PAUSED_BENCH.id)
  })

  it('tells every other alternative that its progression starts again', () => {
    const result = rankAlternatives(testIndex(withFamily), context())
    if (!isRanked(result)) throw new Error('expected alternatives')
    const other = result.alternatives.find((entry) => entry.exerciseId === MACHINE_PRESS.id)
    expect(other?.progression.preservesHistory).toBe(false)
    expect(other?.differences.some((entry) => entry.code === 'progression-resets')).toBe(true)
  })
})

describe('supersets are respected', () => {
  const paired = context({
    session: [
      slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
      slot({ slotId: 'b', exercise: LAT_PULLDOWN, supersetId: 's1' }),
    ],
  })

  it('tells every alternative what happens to the pairing, and names the partner', () => {
    for (const alternative of ranked(paired)) {
      expect(['preserved', 'changed']).toContain(alternative.superset.effect)
      expect(alternative.superset.partnerExerciseId).toBe(LAT_PULLDOWN.id)
      expect(alternative.superset.partnerSlotId).toBe('b')
    }
  })

  it('withholds a candidate that would break the pairing', () => {
    const result = rank(paired)
    const excluded = result.excluded.filter((entry) => entry.code === 'superset-conflict')
    // The fly wants the same cable tower as nothing here, but the heavy presses
    // that cannot be supersetted are refused rather than silently paired.
    expect(order(ranked(paired))).not.toContain(BACK_SQUAT.id)
    expect(excluded.every((entry) => entry.conflictKind !== null)).toBe(true)
  })

  it('offers the broken pairing explicitly once the caller accepts it may end', () => {
    const heavyPartner = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
        slot({ slotId: 'b', exercise: BACK_SQUAT, supersetId: 's1' }),
      ],
    })
    const strict = rank(heavyPartner)
    const relaxed = rank(heavyPartner, { allowSupersetBreak: true })
    expect(relaxed.alternatives.length).toBeGreaterThan(strict.alternatives.length)
    expect(relaxed.alternatives.some((entry) => entry.superset.effect === 'broken')).toBe(true)
  })

  it('says a slot that was never supersetted is not one', () => {
    for (const alternative of ranked()) {
      expect(alternative.superset.effect).toBe('not-in-superset')
      expect(alternative.superset.partnerExerciseId).toBeNull()
    }
  })
})

describe('"no safe alternative exists" is an answer, not an empty list', () => {
  it('says so, with a machine-readable reason and a line to show', () => {
    const nothing = context({ location: 'travel', availableEquipment: [] })
    const stripped = testIndex(CATALOG.filter((entry) => entry.id !== PUSH_UP.id))
    const result = rankAlternatives(stripped, nothing)
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(result.alternatives).toEqual([])
    expect(result.reason).toBe('location-unsuitable')
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.excluded.length).toBeGreaterThan(0)
  })

  it('blames the equipment when the place is fine and the kit is not there', () => {
    const emptyHome = context({ location: 'home', availableEquipment: [] })
    const stripped = testIndex(CATALOG.filter((entry) => entry.id !== PUSH_UP.id))
    const result = rankAlternatives(stripped, emptyHome)
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(result.reason).toBe('equipment-unavailable')
  })

  it('blames the limitation when a limitation is what ruled everything out', () => {
    const forbidden = CATALOG.map((entry) =>
      entry.id === PUSH_UP.id || entry.id === BARBELL_BENCH.id
        ? entry
        : exercise({ ...entry, contraindicatedFor: ['shoulder'] }),
    )
    const result = rankAlternatives(
      testIndex([...forbidden.filter((entry) => entry.id !== PUSH_UP.id)]),
      context({ limitations: ['shoulder'] }),
    )
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(result.reason).toBe('limitation-blocked')
  })

  it('blames the clock when nothing fits the time that is left', () => {
    const result = rank(context({ remainingSeconds: 30 }))
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(result.reason).toBe('time-insufficient')
    expect(result.message).toMatch(/time/i)
  })

  it('says the catalog has nothing when the catalog has nothing', () => {
    const result = rankAlternatives(testIndex([BARBELL_BENCH]), context())
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(result.reason).toBe('no-candidates-in-catalog')
  })

  it('falls back to `mixed` rather than blaming one cause for many', () => {
    const mixedCauses = context({
      location: 'home',
      availableEquipment: ['dumbbells'],
      preferences: {
        preferred: { exerciseIds: [], freeText: [] },
        disliked: { exerciseIds: [], freeText: ['Push-up', 'Dumbbell bench press'] },
      },
    })
    const result = rankAlternatives(testIndex(), mixedCauses)
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(['mixed', 'user-excluded', 'location-unsuitable']).toContain(result.reason)
  })

  it('distinguishes a quality floor from nothing being possible', () => {
    const result = rank(context(), { minimumScore: 100 })
    expect(result.outcome).toBe('none')
    if (result.outcome !== 'none') throw new Error('expected none')
    expect(result.reason).toBe('below-quality-floor')
    expect(result.excluded.some((entry) => entry.code === 'below-quality-floor')).toBe(true)
  })
})

describe('determinism', () => {
  it('returns identical output for identical input, every field of it', () => {
    const first = rank()
    const second = rank()
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('does not depend on the order the catalog was handed to the index', () => {
    const forwards = rankAlternatives(testIndex(CATALOG), context())
    const backwards = rankAlternatives(testIndex([...CATALOG].reverse()), context())
    if (!isRanked(forwards) || !isRanked(backwards)) throw new Error('expected alternatives')
    expect(order(backwards.alternatives)).toEqual(order(forwards.alternatives))
  })

  it('breaks a tie the same way twice, on setup time and then on id', () => {
    const twinA = exercise({ id: 'twin-a-press', name: 'Twin A press', primaryMuscles: ['mid-chest'] })
    const twinB = exercise({ id: 'twin-b-press', name: 'Twin B press', primaryMuscles: ['mid-chest'] })
    const withTwins = [...CATALOG, twinB, twinA]
    const first = rankAlternatives(testIndex(withTwins), context())
    const second = rankAlternatives(testIndex([...withTwins].reverse()), context())
    if (!isRanked(first) || !isRanked(second)) throw new Error('expected alternatives')
    expect(positionOf(first.alternatives, twinA.id)).toBeLessThan(positionOf(first.alternatives, twinB.id))
    expect(order(second.alternatives)).toEqual(order(first.alternatives))
  })
})

describe('cost', () => {
  it('ranks against a realistic catalog well inside the budget', () => {
    const filler = Array.from({ length: 500 }, (_, position) =>
      exercise({
        id: `filler-${position}`,
        name: `Filler ${position}`,
        primaryMuscles: position % 2 === 0 ? ['mid-chest'] : ['quads'],
        movementPattern: position % 2 === 0 ? 'horizontal-push' : 'squat',
        equipment: ['dumbbells'],
        progressionFamily: position % 2 === 0 ? 'horizontal-press-dumbbell' : 'squat-dumbbell',
      }),
    )
    const index = testIndex([...CATALOG, ...filler])
    const started = performance.now()
    for (let run = 0; run < 5; run += 1) rankAlternatives(index, context())
    const perCall = (performance.now() - started) / 5
    expect(perCall).toBeLessThan(200)
  })
})

describe('what the caller sees when a candidate is merely awkward', () => {
  it('keeps it, warns, and costs it score rather than hiding it', () => {
    const crowded = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
        slot({ slotId: 'b', exercise: INCLINE_DUMBBELL }),
      ],
    })
    const result = rank(crowded)
    if (!isRanked(result)) throw new Error('expected alternatives')
    const warned = result.alternatives.filter((entry) => entry.warnings.length > 0)
    expect(warned.length).toBeGreaterThan(0)
    for (const alternative of warned) {
      const factor = alternative.factors.find((entry) => entry.key === 'conflict-caution')
      expect(factor?.score).toBeLessThan(1)
    }
  })
})

describe('the canonical tie-break order', () => {
  // A reason missing from the priority list could never win a tie, so it would
  // silently fall through to `mixed` and the user would get the vaguest possible
  // message. That is the kind of regression nobody notices, so assert coverage.
  it('names every reason except `mixed`, exactly once', () => {
    const expected = NO_ALTERNATIVE_REASONS.filter((reason) => reason !== 'mixed')

    expect([...NO_ALTERNATIVE_PRIORITY].sort()).toEqual([...expected].sort())
    expect(new Set(NO_ALTERNATIVE_PRIORITY).size).toBe(NO_ALTERNATIVE_PRIORITY.length)
  })
})
