import { getMovementPattern } from '../../catalog/movementPatterns/movementPatterns'
import { DIFFICULTY_SCALE } from '../../catalog/taxonomy/scales'
import { createConflictDetector } from '../conflicts/conflictEngine'
import { difficultyCeiling } from './policy'
import {
  isProtectedSlot,
  laterPriorityGroups,
  primaryGroupsOf,
  proposalScore,
  rejection,
  sharedGroups,
  timeEffect,
  transitionPenalty,
  underTimePressure,
} from './context'
import {
  accessoryWorkReason,
  antagonistPairingReason,
  beyondExperienceText,
  compromisesLaterPriorityText,
  gripUnaffectedReason,
  noMuscleOverlapReason,
  notEnoughCandidatesText,
  proposalSummary,
  protectsPriorityLiftText,
  quickTransitionReason,
  savesTimeReason,
  savesTooLittleTimeText,
  separateStationsReason,
  techniqueDisabledText,
  timePressureReason,
  tooFarApartText,
  tooFewRoundsText,
  tooManyCompoundsText,
} from './reasons'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import type { ConflictDetector } from '../conflicts/conflictEngine'
import type { Conflict } from '../conflicts/conflictTypes'
import type { SupersetRationale } from '../../core/validation/workoutSchema'
import type {
  SupersetProposal,
  TechniqueCandidate,
  TechniqueContext,
  TechniqueFindings,
  TechniqueReason,
  TechniqueRejection,
} from './types'

/**
 * SUPERSETS — WHEN PAIRING TWO EXERCISES IS WORTH IT.
 *
 * A superset is two exercises alternated with almost no rest between them. It buys
 * time, and it charges for it: the second movement is done on a body that has just
 * done the first, and the person has to hold two set-ups at once. So the question
 * is never "may these be paired" alone — it is "may these be paired, AND is what it
 * saves worth what it costs".
 *
 * THE FIRST HALF OF THAT QUESTION IS NOT ASKED HERE. `src/engine/conflicts` owns
 * it and already answers every case the product plan names: an exercise the
 * catalog says must be done alone, two on one station, two grip-heavy movements,
 * two making the same competing demand, two heavy compounds, two loading one joint
 * hard, and a pairing that means hopping between set-ups. This module asks the
 * engine and reports its verdict; it does not hold a second opinion. A rule that
 * ought to exist and does not is a rule to add THERE.
 *
 * THE ENGINE IS ASKED FIRST, and that ordering is deliberate. A pairing the engine
 * refuses is explained in the engine's own words — "two heavy compound lifts back
 * to back is more than a pairing can carry" — rather than by whichever of this
 * module's judgements happened to notice first. Only a pairing it permits is then
 * judged on whether it is worth doing.
 *
 * WHAT THIS MODULE ADDS, in the order it asks:
 *
 *   1. A PRIORITY LIFT IS NEVER PAIRED. The reason the session exists is done on
 *      its own, at full effort. That covers the slot the generator marked
 *      `priority` and any slot in an anchor role.
 *   2. NOTHING TIRES A LATER PRIORITY LIFT. A pairing that shares a muscle group
 *      with a protected slot still to come makes that lift worse, and it is the
 *      lift the session was built around.
 *   3. NOT BEYOND THE PERSON'S LEVEL. Alternating two movements is a coordination
 *      and pacing demand ON TOP of each lift, so an exercise rated harder than
 *      their experience is done on its own, and a beginner's pairing holds at most
 *      one compound.
 *   4. ENOUGH ROUNDS TO BE WORTH SETTING UP, and a saving big enough to notice.
 *   5. CLOSE ENOUGH TOGETHER that accepting it does not tear up the session order.
 *
 * A SLOT MAY APPEAR IN MORE THAN ONE PROPOSAL. Every workable pairing is reported,
 * best first; choosing a non-overlapping set of them is the generator's decision,
 * because only the generator knows what else it is fitting into the same minutes.
 */

/** The group id the pairing is asked about. Never leaves this module. */
const PAIR_GROUP_ID = 'technique-pairing'

/**
 * The conflict engine's verdict on ONE pairing, and nothing else.
 *
 * The report is filtered to the conflicts that are ABOUT the pairing — `superset`,
 * and the `station` conflict a superset raises when both movements want one
 * station. Whether each exercise belongs in the session at all is a question the
 * generator has already answered; re-reporting its equipment or its limitations
 * here would second-guess a decision this module does not own, and would bury the
 * pairing verdict in findings the caller has already dealt with.
 */
function pairingConflict(detector: ConflictDetector, b: Exercise): Conflict | null {
  const report = detector.detect(b, { supersetGroup: PAIR_GROUP_ID })
  for (const conflict of report.conflicts) {
    if (conflict.kind === 'superset') return conflict
    if (conflict.kind === 'station' && conflict.detail.basis === 'superset') return conflict
  }
  return null
}

function detectorFor(candidate: TechniqueCandidate, context: TechniqueContext): ConflictDetector {
  return createConflictDetector({
    session: [{ exercise: candidate.exercise, supersetGroup: PAIR_GROUP_ID }],
    techniques: context.techniques,
  })
}

/** True when one movement pushes and the other pulls, so each rests the other. */
function isAntagonistPair(a: Exercise, b: Exercise): boolean {
  const first = getMovementPattern(a.movementPattern).chain
  const second = getMovementPattern(b.movementPattern).chain
  return (
    (first === 'upper-push' && second === 'upper-pull') || (first === 'upper-pull' && second === 'upper-push')
  )
}

/** The distinct stations the pairing occupies, in the pair's own order. */
function stationsOf(a: Exercise, b: Exercise): StationId[] {
  const stations: StationId[] = []
  for (const station of [a.supersetCompatibility.stationId, b.supersetCompatibility.stationId]) {
    if (station !== null && !stations.includes(station)) stations.push(station)
  }
  return stations
}

/**
 * WHY THE GENERATOR PAIRED THESE TWO, in the session model's own vocabulary.
 *
 * The pairing's own nature is preferred over the session's circumstance: "one
 * pushes and one pulls" is true of the pair whatever kind of day it is, and is a
 * better thing to have stamped on a saved workout than "we were in a hurry". Time
 * pressure is the honest remaining answer, and it is always available — a pairing
 * is only ever proposed when it saves time.
 *
 * `user-preference` is never chosen here. It is reserved for a pairing a PERSON
 * made, which is not a thing a generator can do on their behalf.
 */
function rationaleFor(a: TechniqueCandidate, b: TechniqueCandidate, overlap: number): SupersetRationale {
  if (isAntagonistPair(a.exercise, b.exercise)) return 'antagonist-pairing'
  if (overlap === 0) return 'unrelated-muscles'
  if (a.priority === 'accessory' && b.priority === 'accessory') return 'accessory-efficiency'
  return 'time-pressure'
}

/** Candidates in a stable, total order, whatever order the caller passed them in. */
function inSessionOrder(candidates: readonly TechniqueCandidate[]): TechniqueCandidate[] {
  return [...candidates].sort(
    (first, second) => first.position - second.position || first.slotId.localeCompare(second.slotId),
  )
}

export function proposeSupersets(context: TechniqueContext): TechniqueFindings<SupersetProposal> {
  const rejections: TechniqueRejection[] = []

  if (!context.techniques.supersets) {
    return {
      proposals: [],
      rejections: [rejection('superset', 'technique-disabled', [], techniqueDisabledText('superset'))],
    }
  }

  const candidates = inSessionOrder(context.candidates)
  if (candidates.length < 2) {
    return {
      proposals: [],
      rejections: [rejection('superset', 'not-enough-candidates', [], notEnoughCandidatesText('superset'))],
    }
  }

  const { policy } = context
  const ceiling = difficultyCeiling(context.experience, policy.supersetExperienceHeadroom)
  const allowedCompounds = policy.maxSupersetCompounds[context.experience]
  const pressed = underTimePressure(context)
  const proposals: SupersetProposal[] = []

  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i]
    const detector = detectorFor(a, context)

    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j]
      const ids = [a.slotId, b.slotId]

      /* 0. THE conflict engine, first and in its own words. */
      const conflict = pairingConflict(detector, b.exercise)
      if (conflict !== null) {
        const blocking = conflict.severity === 'blocking'
        rejections.push(
          rejection('superset', blocking ? 'blocked-by-conflict' : 'weakens-pairing', ids, conflict.reason, {
            conflictKind: conflict.kind,
            conflictRule: conflict.kind === 'superset' ? conflict.detail.rule : undefined,
            conflictSeverity: conflict.severity,
          }),
        )
        continue
      }

      /* 1. A priority lift is never paired. */
      if (isProtectedSlot(a) || isProtectedSlot(b)) {
        rejections.push(rejection('superset', 'protects-priority-lift', ids, protectsPriorityLiftText()))
        continue
      }

      /* 2. Nothing tires a priority lift that is still to come. */
      const later = laterPriorityGroups(context, b.position)
      const pairGroups = [...primaryGroupsOf(a.exercise), ...primaryGroupsOf(b.exercise)]
      const wouldTire = sharedGroups(pairGroups, later.groups)
      if (wouldTire.length > 0) {
        rejections.push(
          rejection('superset', 'compromises-later-priority', ids, compromisesLaterPriorityText(wouldTire)),
        )
        continue
      }

      /* 3. Not beyond the person's level. */
      const tooHard = [a, b].some(
        (candidate) => !DIFFICULTY_SCALE.atMost(candidate.exercise.difficulty, ceiling),
      )
      if (tooHard) {
        rejections.push(rejection('superset', 'beyond-experience', ids, beyondExperienceText()))
        continue
      }

      const compounds = [a, b].filter(
        (candidate) => candidate.exercise.compoundOrIsolation === 'compound',
      ).length
      if (compounds > allowedCompounds) {
        rejections.push(
          rejection(
            'superset',
            'too-many-compounds-for-experience',
            ids,
            tooManyCompoundsText(allowedCompounds),
          ),
        )
        continue
      }

      /* 4. Enough rounds, and a saving worth having. */
      const rounds = Math.min(a.plannedSets, b.plannedSets)
      if (rounds < policy.minSupersetRounds) {
        rejections.push(
          rejection('superset', 'too-few-rounds', ids, tooFewRoundsText(policy.minSupersetRounds)),
        )
        continue
      }

      const penalty = transitionPenalty(policy, [a.exercise, b.exercise])
      const restBetweenMovesSeconds = policy.supersetMoveGapSeconds + penalty
      const restAfterRoundSeconds = Math.min(
        900,
        Math.max(
          policy.minSupersetRoundRestSeconds,
          Math.round(Math.max(a.restSeconds, b.restSeconds) * policy.supersetRoundRestFactor),
        ),
      )
      const effect = timeEffect(
        rounds * (a.restSeconds + b.restSeconds),
        rounds * (restBetweenMovesSeconds + restAfterRoundSeconds),
      )
      if (effect.savedSeconds < policy.minSupersetSavingSeconds) {
        rejections.push(
          rejection(
            'superset',
            'saves-too-little-time',
            ids,
            savesTooLittleTimeText(policy.minSupersetSavingSeconds),
          ),
        )
        continue
      }

      /* 5. Close enough together to accept without rebuilding the order. */
      const slotDistance = b.position - a.position
      if (slotDistance > policy.maxSupersetSlotDistance) {
        rejections.push(rejection('superset', 'too-far-apart', ids, tooFarApartText()))
        continue
      }

      const overlap = sharedGroups(primaryGroupsOf(a.exercise), primaryGroupsOf(b.exercise)).length
      const antagonist = isAntagonistPair(a.exercise, b.exercise)
      const bothAccessory = a.priority === 'accessory' && b.priority === 'accessory'
      const gripFree =
        !a.exercise.supersetCompatibility.gripHeavy && !b.exercise.supersetCompatibility.gripHeavy

      const supporting: TechniqueReason[] = []
      if (pressed) supporting.push(timePressureReason())
      if (antagonist) supporting.push(antagonistPairingReason())
      if (overlap === 0) supporting.push(noMuscleOverlapReason())
      if (bothAccessory) supporting.push(accessoryWorkReason())
      if (penalty === 0) supporting.push(quickTransitionReason())
      if (gripFree) supporting.push(gripUnaffectedReason())
      supporting.push(separateStationsReason(stationsOf(a.exercise, b.exercise)))

      const leading = savesTimeReason(effect.savedSeconds)
      const reasons: [TechniqueReason, ...TechniqueReason[]] = [leading, ...supporting.slice(0, 3)]
      const bonus =
        (antagonist ? 20 : 0) +
        (overlap === 0 ? 12 : 0) +
        (bothAccessory ? 8 : 0) +
        (penalty === 0 ? 6 : 0) +
        Math.max(0, 8 - 2 * slotDistance)

      const unpaired = [a, b]
        .filter((candidate) => candidate.plannedSets > rounds)
        .map((candidate) => ({ slotId: candidate.slotId, sets: candidate.plannedSets - rounds }))

      proposals.push({
        technique: 'superset',
        score: proposalScore(effect.savedSeconds, bonus, policy),
        reasons,
        timeEffect: effect,
        summary: proposalSummary(leading, effect.savedSeconds),
        firstSlotId: a.slotId,
        secondSlotId: b.slotId,
        rounds,
        unpairedSets: unpaired,
        restBetweenMovesSeconds,
        restAfterRoundSeconds,
        rationale: rationaleFor(a, b, overlap),
        slotDistance,
        reorderRequired: slotDistance > 1,
      })
    }
  }

  proposals.sort(
    (first, second) =>
      second.score - first.score ||
      first.firstSlotId.localeCompare(second.firstSlotId) ||
      first.secondSlotId.localeCompare(second.secondSlotId),
  )

  return { proposals, rejections }
}
