import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { createConflictChecker } from './conflictsAdapter'
import { defaultSlotEstimator } from './estimate'
import { screenCandidate, type ScreenResult } from './exclusions'
import { buildPreferenceLookup } from './preferences'
import { readSession } from './sessionView'
import {
  BACK_SQUAT,
  BARBELL_BENCH,
  CABLE_FLY,
  DUMBBELL_BENCH,
  INCLINE_DUMBBELL,
  MACHINE_PRESS,
  PUSH_UP,
  UNFINISHED_PRESS,
  context,
  exercise,
  slot,
  testIndex,
} from './testFixtures'
import type { AlternativesContext } from './types'

/**
 * Every filter is exercised through the REAL conflict engine rather than a stub,
 * so these tests fail if the two modules ever disagree about what a session
 * forbids — which is the failure a stub would hide.
 */
function screen(
  candidate: Exercise,
  ctx: AlternativesContext = context(),
  allowSupersetBreak = false,
): ScreenResult {
  const view = readSession(ctx)
  return screenCandidate({
    candidate,
    current: view.target.exercise,
    context: ctx,
    view,
    available: new Set(ctx.availableEquipment),
    preferences: buildPreferenceLookup(ctx.preferences, testIndex()),
    estimate: defaultSlotEstimator,
    checker: createConflictChecker(ctx, view, defaultSlotEstimator),
    allowSupersetBreak,
  })
}

describe('what survives', () => {
  it('lets a workable alternative through with nothing to report', () => {
    const result = screen(DUMBBELL_BENCH)
    expect(result.excluded).toBeNull()
  })
})

describe('filters that need no session reasoning', () => {
  it('rules out the exercise being replaced', () => {
    expect(screen(BARBELL_BENCH).excluded?.code).toBe('is-current-exercise')
  })

  it('rules out an entry that is not finished, rather than dropping it silently', () => {
    const excluded = screen(UNFINISHED_PRESS).excluded
    expect(excluded?.code).toBe('not-production-enabled')
    expect(excluded?.name).toBe(UNFINISHED_PRESS.name)
  })

  it('rules out anything that trains the wrong thing', () => {
    expect(screen(BACK_SQUAT).excluded?.code).toBe('wrong-primary-muscle')
  })

  it('allows a different emphasis inside the same muscle group', () => {
    expect(screen(INCLINE_DUMBBELL).excluded).toBeNull()
  })

  it('rules out an exercise the person said they would rather not do', () => {
    const ctx = context({
      preferences: {
        preferred: { exerciseIds: [], freeText: [] },
        disliked: { exerciseIds: [], freeText: ['Push-up'] },
      },
    })
    expect(screen(PUSH_UP, ctx).excluded?.code).toBe('disliked')
  })

  it('rules out an exercise that does not suit where they are training', () => {
    const ctx = context({ location: 'travel', availableEquipment: [] })
    expect(screen(MACHINE_PRESS, ctx).excluded?.code).toBe('location-unsuitable')
  })
})

describe('equipment, and the difference a second location makes', () => {
  const noCables = context({ availableEquipment: ['barbell', 'flat-bench', 'squat-rack', 'dumbbells'] })

  it('rules out an exercise whose kit is nowhere, and names the kit', () => {
    const excluded = screen(CABLE_FLY, noCables).excluded
    expect(excluded?.code).toBe('equipment-unavailable')
    expect(excluded?.missingEquipment).toEqual(['cable-machine'])
    expect(excluded?.text).toContain('cable machine')
    expect(excluded?.availableAt).toEqual([])
  })

  it('reports the SAME exercise as a location change when another saved place has the kit', () => {
    const ctx = context({
      ...noCables,
      otherLocations: [{ id: 'loc-gym', name: 'The gym', equipment: ['cable-machine'] }],
    })
    const excluded = screen(CABLE_FLY, ctx).excluded
    expect(excluded?.code).toBe('requires-location-change')
    expect(excluded?.availableAt.map((location) => location.name)).toEqual(['The gym'])
    expect(excluded?.text).toContain('The gym')
  })

  it('does not offer a location that only has SOME of the missing kit', () => {
    const needsBoth = exercise({
      id: 'cable-crossover',
      name: 'Cable crossover',
      equipment: ['cable-machine', 'adjustable-bench'],
      locationSuitability: ['gym'],
    })
    const ctx = context({
      availableEquipment: ['barbell'],
      otherLocations: [{ id: 'loc-home', name: 'Home', equipment: ['cable-machine'] }],
    })
    expect(screen(needsBoth, ctx).excluded?.code).toBe('equipment-unavailable')
  })
})

describe('the clock', () => {
  it('rules out anything that will not fit the time that is left, and says how long it needs', () => {
    const ctx = context({ remainingSeconds: 120 })
    const excluded = screen(DUMBBELL_BENCH, ctx).excluded
    expect(excluded?.code).toBe('does-not-fit-remaining-time')
    expect(excluded?.text).toMatch(/\d+ min/)
  })

  it('lets the same exercise through when there is room', () => {
    expect(screen(DUMBBELL_BENCH, context({ remainingSeconds: 1800 })).excluded).toBeNull()
  })
})

describe('what the conflict engine decides', () => {
  const contraindicated = exercise({
    id: 'dip',
    name: 'Chest dip',
    equipment: ['dip-bars'],
    contraindicatedFor: ['shoulder'],
    jointStressTags: [{ joint: 'shoulder', intensity: 'high' }],
    progressionFamily: 'triceps-dip',
  })

  it('rules out an exercise a declared limitation forbids, and carries the conflict kind', () => {
    const ctx = context({ limitations: ['shoulder'], availableEquipment: ['dip-bars'] })
    const excluded = screen(contraindicated, ctx).excluded
    expect(excluded?.code).toBe('limitation-contraindicated')
    expect(excluded?.conflictKind).toBe('limitation')
    expect(excluded?.text.length).toBeGreaterThan(0)
  })

  it('lets the same exercise through when the limitation is not declared', () => {
    expect(screen(contraindicated, context({ availableEquipment: ['dip-bars'] })).excluded).toBeNull()
  })

  it('rules out an exercise the session already contains', () => {
    const ctx = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
        slot({ slotId: 'b', exercise: MACHINE_PRESS }),
      ],
    })
    const excluded = screen(MACHINE_PRESS, ctx).excluded
    expect(excluded?.code).toBe('duplicate-in-session')
    expect(excluded?.conflictKind).toBe('duplicate-exercise')
  })

  it('does not report the exercise being replaced as a duplicate of itself', () => {
    // The engine is asked with `replaces`, so the target slot is out of the session.
    expect(screen(DUMBBELL_BENCH).excluded).toBeNull()
  })

  it('returns the conflicts alongside the verdict, so the scorer need not ask twice', () => {
    const ctx = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
        slot({ slotId: 'b', exercise: INCLINE_DUMBBELL }),
      ],
    })
    const result = screen(MACHINE_PRESS, ctx)
    expect(result.conflicts.length).toBeGreaterThan(0)
  })
})

describe('supersets', () => {
  const notPairable = exercise({
    id: 'heavy-floor-press',
    name: 'Heavy floor press',
    supersetCompatibility: { eligible: false, stationId: null, gripHeavy: false, competingDemands: [] },
    progressionFamily: 'horizontal-press-dumbbell',
  })

  const paired = context({
    session: [
      slot({ slotId: 'a', exercise: BARBELL_BENCH, supersetId: 's1' }),
      slot({ slotId: 'b', exercise: BACK_SQUAT, supersetId: 's1' }),
    ],
  })

  it('rules out a candidate that cannot be supersetted while the slot is one half of a superset', () => {
    const excluded = screen(notPairable, paired).excluded
    expect(excluded?.code).toBe('superset-conflict')
    expect(excluded?.conflictKind).toBe('superset')
  })

  it('lets it through when the caller has already accepted that the pairing may end', () => {
    expect(screen(notPairable, paired, true).excluded).toBeNull()
  })

  it('does not object at all when the slot is not part of a superset', () => {
    expect(screen(notPairable).excluded).toBeNull()
  })
})

describe('overlap, and the lift the session was built around', () => {
  const crowding = exercise({
    id: 'incline-machine-press',
    name: 'Incline machine press',
    primaryMuscles: ['upper-chest', 'mid-chest'],
    equipment: ['selectorised-machines'],
    locationSuitability: ['gym'],
    progressionFamily: 'incline-press-machine',
  })

  it('rules out a candidate that repeats what the rest of the session already does', () => {
    const ctx = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
        slot({ slotId: 'b', exercise: INCLINE_DUMBBELL }),
      ],
    })
    const excluded = screen(crowding, ctx).excluded
    expect(excluded?.code).toBe('excessive-overlap')
  })

  it('reports the same overlap as interference when it is a LATER priority lift being crowded', () => {
    const ctx = context({
      session: [
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
        slot({ slotId: 'b', exercise: INCLINE_DUMBBELL, priority: 'priority' }),
      ],
    })
    const excluded = screen(crowding, ctx).excluded
    expect(excluded?.code).toBe('interferes-with-priority')
  })

  it('reports plain overlap, not interference, once the priority lift has been done', () => {
    // The overlap is real — the work happened — but nothing is left to spoil, so
    // the more alarming reason would be untrue.
    const ctx = context({
      session: [
        slot({ slotId: 'b', exercise: INCLINE_DUMBBELL, priority: 'priority', status: 'completed' }),
        slot({ slotId: 'a', exercise: BARBELL_BENCH }),
      ],
    })
    expect(screen(crowding, ctx).excluded?.code).toBe('excessive-overlap')
  })
})
