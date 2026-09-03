import { TRANSITION_COST_SCALE } from '../../catalog/taxonomy/scales'
import {
  isProtectedSlot,
  primaryGroupsOf,
  proposalScore,
  rejection,
  sharedGroups,
  timeEffect,
  transitionPenalty,
  underTimePressure,
} from './context'
import {
  circuitAlreadyFullText,
  equipmentUnavailableText,
  fatigueTooHighText,
  goalDoesNotSuitCircuitsText,
  goalSuitsCircuitReason,
  notEnoughCandidatesText,
  proposalSummary,
  protectsPriorityLiftText,
  recoveredEnoughReason,
  sameStationText,
  savesTimeReason,
  savesTooLittleTimeText,
  scarceStationText,
  sharesMuscleWithMemberText,
  strengthSessionText,
  techniqueDisabledText,
  timePressureReason,
  tooFewMembersText,
  tooFewRoundsText,
  transitionTooCostlyText,
} from './reasons'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { StationId } from '../../catalog/taxonomy/taxonomy'
import type {
  CircuitProposal,
  TechniqueCandidate,
  TechniqueContext,
  TechniqueFindings,
  TechniqueReason,
  TechniqueRejection,
} from './types'

/**
 * CIRCUITS — ONLY WHEN THE GOAL, THE KIT, THE PLACE AND THE PERSON SUPPORT ONE.
 *
 * A circuit is a run of stations performed back to back for a number of rounds. It
 * is the cheapest way to spend a short session and the most expensive way to
 * spend a strong one: it costs rest, and rest is what a heavy set is built on.
 *
 * A CIRCUIT IS NEVER FORCED INTO A STRENGTH-PRIORITY SESSION. That is the flat
 * rule the product plan states, and it is checked before anything else is
 * measured: a session built around getting stronger gets no circuit however well
 * the stations would have lined up, and no member of any circuit is ever a slot
 * the session was built around.
 *
 * THE FOUR SUPPORTS, in the order they are asked:
 *
 *   GOAL       — `policy.circuitGoals`. A circuit is a way to cover a lot of work
 *                in a little time. It is not a way to get stronger, and a person
 *                who said that is what they want does not get one.
 *   FATIGUE    — recovery at or above `policy.circuitMinRecovery`. Unmeasured is
 *                not exhausted: with no recovery model in the product until Phase
 *                6, an unknown score passes and the proposal simply does not claim
 *                `recovered-enough` as a reason. Measured and low BLOCKS.
 *   EQUIPMENT  — every member's required kit is at the place they are training,
 *                and no two members want the same station, because you cannot take
 *                turns with yourself.
 *   LOCATION   — at a gym, a circuit may not tie up a station a gym has one of.
 *                A circuit holds every station it uses for its whole duration, and
 *                that is four people's squat rack. At home, and at a location of no
 *                fixed kind, nothing is concluded and the rule stays silent.
 *
 * AND THE STRUCTURE: members train different muscle groups (a circuit whose
 * stations all hit one group is straight sets with extra walking), transitions are
 * cheap enough to be worth doing, everyone has enough rounds, and the whole thing
 * saves a clear stretch of time.
 *
 * ONE CIRCUIT PER SESSION. A second one is a different session's structure. Slots
 * that would have qualified but did not fit are reported as `circuit-already-full`
 * rather than silently passed over.
 */

/** Stations already claimed, and the groups already trained, as the circuit fills. */
interface Admitted {
  readonly members: TechniqueCandidate[]
  readonly stations: StationId[]
  readonly groups: MuscleGroupId[]
}

/** No circuit, and the one reason why. Every gate below returns through this. */
function noCircuit(reason: TechniqueRejection): TechniqueFindings<CircuitProposal> {
  return { proposals: [], rejections: [reason] }
}

export function proposeCircuits(context: TechniqueContext): TechniqueFindings<CircuitProposal> {
  const { policy } = context

  /* -- the four whole-technique gates ------------------------------- */

  if (!context.techniques.circuits) {
    return noCircuit(rejection('circuit', 'technique-disabled', [], techniqueDisabledText('circuit')))
  }
  if (context.style === 'strength') {
    return noCircuit(rejection('circuit', 'strength-session', [], strengthSessionText()))
  }
  if (!policy.circuitGoals.includes(context.goal)) {
    return noCircuit(rejection('circuit', 'goal-does-not-suit-circuits', [], goalDoesNotSuitCircuitsText()))
  }
  const recoveryKnown = context.systemicRecovery !== null
  if (recoveryKnown && (context.systemicRecovery ?? 0) < policy.circuitMinRecovery) {
    return noCircuit(rejection('circuit', 'fatigue-too-high', [], fatigueTooHighText()))
  }

  const candidates = [...context.candidates].sort(
    (first, second) => first.position - second.position || first.slotId.localeCompare(second.slotId),
  )
  if (candidates.length < policy.minCircuitMembers) {
    return noCircuit(rejection('circuit', 'not-enough-candidates', [], notEnoughCandidatesText('circuit')))
  }

  /* -- who may be a member ------------------------------------------ */

  const rejections: TechniqueRejection[] = []
  const admitted: Admitted = { members: [], stations: [], groups: [] }
  const eligibleIds: string[] = []

  for (const candidate of candidates) {
    const ids = [candidate.slotId]
    const exercise = candidate.exercise

    if (isProtectedSlot(candidate)) {
      rejections.push(rejection('circuit', 'protects-priority-lift', ids, protectsPriorityLiftText()))
      continue
    }

    const missing = exercise.equipment.filter((id) => !context.availableEquipment.includes(id))
    if (missing.length > 0) {
      rejections.push(rejection('circuit', 'equipment-unavailable', ids, equipmentUnavailableText()))
      continue
    }

    const station = exercise.supersetCompatibility.stationId
    if (context.location === 'gym' && station !== null && policy.scarceStations.includes(station)) {
      rejections.push(rejection('circuit', 'scarce-station', ids, scarceStationText(station)))
      continue
    }

    if (!TRANSITION_COST_SCALE.atMost(exercise.transitionCost, policy.maxCircuitTransitionCost)) {
      rejections.push(rejection('circuit', 'transition-too-costly', ids, transitionTooCostlyText()))
      continue
    }

    if (candidate.plannedSets < policy.minCircuitRounds) {
      rejections.push(rejection('circuit', 'too-few-rounds', ids, tooFewRoundsText(policy.minCircuitRounds)))
      continue
    }

    eligibleIds.push(candidate.slotId)

    if (station !== null && admitted.stations.includes(station)) {
      rejections.push(rejection('circuit', 'same-station', ids, sameStationText(station)))
      continue
    }

    const groups = primaryGroupsOf(exercise)
    const clash = sharedGroups(groups, admitted.groups)
    if (clash.length > 0) {
      rejections.push(
        rejection('circuit', 'shares-muscle-with-member', ids, sharesMuscleWithMemberText(clash)),
      )
      continue
    }

    if (admitted.members.length >= policy.maxCircuitMembers) {
      rejections.push(
        rejection('circuit', 'circuit-already-full', ids, circuitAlreadyFullText(policy.maxCircuitMembers)),
      )
      continue
    }

    admitted.members.push(candidate)
    if (station !== null) admitted.stations.push(station)
    for (const group of groups) if (!admitted.groups.includes(group)) admitted.groups.push(group)
  }

  if (admitted.members.length < policy.minCircuitMembers) {
    rejections.push(
      rejection('circuit', 'too-few-members', eligibleIds, tooFewMembersText(policy.minCircuitMembers)),
    )
    return { proposals: [], rejections }
  }

  /* -- what it costs and saves -------------------------------------- */

  const members = admitted.members
  const memberIds = members.map((member) => member.slotId)
  const rounds = members.reduce((least, member) => Math.min(least, member.plannedSets), Infinity)
  const totalRest = members.reduce((sum, member) => sum + member.restSeconds, 0)

  const restBetweenStationsSeconds =
    policy.circuitStationGapSeconds +
    transitionPenalty(
      policy,
      members.map((member) => member.exercise),
    )
  const restAfterRoundSeconds = Math.min(
    900,
    Math.max(
      policy.minCircuitRoundRestSeconds,
      Math.round((totalRest / members.length) * policy.circuitRoundRestFactor),
    ),
  )

  const effect = timeEffect(
    rounds * totalRest,
    rounds * ((members.length - 1) * restBetweenStationsSeconds + restAfterRoundSeconds),
  )

  if (effect.savedSeconds < policy.minCircuitSavingSeconds) {
    rejections.push(
      rejection(
        'circuit',
        'saves-too-little-time',
        memberIds,
        savesTooLittleTimeText(policy.minCircuitSavingSeconds),
      ),
    )
    return { proposals: [], rejections }
  }

  const pressed = underTimePressure(context)
  const supporting: TechniqueReason[] = [goalSuitsCircuitReason()]
  if (recoveryKnown) supporting.push(recoveredEnoughReason())
  if (pressed) supporting.push(timePressureReason())

  const leading = savesTimeReason(effect.savedSeconds)
  const reasons: [TechniqueReason, ...TechniqueReason[]] = [leading, ...supporting.slice(0, 3)]
  const bonus =
    (recoveryKnown ? 10 : 0) + (pressed ? 10 : 0) + (members.length >= policy.maxCircuitMembers ? 5 : 0)

  const proposal: CircuitProposal = {
    technique: 'circuit',
    score: proposalScore(effect.savedSeconds, bonus, policy),
    reasons,
    timeEffect: effect,
    summary: proposalSummary(leading, effect.savedSeconds),
    memberSlotIds: memberIds,
    rounds,
    restBetweenStationsSeconds,
    restAfterRoundSeconds,
    stations: admitted.stations,
  }

  return { proposals: [proposal], rejections }
}
