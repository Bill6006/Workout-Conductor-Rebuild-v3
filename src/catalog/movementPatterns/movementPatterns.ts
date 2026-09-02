import { z } from 'zod'
import type { JointId } from '../taxonomy/joints'

/**
 * THE canonical movement-pattern vocabulary.
 *
 * The conflict engine judges "these two exercises are the same movement" from
 * THIS file and never from an exercise name. Each pattern therefore carries the
 * structural facts that judgement needs:
 *
 *   - `plane`       — which plane the load travels in;
 *   - `chain`       — which chain of the body drives it;
 *   - `primaryJoint`— the joint whose action defines the pattern;
 *   - `compound`    — one working joint or several;
 *   - `overlaps`    — patterns that train substantially the same thing.
 *
 * WHY THE ISOLATION IDS NAME A JOINT AND THE LEG ONES DO NOT SHARE THEM. A biceps
 * curl and a leg curl are both "a curl", and a single `isolation-curl` id would
 * make the duplicate-pattern check treat them as the same movement. The four
 * `isolation-*` ids therefore mean the ARM and SHOULDER isolations specifically;
 * the knee and hip isolations get ids of their own (`knee-flexion`,
 * `knee-extension`, `hip-abduction`, `hip-adduction`). `primaryJoint` records
 * which joint each one works, so a check can say why.
 *
 * `overlaps` is symmetric and is asserted symmetric by the tests: declaring
 * A overlaps B without the reverse is a bug, because overlap is a property of the
 * pair, not of the order the engine happened to compare them in.
 */

export const MOVEMENT_PATTERN_IDS = [
  'horizontal-push',
  'horizontal-pull',
  'vertical-push',
  'vertical-pull',
  'squat',
  'hinge',
  'lunge',
  'hip-extension',
  'carry',
  'calf-raise',
  'knee-flexion',
  'knee-extension',
  'hip-abduction',
  'hip-adduction',
  'isolation-curl',
  'isolation-extension',
  'isolation-raise',
  'isolation-fly',
  'shrug',
  'rotation',
  'anti-extension',
  'anti-rotation',
  'anti-lateral-flexion',
] as const

export type MovementPatternId = (typeof MOVEMENT_PATTERN_IDS)[number]

export const MOVEMENT_PLANES = ['sagittal', 'frontal', 'transverse', 'mixed'] as const
export type MovementPlane = (typeof MOVEMENT_PLANES)[number]

/**
 * The chain a pattern loads. This is the coarse cut the conflict engine makes
 * before it looks at muscles: two `upper-push` patterns back to back is a
 * different conversation from an `upper-push` followed by a `lower`.
 */
export const MOVEMENT_CHAINS = ['upper-push', 'upper-pull', 'lower', 'trunk', 'loaded-carry'] as const
export type MovementChain = (typeof MOVEMENT_CHAINS)[number]

export interface MovementPattern {
  readonly id: MovementPatternId
  readonly plane: MovementPlane
  readonly chain: MovementChain
  readonly primaryJoint: JointId
  /** False for a single-joint movement. */
  readonly compound: boolean
  /** Patterns that train substantially the same movement. Symmetric. */
  readonly overlaps: readonly MovementPatternId[]
}

export const MOVEMENT_PATTERNS: readonly MovementPattern[] = [
  {
    id: 'horizontal-push',
    plane: 'transverse',
    chain: 'upper-push',
    primaryJoint: 'shoulder',
    compound: true,
    overlaps: ['isolation-fly'],
  },
  {
    id: 'horizontal-pull',
    plane: 'transverse',
    chain: 'upper-pull',
    primaryJoint: 'shoulder',
    compound: true,
    overlaps: ['isolation-fly'],
  },
  {
    id: 'vertical-push',
    plane: 'sagittal',
    chain: 'upper-push',
    primaryJoint: 'shoulder',
    compound: true,
    overlaps: ['isolation-raise'],
  },
  {
    id: 'vertical-pull',
    plane: 'frontal',
    chain: 'upper-pull',
    primaryJoint: 'shoulder',
    compound: true,
    overlaps: [],
  },
  {
    id: 'squat',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'knee',
    compound: true,
    overlaps: ['lunge', 'knee-extension'],
  },
  {
    id: 'hinge',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'hip',
    compound: true,
    overlaps: ['hip-extension', 'knee-flexion'],
  },
  {
    id: 'lunge',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'knee',
    compound: true,
    overlaps: ['squat', 'knee-extension'],
  },
  {
    id: 'hip-extension',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'hip',
    compound: true,
    overlaps: ['hinge'],
  },
  {
    id: 'carry',
    plane: 'mixed',
    chain: 'loaded-carry',
    primaryJoint: 'lower-back',
    compound: true,
    overlaps: ['anti-lateral-flexion'],
  },
  {
    id: 'calf-raise',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'ankle',
    compound: false,
    overlaps: [],
  },
  {
    id: 'knee-flexion',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'knee',
    compound: false,
    overlaps: ['hinge'],
  },
  {
    id: 'knee-extension',
    plane: 'sagittal',
    chain: 'lower',
    primaryJoint: 'knee',
    compound: false,
    overlaps: ['squat', 'lunge'],
  },
  {
    id: 'hip-abduction',
    plane: 'frontal',
    chain: 'lower',
    primaryJoint: 'hip',
    compound: false,
    overlaps: [],
  },
  {
    id: 'hip-adduction',
    plane: 'frontal',
    chain: 'lower',
    primaryJoint: 'hip',
    compound: false,
    overlaps: [],
  },
  {
    id: 'isolation-curl',
    plane: 'sagittal',
    chain: 'upper-pull',
    primaryJoint: 'elbow',
    compound: false,
    overlaps: [],
  },
  {
    id: 'isolation-extension',
    plane: 'sagittal',
    chain: 'upper-push',
    primaryJoint: 'elbow',
    compound: false,
    overlaps: [],
  },
  {
    id: 'isolation-raise',
    plane: 'frontal',
    chain: 'upper-push',
    primaryJoint: 'shoulder',
    compound: false,
    overlaps: ['vertical-push'],
  },
  {
    id: 'isolation-fly',
    plane: 'transverse',
    chain: 'upper-push',
    primaryJoint: 'shoulder',
    compound: false,
    overlaps: ['horizontal-push', 'horizontal-pull'],
  },
  {
    id: 'shrug',
    plane: 'frontal',
    chain: 'upper-pull',
    primaryJoint: 'shoulder',
    compound: false,
    overlaps: [],
  },
  {
    id: 'rotation',
    plane: 'transverse',
    chain: 'trunk',
    primaryJoint: 'lower-back',
    compound: false,
    overlaps: ['anti-rotation'],
  },
  {
    id: 'anti-extension',
    plane: 'sagittal',
    chain: 'trunk',
    primaryJoint: 'lower-back',
    compound: false,
    overlaps: [],
  },
  {
    id: 'anti-rotation',
    plane: 'transverse',
    chain: 'trunk',
    primaryJoint: 'lower-back',
    compound: false,
    overlaps: ['rotation'],
  },
  {
    id: 'anti-lateral-flexion',
    plane: 'frontal',
    chain: 'trunk',
    primaryJoint: 'lower-back',
    compound: false,
    overlaps: ['carry'],
  },
]

const BY_ID = new Map<string, MovementPattern>(MOVEMENT_PATTERNS.map((pattern) => [pattern.id, pattern]))

export const movementPatternIdSchema = z.enum(MOVEMENT_PATTERN_IDS)
export const movementPlaneSchema = z.enum(MOVEMENT_PLANES)
export const movementChainSchema = z.enum(MOVEMENT_CHAINS)

export function isMovementPatternId(value: unknown): value is MovementPatternId {
  return typeof value === 'string' && BY_ID.has(value)
}

export function getMovementPattern(id: MovementPatternId): MovementPattern {
  const pattern = BY_ID.get(id)
  if (!pattern) throw new Error(`Unknown movement pattern id: ${id}`)
  return pattern
}

/** Every pattern that loads a chain, in canonical order. */
export function patternsInChain(chain: MovementChain): MovementPatternId[] {
  return MOVEMENT_PATTERNS.filter((pattern) => pattern.chain === chain).map((pattern) => pattern.id)
}

/**
 * True when two patterns train substantially the same movement. Identity counts,
 * and so does a declared overlap — which is what stops "dumbbell fly straight
 * after barbell bench" reading as two unrelated exercises.
 */
export function patternsOverlap(a: MovementPatternId, b: MovementPatternId): boolean {
  if (a === b) return true
  return getMovementPattern(a).overlaps.includes(b)
}
