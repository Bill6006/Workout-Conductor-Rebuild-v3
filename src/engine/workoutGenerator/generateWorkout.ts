/**
 * THE workout generator. One entry point, pure and deterministic.
 *
 * Same inputs and the same seed produce a byte-identical session, every time. It
 * reads no clock and calls no random number generator — `forDate`, `generatedAt`
 * and `seed` all arrive from the caller, which is what makes a generated session
 * reproducible and diffable.
 *
 * It composes the parts rather than reimplementing them:
 *   src/engine/volume     which muscles today should train, and how much
 *   src/engine/duration   what the chosen length can hold, and what things cost
 *   src/engine/scoring    which exercise fills a slot, and its set/rep scheme
 *   src/engine/techniques whether a superset or drop set earns its place
 *   src/engine/conflicts  whether a candidate clashes — via the injected checker
 *
 * THE DURATION RULE. A shorter length REBUILDS the session. `shapeFor` gives a
 * different set budget, group count, block count, warm-up and rest scaling, and
 * the whole session is built from those. A 15-minute session is therefore not a
 * prefix of the 60-minute one, and the generator's tests assert exactly that.
 *
 * Phase 4 will wrap this in the centralised Recalibration Engine. There is
 * deliberately ONE entry point so there is nothing for Phase 4 to have to unify.
 */
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import { muscleGroupLabel } from '../../catalog/labels/catalogLabels'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type {
  ExerciseEntry,
  ExplanationPoint,
  GenerationDecision,
  KnownCompromise,
  SetTarget,
  SingleBlock,
  SupersetBlock,
  WarmUpPlan,
  Workout,
  WorkoutBlock,
  WorkoutConfidence,
} from '../../core/validation/workoutSchema'
import { WORKOUT_SCHEMA_VERSION, isSupersetBlock } from '../../core/validation/workoutSchema'
import {
  MINIMUM_VIABLE_SECONDS,
  blockSeconds,
  entrySeconds,
  judgeFit,
  shapeFor,
  transitionSeconds,
} from '../duration/time'
import { schemeFor, tempoFor, tempoReasonFor } from '../scoring/prescribe'
import { selectForSlot, type SelectionContext } from '../scoring/selectExercise'
import { proposeDropSet, proposeSuperset } from '../techniques/techniques'
import { planMuscles } from '../volume/volume'
import { GENERATOR_VERSION, deriveSeed, type GenerateWorkoutInput, type GenerateWorkoutResult } from './types'

export function generateWorkout(input: GenerateWorkoutInput): GenerateWorkoutResult {
  const { profile, exercises } = input
  if (exercises.length === 0) {
    return {
      outcome: 'none',
      reason: 'catalog-empty',
      message: 'The exercise catalog is empty.',
      considered: 0,
    }
  }

  const style = profile.trainingStyle
  const shape = shapeFor(input.availableTime, profile.schedule.typicalDurationMin)
  const techniques = input.techniques ?? profile.techniques
  const decisions: GenerationDecision[] = []
  const compromises: KnownCompromise[] = []

  decisions.push({
    step: 'resolve-duration',
    text:
      input.availableTime === 'default'
        ? `Default length: ${Math.round(shape.budgetSeconds / 60)} min from your profile.`
        : `Building for ${input.availableTime} minutes.`,
    muscleGroups: [],
    entryIds: [],
    blockIds: [],
    varietyIndex: null,
  })

  // ---- what to train -----------------------------------------------------
  const plan = planMuscles(profile, shape.setBudget, {
    volume: input.weeklyMuscleVolume,
    exposure: input.recentMuscleExposure,
    maxGroups: shape.maxGroups,
  })
  if (plan.priorities.length === 0) {
    return {
      outcome: 'none',
      reason: 'no-usable-exercises',
      message: 'No muscle group came out as worth training today.',
      considered: exercises.length,
    }
  }
  decisions.push({
    step: 'muscle-priorities',
    text: `Priorities: ${plan.priorities.map((p) => muscleGroupLabel(p.group)).join(', ')}.`,
    muscleGroups: plan.priorities.map((p) => p.group),
    entryIds: [],
    blockIds: [],
    varietyIndex: null,
  })

  // ---- fill the slots ----------------------------------------------------
  const equipment = new Set<EquipmentId>(input.equipment)
  const preferredIds = new Set(profile.exercisePreferences.preferred.exerciseIds)
  const dislikedIds = new Set(profile.exercisePreferences.disliked.exerciseIds)
  const used = new Set<string>()
  const patternCounts = new Map<MovementPatternId, number>()
  const rejected: Workout['explanation'] extends never
    ? never
    : ReturnType<typeof selectForSlot>['rejected'][number][] = []

  const entries: { entry: ExerciseEntry; exercise: Exercise; group: MuscleGroupId }[] = []
  let spentSeconds = 0
  let counter = 0
  const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`

  // Round-robin the priorities so a session spreads across its groups rather
  // than exhausting the first one — but weight the first group more, because it
  // is the priority and the plan says short sessions serve one priority well.
  const slots = buildSlots(
    plan.priorities.map((p) => ({ group: p.group, sets: p.targetSets })),
    shape.maxBlocks,
  )

  for (const slot of slots) {
    const remainingSeconds = shape.budgetSeconds - shape.warmUpSeconds - spentSeconds
    if (remainingSeconds <= 60) break

    const context: SelectionContext = {
      profile,
      equipment,
      // A location of no declared kind tells us nothing, so treat it as the most
      // permissive case rather than silently narrowing what the person can do.
      locationKind: input.location.suitability ?? 'gym',
      used,
      patternCounts,
      preferredIds,
      dislikedIds,
      remainingSeconds,
    }
    const role = shape.slotRoles[Math.min(slot.index, shape.slotRoles.length - 1)] as TrainingRole
    const result = selectForSlot(exercises, slot.group, role, context, (exercise) => {
      const conflicts = input.conflicts?.check(exercise) ?? []
      const blocking = conflicts.find((conflict) => conflict.severity === 'blocking')
      return blocking ? blocking.reason : null
    })
    rejected.push(...result.rejected)

    const best = result.ranked[0]
    if (!best) continue

    const reason = tempoReasonFor(best.exercise, role)
    const entryId = nextId('entry')

    // FIT, DO NOT OVERSHOOT. The slot asked for a number of sets; what actually
    // goes in is the most of those that the remaining budget can hold. Shrinking
    // here — rather than letting the session run long and apologising for it —
    // is what makes a 30-minute session take 30 minutes.
    let scheme = schemeFor(best.exercise, role, { style, sets: slot.sets, restFactor: shape.restFactor })
    const perSet = scheme.restSeconds + ((scheme.reps.min + scheme.reps.max) / 2) * 3.5
    const affordableSets = Math.floor(
      (remainingSeconds - best.exercise.setupTimeSeconds - transitionSeconds(best.exercise)) / perSet,
    )
    if (affordableSets < scheme.sets) {
      // Two sets is the floor worth programming; below that the slot is not
      // worth the setup time and the session is better off without it.
      if (affordableSets < 2) continue
      scheme = schemeFor(best.exercise, role, {
        style,
        sets: affordableSets,
        restFactor: shape.restFactor,
      })
    }

    const targets: SetTarget[] = []
    for (let index = 0; index < scheme.sets; index += 1) {
      const setId = `${entryId}-s${index + 1}`
      const target: SetTarget = {
        setId,
        kind: 'working',
        reps: scheme.reps,
        rirTarget: scheme.rirTarget,
        restSeconds: scheme.restSeconds,
        weight: {
          kind: best.exercise.load.measure === 'none' ? 'none' : 'unknown',
          reason: 'no-history',
        } as SetTarget['weight'],
        tempo: reason ? tempoFor(reason) : null,
        dropSet: null,
        estimatedSeconds: 0,
      }
      targets.push({ ...target, estimatedSeconds: 0 })
    }

    const entry: ExerciseEntry = {
      entryId,
      exerciseId: best.exercise.id,
      role,
      priority: slot.index === 0 ? 'priority' : slot.index <= 2 ? 'normal' : 'accessory',
      targets,
      records: [],
      replacements: [],
      progressionFamily: best.exercise.progressionFamily,
      estimatedSeconds: entrySeconds(targets, best.exercise),
      note: '',
    }

    entries.push({ entry, exercise: best.exercise, group: slot.group })
    used.add(best.exercise.id)
    patternCounts.set(
      best.exercise.movementPattern,
      (patternCounts.get(best.exercise.movementPattern) ?? 0) + 1,
    )
    spentSeconds += entry.estimatedSeconds + transitionSeconds(best.exercise)
  }

  if (entries.length === 0) {
    return {
      outcome: 'none',
      reason: 'no-usable-exercises',
      message: 'Nothing in the catalog fits your equipment, location, and limitations today.',
      considered: exercises.length,
    }
  }

  // ---- techniques --------------------------------------------------------
  const blocks = assembleBlocks(entries, {
    favourSupersets: shape.favourSupersets,
    allowSupersets: techniques.supersets,
    allowDropSets: techniques.dropSets,
    seed: deriveSeed(input.seed, 'techniques'),
    decisions,
    nextId,
    exerciseOf: (id) => entries.find((e) => e.exercise.id === id)?.exercise ?? null,
  })

  // ---- warm-up -----------------------------------------------------------
  const warmUp = planWarmUp(
    shape.warmUpSeconds,
    entries.map((e) => e.group),
    input.availableTime,
  )

  // ---- time --------------------------------------------------------------
  const exerciseById = new Map(entries.map((e) => [e.exercise.id, e.exercise] as const))
  const workSeconds = blocks.reduce(
    (sum, block) => sum + blockSeconds(block, (id) => exerciseById.get(id) ?? null),
    0,
  )
  const transitions = entries.reduce((sum, e) => sum + transitionSeconds(e.exercise), 0)
  // One transition per gap BETWEEN blocks, not one per block — there is no
  // exercise to walk to after the last one.
  const gaps = Math.max(0, blocks.length - 1)
  const estimatedSeconds =
    workSeconds + Math.round((transitions * gaps) / Math.max(1, entries.length)) + warmUp.estimatedSeconds
  const fit = judgeFit(estimatedSeconds, shape.budgetSeconds)

  if (!fit.fits && shape.budgetSeconds < MINIMUM_VIABLE_SECONDS) {
    return {
      outcome: 'none',
      reason: 'time-too-short',
      message: 'There is not enough time here for a session worth doing.',
      considered: exercises.length,
    }
  }
  if (!fit.fits) {
    compromises.push({
      code: 'fewer-sets',
      severity: 'notable',
      text: `This is the closest realistic plan and may run about ${fit.overrunMinutes} min over.`,
      muscleGroups: [],
      entryIds: [],
      blockIds: [],
      secondsSaved: null,
    })
  }
  if (plan.priorities.length < 3 && input.availableTime !== 'default') {
    compromises.push({
      code: 'muscle-group-under-volume',
      severity: 'minor',
      text: `At ${input.availableTime} minutes this focuses on ${plan.priorities.map((p) => muscleGroupLabel(p.group)).join(' and ')} rather than the whole week.`,
      muscleGroups: plan.priorities.map((p) => p.group),
      entryIds: [],
      blockIds: [],
      secondsSaved: null,
    })
  }

  const confidence = judgeConfidence(input, entries.length)
  const explanation = explain(input, plan, blocks, shape, techniques, compromises)

  const workout: Workout = {
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    id: `workout-${input.forDate}-${input.availableTime}`,
    generatedAt: input.generatedAt,
    forDate: input.forDate,
    title: titleFor(entries.map((e) => e.group)),
    goal: profile.goals.primary,
    trainingStyle: style,
    durationChoice: input.availableTime,
    plannedMinutes:
      input.availableTime === 'default' ? Math.round(shape.budgetSeconds / 60) : input.availableTime,
    estimatedMinutes: Math.max(1, Math.round(estimatedSeconds / 60)),
    musclePriorities: [...plan.priorities],
    blocks,
    circuits: [],
    warmUp,
    explanation,
    confidence,
    knownCompromises: compromises,
    generatorVersion: GENERATOR_VERSION,
    seed: input.seed,
  }

  return {
    outcome: 'generated',
    workout,
    recalibration: {
      generatorVersion: GENERATOR_VERSION,
      seed: input.seed,
      durationChoice: input.availableTime,
      inputsPresent: presentInputs(input),
      decisions,
      timeBudget: {
        budgetSeconds: shape.budgetSeconds,
        warmUpSeconds: warmUp.estimatedSeconds,
        workSeconds,
        restSeconds: 0,
        transitionSeconds: transitions,
        estimatedSeconds,
        headroomSeconds: fit.headroomSeconds,
      },
      volumePlan: [...plan.volumePlan],
      patternBalance: [...patternCounts.entries()].map(([pattern, count]) => ({ pattern, count })),
      rejected: rejected.slice(0, 60),
    },
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Slot {
  readonly group: MuscleGroupId
  readonly sets: number
  readonly index: number
}

/** Turn per-group set targets into ordered slots, capped at the block budget. */
function buildSlots(groups: readonly { group: MuscleGroupId; sets: number }[], maxBlocks: number): Slot[] {
  const slots: Slot[] = []
  // Each group gets at least one slot; the priority group gets a second before
  // anyone gets a third, so a short session serves its priority properly.
  const rounds = Math.ceil(maxBlocks / Math.max(1, groups.length)) + 1
  for (let round = 0; round < rounds && slots.length < maxBlocks; round += 1) {
    for (const group of groups) {
      if (slots.length >= maxBlocks) break
      const already = slots.filter((slot) => slot.group === group.group).length
      const remaining =
        group.sets - slots.filter((s) => s.group === group.group).reduce((n, s) => n + s.sets, 0)
      if (remaining <= 0) continue
      const sets = already === 0 ? Math.min(remaining, 4) : Math.min(remaining, 3)
      // One set is junk volume — it costs the setup and the walk across the gym
      // and buys almost nothing. Leave the sets unspent rather than tacking a
      // token exercise onto the end of the session.
      if (sets < 2) continue
      slots.push({ group: group.group, sets, index: slots.length })
    }
  }
  return slots
}

function assembleBlocks(
  entries: readonly { entry: ExerciseEntry; exercise: Exercise; group: MuscleGroupId }[],
  options: {
    favourSupersets: boolean
    allowSupersets: boolean
    allowDropSets: boolean
    seed: number
    decisions: GenerationDecision[]
    nextId: (prefix: string) => string
    exerciseOf: (id: string) => Exercise | null
  },
): WorkoutBlock[] {
  const blocks: WorkoutBlock[] = []
  const taken = new Set<number>()

  for (let index = 0; index < entries.length; index += 1) {
    if (taken.has(index)) continue
    const current = entries[index]

    // Supersets are only ever sought among the accessory tail — pairing the
    // session's priority lift is exactly the "reduces the quality of a priority
    // lift" case the plan tells us to avoid.
    if (options.allowSupersets && current.entry.priority !== 'priority') {
      let partner = -1
      for (let other = index + 1; other < entries.length; other += 1) {
        if (taken.has(other)) continue
        if (entries[other].entry.priority === 'priority') continue
        if (!proposeSuperset(current.exercise, entries[other].exercise, options.favourSupersets)) continue
        // One round is not a superset, it is two exercises done once. Check
        // before committing rather than unpicking a half-built block.
        const rounds = Math.min(current.entry.targets.length, entries[other].entry.targets.length)
        if (rounds < 2) continue
        partner = other
        break
      }
      if (partner !== -1) {
        const mate = entries[partner]
        taken.add(index)
        taken.add(partner)
        const rounds = Math.min(current.entry.targets.length, mate.entry.targets.length)
        const block: SupersetBlock = {
          kind: 'superset',
          blockId: options.nextId('block'),
          moves: [trim(current.entry, rounds), trim(mate.entry, rounds)],
          rounds,
          restBetweenMovesSeconds: 20,
          restAfterRoundSeconds: Math.round(current.entry.targets[0].restSeconds * 0.8),
          rationale: options.favourSupersets ? 'time-pressure' : 'unrelated-muscles',
          estimatedSeconds: 0,
        }
        const withTime: SupersetBlock = {
          ...block,
          estimatedSeconds: blockSeconds(block, options.exerciseOf),
        }
        blocks.push(withTime)
        options.decisions.push({
          step: 'superset',
          text: `Paired ${current.exercise.name} with ${mate.exercise.name} to save time.`,
          muscleGroups: [current.group, mate.group],
          entryIds: [current.entry.entryId, mate.entry.entryId],
          blockIds: [withTime.blockId],
          varietyIndex: null,
        })
        continue
      }
    }

    taken.add(index)
    let entry = current.entry
    if (options.allowDropSets && proposeDropSet(current.exercise, entry.role)) {
      const last = entry.targets[entry.targets.length - 1]
      entry = {
        ...entry,
        targets: [
          ...entry.targets.slice(0, -1),
          { ...last, dropSet: { drops: 1, loadReductionPercent: 25, transitionSeconds: 12 } },
        ],
      }
      options.decisions.push({
        step: 'drop-set',
        text: `Added one drop on the last set of ${current.exercise.name} — it is cheap volume on a simple setup.`,
        muscleGroups: [current.group],
        entryIds: [entry.entryId],
        blockIds: [],
        varietyIndex: null,
      })
    }

    const single: SingleBlock = {
      kind: 'single',
      blockId: options.nextId('block'),
      entry: { ...entry, estimatedSeconds: entrySeconds(entry.targets, current.exercise) },
      estimatedSeconds: 0,
    }
    blocks.push({ ...single, estimatedSeconds: blockSeconds(single, options.exerciseOf) })
  }

  return blocks
}

/** A superset's two moves must carry exactly `rounds` targets each. */
function trim(entry: ExerciseEntry, rounds: number): ExerciseEntry {
  return { ...entry, targets: entry.targets.slice(0, rounds) }
}

function planWarmUp(
  seconds: number,
  groups: readonly MuscleGroupId[],
  choice: GenerateWorkoutInput['availableTime'],
): WarmUpPlan {
  if (seconds <= 0) {
    return { steps: [], rampedEntryIds: [], estimatedSeconds: 0, rationale: 'No time for a warm-up.' }
  }
  const unique = [...new Set(groups)].slice(0, 4)
  const steps: WarmUpPlan['steps'] = [
    {
      stepId: 'warm-1',
      kind: 'raise',
      exerciseId: null,
      instruction: 'Easy cardio until you are warm and breathing a little harder.',
      seconds: Math.round(seconds * (choice === 15 ? 0.6 : 0.4)),
      targetGroups: [],
    },
  ]
  if (choice !== 15) {
    steps.push({
      stepId: 'warm-2',
      kind: 'movement-rehearsal',
      exerciseId: null,
      instruction: 'Two light sets of the first movement, building toward your working weight.',
      seconds: Math.round(seconds * 0.6),
      targetGroups: unique,
    })
  }
  return {
    steps,
    rampedEntryIds: [],
    estimatedSeconds: steps.reduce((sum, step) => sum + step.seconds, 0),
    rationale:
      choice === 15
        ? 'Short session, so the warm-up is brief and general rather than a full ramp.'
        : 'Enough to be ready for the first working set without eating the session.',
  }
}

function judgeConfidence(input: GenerateWorkoutInput, blocks: number): WorkoutConfidence {
  const limiters: WorkoutConfidence['limiters'] = []
  if (!input.recentWorkouts?.length) limiters.push('no-workout-history')
  if (!input.progression?.length) limiters.push('no-progression-state')
  if (!input.recovery) limiters.push('recovery-unknown')
  if (!input.readiness) limiters.push('readiness-unknown')
  if (input.availableTime === 15) limiters.push('short-time-budget')
  if (blocks <= 2) limiters.push('thin-catalog-coverage')
  // With no history at all, confidence should not read as high. It says what it
  // is: a sensible first guess, not a judgement informed by anything you did.
  const score = Math.max(0.15, 1 - limiters.length * 0.16)
  return {
    level: score >= 0.7 ? 'high' : score >= 0.45 ? 'moderate' : 'low',
    score: Number(score.toFixed(2)),
    limiters,
  }
}

function explain(
  input: GenerateWorkoutInput,
  plan: ReturnType<typeof planMuscles>,
  blocks: readonly WorkoutBlock[],
  shape: ReturnType<typeof shapeFor>,
  techniques: { supersets: boolean; dropSets: boolean; circuits: boolean },
  compromises: readonly KnownCompromise[],
): Workout['explanation'] {
  const points: ExplanationPoint[] = []
  const primary = plan.priorities[0]

  if (primary) {
    points.push({
      code: primary.reason === 'goal' ? 'goal-emphasis' : 'muscle-priority',
      text: `${muscleGroupLabel(primary.group)} leads today${primary.reason === 'weekly-volume-deficit' ? ' — it is behind for the week.' : '.'}`,
      weight: 'major',
      muscleGroups: [primary.group],
      entryIds: [],
      blockIds: [],
    })
  }
  points.push({
    code: 'time-budget',
    text:
      input.availableTime === 'default'
        ? `Built to your usual ${Math.round(shape.budgetSeconds / 60)} minutes.`
        : `Rebuilt for ${input.availableTime} minutes — this is not the longer session with the end cut off.`,
    weight: 'major',
    muscleGroups: [],
    entryIds: [],
    blockIds: [],
  })

  const supersets = blocks.filter((block) => block.kind === 'superset')
  if (supersets.length > 0) {
    points.push({
      code: 'superset-used',
      text: `${supersets.length === 1 ? 'One pairing' : `${supersets.length} pairings`} to fit more work into the time.`,
      weight: 'supporting',
      muscleGroups: [],
      entryIds: [],
      blockIds: supersets.map((block) => block.blockId),
    })
  } else if (!techniques.supersets) {
    points.push({
      code: 'superset-used',
      text: 'No supersets — you have them switched off in Settings.',
      weight: 'supporting',
      muscleGroups: [],
      entryIds: [],
      blockIds: [],
    })
  }

  if (compromises.length > 0) {
    points.push({
      code: 'time-budget',
      text: compromises[0].text,
      weight: 'supporting',
      muscleGroups: [],
      entryIds: [],
      blockIds: [],
    })
  }

  const heavyFirst =
    blocks[0] !== undefined && !isSupersetBlock(blocks[0]) && blocks[0].entry.role === 'primary-strength'
  const blockCount = `${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}`

  return {
    // The card already carries the muscle groups as its title, so the headline
    // says what SHAPE the session is rather than repeating them.
    headline: heavyFirst
      ? `Heavy work first, then volume — ${blockCount}.`
      : `${blockCount}, built for stimulus in the time you have.`,
    points: points.slice(0, 12),
  }
}

function titleFor(groups: readonly MuscleGroupId[]): string {
  const named = [...new Set(groups)].slice(0, 2).map(muscleGroupLabel)
  if (named.length === 0) return 'Training'
  return named.join(' and ')
}

function presentInputs(
  input: GenerateWorkoutInput,
): NonNullable<
  ReturnType<typeof generateWorkout> extends { recalibration: infer R } ? R : never
>['inputsPresent'] {
  const flags: string[] = []
  if (input.weeklyPlan) flags.push('weekly-plan')
  if (input.recentWorkouts?.length) flags.push('recent-workouts')
  if (input.weeklyMuscleVolume?.length) flags.push('weekly-muscle-volume')
  if (input.recentMuscleExposure?.length) flags.push('recent-muscle-exposure')
  if (input.recovery) flags.push('recovery')
  if (input.readiness) flags.push('readiness')
  if (input.pain?.length) flags.push('pain')
  if (input.preferences) flags.push('preferences')
  if (input.progression?.length) flags.push('progression-state')
  if (input.trainingFrequency) flags.push('training-frequency')
  return flags as never
}
