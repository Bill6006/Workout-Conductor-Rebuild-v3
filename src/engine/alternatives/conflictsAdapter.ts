import { createConflictDetector } from '../conflicts/conflictEngine'
import type { ConflictContextInput, SessionEntry } from '../conflicts/conflictContext'
import type { ConflictPolicy } from '../conflicts/conflictPolicy'
import { estimateSlotWith, type SlotEstimator } from './estimate'
import type { ConflictChecker } from './conflictPort'
import type { SessionView } from './sessionView'
import type { AlternativesContext } from './types'

/**
 * THE ADAPTER. It turns a ranking context into the conflict engine's context, and
 * the engine's detector into the one-question `ConflictChecker` the ranker uses.
 *
 * ONE DETECTOR PER RANKING CALL, NOT ONE PER CANDIDATE. The engine indexes the
 * session when the detector is built and every `detect` reads that index, so
 * ranking a few dozen candidates costs one session index rather than a few dozen.
 * That is why this returns a prepared checker rather than a function that takes a
 * context.
 *
 * `replaces` IS THE WHOLE TRICK. Without it the engine would judge every candidate
 * against a session that still contains the exercise it is standing in for, and
 * report every single one as a duplicate of the thing being replaced.
 *
 * TWO INPUTS ARE DELIBERATELY WITHHELD, and this is the paragraph that says so:
 *
 *   `timeBudgetSeconds` is left `null`. The engine's time rule is about whether a
 *   PLANNED session fits its budget; the ranker's question is whether a candidate
 *   fits the time left in a session already under way, with some of it done. Those
 *   are different sums, and the ranker's filter answers its own — with a message
 *   naming the minutes — so handing the engine a number it would interpret
 *   differently would produce a second, wronger answer to the same question.
 *
 *   Equipment and location ARE passed, because the engine needs them to reason
 *   properly, but the ranker's own filters run first and will have removed those
 *   candidates already with a better message (including "you have that at the
 *   gym"). The engine's verdict on them is therefore a safety net, not a
 *   duplicate: if the ranker's filter ever missed one, the engine still blocks it.
 */

export interface ConflictCheckerOptions {
  /** Overrides for the engine's thresholds. Passed straight through. */
  readonly policy?: Partial<ConflictPolicy>
}

export function createConflictChecker(
  context: AlternativesContext,
  view: SessionView,
  estimate: SlotEstimator,
  options: ConflictCheckerOptions = {},
): ConflictChecker {
  const session: SessionEntry[] = context.session.map((slot) => ({
    exercise: slot.exercise,
    supersetGroup: slot.supersetId,
    slot: slot.slotId,
    estimatedSeconds: estimateSlotWith(estimate, slot, slot.exercise),
  }))

  const input: ConflictContextInput = {
    session,
    availableEquipment: context.availableEquipment,
    location: { id: 'current', name: 'this location', suitability: context.location },
    limitations: context.limitations,
    techniques: context.techniques,
    recentTraining: context.recentTraining,
    timeBudgetSeconds: null,
    policy: options.policy,
  }

  const detector = createConflictDetector(input)

  return {
    id: 'conflicts-engine',
    check: (candidate) =>
      detector.detect(candidate, {
        supersetGroup: view.target.supersetId,
        slot: view.target.slotId,
        estimatedSeconds: estimateSlotWith(estimate, view.target, candidate),
        replaces: view.target.exercise.id,
      }).conflicts,
  }
}
