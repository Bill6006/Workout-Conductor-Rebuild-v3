import { describe, expect, it } from 'vitest'
import { exerciseSchema } from '../../catalog/exercises/exerciseSchema'
import { buildAlternativesIndex } from './catalogIndex'
import {
  BACK_SQUAT,
  BARBELL_BENCH,
  BARBELL_ROW,
  CABLE_FLY,
  CATALOG,
  DUMBBELL_BENCH,
  INCLINE_DUMBBELL,
  MACHINE_PRESS,
  PUSH_UP,
  UNFINISHED_PRESS,
  exercise,
} from './testFixtures'

const ids = (list: readonly { id: string }[]): string[] => list.map((entry) => entry.id)

describe('the fixture catalog', () => {
  it('is made of entries the real schema would accept, so a test cannot pass on an impossible exercise', () => {
    for (const entry of CATALOG) {
      const result = exerciseSchema.safeParse(entry)
      expect(result.success, `${entry.id}: ${result.error?.message}`).toBe(true)
    }
  })
})

describe('building the index', () => {
  it('reaches every entry by id, including one that can never be proposed', () => {
    const index = buildAlternativesIndex(CATALOG)
    expect(index.byId('barbell-bench-press')).toBe(BARBELL_BENCH)
    expect(index.byId(UNFINISHED_PRESS.id)).toBe(UNFINISHED_PRESS)
    expect(index.byId('nothing-like-this')).toBeNull()
  })

  it('counts only the entries that may be programmed', () => {
    const index = buildAlternativesIndex(CATALOG)
    expect(index.productionSize).toBe(CATALOG.length - 1)
  })

  it('keeps the first entry to claim an id, so a malformed catalog cannot flip the answer', () => {
    const impostor = exercise({ id: 'push-up', name: 'Impostor push-up' })
    const index = buildAlternativesIndex([PUSH_UP, impostor])
    expect(index.byId('push-up')?.name).toBe('Push-up')
  })
})

describe('the candidate pool', () => {
  it('seeds from the muscle group, the movement pattern, the family, and the hand-picked list', () => {
    const index = buildAlternativesIndex(CATALOG)
    const pool = ids(index.candidatesFor(BARBELL_BENCH))
    expect(pool).toContain(DUMBBELL_BENCH.id)
    expect(pool).toContain(MACHINE_PRESS.id)
    expect(pool).toContain(INCLINE_DUMBBELL.id)
    expect(pool).toContain(PUSH_UP.id)
    // Overlapping pattern rather than a shared group: isolation-fly overlaps
    // horizontal-push, which is how a fly reaches a bench press's pool at all.
    expect(pool).toContain(CABLE_FLY.id)
  })

  it('never contains the exercise being replaced', () => {
    const index = buildAlternativesIndex(CATALOG)
    expect(ids(index.candidatesFor(BARBELL_BENCH))).not.toContain(BARBELL_BENCH.id)
  })

  it('leaves out anything that trains something else entirely', () => {
    const index = buildAlternativesIndex(CATALOG)
    const pool = ids(index.candidatesFor(BARBELL_BENCH))
    expect(pool).not.toContain(BACK_SQUAT.id)
    expect(pool).not.toContain(BARBELL_ROW.id)
  })

  it('still admits a hand-picked substitution that is not production-enabled, so it can be REPORTED', () => {
    // The alternative — dropping it silently — is a catalog error nobody ever sees.
    const index = buildAlternativesIndex(CATALOG)
    expect(ids(index.candidatesFor(BARBELL_BENCH))).toContain(UNFINISHED_PRESS.id)
  })

  it('leaves out an unfinished entry that is not hand-picked', () => {
    const index = buildAlternativesIndex(CATALOG)
    expect(ids(index.candidatesFor(DUMBBELL_BENCH))).not.toContain(UNFINISHED_PRESS.id)
  })

  it('returns the pool in catalog order, the same way every time', () => {
    const index = buildAlternativesIndex(CATALOG)
    const first = ids(index.candidatesFor(BARBELL_BENCH))
    const second = ids(index.candidatesFor(BARBELL_BENCH))
    expect(second).toEqual(first)
    const positions = first.map((id) => CATALOG.findIndex((entry) => entry.id === id))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('is a small fraction of a large catalog rather than a scan of it', () => {
    const filler = Array.from({ length: 400 }, (_, position) =>
      exercise({
        id: `filler-${position}`,
        name: `Filler ${position}`,
        primaryMuscles: ['quads'],
        movementPattern: 'knee-extension',
        progressionFamily: 'leg-extension',
      }),
    )
    const index = buildAlternativesIndex([...CATALOG, ...filler])
    expect(index.candidatesFor(BARBELL_BENCH).length).toBeLessThan(20)
  })
})
