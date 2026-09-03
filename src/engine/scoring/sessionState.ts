import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { MovementPatternId } from '../../catalog/movementPatterns/movementPatterns'
import { STRESS_WEIGHTS, type JointStressTagId } from '../../catalog/taxonomy/joints'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import { createConflictDetector } from '../conflicts/conflictEngine'
import type { SessionEntry } from '../conflicts/conflictContext'
import type { SlotEstimator } from '../alternatives/estimate'
import type { ConflictChecker } from '../alternatives/conflictPort'
import type { ChosenExercise, SelectionContext, SlotRequest } from './selectionTypes'

/**
 * ONE READING OF THE SESSION SO FAR, computed once per slot and handed to every
 * filter and every factor.
 *
 * The filters and the factors need the same handful of facts about what has
 * already been chosen — which joints have taken load, which kit is out, which
 * patterns are used, which slots the session is built around. Deriving them
 * twice is the usual way two answers quietly disagree, so they are derived once
 * here and passed down. This mirrors `alternatives/sessionView.ts`; it cannot
 * BE that module, because that one is organised around a target slot that
 * already holds an exercise and this one has an empty slot.
 *
 * JOINT LOAD IS COUNTED IN THE CATALOG'S UNITS. `STRESS_WEIGHTS` — low 1,
 * moderate 2, high 4 — the same doubling scale the conflict policy's thresholds
 * are written in, so the joint factor can compare a candidate's cost against
 * `jointStressStrong` without inventing a second currency.
 */

export interface SessionState {
  readonly chosen: readonly ChosenExercise[]
  /** Load the session has already put through each joint. */
  readonly jointLoad: Readonly<Partial<Record<JointStressTagId, number>>>
  /** Equipment already in use — kit that is literally out. */
  readonly stagedEquipment: ReadonlySet<EquipmentId>
  /** Stations already occupied, so a second exercise there costs no transition. */
  readonly stagedStations: ReadonlySet<StationId>
  /** Movement patterns already used. */
  readonly usedPatterns: ReadonlySet<MovementPatternId>
  /** Exercise ids already in the session. */
  readonly chosenIds: ReadonlySet<string>
  /** Ids of the exercises filling the slots the session is built around. */
  readonly priorityIds: ReadonlySet<string>
}

export function readSessionState(context: SelectionContext): SessionState {
  const jointLoad: Partial<Record<JointStressTagId, number>> = {}
  const stagedEquipment = new Set<EquipmentId>()
  const stagedStations = new Set<StationId>()
  const usedPatterns = new Set<MovementPatternId>()
  const chosenIds = new Set<string>()
  const priorityIds = new Set<string>()

  for (const entry of context.chosen) {
    for (const tag of entry.exercise.jointStressTags) {
      jointLoad[tag.joint] = (jointLoad[tag.joint] ?? 0) + STRESS_WEIGHTS[tag.intensity]
    }
    for (const id of entry.exercise.equipment) stagedEquipment.add(id)
    const station = entry.exercise.supersetCompatibility.stationId
    if (station !== null) stagedStations.add(station)
    usedPatterns.add(entry.exercise.movementPattern)
    chosenIds.add(entry.exercise.id)
    if (entry.priority === 'priority') priorityIds.add(entry.exercise.id)
  }

  return {
    chosen: context.chosen,
    jointLoad,
    stagedEquipment,
    stagedStations,
    usedPatterns,
    chosenIds,
    priorityIds,
  }
}

/**
 * THE ADAPTER. It turns a selection context into the conflict engine's context,
 * and the engine's detector into the one-question `ConflictChecker` the filters
 * use.
 *
 * ONE DETECTOR PER SLOT, NOT ONE PER CANDIDATE. The engine indexes the session
 * when the detector is built and every `detect` reads that index, so screening a
 * few dozen candidates costs one session index rather than a few dozen.
 *
 * NO `replaces`. Selection is adding, not swapping: nothing is coming out, so
 * every conflict the engine reports is one the session would really acquire.
 *
 * `timeBudgetSeconds` IS LEFT NULL, deliberately, and this paragraph is the
 * disclosure. The engine's time rule judges whether a PLANNED session fits its
 * budget; duration fitting for a session under construction belongs to Phase 3's
 * duration engine, which owns the clock and the rebuild. Handing the engine a
 * number it would interpret differently would produce a second, wronger answer
 * to a question that already has an owner. `SlotRequest.maxSeconds` is this
 * module's own, much narrower question — does this one slot fit — and it is
 * answered by a filter with its own reason.
 */
export function createSelectionConflictChecker(
  slot: SlotRequest,
  context: SelectionContext,
  estimate: SlotEstimator,
): ConflictChecker {
  const session: SessionEntry[] = context.chosen.map((entry) => ({
    exercise: entry.exercise,
    supersetGroup: entry.supersetId,
    slot: entry.slotId,
    estimatedSeconds: estimate({
      exercise: entry.exercise,
      sets: entry.plannedSets,
      restSeconds: entry.restSeconds,
    }),
  }))

  const detector = createConflictDetector({
    session,
    availableEquipment: context.availableEquipment,
    location: { id: 'current', name: 'this location', suitability: context.location },
    limitations: context.limitations,
    techniques: context.techniques,
    recentTraining: context.recentTraining ?? [],
    timeBudgetSeconds: null,
    policy: context.policy,
  })

  return {
    id: 'conflicts-engine',
    check: (candidate) =>
      detector.detect(candidate, {
        supersetGroup: slot.supersetGroup ?? null,
        slot: slot.slotId,
        estimatedSeconds: estimate({
          exercise: candidate,
          sets: slot.plannedSets,
          restSeconds: slot.restSeconds,
        }),
      }).conflicts,
  }
}

/** Seconds a candidate would take in this slot, through the shared estimator. */
export function estimateForSlot(estimate: SlotEstimator, slot: SlotRequest, candidate: Exercise): number {
  return estimate({ exercise: candidate, sets: slot.plannedSets, restSeconds: slot.restSeconds })
}
