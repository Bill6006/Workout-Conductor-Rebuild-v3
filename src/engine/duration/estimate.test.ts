import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import {
  makeEntry,
  makeRampedEntry,
  makeSetTarget,
  makeSingleBlock,
  makeSupersetBlock,
  makeWorkout,
} from '../../core/validation/testFixtures'
import type { SetTarget, SupersetBlock } from '../../core/validation/workoutSchema'
import { anExercise } from '../conflicts/testFixtures'
import { restPolicyFor, supersetRests } from './budget'
import {
  estimateBlock,
  estimateCandidate,
  estimateEntry,
  estimateSession,
  estimateSetTarget,
  estimateWorkout,
  lookupFrom,
  supersetSaving,
  timeBudgetFields,
  warmUpStepSeconds,
} from './estimate'
import { FALLBACK_SETUP_SECONDS, TRANSITION_SECONDS } from './timeModel'

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const BENCH: Exercise = anExercise({
  id: 'barbell-bench-press',
  setupTimeSeconds: 90,
  transitionCost: 'high',
  typicalRepRange: { min: 6, max: 10 },
  compoundOrIsolation: 'compound',
})

const LATERAL: Exercise = anExercise({
  id: 'dumbbell-lateral-raise',
  setupTimeSeconds: 30,
  transitionCost: 'low',
  typicalRepRange: { min: 10, max: 15 },
  compoundOrIsolation: 'isolation',
})

const PUSHDOWN: Exercise = anExercise({
  id: 'cable-triceps-pushdown',
  setupTimeSeconds: 30,
  transitionCost: 'moderate',
  typicalRepRange: { min: 10, max: 15 },
  compoundOrIsolation: 'isolation',
})

const PLANK: Exercise = anExercise({
  id: 'plank',
  setupTimeSeconds: 15,
  transitionCost: 'low',
  repUnit: 'seconds',
  typicalRepRange: { min: 30, max: 60 },
  compoundOrIsolation: 'isolation',
})

const CATALOG = [BENCH, LATERAL, PUSHDOWN, PLANK]
const lookup = lookupFrom(CATALOG)

/* ------------------------------------------------------------------ *
 * One set
 * ------------------------------------------------------------------ */

describe('estimating one set', () => {
  it('charges the work and the rest that follows it', () => {
    const target = makeSetTarget({ setId: 's1', reps: { min: 10, max: 10, unit: 'reps' }, restSeconds: 90 })
    const estimate = estimateSetTarget(target, BENCH)
    expect(estimate.cost.workSeconds).toBe(30)
    expect(estimate.cost.restSeconds).toBe(90)
    expect(estimate.cost.transitionSeconds).toBe(0)
    expect(estimate.cost.totalSeconds).toBe(120)
  })

  it('charges the LAST rest too, rather than assuming it is free', () => {
    // The `sets - 1` shortcut is where optimism creeps into a session estimate:
    // it makes every exercise a full rest cheaper than it really is.
    const target = makeSetTarget({ setId: 's1', restSeconds: 180 })
    expect(estimateSetTarget(target, BENCH).cost.restSeconds).toBe(180)
  })

  it('reads a hold in seconds', () => {
    const target = makeSetTarget({
      setId: 's1',
      reps: { min: 45, max: 45, unit: 'seconds' },
      restSeconds: 60,
    })
    expect(estimateSetTarget(target, PLANK).cost.workSeconds).toBe(45)
  })

  it('charges a drop-set intent only for the seconds spent stripping load', () => {
    const plain = makeSetTarget({ setId: 's1', reps: { min: 10, max: 10, unit: 'reps' } })
    const dropping = makeSetTarget({
      setId: 's2',
      reps: { min: 10, max: 10, unit: 'reps' },
      dropSet: { drops: 2, loadReductionPercent: 20, transitionSeconds: 12 },
    })
    // The drops themselves are separate `drop` targets in the same entry and are
    // estimated in their own right; charging their work here would double count.
    expect(estimateSetTarget(dropping, BENCH).cost.workSeconds).toBe(
      estimateSetTarget(plain, BENCH).cost.workSeconds + 24,
    )
  })

  it('uses a prescribed tempo over the default rep speed', () => {
    const target = makeSetTarget({
      setId: 's1',
      reps: { min: 8, max: 8, unit: 'reps' },
      tempo: {
        eccentricSeconds: 4,
        bottomPauseSeconds: 1,
        concentricSeconds: 1,
        topPauseSeconds: 0,
        reason: 'control-eccentric',
      },
    })
    expect(estimateSetTarget(target, BENCH).cost.workSeconds).toBe(8 * 6)
  })
})

/* ------------------------------------------------------------------ *
 * One entry
 * ------------------------------------------------------------------ */

describe('estimating one exercise entry', () => {
  it('charges setup once, then every set', () => {
    const entry = makeEntry({ entryId: 'e1', exerciseId: BENCH.id })
    const estimate = estimateEntry(entry, lookup)
    expect(estimate.cost.transitionSeconds).toBe(BENCH.setupTimeSeconds)
    expect(estimate.sets).toHaveLength(3)
    expect(estimate.cost.totalSeconds).toBe(
      BENCH.setupTimeSeconds + estimate.cost.workSeconds + estimate.cost.restSeconds,
    )
  })

  it('never costs less for more sets', () => {
    let previous = -1
    for (let sets = 1; sets <= 8; sets += 1) {
      const targets: SetTarget[] = Array.from({ length: sets }, (_, index) =>
        makeSetTarget({ setId: `s${index + 1}` }),
      )
      const total = estimateEntry(makeEntry({ entryId: 'e1', exerciseId: BENCH.id, targets }), lookup).cost
        .totalSeconds
      expect(total).toBeGreaterThan(previous)
      previous = total
    }
  })

  it('reports the seconds that went on ramp sets', () => {
    const estimate = estimateEntry(makeRampedEntry('e1'), lookup)
    expect(estimate.rampSeconds).toBeGreaterThan(0)
    expect(estimate.rampSeconds).toBeLessThan(estimate.cost.totalSeconds)
  })

  it('falls back honestly for an exercise the catalog does not know', () => {
    const entry = makeEntry({ entryId: 'e1', exerciseId: 'custom:my-machine' })
    const estimate = estimateEntry(entry, lookup)
    expect(estimate.usedFallback).toBe(true)
    expect(estimate.cost.transitionSeconds).toBe(FALLBACK_SETUP_SECONDS)
    // Falling back must never mean costing nothing.
    expect(estimate.cost.totalSeconds).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ *
 * Blocks, and the superset saving
 * ------------------------------------------------------------------ */

/** A superset built with the rest scheme `budget.ts` would program for it. */
function pairedBlock(rounds: number, betweenSeconds: number, afterSeconds: number): SupersetBlock {
  const targets = (entryId: string, rest: number) =>
    Array.from({ length: rounds }, (_, index) =>
      makeSetTarget({
        setId: `${entryId}-r${index + 1}`,
        reps: { min: 12, max: 12, unit: 'reps' },
        restSeconds: rest,
      }),
    )
  return makeSupersetBlock({
    blockId: 'pair',
    rounds,
    restBetweenMovesSeconds: betweenSeconds,
    restAfterRoundSeconds: afterSeconds,
    moves: [
      makeEntry({
        entryId: 'pair-a',
        exerciseId: LATERAL.id,
        role: 'isolation',
        targets: targets('pair-a', betweenSeconds),
      }),
      makeEntry({
        entryId: 'pair-b',
        exerciseId: PUSHDOWN.id,
        role: 'isolation',
        targets: targets('pair-b', afterSeconds),
      }),
    ],
  })
}

describe('estimating a block', () => {
  it('a single block costs exactly its entry', () => {
    const block = makeSingleBlock({
      blockId: 'b1',
      entry: makeEntry({ entryId: 'e1', exerciseId: BENCH.id }),
    })
    const estimate = estimateBlock(block, lookup)
    expect(estimate.cost).toEqual(estimateEntry(block.entry, lookup).cost)
  })

  it('a superset pays two setups, because it holds two stations', () => {
    const block = pairedBlock(3, 25, 90)
    const estimate = estimateBlock(block, lookup)
    expect(estimate.cost.transitionSeconds).toBeGreaterThanOrEqual(
      LATERAL.setupTimeSeconds + PUSHDOWN.setupTimeSeconds,
    )
  })

  it('charges the walk across only when the programmed gap cannot cover it', () => {
    const covered = estimateBlock(pairedBlock(3, TRANSITION_SECONDS.moderate + 10, 90), lookup)
    const uncovered = estimateBlock(pairedBlock(3, 5, 90), lookup)
    expect(covered.cost.transitionSeconds).toBe(LATERAL.setupTimeSeconds + PUSHDOWN.setupTimeSeconds)
    expect(uncovered.cost.transitionSeconds).toBeGreaterThan(covered.cost.transitionSeconds)
  })

  it('reports the rest the block ends on, so the next walk can net against it', () => {
    expect(estimateBlock(pairedBlock(3, 25, 90), lookup).trailingRestSeconds).toBe(90)
  })
})

describe('what a superset is worth', () => {
  const policy = restPolicyFor('default', 'standard')

  it('costs less than the same two exercises performed separately', () => {
    const rests = supersetRests(policy, 'primary-hypertrophy', 'secondary-hypertrophy')
    const saving = supersetSaving({
      first: LATERAL,
      second: PUSHDOWN,
      rounds: 3,
      straightRestFirstSeconds: policy.byRole['primary-hypertrophy'],
      straightRestSecondSeconds: policy.byRole['secondary-hypertrophy'],
      betweenMovesSeconds: rests.betweenMovesSeconds,
      afterRoundSeconds: rests.afterRoundSeconds,
    })
    expect(saving.pairedSeconds).toBeLessThan(saving.separateSeconds)
    expect(saving.saves).toBe(true)
    expect(saving.savedSeconds).toBe(saving.separateSeconds - saving.pairedSeconds)
  })

  /**
   * The rest below which alternating stops paying for itself.
   *
   * A superset's saving IS the second straight rest: one round rest replaces two.
   * When both movements already rested only about half a minute there is no
   * second rest worth replacing, and the walk across — paid every round instead
   * of once — costs more than the pairing saves. Around 45 seconds is where the
   * two cross for a low-to-moderate transition pair, so the sweep below claims
   * the property only above it, and the test after this one pins what happens
   * underneath.
   */
  const REST_AT_WHICH_PAIRING_PAYS = 45

  it('saves time across every ordinary pairing of roles, styles and durations', () => {
    const roles = [
      'primary-strength',
      'secondary-strength',
      'primary-hypertrophy',
      'secondary-hypertrophy',
      'isolation',
    ] as const
    let asserted = 0
    for (const choice of [15, 30, 45, 'default'] as const) {
      for (const style of ['short', 'standard', 'long'] as const) {
        const scheme = restPolicyFor(choice, style)
        for (const roleA of roles) {
          for (const roleB of roles) {
            const restA = scheme.byRole[roleA]
            const restB = scheme.byRole[roleB]
            const rests = supersetRests(scheme, roleA, roleB)
            const saving = supersetSaving({
              first: LATERAL,
              second: PUSHDOWN,
              rounds: 3,
              straightRestFirstSeconds: restA,
              straightRestSecondSeconds: restB,
              betweenMovesSeconds: rests.betweenMovesSeconds,
              afterRoundSeconds: rests.afterRoundSeconds,
            })
            expect(saving.savedSeconds).toBe(saving.separateSeconds - saving.pairedSeconds)
            if (Math.min(restA, restB) < REST_AT_WHICH_PAIRING_PAYS) continue
            expect(saving.saves).toBe(true)
            asserted += 1
          }
        }
      }
    }
    // A sweep that skipped everything would pass while proving nothing.
    expect(asserted).toBeGreaterThan(100)
  })

  it('does not claim a saving at the rest floor, where there is no second rest to replace', () => {
    const squeezed = restPolicyFor(15, 'short')
    const rests = supersetRests(squeezed, 'isolation', 'isolation')
    const saving = supersetSaving({
      first: LATERAL,
      second: PUSHDOWN,
      rounds: 3,
      straightRestFirstSeconds: squeezed.byRole.isolation,
      straightRestSecondSeconds: squeezed.byRole.isolation,
      betweenMovesSeconds: rests.betweenMovesSeconds,
      afterRoundSeconds: rests.afterRoundSeconds,
    })
    expect(saving.saves).toBe(false)
  })

  it('says so honestly when a pairing would NOT save time', () => {
    // Two briefly-rested movements on opposite sides of a gym: alternated, the
    // walk is paid every round instead of once. A model that assumed supersets
    // always save time would talk the generator into this pairing.
    const farAway = anExercise({ id: 'far-machine', transitionCost: 'high', setupTimeSeconds: 30 })
    const saving = supersetSaving({
      first: LATERAL,
      second: farAway,
      rounds: 4,
      straightRestFirstSeconds: 30,
      straightRestSecondSeconds: 30,
      betweenMovesSeconds: 15,
      afterRoundSeconds: 45,
    })
    expect(saving.saves).toBe(false)
    expect(saving.savedSeconds).toBeLessThan(0)
  })
})

/* ------------------------------------------------------------------ *
 * A whole session
 * ------------------------------------------------------------------ */

describe('estimating a whole session', () => {
  it('adds warm-up steps, every block, and the walk between them', () => {
    const workout = makeWorkout()
    const estimate = estimateWorkout(workout, lookup)
    expect(estimate.warmUpStepSeconds).toBe(warmUpStepSeconds(workout.warmUp))
    expect(estimate.totalSeconds).toBe(
      estimate.warmUpStepSeconds + estimate.workSeconds + estimate.restSeconds + estimate.transitionSeconds,
    )
    expect(estimate.blocks).toHaveLength(workout.blocks.length)
  })

  it('counts a ramp set once — inside its block, not twice via the warm-up', () => {
    // `warmUpTotalSeconds` is for `WarmUpPlan.estimatedSeconds`. Adding it to a
    // total that already walked the blocks is the double count this splits apart.
    const estimate = estimateWorkout(makeWorkout(), lookup)
    expect(estimate.rampSeconds).toBeGreaterThan(0)
    expect(estimate.warmUpTotalSeconds).toBe(estimate.warmUpStepSeconds + estimate.rampSeconds)
    expect(estimate.totalSeconds).toBeLessThan(estimate.warmUpTotalSeconds + estimate.totalSeconds)
    const withoutRamps = estimateSession(
      { blocks: makeWorkout().blocks, warmUpStepSeconds: 0 },
      lookup,
    ).totalSeconds
    expect(estimate.totalSeconds).toBe(withoutRamps + estimate.warmUpStepSeconds)
  })

  it('charges the first block its whole walk, having no rest to spend it during', () => {
    const one = estimateSession(
      {
        blocks: [
          makeSingleBlock({ blockId: 'b1', entry: makeEntry({ entryId: 'e1', exerciseId: BENCH.id }) }),
        ],
        warmUpStepSeconds: 0,
      },
      lookup,
    )
    expect(one.transitionSeconds).toBe(BENCH.setupTimeSeconds + TRANSITION_SECONDS.high)
  })

  it('never costs less for more blocks', () => {
    const blocks = [
      makeSingleBlock({ blockId: 'b1', entry: makeEntry({ entryId: 'e1', exerciseId: BENCH.id }) }),
      makeSingleBlock({ blockId: 'b2', entry: makeEntry({ entryId: 'e2', exerciseId: LATERAL.id }) }),
      makeSingleBlock({ blockId: 'b3', entry: makeEntry({ entryId: 'e3', exerciseId: PUSHDOWN.id }) }),
    ]
    let previous = -1
    for (let count = 1; count <= blocks.length; count += 1) {
      const total = estimateSession(
        { blocks: blocks.slice(0, count), warmUpStepSeconds: 0 },
        lookup,
      ).totalSeconds
      expect(total).toBeGreaterThan(previous)
      previous = total
    }
  })

  it('charges a circuit for revisiting every station on every round', () => {
    const blocks = [
      makeSingleBlock({ blockId: 'b1', entry: makeEntry({ entryId: 'e1', exerciseId: LATERAL.id }) }),
      makeSingleBlock({ blockId: 'b2', entry: makeEntry({ entryId: 'e2', exerciseId: PUSHDOWN.id }) }),
    ]
    const plain = estimateSession({ blocks, warmUpStepSeconds: 0 }, lookup)
    const circuited = estimateSession(
      {
        blocks,
        warmUpStepSeconds: 0,
        circuits: [
          {
            circuitId: 'c1',
            blockIds: ['b1', 'b2'],
            rounds: 3,
            restBetweenStationsSeconds: 15,
            restAfterRoundSeconds: 60,
          },
        ],
      },
      lookup,
    )
    expect(circuited.transitionSeconds).toBeGreaterThan(plain.transitionSeconds)
  })

  it('reports the band and the minutes a screen shows', () => {
    const estimate = estimateWorkout(makeWorkout(), lookup)
    expect(estimate.band.seconds).toBe(estimate.totalSeconds)
    expect(estimate.band.lowSeconds).toBeLessThan(estimate.totalSeconds)
    expect(estimate.band.highSeconds).toBeGreaterThan(estimate.totalSeconds)
    expect(estimate.minutes).toBe(Math.round(estimate.totalSeconds / 60))
  })

  it('hands the audit trail the same four numbers it reported', () => {
    const estimate = estimateWorkout(makeWorkout(), lookup)
    const fields = timeBudgetFields(estimate)
    expect(fields.estimatedSeconds).toBe(estimate.totalSeconds)
    expect(fields.warmUpSeconds + fields.workSeconds + fields.restSeconds + fields.transitionSeconds).toBe(
      estimate.totalSeconds,
    )
  })

  it('is deterministic', () => {
    const workout = makeWorkout()
    const a = estimateWorkout(workout, lookup)
    const b = estimateWorkout(workout, lookupFrom([...CATALOG]))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

/* ------------------------------------------------------------------ *
 * A candidate the generator has not committed to
 * ------------------------------------------------------------------ */

describe('estimating a candidate', () => {
  it('never costs less for more sets', () => {
    let previous = -1
    for (let workingSets = 0; workingSets <= 10; workingSets += 1) {
      const cost = estimateCandidate({ exercise: BENCH, workingSets, restSeconds: 120 }).totalSeconds
      expect(cost).toBeGreaterThanOrEqual(previous)
      previous = cost
    }
  })

  it('never costs less for more rest', () => {
    let previous = -1
    for (let restSeconds = 0; restSeconds <= 300; restSeconds += 30) {
      const cost = estimateCandidate({ exercise: BENCH, workingSets: 3, restSeconds }).totalSeconds
      expect(cost).toBeGreaterThanOrEqual(previous)
      previous = cost
    }
  })

  it('reports what one more set would cost, which is less than another exercise', () => {
    const cost = estimateCandidate({ exercise: BENCH, workingSets: 3, restSeconds: 120 })
    expect(cost.marginalSetSeconds).toBe(cost.perSetSeconds)
    // The whole reason a rebuild reaches for volume before it reaches for another
    // movement: a set pays no setup and no walk.
    expect(cost.marginalSetSeconds).toBeLessThan(cost.totalSeconds)
    expect(cost.setupSeconds + cost.walkSeconds).toBe(cost.transitionSeconds)
  })

  it('agrees with the built entry it would become', () => {
    const targets = Array.from({ length: 3 }, (_, index) =>
      makeSetTarget({ setId: `s${index + 1}`, reps: { min: 8, max: 8, unit: 'reps' }, restSeconds: 120 }),
    )
    const built = estimateEntry(makeEntry({ entryId: 'e1', exerciseId: BENCH.id, targets }), lookup)
    const candidate = estimateCandidate({
      exercise: BENCH,
      workingSets: 3,
      reps: 8,
      restSeconds: 120,
      previousRestSeconds: 600,
    })
    expect(candidate.workSeconds).toBe(built.cost.workSeconds)
    expect(candidate.restSeconds).toBe(built.cost.restSeconds)
    expect(candidate.transitionSeconds).toBe(built.cost.transitionSeconds)
  })

  it('costs ramp sets and drops on top', () => {
    const bare = estimateCandidate({ exercise: BENCH, workingSets: 3, restSeconds: 120 })
    const ramped = estimateCandidate({
      exercise: BENCH,
      workingSets: 3,
      restSeconds: 120,
      warmUpSets: 2,
      warmUpRestSeconds: 40,
    })
    const dropped = estimateCandidate({
      exercise: BENCH,
      workingSets: 3,
      restSeconds: 120,
      dropSet: { drops: 2, loadReductionPercent: 20, transitionSeconds: 10 },
    })
    expect(ramped.totalSeconds).toBeGreaterThan(bare.totalSeconds)
    expect(ramped.rampSeconds).toBeGreaterThan(0)
    expect(dropped.totalSeconds).toBeGreaterThan(bare.totalSeconds)
  })

  it('costs a custom movement from the documented fallbacks rather than as free', () => {
    const cost = estimateCandidate({ exercise: null, workingSets: 3, restSeconds: 120 })
    expect(cost.setupSeconds).toBe(FALLBACK_SETUP_SECONDS)
    expect(cost.totalSeconds).toBeGreaterThan(0)
  })

  it('reads a hold in seconds', () => {
    const hold = estimateCandidate({ exercise: PLANK, workingSets: 3, restSeconds: 60 })
    // 45-second midpoint hold, three sets: 135 seconds of work, not 405.
    expect(hold.workSeconds).toBe(135)
  })
})
