import type { EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { WARM_UP_SUITABILITY_SCALE } from '../../catalog/taxonomy/scales'
import { CONFLICT_KIND_TO_EXCLUSION, type Conflict, type ConflictChecker } from '../alternatives/conflictPort'
import type { SlotEstimator } from '../alternatives/estimate'
import type { PreferenceLookup } from '../alternatives/preferences'
import { reachOf } from '../volume/credit'
import { estimateForSlot, type SessionState } from './sessionState'
import type { ExcludedSelection, SelectionContext, SlotRequest } from './selectionTypes'

/**
 * THE HARD FILTERS, and this module's POLICY over what the conflict engine says.
 *
 * NO CONFLICT RULE IS WRITTEN HERE, AND NONE MAY BE. Everything about whether a
 * candidate belongs in THIS session — limitations, duplicates, muscle overlap,
 * repeated patterns, joint stress, grip, stations, supersets, recovery, role —
 * is asked of `ConflictChecker`, one call per surviving candidate. This file only
 * decides what to DO with the answers, which is the caller's job by the conflict
 * engine's own design (see `alternatives/conflictPort.ts`, which documents the
 * split this file keeps to).
 *
 * WHAT IS SCREENED HERE IS THE CANDIDATE AGAINST THE PERSON'S SITUATION: whether
 * the entry is finished enough to program, whether it trains the muscle the slot
 * is for, whether they said they dislike it, whether the exercise suits this kind
 * of place, whether the kit is here, whether it fits the slot's own time, and —
 * the one thing only slot-filling can ask — whether it is a thing you can warm up
 * on when the slot is a warm-up. None of those needs to see the session.
 *
 * ORDER IS THE ANSWER. A candidate usually fails several ways at once; the FIRST
 * check to fire is the one reported, so the checks run cheapest and most concrete
 * first.
 *
 * A FILTER, NOT A PENALTY. An exercise a person cannot do, must not do, or has
 * said they do not want is not a weak fill — it is not a fill. Scoring it low
 * would still float it to the top on a day when everything else is worse, which
 * is exactly the day it matters that it never appears.
 *
 * SEVERITY POLICY, and this paragraph is the whole of it:
 *
 *   `blocking` excludes. Always, with no exception — a generator has other
 *              options, and there is no caller here who has already accepted a
 *              broken pairing the way the alternatives screen can.
 *   `strong`   excludes when it is a muscle-overlap, repeated-movement or grip
 *              conflict, and reports as a warning otherwise. This is the
 *              difference `alternatives/exclusions.ts` names explicitly: an
 *              alternatives list has no next attempt and must show a
 *              workable-but-worse option, and a generator DOES have a next
 *              attempt and should take it.
 *   `advisory` never excludes. It costs score through `conflict-caution`.
 *
 *   Plus one escalation: a `strong` conflict naming an exercise that is filling
 *   one of the session's PRIORITY slots is `interferes-with-priority`, because
 *   the session was built around that lift and an accessory may not quietly cost
 *   it. Both act on conflicts the ENGINE detected, at the ENGINE's thresholds.
 */

/** Conflict kinds a generator re-rolls on rather than programming with a warning. */
export const STRONG_EXCLUDES_KINDS: readonly Conflict['kind'][] = [
  'muscle-overlap',
  'duplicate-movement-pattern',
  'grip',
]

export interface ScreenInput {
  readonly candidate: Exercise
  readonly slot: SlotRequest
  readonly context: SelectionContext
  readonly state: SessionState
  readonly available: ReadonlySet<EquipmentId>
  readonly preferences: PreferenceLookup
  readonly estimate: SlotEstimator
  readonly checker: ConflictChecker
}

export interface ScreenResult {
  /** `null` when the candidate survives and may be scored. */
  readonly excluded: ExcludedSelection | null
  /**
   * Everything the conflict engine said, every severity. Returned even when the
   * candidate is excluded, so the scorer never asks the engine a second time.
   */
  readonly conflicts: readonly Conflict[]
}

function exclude(
  candidate: Exercise,
  code: ExcludedSelection['code'],
  extra: Partial<ExcludedSelection> = {},
): ExcludedSelection {
  return {
    exerciseId: candidate.id,
    code,
    missingEquipment: [],
    conflictKind: null,
    ...extra,
  }
}

const NONE: readonly Conflict[] = []

export function screenCandidate(input: ScreenInput): ScreenResult {
  const { candidate, slot, context, state, available, preferences } = input

  if (!candidate.productionEnabled) {
    return { excluded: exclude(candidate, 'not-production-enabled'), conflicts: NONE }
  }

  // TRAINS THE WRONG THING. The coarse gate: does the exercise reach the slot's
  // muscle group at all, and — when the slot insists — as a primary muscle. How
  // well the exact heads line up is a scoring question, not a yes/no one.
  const reach = reachOf(candidate, slot.targetGroup)
  if (reach === 'none' || (slot.requirePrimaryTarget && reach !== 'primary')) {
    return { excluded: exclude(candidate, 'wrong-primary-muscle'), conflicts: NONE }
  }

  if (preferences.match(candidate).side === 'disliked') {
    return { excluded: exclude(candidate, 'disliked'), conflicts: NONE }
  }

  // A slot asking for a warm-up cannot be filled by something the catalog says
  // must never be warmed up on. This is the one exclusion a swap cannot produce,
  // because a swap inherits its slot's role rather than being asked for one.
  if (slot.role === 'warm-up' && candidate.warmUpSuitability === 'unsuitable') {
    return { excluded: exclude(candidate, 'unsuitable-for-role'), conflicts: NONE }
  }

  // A location of no fixed kind says nothing about suitability, so the filter
  // stays silent rather than guessing — the same choice the conflict engine makes.
  if (context.location !== null && !candidate.locationSuitability.includes(context.location)) {
    return { excluded: exclude(candidate, 'location-unsuitable'), conflicts: NONE }
  }

  const missingEquipment = candidate.equipment.filter((id) => !available.has(id))
  if (missingEquipment.length > 0) {
    return {
      excluded: exclude(candidate, 'equipment-unavailable', { missingEquipment }),
      conflicts: NONE,
    }
  }

  const maxSeconds = slot.maxSeconds ?? null
  if (maxSeconds !== null && estimateForSlot(input.estimate, slot, candidate) > maxSeconds) {
    return { excluded: exclude(candidate, 'does-not-fit-remaining-time'), conflicts: NONE }
  }

  // Everything left is a question about the SESSION. One call, every severity,
  // no rule re-implemented here.
  const conflicts = input.checker.check(candidate)

  for (const conflict of conflicts) {
    if (conflict.severity !== 'blocking') continue
    return {
      excluded: exclude(candidate, CONFLICT_KIND_TO_EXCLUSION[conflict.kind], {
        conflictKind: conflict.kind,
      }),
      conflicts,
    }
  }

  // The more specific reason wins: "this would cost the lift the session is
  // built around" says more than "this overlaps", and both are true at once.
  const stolen = conflicts.find(
    (conflict) =>
      conflict.severity === 'strong' && conflict.exerciseIds.some((id) => state.priorityIds.has(id)),
  )
  if (stolen) {
    return {
      excluded: exclude(candidate, 'interferes-with-priority', { conflictKind: stolen.kind }),
      conflicts,
    }
  }

  const tooMuch = conflicts.find(
    (conflict) => conflict.severity === 'strong' && STRONG_EXCLUDES_KINDS.includes(conflict.kind),
  )
  if (tooMuch) {
    return {
      excluded: exclude(candidate, CONFLICT_KIND_TO_EXCLUSION[tooMuch.kind], {
        conflictKind: tooMuch.kind,
      }),
      conflicts,
    }
  }

  return { excluded: null, conflicts }
}

/** True when the catalog can serve this slot's role at all. Used for messages only. */
export function servesRole(candidate: Exercise, slot: SlotRequest): boolean {
  if (slot.role !== 'warm-up') return true
  return WARM_UP_SUITABILITY_SCALE.atLeast(candidate.warmUpSuitability, 'specific-ramp')
}
