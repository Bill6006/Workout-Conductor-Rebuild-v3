import { createTechniqueContext } from './context'
import { proposeCircuits } from './circuits'
import { proposeDropSets } from './dropSets'
import { proposeSupersets } from './supersets'
import type { TechniqueContextInput, TechniqueProposals } from './types'

/**
 * SUPERSETS, DROP SETS AND CIRCUITS — THE PUBLIC SURFACE.
 *
 * ONE OWNER FOR ONE RESPONSIBILITY. Everything that decides whether a training
 * technique is worth using lives behind this barrel. The generator asks; it does
 * not hold rules of its own about when a pairing is a good pairing, and neither
 * does any screen.
 *
 * NOTHING HERE MUTATES A SESSION. Every function returns proposals and rejections.
 * The generator owns the plan and decides what to accept against its time budget;
 * Phase 5 renders the reasons. A proposal engine that edited the plan would be a
 * second owner of the plan.
 *
 * NOTHING HERE IMPORTS EXERCISE DATA. Candidates arrive carrying their `Exercise`
 * records, exactly as the conflict engine and the alternatives ranker take theirs,
 * so this module can be pulled into any chunk without dragging the catalog behind
 * it.
 *
 * PURE AND DETERMINISTIC. No React, no storage, no `Date.now()`, no
 * `Math.random()`. The same context always produces byte-identical proposals in
 * the same order — asserted, not assumed, in `techniques.test.ts`.
 *
 * Most callers need only:
 *
 *     const { supersets, dropSets, circuits, rejections } = proposeTechniques({
 *       candidates,
 *       techniques: profile.techniques,
 *       style: profile.trainingStyle,
 *       timeBudgetSeconds,
 *       estimatedSeconds,
 *     })
 */

/**
 * All three techniques, considered against one session.
 *
 * THEY ARE CONSIDERED INDEPENDENTLY, AND THAT IS DELIBERATE. A slot can appear in
 * a superset proposal, a drop-set proposal and a circuit proposal at once, because
 * only the generator knows which of the three it can afford and which it wants.
 * Choosing between them here would be this module deciding the session, which is
 * the one thing it must not do.
 */
export function proposeTechniques(input: TechniqueContextInput = {}): TechniqueProposals {
  const context = createTechniqueContext(input)
  const supersets = proposeSupersets(context)
  const dropSets = proposeDropSets(context)
  const circuits = proposeCircuits(context)

  return {
    supersets: supersets.proposals,
    dropSets: dropSets.proposals,
    circuits: circuits.proposals,
    rejections: [...supersets.rejections, ...dropSets.rejections, ...circuits.rejections],
  }
}

export { proposeSupersets } from './supersets'
export { DROP_SET_SIZE_ROLES, DROP_SET_STRENGTH_ROLES, proposeDropSets } from './dropSets'
export { proposeCircuits } from './circuits'

export {
  createTechniqueContext,
  defaultWorkSecondsEstimator,
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

export {
  DEFAULT_TECHNIQUE_POLICY,
  SECONDS_PER_REP,
  difficultyCeiling,
  resolveTechniquePolicy,
} from './policy'
export type { TechniquePolicy } from './policy'

export { minutesPhrase } from './reasons'

export { TECHNIQUE_KINDS, TECHNIQUE_REASON_CODES, TECHNIQUE_REJECTION_CODES } from './types'
export type {
  CircuitProposal,
  DropSetProposal,
  MuscleVolumeNeed,
  SupersetProposal,
  TechniqueCandidate,
  TechniqueContext,
  TechniqueContextInput,
  TechniqueFindings,
  TechniqueKind,
  TechniqueProposals,
  TechniqueReason,
  TechniqueReasonCode,
  TechniqueRejection,
  TechniqueRejectionCode,
  TimeEffect,
  WorkSecondsEstimator,
  WorkSecondsInput,
} from './types'
