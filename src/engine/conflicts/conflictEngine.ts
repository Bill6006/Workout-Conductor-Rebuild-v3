import { createConflictContext } from './conflictContext'
import { createConflictReport } from './conflictTypes'
import { buildSessionIndex, prepareEntry } from './sessionIndex'
import { entryConflicts } from './entryRules'
import { pairConflicts } from './pairRules'
import { candidateLoadConflicts, loadConflicts } from './loadRules'
import { candidateSupersetConflicts, supersetConflicts } from './supersetRules'
import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { Conflict, ConflictReport } from './conflictTypes'
import type {
  CandidatePlacement,
  ConflictContext,
  ConflictContextInput,
  SessionEntry,
} from './conflictContext'
import type { SessionIndex } from './sessionIndex'

/**
 * THE conflict engine. Two questions, one set of rules.
 *
 *   `detect`   — "what happens if I add this one exercise?" Phase 3 asks it while
 *                filling a session; Phase 5 asks it once per alternative.
 *   `validate` — "is this whole session sound?" Phase 4 asks it after assembling
 *                one, and Phase 8's recalibration asks it after a change.
 *
 * THEY SHARE EVERY RULE. Neither is a re-implementation of the other: both call
 * the same functions in `entryRules`, `pairRules`, `loadRules` and
 * `supersetRules`, and every threshold lives in `conflictPolicy`. Two code paths
 * that could disagree about whether a session is legal is the defect this
 * structure exists to prevent.
 *
 * PURE, AND DETERMINISTIC. No React, no storage, no clock, no randomness. The same
 * context and candidate always produce the same report, in the same order, and
 * nothing in this folder mutates anything a caller passed in.
 *
 * WHY A DETECTOR OBJECT. Ranking alternatives means calling `detect` hundreds of
 * times against ONE session. `createConflictDetector` builds the session's index
 * once and every candidate reads it; the per-candidate work is then set by the
 * candidate's own fields — one pattern, a few muscles, one station — rather than
 * by the session's length. `detectConflicts` and `validateSession` are the
 * one-shot conveniences on top; use the detector in a loop.
 */

export interface ConflictDetector {
  /** The resolved context, with every default filled in. */
  readonly context: ConflictContext
  /** What adding one exercise to this session would mean. */
  detect(candidate: Exercise, placement?: CandidatePlacement): ConflictReport
  /** Everything wrong with the session as it stands. */
  validate(): ConflictReport
}

export function createConflictDetector(input: ConflictContextInput = {}): ConflictDetector {
  const context = createConflictContext(input)
  const baseIndex = buildSessionIndex(context.session, context.policy)

  /**
   * The session the candidate is being judged against. Normally the whole thing;
   * for a swap, the session WITHOUT the entry being replaced — otherwise every
   * alternative would be reported as a duplicate of the exercise it stands in for.
   */
  function indexWithout(replaced: string | null | undefined): SessionIndex {
    if (!replaced) return baseIndex
    const remaining = context.session.filter((entry) => entry.exercise.id !== replaced)
    if (remaining.length === context.session.length) return baseIndex
    return buildSessionIndex(remaining, context.policy)
  }

  function detect(candidate: Exercise, placement: CandidatePlacement = {}): ConflictReport {
    const index = indexWithout(placement.replaces)
    const entry: SessionEntry = {
      exercise: candidate,
      supersetGroup: placement.supersetGroup ?? null,
      slot: placement.slot ?? null,
      estimatedSeconds: placement.estimatedSeconds,
    }
    const prepared = prepareEntry(entry, index.entries.length)

    return createConflictReport([
      ...entryConflicts(candidate, context),
      ...pairConflicts(prepared, index, context),
      ...candidateSupersetConflicts(prepared, index, context),
      ...candidateLoadConflicts(prepared, index, context),
    ])
  }

  /**
   * Pairwise rules run over each entry against the ones BEFORE it, so a pair is
   * reported once rather than from both ends. That walk is quadratic in the number
   * of entries, which is fine and deliberate: a session is a dozen exercises and
   * this runs once per session, not once per candidate. The path that runs
   * hundreds of times — `detect` — is the one kept linear in the candidate.
   */
  function validate(): ConflictReport {
    const conflicts: Conflict[] = []
    const prefix: SessionEntry[] = []

    for (const entry of context.session) {
      conflicts.push(...entryConflicts(entry.exercise, context))
      const prepared = prepareEntry(entry, prefix.length)
      conflicts.push(...pairConflicts(prepared, buildSessionIndex(prefix, context.policy), context))
      prefix.push(entry)
    }

    conflicts.push(...supersetConflicts(baseIndex, context))
    conflicts.push(...loadConflicts(baseIndex, context))

    return createConflictReport(conflicts)
  }

  return { context, detect, validate }
}

/**
 * One-shot: what adding `candidate` to this session would mean.
 *
 * Convenient, and the wrong tool in a loop — it rebuilds the session index on
 * every call. Ranking a list of alternatives should build one detector and call
 * `detect` on it.
 */
export function detectConflicts(
  candidate: Exercise,
  context: ConflictContextInput,
  placement?: CandidatePlacement,
): ConflictReport {
  return createConflictDetector(context).detect(candidate, placement)
}

/** One-shot: everything wrong with the session on the context. */
export function validateSession(context: ConflictContextInput): ConflictReport {
  return createConflictDetector(context).validate()
}
