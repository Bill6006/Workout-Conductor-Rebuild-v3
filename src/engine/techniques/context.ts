import { rollUpMuscles } from '../../catalog/muscles/muscles'
import { TRANSITION_COST_SCALE } from '../../catalog/taxonomy/scales'
import { isAnchorRole } from '../../catalog/taxonomy/taxonomy'
import { SECONDS_PER_REP, resolveTechniquePolicy } from './policy'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { TransitionCost } from '../../catalog/taxonomy/scales'
import type { ConflictKind, ConflictSeverity, SupersetRule } from '../conflicts/conflictTypes'
import type { TechniquePolicy } from './policy'
import type {
  TechniqueCandidate,
  TechniqueContext,
  TechniqueContextInput,
  TechniqueKind,
  TechniqueRejection,
  TechniqueRejectionCode,
  TimeEffect,
  WorkSecondsEstimator,
} from './types'

/**
 * THE RESOLVED CONTEXT, AND THE FACTS ALL THREE PROPOSERS SHARE.
 *
 * WHY THE DEFAULTS FAIL QUIET RATHER THAN GENEROUS. Every technique defaults to
 * ON, because that is what the profile ships with; every MEASUREMENT defaults to
 * `null`, meaning "not measured". A rule that needs a measurement it does not have
 * declines rather than guessing — which is why a session generated today, with no
 * history and no recovery model in the product at all, gets supersets when the
 * time arithmetic justifies them and gets no circuits, rather than getting a
 * circuit built on an invented recovery score.
 */

/** No techniques stated means all of them, which is the profile's own default. */
const ALL_TECHNIQUES = { supersets: true, dropSets: true, circuits: true } as const

/**
 * THE DEFAULT WORK ESTIMATE — crude on purpose, and replaceable.
 *
 * Phase 3's duration engine owns time estimation properly. This is the same small
 * model the alternatives ranker uses (`SECONDS_PER_REP` a rep, a hold counted in
 * its own seconds, a unilateral movement done twice), so that a technique proposal
 * and a swap suggestion cannot quote two different lengths for one set. Pass
 * `estimateWorkSeconds` to replace it.
 */
export const defaultWorkSecondsEstimator: WorkSecondsEstimator = ({ exercise, reps }) => {
  const amount = reps ?? (exercise.typicalRepRange.min + exercise.typicalRepRange.max) / 2
  const perSide = exercise.repUnit === 'seconds' ? amount : amount * SECONDS_PER_REP
  return Math.round(Math.max(0, perSide) * (exercise.unilateral ? 2 : 1))
}

/** Fills in the defaults. The one way a `TechniqueContext` is made. */
export function createTechniqueContext(input: TechniqueContextInput = {}): TechniqueContext {
  return {
    candidates: input.candidates ?? [],
    techniques: { ...ALL_TECHNIQUES, ...input.techniques },
    style: input.style ?? 'hybrid',
    goal: input.goal ?? 'build-muscle',
    experience: input.experience ?? 'intermediate',
    location: input.location ?? null,
    availableEquipment: input.availableEquipment ?? [],
    timeBudgetSeconds: input.timeBudgetSeconds ?? null,
    estimatedSeconds: input.estimatedSeconds ?? 0,
    timePressure: input.timePressure ?? null,
    muscleVolumeNeed: input.muscleVolumeNeed ?? null,
    systemicRecovery: input.systemicRecovery ?? null,
    estimateWorkSeconds: input.estimateWorkSeconds ?? defaultWorkSecondsEstimator,
    policy: resolveTechniquePolicy(input.policy),
  }
}

/* ------------------------------------------------------------------ *
 * Muscles
 * ------------------------------------------------------------------ */

/** The groups an exercise mainly trains, rolled up through the muscle catalogue. */
export function primaryGroupsOf(exercise: Exercise): MuscleGroupId[] {
  return rollUpMuscles(exercise.primaryMuscles)
}

/** Groups present in both lists, in the first list's order. Total and stable. */
export function sharedGroups(a: readonly MuscleGroupId[], b: readonly MuscleGroupId[]): MuscleGroupId[] {
  const theirs = new Set(b)
  return a.filter((group) => theirs.has(group))
}

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

/**
 * THE SLOTS A TECHNIQUE MAY NOT TOUCH.
 *
 * A slot is protected when the generator marked it `priority` OR when its role is
 * one of the session's anchors — `primary-strength` and `primary-hypertrophy`,
 * which is the taxonomy's own definition and not a second list. Both halves
 * matter: a generator that has not assigned priorities yet still says what a lift
 * is FOR, and the reason the session exists is not paired, dropped, or circuited.
 */
export function isProtectedSlot(candidate: TechniqueCandidate): boolean {
  return candidate.priority === 'priority' || isAnchorRole(candidate.role)
}

/**
 * The muscle groups a LATER protected slot depends on.
 *
 * This is what "does not compromise a later priority exercise" is measured
 * against: fatiguing a group now that the session's main lift needs in ten minutes
 * makes the main lift worse, and the main lift is the reason for the session.
 */
export function laterPriorityGroups(
  context: TechniqueContext,
  position: number,
): { readonly groups: readonly MuscleGroupId[]; readonly slotIds: readonly string[] } {
  const groups: MuscleGroupId[] = []
  const slotIds: string[] = []
  for (const candidate of context.candidates) {
    if (candidate.position <= position) continue
    if (!isProtectedSlot(candidate)) continue
    slotIds.push(candidate.slotId)
    for (const group of primaryGroupsOf(candidate.exercise)) {
      if (!groups.includes(group)) groups.push(group)
    }
  }
  return { groups, slotIds }
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

/**
 * IS TODAY A RUSH? One question, one answer, read by all three techniques.
 *
 * Two independent things count: the person said so, or the session as planned
 * overruns the time set aside by more than the policy's margin. With neither
 * measured the answer is NO — an unmeasured rush is not a rush, and a technique
 * whose whole case is time efficiency has nothing to be efficient about.
 */
export function underTimePressure(context: TechniqueContext): boolean {
  const { timePressure, timeBudgetSeconds, estimatedSeconds, policy } = context
  if (timePressure !== null && timePressure >= policy.timePressureThreshold) return true
  if (timeBudgetSeconds === null) return false
  return estimatedSeconds - timeBudgetSeconds >= policy.overBudgetPressureSeconds
}

/** Seconds added per round for moving between set-ups, from the costliest of them. */
export function transitionPenalty(policy: TechniquePolicy, exercises: readonly Exercise[]): number {
  let worst: TransitionCost = 'low'
  for (const exercise of exercises) worst = TRANSITION_COST_SCALE.highest(worst, exercise.transitionCost)
  return policy.transitionPenaltySeconds[worst]
}

/** Assembles the arithmetic, so `savedSeconds` is always exactly the difference. */
export function timeEffect(beforeSeconds: number, afterSeconds: number, addedSeconds = 0): TimeEffect {
  const before = Math.round(beforeSeconds)
  const after = Math.round(afterSeconds)
  return { beforeSeconds: before, afterSeconds: after, savedSeconds: before - after, addedSeconds }
}

/**
 * A proposal's 0-100 score: how good a use of the technique this is, HERE.
 *
 * It is an ordering key, not a quality grade — a 40 is worth accepting when the
 * clock demands it. The saving does most of the work, capped at
 * `savingScoreScaleSeconds` so a huge saving cannot bury every structural reason,
 * and the bonuses are what separate two pairings that save the same minute.
 */
export function proposalScore(savedSeconds: number, bonus: number, policy: TechniquePolicy): number {
  const scale = Math.max(1, policy.savingScoreScaleSeconds)
  const fromTime = Math.min(1, Math.max(0, savedSeconds) / scale) * 60
  return Math.max(0, Math.min(100, Math.round(fromTime + bonus)))
}

/* ------------------------------------------------------------------ *
 * Rejections
 * ------------------------------------------------------------------ */

export interface RejectionOptions {
  readonly conflictKind?: ConflictKind
  readonly conflictRule?: SupersetRule
  readonly conflictSeverity?: ConflictSeverity
}

/** The one way a rejection is made, so every one of them is fully populated. */
export function rejection(
  technique: TechniqueKind,
  code: TechniqueRejectionCode,
  slotIds: readonly string[],
  text: string,
  options: RejectionOptions = {},
): TechniqueRejection {
  return {
    technique,
    code,
    slotIds,
    text,
    conflictKind: options.conflictKind ?? null,
    conflictRule: options.conflictRule ?? null,
    conflictSeverity: options.conflictSeverity ?? null,
  }
}
