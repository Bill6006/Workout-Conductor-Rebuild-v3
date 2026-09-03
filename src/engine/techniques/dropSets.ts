import { SUITABILITY_SCALE } from '../../catalog/taxonomy/scales'
import {
  isProtectedSlot,
  laterPriorityGroups,
  primaryGroupsOf,
  proposalScore,
  rejection,
  sharedGroups,
  timeEffect,
  underTimePressure,
} from './context'
import {
  compromisesLaterPriorityText,
  enoughDropSetsText,
  hypertrophyFocusReason,
  noLoadToDropText,
  noTimePressureText,
  notEnoughCandidatesText,
  notHypertrophyContextText,
  proposalSummary,
  protectsPriorityLiftText,
  savesTimeReason,
  savesTooLittleTimeText,
  setupTooComplexText,
  simpleToStripReason,
  strengthPrioritySlotText,
  techniqueDisabledText,
  timePressureReason,
  unsafeForDropSetText,
  volumeAlreadyMetText,
  volumeStillOwedReason,
} from './reasons'
import type { MuscleGroupId } from '../../catalog/muscles/muscles'
import type { TrainingRole } from '../../catalog/taxonomy/taxonomy'
import type {
  DropSetProposal,
  TechniqueContext,
  TechniqueFindings,
  TechniqueReason,
  TechniqueRejection,
} from './types'

/**
 * DROP SETS — A TIME-EFFICIENT HYPERTROPHY TOOL, NOT A DEFAULT INTENSIFIER.
 *
 * That sentence is the whole rule set, and it cuts both ways. A drop set buys
 * close to another set's worth of stimulus for a fraction of another set's worth
 * of clock, which makes it excellent when the clock is the problem. When the clock
 * is NOT the problem, another straight set is the better buy — same stimulus, less
 * accumulated fatigue, nothing new to explain — and proposing a drop set anyway
 * would be treating "harder" as "better".
 *
 * SO IT IS PROPOSED ONLY WHEN EVERY ONE OF THESE IS TRUE, in the order asked:
 *
 *   1. THE PERSON TURNED DROP SETS ON. `techniques.dropSets`.
 *   2. THE EXERCISE IS SAFE FOR ONE. `safeForDropSet` on the catalog entry, and a
 *      load that exists to be dropped — there is nothing to strip off a plank.
 *   3. THE SLOT IS NOT A STRENGTH LIFT AND NOT A PRIORITY. Taking a heavy lift to
 *      failure and past it is not what a strength slot is for, and the session's
 *      main lift is left as straight sets whatever it is for.
 *   4. THE GOAL IS SIZE. A strength session does not get one; nor does a slot whose
 *      job is not building size, or an exercise the catalog rates poorly for it.
 *   5. TIME IS LIMITED. Either the person said so or the session overruns its
 *      budget. With neither true there is room for another straight set.
 *   6. THE MUSCLE STILL NEEDS VOLUME. When weekly volume is known and the group's
 *      target is already met, more work on it is not the answer. When volume is not
 *      known — which is every session until Phase 6 — this passes rather than
 *      blocks, because "unmeasured" is not "met".
 *   7. IT DOES NOT COMPROMISE A LATER PRIORITY EXERCISE.
 *   8. SETUP IS SIMPLE. A drop only works if the weight comes off in seconds: a
 *      pin, a dial, a lighter pair of dumbbells. Stripping plates mid-set is not a
 *      drop set, it is a rest.
 *   9. IT ACTUALLY SAVES THE TIME IT CLAIMS TO. The arithmetic is against the
 *      straight set it stands in for, not against nothing.
 *
 * AND THEN AT MOST `maxDropSetsPerSession` OF THEM. A session of drop sets is not a
 * session with drop sets in it. The limit is applied AFTER ranking, so the slots
 * that gain the most are the ones that get them, and the slots that lose out are
 * reported as `enough-drop-sets-already` rather than silently dropped.
 */

/** Roles whose job is building size. `primary-hypertrophy` is protected elsewhere. */
const SIZE_ROLES: readonly TrainingRole[] = [
  'primary-hypertrophy',
  'secondary-hypertrophy',
  'isolation',
  'specialisation',
  'finisher',
]

/** Roles that exist to move load. A drop set is not what they are for. */
const STRENGTH_ROLES: readonly TrainingRole[] = ['primary-strength', 'secondary-strength']

/**
 * Groups that still owe sets this week, and whether that is known at all.
 *
 * `known: false` is the state of the product today and for every session until
 * Phase 6 supplies weekly volume. It is reported rather than defaulted, so the
 * rule can pass on an unmeasured group without pretending it measured one.
 */
function volumeOutlook(
  context: TechniqueContext,
  groups: readonly MuscleGroupId[],
): { readonly known: boolean; readonly owed: readonly MuscleGroupId[] } {
  if (context.muscleVolumeNeed === null) return { known: false, owed: [] }
  const owed = groups.filter((group) =>
    (context.muscleVolumeNeed ?? []).some((need) => need.group === group && need.setsRemaining > 0),
  )
  return { known: true, owed }
}

export function proposeDropSets(context: TechniqueContext): TechniqueFindings<DropSetProposal> {
  if (!context.techniques.dropSets) {
    return {
      proposals: [],
      rejections: [rejection('drop-set', 'technique-disabled', [], techniqueDisabledText('drop-set'))],
    }
  }

  const candidates = [...context.candidates]
    .filter((candidate) => candidate.plannedSets >= 1)
    .sort((first, second) => first.position - second.position || first.slotId.localeCompare(second.slotId))

  if (candidates.length === 0) {
    return {
      proposals: [],
      rejections: [rejection('drop-set', 'not-enough-candidates', [], notEnoughCandidatesText('drop-set'))],
    }
  }

  const { policy } = context
  const rejections: TechniqueRejection[] = []
  const pressed = underTimePressure(context)
  const eligible: DropSetProposal[] = []

  for (const candidate of candidates) {
    const ids = [candidate.slotId]
    const exercise = candidate.exercise

    /* 2. Safe, and something to drop. */
    if (!exercise.safeForDropSet) {
      rejections.push(rejection('drop-set', 'unsafe-for-drop-set', ids, unsafeForDropSetText()))
      continue
    }
    if (exercise.load.measure === 'none') {
      rejections.push(rejection('drop-set', 'no-load-to-drop', ids, noLoadToDropText()))
      continue
    }

    /* 3. Not a strength lift, not the session's priority. */
    if (STRENGTH_ROLES.includes(candidate.role)) {
      rejections.push(rejection('drop-set', 'strength-priority-slot', ids, strengthPrioritySlotText()))
      continue
    }
    if (isProtectedSlot(candidate)) {
      rejections.push(rejection('drop-set', 'protects-priority-lift', ids, protectsPriorityLiftText()))
      continue
    }

    /* 4. The goal is size. */
    if (context.style === 'strength') {
      rejections.push(
        rejection('drop-set', 'not-a-hypertrophy-context', ids, notHypertrophyContextText('session')),
      )
      continue
    }
    const buildsSize =
      SIZE_ROLES.includes(candidate.role) &&
      SUITABILITY_SCALE.atLeast(exercise.hypertrophySuitability, 'good')
    if (!buildsSize) {
      rejections.push(
        rejection('drop-set', 'not-a-hypertrophy-context', ids, notHypertrophyContextText('slot')),
      )
      continue
    }

    /* 5. Time is limited. */
    if (!pressed) {
      rejections.push(rejection('drop-set', 'no-time-pressure', ids, noTimePressureText()))
      continue
    }

    /* 6. The muscle still needs volume. */
    const groups = primaryGroupsOf(exercise)
    const volume = volumeOutlook(context, groups)
    if (volume.known && volume.owed.length === 0) {
      rejections.push(rejection('drop-set', 'volume-already-met', ids, volumeAlreadyMetText(groups)))
      continue
    }

    /* 7. Nothing a later priority lift needs. */
    const later = laterPriorityGroups(context, candidate.position)
    const wouldTire = sharedGroups(groups, later.groups)
    if (wouldTire.length > 0) {
      rejections.push(
        rejection('drop-set', 'compromises-later-priority', ids, compromisesLaterPriorityText(wouldTire)),
      )
      continue
    }

    /* 8. The load comes off in seconds. */
    const quickBase = policy.dropSetQuickBases.includes(exercise.load.basis)
    if (!quickBase || exercise.setupTimeSeconds > policy.dropSetMaxSetupSeconds) {
      rejections.push(rejection('drop-set', 'setup-too-complex', ids, setupTooComplexText()))
      continue
    }

    /* 9. It beats the straight set it stands in for. */
    const straightSetWork = context.estimateWorkSeconds({ exercise, reps: null })
    const midpoint = (exercise.typicalRepRange.min + exercise.typicalRepRange.max) / 2
    const dropWork = context.estimateWorkSeconds({
      exercise,
      reps: Math.max(1, Math.round(midpoint * policy.dropSetRepFactor)),
    })
    const drops = (context.timePressure ?? 0) >= policy.dropSetSecondDropPressure ? 2 : 1
    const addedSeconds = drops * (policy.dropSetTransitionSeconds + dropWork)
    const effect = timeEffect(straightSetWork + candidate.restSeconds, addedSeconds, addedSeconds)

    if (effect.savedSeconds < policy.minDropSetSavingSeconds) {
      rejections.push(
        rejection(
          'drop-set',
          'saves-too-little-time',
          ids,
          savesTooLittleTimeText(policy.minDropSetSavingSeconds),
        ),
      )
      continue
    }

    const supporting: TechniqueReason[] = [hypertrophyFocusReason()]
    if (volume.owed.length > 0) supporting.push(volumeStillOwedReason(volume.owed))
    supporting.push(timePressureReason(), simpleToStripReason())

    const leading = savesTimeReason(effect.savedSeconds)
    const reasons: [TechniqueReason, ...TechniqueReason[]] = [leading, ...supporting.slice(0, 3)]
    const bonus =
      (volume.owed.length > 0 ? 15 : 0) + (context.style === 'hypertrophy' ? 10 : 0) + (quickBase ? 5 : 0)

    eligible.push({
      technique: 'drop-set',
      score: proposalScore(effect.savedSeconds, bonus, policy),
      reasons,
      timeEffect: effect,
      summary: proposalSummary(leading, effect.savedSeconds),
      slotId: candidate.slotId,
      setIndex: candidate.plannedSets - 1,
      intent: {
        drops,
        loadReductionPercent: policy.dropSetLoadReductionPercent,
        transitionSeconds: policy.dropSetTransitionSeconds,
      },
      equivalentStraightSets: 1,
    })
  }

  eligible.sort((first, second) => second.score - first.score || first.slotId.localeCompare(second.slotId))

  const limit = Math.max(0, policy.maxDropSetsPerSession)
  const proposals = eligible.slice(0, limit)
  for (const spare of eligible.slice(limit)) {
    rejections.push(
      rejection('drop-set', 'enough-drop-sets-already', [spare.slotId], enoughDropSetsText(limit)),
    )
  }

  return { proposals, rejections }
}

/** The roles whose job is building size. Exported so a test can pin the list. */
export const DROP_SET_SIZE_ROLES = SIZE_ROLES
/** The roles that exist to move load. Exported so a test can pin the list. */
export const DROP_SET_STRENGTH_ROLES = STRENGTH_ROLES
