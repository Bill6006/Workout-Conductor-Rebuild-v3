import { equipmentLabel, type EquipmentId } from '../../catalog/equipment/equipment'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import { locationSuitabilityLabel } from '../../catalog/labels/catalogLabels'
import {
  CONFLICT_KIND_TO_EXCLUSION,
  SUPERSET_CONFLICT_KINDS,
  type Conflict,
  type ConflictChecker,
} from './conflictPort'
import { estimateSlotWith, type SlotEstimator } from './estimate'
import type { PreferenceLookup } from './preferences'
import { jaccard, primaryGroups, type SessionView } from './sessionView'
import type { AlternativeLocation, AlternativesContext, ExcludedCandidate } from './types'

/**
 * THE HARD FILTERS, and the ranker's POLICY over what the conflict engine reports.
 *
 * THE DISTINCTION THIS FILE EXISTS TO MAKE. An exercise the person cannot do,
 * must not do, or has said they do not want is not a weak alternative — it is not
 * an alternative. Scoring it low would still float it to the top of a short list
 * on a day when everything else is worse, which is exactly the day it matters
 * that it never appears. So these are filters, and the score never sees them.
 *
 * ORDER IS THE ANSWER. A candidate usually fails several ways at once; the FIRST
 * check to fire is the one reported, so the checks run cheapest and most concrete
 * first. "You do not have a cable machine" is a better explanation than "it
 * overlaps with your third exercise", even when both are true.
 *
 * NO CONFLICT RULE IS WRITTEN HERE. Everything the session decides is asked of
 * `ConflictChecker` — one call per surviving candidate — and this file only
 * decides what to DO with the answers, which is the caller's job by the conflict
 * engine's own design:
 *
 *   `blocking`  excludes, EXCEPT a superset or station conflict when the caller
 *               has already accepted that the pairing may end; then it is reported
 *               as a broken superset instead of hiding the candidate.
 *   `strong`    usually keeps the candidate, shows the conflict as a warning, and
 *               costs real score through the `conflict-caution` factor — a person
 *               choosing by hand is entitled to see a workable-but-worse option.
 *               Two escalations are named below.
 *   `advisory`  the same, at a smaller cost, and never an exclusion.
 *
 * TWO ESCALATIONS, AND THIS PARAGRAPH IS THE WHOLE LIST. Both act on conflicts the
 * ENGINE detected, using the ENGINE's thresholds; neither invents a rule.
 *
 *   1. A `strong` overlap, repeated-movement, or grip conflict naming an exercise
 *      in a LATER slot marked `priority` is excluded as `interferes-with-priority`.
 *      The ranker will not offer a swap that quietly costs a person the lift the
 *      session was built around.
 *   2. A `strong` overlap or repeated-movement conflict anywhere is excluded as
 *      `excessive-overlap` / `duplicate-in-session`. See `STRONG_EXCLUDES_KINDS`.
 */

export interface ScreenInput {
  readonly candidate: Exercise
  readonly current: Exercise
  readonly context: AlternativesContext
  readonly view: SessionView
  readonly available: ReadonlySet<EquipmentId>
  readonly preferences: PreferenceLookup
  readonly estimate: SlotEstimator
  readonly checker: ConflictChecker
  readonly allowSupersetBreak: boolean
}

export interface ScreenResult {
  /** `null` when the candidate survives and may be scored. */
  readonly excluded: ExcludedCandidate | null
  /**
   * Everything the conflict engine said, every severity. Returned even when the
   * candidate is excluded, so a caller can see the whole picture and so the scorer
   * never has to ask the engine a second time.
   */
  readonly conflicts: readonly Conflict[]
}

function excluded(
  candidate: Exercise,
  code: ExcludedCandidate['code'],
  text: string,
  extra: Partial<ExcludedCandidate> = {},
): ExcludedCandidate {
  return {
    exerciseId: candidate.id,
    name: candidate.name,
    code,
    text,
    missingEquipment: [],
    availableAt: [],
    conflictKind: null,
    ...extra,
  }
}

/**
 * Which of the person's other saved locations could do this exercise.
 *
 * This is what turns a dead end into a useful sentence. "You do not have a leg
 * press" is a refusal; "the gym has one" is an answer, and the person is often
 * standing somewhere they can choose to leave.
 */
export function locationsWith(
  context: AlternativesContext,
  needed: readonly EquipmentId[],
): readonly AlternativeLocation[] {
  return (context.otherLocations ?? []).filter((location) => {
    const have = new Set(location.equipment)
    return needed.every((id) => have.has(id))
  })
}

/** Overlap and grip conflicts are the ones that can steal a later priority lift. */
const PRIORITY_SENSITIVE_KINDS: readonly Conflict['kind'][] = [
  'muscle-overlap',
  'duplicate-movement-pattern',
  'grip',
]

/**
 * The kinds where the engine's `strong` rung is an exclusion FOR THIS CALLER.
 *
 * A generator that gets a `strong` conflict re-rolls and tries something else. An
 * alternatives list has no next attempt: whatever it shows is what a person will
 * tap. Offering a swap the engine says makes the session measurably worse — when
 * the whole point of the swap is to make it better — is offering a wrong answer
 * with a warning attached, so overlap and repeated-movement conflicts at `strong`
 * filter rather than penalise. Every other kind stays a penalty, because a person
 * choosing by hand is entitled to see a workable-but-worse option and decide.
 */
const STRONG_EXCLUDES_KINDS: readonly Conflict['kind'][] = ['muscle-overlap', 'duplicate-movement-pattern']

function stealsFromPriority(conflict: Conflict, view: SessionView): boolean {
  if (conflict.severity !== 'strong') return false
  if (!PRIORITY_SENSITIVE_KINDS.includes(conflict.kind)) return false
  return view.upcoming.some(
    (slot) => slot.priority === 'priority' && conflict.exerciseIds.includes(slot.exercise.id),
  )
}

export function screenCandidate(input: ScreenInput): ScreenResult {
  const { candidate, current, context, view, available, preferences } = input
  const none: readonly Conflict[] = []

  if (candidate.id === current.id) {
    return {
      excluded: excluded(candidate, 'is-current-exercise', 'This is the exercise you have'),
      conflicts: none,
    }
  }

  if (!candidate.productionEnabled) {
    return {
      excluded: excluded(candidate, 'not-production-enabled', 'Not ready to be programmed yet'),
      conflicts: none,
    }
  }

  // TRAINS THE WRONG THING. The gate is the muscle GROUP rather than the exact
  // muscle, so an incline press can be replaced by a flat one; how well the exact
  // muscles line up is then a scoring question, not a yes/no one.
  if (jaccard(primaryGroups(candidate), primaryGroups(current)) === 0) {
    return {
      excluded: excluded(candidate, 'wrong-primary-muscle', `Does not train what ${current.name} trains`),
      conflicts: none,
    }
  }

  if (preferences.match(candidate).side === 'disliked') {
    return {
      excluded: excluded(candidate, 'disliked', 'You said you would rather not do this one'),
      conflicts: none,
    }
  }

  if (!candidate.locationSuitability.includes(context.location)) {
    return {
      excluded: excluded(
        candidate,
        'location-unsuitable',
        `Not one for ${locationSuitabilityLabel(context.location).toLowerCase()}`,
      ),
      conflicts: none,
    }
  }

  const missingEquipment = candidate.equipment.filter((id) => !available.has(id))
  if (missingEquipment.length > 0) {
    const availableAt = locationsWith(context, missingEquipment)
    const kit = missingEquipment.map((id) => equipmentLabel(id).toLowerCase()).join(', ')
    if (availableAt.length > 0) {
      return {
        excluded: excluded(
          candidate,
          'requires-location-change',
          `Needs ${kit} — you have that at ${availableAt.map((location) => location.name).join(' or ')}`,
          { missingEquipment, availableAt },
        ),
        conflicts: none,
      }
    }
    return {
      excluded: excluded(candidate, 'equipment-unavailable', `Needs ${kit}, which is not here`, {
        missingEquipment,
      }),
      conflicts: none,
    }
  }

  if (context.remainingSeconds !== null) {
    const seconds = estimateSlotWith(input.estimate, view.target, candidate)
    if (seconds > context.remainingSeconds) {
      return {
        excluded: excluded(
          candidate,
          'does-not-fit-remaining-time',
          `Needs about ${Math.round(seconds / 60)} min and you have ${Math.floor(context.remainingSeconds / 60)}`,
        ),
        conflicts: none,
      }
    }
  }

  // Everything left is a question about the SESSION. One call, every severity,
  // no rule re-implemented here.
  const conflicts = input.checker.check(candidate)

  for (const conflict of conflicts) {
    if (conflict.severity !== 'blocking') continue
    if (input.allowSupersetBreak && SUPERSET_CONFLICT_KINDS.includes(conflict.kind)) continue
    return {
      excluded: excluded(candidate, CONFLICT_KIND_TO_EXCLUSION[conflict.kind], conflict.reason, {
        conflictKind: conflict.kind,
      }),
      conflicts,
    }
  }

  // The more specific reason wins: "this would cost you your main lift" says more
  // than "this overlaps", and both are true of the same conflict.
  const stolen = conflicts.find((conflict) => stealsFromPriority(conflict, view))
  if (stolen) {
    return {
      excluded: excluded(candidate, 'interferes-with-priority', stolen.reason, {
        conflictKind: stolen.kind,
      }),
      conflicts,
    }
  }

  const tooMuch = conflicts.find(
    (conflict) => conflict.severity === 'strong' && STRONG_EXCLUDES_KINDS.includes(conflict.kind),
  )
  if (tooMuch) {
    return {
      excluded: excluded(candidate, CONFLICT_KIND_TO_EXCLUSION[tooMuch.kind], tooMuch.reason, {
        conflictKind: tooMuch.kind,
      }),
      conflicts,
    }
  }

  return { excluded: null, conflicts }
}
