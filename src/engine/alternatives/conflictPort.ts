import type { Exercise } from '../../catalog/exercises/exerciseSchema'
import type { Conflict, ConflictKind } from '../conflicts/conflictTypes'
import type { ExclusionCode } from './types'

/**
 * THE PORT ONTO THE CONFLICT ENGINE — and it is deliberately one function wide.
 *
 * `src/engine/conflicts` is the single owner of every rule about whether two
 * exercises belong in the same session. This ranker asks it; it does not hold a
 * copy of a single one of those rules, and it does not define a rival vocabulary
 * for the answers. `Conflict`, `ConflictKind` and `ConflictSeverity` are imported
 * from that engine, so there is exactly one meaning of "duplicate" and one meaning
 * of "blocking" in the product.
 *
 * WHY A PORT AT ALL, RATHER THAN CALLING THE ENGINE DIRECTLY EVERYWHERE. Ranking
 * asks the same question of the same session a few dozen times in a row. The
 * engine's own `createConflictDetector` is built for exactly that — it indexes the
 * session once — so the ranker builds one detector per call and every candidate
 * reads it. This interface is that prepared question: candidate in, conflicts out.
 * It also lets a test hand the ranker a stub, and lets a caller that already holds
 * a detector pass its own.
 *
 * THE SPLIT OF RESPONSIBILITY, so neither side duplicates the other:
 *
 *   The ranker filters on facts about the CANDIDATE AND THE PERSON'S SITUATION
 *   that it can report better than a conflict can — the equipment here, whether
 *   another saved location has it, whether the exercise suits this kind of place,
 *   whether they said they dislike it, whether it trains the right thing at all,
 *   and whether it fits the time LEFT in a session already under way.
 *
 *   The conflict engine judges everything about the SESSION: limitations,
 *   duplicates, overlap, joint stress, grip, stations, supersets, recovery, role.
 *   Every one of those needs to see the whole session, which is what the engine is.
 *
 * A CONFLICT IS DATA; WHAT TO DO ABOUT IT IS THE RANKER'S POLICY. The engine says
 * "blocking", "strong", "advisory" and the ranker decides that blocking excludes,
 * strong and advisory cost score and are shown as warnings, and that a blocking
 * superset conflict becomes a reported broken superset when the caller has already
 * said it will accept one. That policy lives in `exclusions.ts` and nowhere else.
 */

export type { Conflict, ConflictKind, ConflictSeverity } from '../conflicts/conflictTypes'

/** The prepared question: one candidate, judged against one already-indexed session. */
export interface ConflictChecker {
  /** Identifies the implementation on the result, for logs and for review. */
  readonly id: string
  /**
   * Every conflict that putting `candidate` into the target slot would create,
   * with the exercise it replaces already taken out of the session.
   */
  check(candidate: Exercise): readonly Conflict[]
}

/**
 * Where the answers came from. `engine` is the real conflict engine, built by this
 * module from the ranking context; `injected` is a checker the caller supplied.
 */
export const CONFLICT_SOURCES = ['engine', 'injected'] as const
export type ConflictSource = (typeof CONFLICT_SOURCES)[number]

/**
 * Which exclusion a blocking conflict is reported as.
 *
 * Several of the engine's kinds land on one exclusion because the exclusion is
 * what the PERSON needs told: a station clash and an ineligible pairing are
 * different rules and the same sentence — "this cannot be your superset".
 *
 * `grip` and `recovery` have no exclusion of their own because they are only ever
 * blocking in combination with the session; `session-conflict` says exactly that,
 * and the conflict's own `reason` carries the specifics.
 */
export const CONFLICT_KIND_TO_EXCLUSION = {
  limitation: 'limitation-contraindicated',
  equipment: 'equipment-unavailable',
  location: 'location-unsuitable',
  'duplicate-exercise': 'duplicate-in-session',
  'duplicate-movement-pattern': 'duplicate-in-session',
  station: 'superset-conflict',
  superset: 'superset-conflict',
  'progression-role': 'interferes-with-priority',
  'joint-stress': 'unsafe-joint-stress',
  'muscle-overlap': 'excessive-overlap',
  grip: 'session-conflict',
  recovery: 'session-conflict',
  time: 'does-not-fit-remaining-time',
} as const satisfies Record<ConflictKind, ExclusionCode>

/** The kinds that are about the superset pairing rather than the exercise itself. */
export const SUPERSET_CONFLICT_KINDS: readonly ConflictKind[] = ['superset', 'station']
