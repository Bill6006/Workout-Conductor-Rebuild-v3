import {
  formatPlateRun,
  formatWeight,
  planLoad,
  type LoadPlan,
  type PlateInventory,
  type PlateLoad,
  type PlateMathLoadModel,
} from './plateLoad'
import type { WeightUnit } from '../../core/validation/workoutSchema'
import styles from './PlateMath.module.css'

/**
 * The plate breakdown, rendered plainly.
 *
 * One line answers the question — `60 kg = bar + 20 + 5 per side` — and a second
 * line exists only when there is something the first line would otherwise hide:
 * a near miss, a target under the empty bar, an empty rack, or the fact that a
 * dumbbell number is PER HAND. It is read mid-set, one-handed, out of breath, so
 * there is no chrome, no heading, and nothing to tap.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TRUE TO SAY. An exercise whose load
 * model says `plateMath: false` — a pin stack, a band, a fixed dumbbell — gets no
 * box, no dash, and no empty state, because the catalog has already said a
 * breakdown does not exist for it.
 */
export interface PlateMathProps {
  /** The working weight the session asks for, as the set logger records it. */
  targetWeight: number
  unit: WeightUnit
  /** Straight off the catalog entry: `exercise.load`. */
  load: PlateMathLoadModel
  /**
   * The bar in use, from settings. Only read when `load.usesBar`. Defaults to
   * `DEFAULT_BAR_WEIGHT[unit]` (20 kg / 45 lb) — right for a standard Olympic bar
   * and wrong for every other bar, so a real caller passes this.
   */
  barWeight?: number
  /** The rack. Defaults to `defaultPlateInventory(unit)`. */
  inventory?: PlateInventory
  /** Names the readout for assistive technology when the screen shows several. */
  exerciseName?: string
  className?: string
}

export function PlateMath({
  targetWeight,
  unit,
  load,
  barWeight,
  inventory,
  exerciseName,
  className,
}: PlateMathProps) {
  const plan = planLoad({ targetWeight, unit, load, barWeight, inventory })
  if (plan.kind === 'none') return null

  const lines = describePlan(plan)
  const label = exerciseName ? `How to load ${exerciseName}` : 'How to load'

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      <p className={styles.headline}>{lines.headline}</p>
      {lines.flag !== null && <p className={styles.flag}>{lines.flag}</p>}
      {lines.detail !== null && <p className={styles.detail}>{lines.detail}</p>}
    </div>
  )
}

interface PlateMathLines {
  readonly headline: string
  /** The thing a person would be misled by if it went unsaid. */
  readonly flag: string | null
  /** Supporting arithmetic. Always safe to skip. */
  readonly detail: string | null
}

function describePlan(plan: Exclude<LoadPlan, { kind: 'none' }>): PlateMathLines {
  if (plan.kind === 'per-hand') {
    return {
      headline: `${formatWeight(plan.weightPerHand, plan.unit)} in each hand`,
      flag: null,
      detail: 'Per hand, not the total for both.',
    }
  }
  return describePlateLoad(plan.load)
}

function describePlateLoad(load: PlateLoad): PlateMathLines {
  const { unit } = load
  const target = formatWeight(load.targetWeight, unit)
  const achievable = formatWeight(load.achievableWeight, unit)
  const gap = formatWeight(Math.abs(load.differenceFromTarget), unit)

  if (load.status === 'unloadable') {
    return { headline: 'No plates available', flag: `Nothing to load for a ${target} target.`, detail: null }
  }

  if (load.status === 'below-bar') {
    return {
      headline: `${achievable} = empty bar`,
      flag: `${target} is under the bar — the empty bar already weighs ${achievable}.`,
      detail: null,
    }
  }

  const bare = load.platesPerSide.length === 0
  const headline = bare ? `${achievable} = empty bar` : `${achievable} = ${loadingRun(load)}`

  if (load.status === 'exact') {
    return { headline, flag: null, detail: barAndSideDetail(load) }
  }

  const direction = load.differenceFromTarget < 0 ? 'under' : 'over'
  const flag = bare
    ? `No plates available — the empty bar is ${gap} ${direction} the ${target} target.`
    : `Closest loadable — ${gap} ${direction} the ${target} target.`

  return { headline, flag, detail: barAndSideDetail(load) }
}

/** `bar + 20 + 5 per side`, or `20 + 5 per side` where there is no bar. */
function loadingRun(load: PlateLoad): string {
  const run = formatPlateRun(load.platesPerSide)
  const withBar = load.barWeight > 0 ? `bar + ${run}` : run
  return load.sides === 1 ? withBar : `${withBar} per side`
}

function barAndSideDetail(load: PlateLoad): string | null {
  const parts: string[] = []
  if (load.barWeight > 0) parts.push(`${formatWeight(load.barWeight, load.unit)} bar`)
  if (load.perSideWeight > 0 && load.sides > 1) {
    parts.push(`${formatWeight(load.perSideWeight, load.unit)} per side`)
  }
  return parts.length > 0 ? parts.join(' + ') : null
}
