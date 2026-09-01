import { z } from 'zod'

/**
 * THE canonical equipment list.
 *
 * This file is the single owner of equipment identity for the whole app. Phase 2
 * extends this array (and may add fields to `EquipmentItem`); it must never gain a
 * rival list. Anything that needs an equipment id, label, or ordering imports from
 * here — screens, schemas, the future exercise catalog, and the future generator.
 *
 * Ids are stable, kebab-case, and durable: they are written into saved profiles, so
 * an id may be added or relabelled but never renamed or reused for something else.
 */

export const EQUIPMENT_IDS = [
  'barbell',
  'ez-bar',
  'dumbbells',
  'adjustable-dumbbells',
  'kettlebell',
  'flat-bench',
  'adjustable-bench',
  'squat-rack',
  'smith-machine',
  'cable-machine',
  'lat-pulldown',
  'leg-press',
  'selectorised-machines',
  'pull-up-bar',
  'dip-bars',
  'resistance-bands',
  'bodyweight-only',
] as const

export type EquipmentId = (typeof EQUIPMENT_IDS)[number]

export interface EquipmentItem {
  readonly id: EquipmentId
  /** Short display label. Sentence case, safe inside a narrow chip at 360px. */
  readonly label: string
  /** True when the item is commonly present in a home setup — used to seed the Home location. */
  readonly homeLikely: boolean
}

export const EQUIPMENT: readonly EquipmentItem[] = [
  { id: 'barbell', label: 'Barbell', homeLikely: false },
  { id: 'ez-bar', label: 'EZ bar', homeLikely: false },
  { id: 'dumbbells', label: 'Dumbbells', homeLikely: true },
  { id: 'adjustable-dumbbells', label: 'Adjustable dumbbells', homeLikely: true },
  { id: 'kettlebell', label: 'Kettlebell', homeLikely: true },
  { id: 'flat-bench', label: 'Flat bench', homeLikely: true },
  { id: 'adjustable-bench', label: 'Adjustable bench', homeLikely: true },
  { id: 'squat-rack', label: 'Squat rack', homeLikely: false },
  { id: 'smith-machine', label: 'Smith machine', homeLikely: false },
  { id: 'cable-machine', label: 'Cable machine', homeLikely: false },
  { id: 'lat-pulldown', label: 'Lat pulldown', homeLikely: false },
  { id: 'leg-press', label: 'Leg press', homeLikely: false },
  { id: 'selectorised-machines', label: 'Selectorised machines', homeLikely: false },
  { id: 'pull-up-bar', label: 'Pull-up bar', homeLikely: true },
  { id: 'dip-bars', label: 'Dip bars', homeLikely: true },
  { id: 'resistance-bands', label: 'Resistance bands', homeLikely: true },
  { id: 'bodyweight-only', label: 'Bodyweight only', homeLikely: true },
]

const BY_ID = new Map<string, EquipmentItem>(EQUIPMENT.map((item) => [item.id, item]))

/** Zod enum over the canonical ids, so schemas.ts never restates the list. */
export const equipmentIdSchema = z.enum(EQUIPMENT_IDS)

export function isEquipmentId(value: unknown): value is EquipmentId {
  return typeof value === 'string' && BY_ID.has(value)
}

export function getEquipment(id: EquipmentId): EquipmentItem {
  const item = BY_ID.get(id)
  if (!item) throw new Error(`Unknown equipment id: ${id}`)
  return item
}

/** Display label for an id, falling back to the raw id so UI never renders blank. */
export function equipmentLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id
}

/** Ids sorted into canonical (array) order — use before rendering a saved selection. */
export function sortEquipmentIds(ids: readonly string[]): EquipmentId[] {
  const wanted = new Set(ids)
  return EQUIPMENT.filter((item) => wanted.has(item.id)).map((item) => item.id)
}

/**
 * `bodyweight-only` is a constraint, not a piece of kit. It answers "I have
 * nothing", so a seed that pairs it with a squat rack describes a setup that
 * cannot exist. A fully equipped gym therefore seeds every id EXCEPT this one.
 *
 * It is not removed from EQUIPMENT_IDS or from `homeLikely`: it remains a
 * selectable, savable id (a real home or travel setup can genuinely be
 * bodyweight-only, and saved profiles already carry it). Only the "everything"
 * seed excludes it.
 */
const CONSTRAINT_ONLY_IDS: readonly EquipmentId[] = ['bodyweight-only']

/** True for an id that describes the absence of equipment rather than a piece of it. */
export function isConstraintOnlyEquipment(id: string): boolean {
  return CONSTRAINT_ONLY_IDS.includes(id as EquipmentId)
}

/** The seed selection for a freshly created location of each kind. */
export function defaultEquipmentFor(kind: 'home' | 'gym' | 'travel' | 'custom'): EquipmentId[] {
  if (kind === 'gym')
    return EQUIPMENT.filter((item) => !isConstraintOnlyEquipment(item.id)).map((item) => item.id)
  if (kind === 'home') return EQUIPMENT.filter((item) => item.homeLikely).map((item) => item.id)
  if (kind === 'travel') return ['resistance-bands', 'bodyweight-only']
  return []
}
