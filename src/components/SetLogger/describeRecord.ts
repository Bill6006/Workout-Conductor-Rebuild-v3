import type { SetRecord, WeightUnit } from '../../core/validation/workoutSchema'

/**
 * A one-line summary of a completed set, for the history strip.
 *
 * In its own module so `SetLogger.tsx` exports only a component, which is what
 * React Fast Refresh needs.
 */
export function describeRecord(record: SetRecord, unit: WeightUnit): string {
  if (record.outcome === 'skipped') return 'skipped'
  const load = record.load ? `${record.load.value} ${unit}` : 'bodyweight'
  const rir = record.rir === null ? '' : ` · ${record.rir} RIR`
  return `${load} × ${record.reps}${rir}`
}
