import {
  MUSCLE_GROUP_IDS,
  isMuscleGroupId,
  isMuscleId,
  muscleGroupOf,
  sortMuscleIds,
  type MuscleGroupId,
  type MuscleId,
} from '../../catalog/muscles/muscles'
import { SECONDARY_MUSCLE_CREDIT, groupReach, roundSets } from './credit'
import type { GroupVolume, MuscleVolume, SessionVolume, VolumeLedger, WorkedExercise } from './volumeTypes'

/**
 * WEEKLY EFFECTIVE VOLUME — how much work each muscle and each group actually
 * got, in the units `credit.ts` defines.
 *
 * ONE PASS, TWO LEVELS, AND THE GROUP LEVEL IS NOT A SUM OF THE MUSCLE LEVEL.
 * Heads are counted individually because they are individually trainable — a
 * person doing only flat pressing has an under-worked upper chest and the ledger
 * has to be able to say so. Groups are counted from the EXERCISE, so one set is
 * one set of chest work however many chest heads the entry names. Summing the
 * head credits into the group is the obvious shortcut and it is wrong; see the
 * note on `GroupVolume`.
 *
 * THE WINDOW IS A WINDOW, NOT A CALENDAR WEEK. `daysAgo < windowDays` — seven
 * days means today and the six before it. A calendar week would make Monday's
 * answer to "how much chest work have I had" collapse to zero overnight, which
 * is a property of the calendar rather than of the person.
 *
 * NO CLOCK, NO CATALOG, NO STORAGE. Sessions arrive with their own `daysAgo`,
 * exercises arrive as values, and the same input builds the same ledger.
 */

/** Days counted as "this week" unless a caller says otherwise. */
export const DEFAULT_VOLUME_WINDOW_DAYS = 7

export interface VolumeLedgerOptions {
  /** Sessions with `daysAgo` below this are counted. Default 7. */
  readonly windowDays?: number
}

interface GroupTally {
  direct: number
  indirect: number
  exercises: Set<string>
}

interface MuscleTally {
  direct: number
  indirect: number
}

function buildLedger(
  muscleTallies: Map<MuscleId, MuscleTally>,
  groupTallies: Map<MuscleGroupId, GroupTally>,
  sessions: number,
): VolumeLedger {
  const byMuscle: MuscleVolume[] = sortMuscleIds([...muscleTallies.keys()]).map((muscle) => {
    const tally = muscleTallies.get(muscle) as MuscleTally
    return {
      muscle,
      group: muscleGroupOf(muscle),
      directSets: roundSets(tally.direct),
      indirectSets: roundSets(tally.indirect),
      effectiveSets: roundSets(tally.direct + SECONDARY_MUSCLE_CREDIT * tally.indirect),
    }
  })

  const byGroup: GroupVolume[] = MUSCLE_GROUP_IDS.filter((group) => groupTallies.has(group)).map((group) => {
    const tally = groupTallies.get(group) as GroupTally
    return {
      group,
      directSets: roundSets(tally.direct),
      indirectSets: roundSets(tally.indirect),
      effectiveSets: roundSets(tally.direct + SECONDARY_MUSCLE_CREDIT * tally.indirect),
      exercises: tally.exercises.size,
    }
  })

  const groupIndex = new Map(byGroup.map((row) => [row.group, row]))
  const muscleIndex = new Map(byMuscle.map((row) => [row.muscle, row]))

  return {
    byMuscle,
    byGroup,
    totalSets: roundSets(byGroup.reduce((total, row) => total + row.effectiveSets, 0)),
    sessions,
    hasHistory: sessions > 0,
    groupSets: (group) => groupIndex.get(group)?.effectiveSets ?? 0,
    muscleSets: (muscle) => muscleIndex.get(muscle)?.effectiveSets ?? 0,
    forGroup: (group) => groupIndex.get(group) ?? null,
  }
}

/**
 * The ledger of a person with no history at all.
 *
 * It is a real value rather than `null` so that every caller downstream reads
 * one shape. `hasHistory` is false, which is the fact that stops "zero sets"
 * being mistaken for "a deficit of a full week".
 */
export function emptyVolumeLedger(): VolumeLedger {
  return buildLedger(new Map(), new Map(), 0)
}

/** Adds one exercise's sets into both tallies. */
function addExercise(
  item: WorkedExercise,
  muscleTallies: Map<MuscleId, MuscleTally>,
  groupTallies: Map<MuscleGroupId, GroupTally>,
): void {
  if (!(item.sets > 0)) return

  for (const muscle of item.exercise.primaryMuscles) {
    if (!isMuscleId(muscle)) continue
    const tally = muscleTallies.get(muscle) ?? { direct: 0, indirect: 0 }
    tally.direct += item.sets
    muscleTallies.set(muscle, tally)
  }
  for (const muscle of item.exercise.secondaryMuscles) {
    if (!isMuscleId(muscle)) continue
    const tally = muscleTallies.get(muscle) ?? { direct: 0, indirect: 0 }
    tally.indirect += item.sets
    muscleTallies.set(muscle, tally)
  }

  for (const { group, reach } of groupReach(item.exercise)) {
    const tally = groupTallies.get(group) ?? { direct: 0, indirect: 0, exercises: new Set<string>() }
    if (reach === 'primary') tally.direct += item.sets
    else tally.indirect += item.sets
    tally.exercises.add(item.exercise.id)
    groupTallies.set(group, tally)
  }
}

/**
 * Counts effective weekly volume from whatever sessions the caller has.
 *
 * Sessions outside the window are ignored rather than decayed: this is a count
 * of what the week contained, and the "how recently and how hard" question is
 * `exposure.ts`'s, not this one's. Two functions rather than one weighted number,
 * because a group can be simultaneously behind on the week and trained yesterday,
 * and a single figure could not say so.
 */
export function buildVolumeLedger(
  sessions: readonly SessionVolume[],
  options: VolumeLedgerOptions = {},
): VolumeLedger {
  const windowDays = options.windowDays ?? DEFAULT_VOLUME_WINDOW_DAYS
  const muscleTallies = new Map<MuscleId, MuscleTally>()
  const groupTallies = new Map<MuscleGroupId, GroupTally>()
  let counted = 0

  for (const session of sessions) {
    if (session.daysAgo < 0 || session.daysAgo >= windowDays) continue
    counted += 1

    for (const item of session.items ?? []) {
      addExercise(item, muscleTallies, groupTallies)
    }

    // A summary-only session contributes group volume and no head detail. It is
    // counted as DIRECT work: a caller that kept per-group totals recorded what
    // the session was FOR, and discounting it as assistance would understate a
    // week that is already only half-remembered.
    for (const [group, sets] of Object.entries(session.setsByGroup ?? {})) {
      if (!isMuscleGroupId(group) || !(typeof sets === 'number') || !(sets > 0)) continue
      const tally = groupTallies.get(group) ?? { direct: 0, indirect: 0, exercises: new Set<string>() }
      tally.direct += sets
      groupTallies.set(group, tally)
    }
  }

  return buildLedger(muscleTallies, groupTallies, counted)
}

/**
 * The ledger for a session being built right now — the sets already programmed
 * into it. The generator asks this after every slot it fills, so that the next
 * slot's priorities see the work it has just committed to.
 */
export function volumeOfSession(items: readonly WorkedExercise[]): VolumeLedger {
  return buildVolumeLedger([{ daysAgo: 0, items }])
}

/**
 * Adds two ledgers' group totals: the week so far plus what this session plans.
 *
 * Group level only, and deliberately so — the two ledgers may not agree about
 * heads (a summary-only week has none), and a merged per-muscle figure would be
 * detailed where the data is not.
 */
export function combineGroupSets(
  a: VolumeLedger,
  b: VolumeLedger,
): Readonly<Partial<Record<MuscleGroupId, number>>> {
  const totals: Partial<Record<MuscleGroupId, number>> = {}
  for (const row of [...a.byGroup, ...b.byGroup]) {
    totals[row.group] = roundSets((totals[row.group] ?? 0) + row.effectiveSets)
  }
  return totals
}
