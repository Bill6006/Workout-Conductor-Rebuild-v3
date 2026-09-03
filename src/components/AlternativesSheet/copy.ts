import { equipmentLabel, sortEquipmentIds } from '../../catalog/equipment'
import type {
  DifferenceMagnitude,
  MatchQuality,
  NoAlternativeReason,
  ProgressionContinuity,
  SupersetEffect,
  SupersetImpact,
} from '../../engine/alternatives'

/**
 * The words AlternativesSheet puts on screen, and nothing else.
 *
 * WHAT THIS FILE MAY DO: turn a value the ranker already decided into a short
 * label a thumb-sized row can hold — `preservesHistory: false` into "Progression
 * starts over", `broken` into "Breaks the superset", 45 seconds into "45s".
 *
 * WHAT IT MAY NOT DO: decide anything. There is no second ranker, no second
 * exclusion rule, and no rewriting of the ranker's own sentences here. Every
 * `text` the engine returns — the primary reason, the key difference, the
 * superset impact, the "nothing suitable" message — is rendered verbatim.
 *
 * IT OWNS NO RIVAL LIST. Equipment names come from `equipmentLabel()` and
 * equipment ORDER from `sortEquipmentIds()`, both in `catalog/equipment`, which
 * is the single owner of equipment identity. The maps below cover engine enums
 * (`MatchQuality`, `SupersetEffect`, `NoAlternativeReason`) that the profile
 * copy catalogue in `catalog/labels` does not describe and should not: they are
 * not stored on a profile and never read outside this swap surface.
 */

/* --------------------------------------------------------------- the score */

export const MATCH_QUALITY_LABELS: Readonly<Record<MatchQuality, string>> = {
  weak: 'Weak match',
  fair: 'Fair match',
  strong: 'Strong match',
  excellent: 'Excellent match',
}

export function matchQualityLabel(quality: MatchQuality): string {
  return MATCH_QUALITY_LABELS[quality]
}

/* ------------------------------------------------------------- differences */

/**
 * The lead-in for the key difference, carrying the magnitude the ranker set. A
 * major difference is announced as one; the sentence after it is the engine's.
 */
export const DIFFERENCE_LEAD_INS: Readonly<Record<DifferenceMagnitude, string>> = {
  slight: 'Slight difference',
  notable: 'Difference',
  major: 'Big difference',
}

export function differenceLeadIn(magnitude: DifferenceMagnitude): string {
  return DIFFERENCE_LEAD_INS[magnitude]
}

/* -------------------------------------------------------------------- time */

/**
 * Seconds as a gym-readable duration. Short enough to sit on a row: "45s",
 * "2 min", "2 min 30s".
 */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole}s`

  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}s`
}

/* --------------------------------------------------------------- equipment */

/** Canonical order first, then anything the catalog does not know, never dropped. */
function orderedEquipmentLabels(ids: readonly string[]): string[] {
  const canonical: readonly string[] = sortEquipmentIds(ids)
  const known = new Set(canonical)
  const unknown = ids.filter((id) => !known.has(id))
  return [...canonical, ...unknown].map(equipmentLabel)
}

/** What the swap needs to hand, with anything optional named as optional. */
export function equipmentSummary(
  equipment: readonly string[],
  optionalEquipment: readonly string[] = [],
): string {
  const required = orderedEquipmentLabels(equipment)
  const optional = orderedEquipmentLabels(optionalEquipment)
  const base = required.length > 0 ? required.join(', ') : 'No equipment'
  return optional.length > 0 ? `${base} (optional: ${optional.join(', ')})` : base
}

/* ------------------------------------------------------------------- flags */

/** `good` reads as kept, `caution` as changed, `warn` as lost. */
export type FlagTone = 'good' | 'caution' | 'warn'

export interface AlternativeFlag {
  readonly key: 'progression' | 'superset'
  readonly label: string
  readonly tone: FlagTone
}

/**
 * Whether the working load, rep target and streak survive the swap. The answer
 * is `progression.preservesHistory`; this only puts a word on it.
 */
export function progressionFlag(progression: ProgressionContinuity): AlternativeFlag {
  return progression.preservesHistory
    ? { key: 'progression', label: 'Keeps your progression', tone: 'good' }
    : { key: 'progression', label: 'Progression starts over', tone: 'caution' }
}

const SUPERSET_FLAGS: Readonly<Record<SupersetEffect, AlternativeFlag | null>> = {
  // Nothing to say: the slot was never part of a pairing.
  'not-in-superset': null,
  preserved: { key: 'superset', label: 'Superset holds', tone: 'good' },
  changed: { key: 'superset', label: 'Superset changes', tone: 'caution' },
  broken: { key: 'superset', label: 'Breaks the superset', tone: 'warn' },
}

export function supersetFlag(superset: SupersetImpact): AlternativeFlag | null {
  return SUPERSET_FLAGS[superset.effect]
}

/** True when the pairing does not survive unchanged, so its sentence is worth the room. */
export function supersetNeedsExplaining(superset: SupersetImpact): boolean {
  return superset.effect === 'changed' || superset.effect === 'broken'
}

/* ------------------------------------------------- nothing suitable at all */

/**
 * A headline for the ranker's own `reason`. The line UNDER it is the ranker's
 * `message`, rendered as given — this map never becomes a second explanation.
 */
export const NO_ALTERNATIVE_HEADLINES: Readonly<Record<NoAlternativeReason, string>> = {
  'no-candidates-in-catalog': 'Nothing in the catalogue trains this',
  'equipment-unavailable': 'Nothing here matches your equipment',
  'requires-location-change': 'The options are at another location',
  'location-unsuitable': 'Nothing suits where you are training',
  'limitation-blocked': 'Your limitations rule the options out',
  'time-insufficient': 'Nothing fits the time you have left',
  'session-conflict': 'Everything clashes with this session',
  'user-excluded': 'You have ruled the options out yourself',
  'below-quality-floor': 'Nothing close enough to swap in',
  mixed: 'No safe swap for this one',
}

export function noAlternativeHeadline(reason: NoAlternativeReason): string {
  return NO_ALTERNATIVE_HEADLINES[reason]
}

/* ------------------------------------------------------------------ counts */

export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/* ------------------------------------------------------------------ poster */

/**
 * A poster path is repository-relative under the public root (`media/...`), so
 * it needs the app's base in front of it — the deployed app lives on a Pages
 * subpath. Nothing here reaches the network on its own: this is a same-origin
 * file the app ships.
 */
export function posterUrl(path: string, base: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${path.replace(/^\/+/, '')}`
}
