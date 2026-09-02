import { describe, expect, it } from 'vitest'
import {
  CONFLICT_KINDS,
  CONFLICT_SEVERITIES,
  CONFLICT_SEVERITY_SCALE,
  NO_CONFLICTS,
  SUPERSET_RULES,
  compareConflicts,
  conflictsOfKind,
  createConflictReport,
  highestSeverity,
  sortConflicts,
  withinSeverity,
} from './conflictTypes'
import type { Conflict, ConflictSeverity } from './conflictTypes'

function aConflict(severity: ConflictSeverity, exerciseIds: string[] = ['a']): Conflict {
  return {
    kind: 'duplicate-exercise',
    severity,
    exerciseIds,
    reason: 'because',
    detail: { exerciseId: exerciseIds[0] },
  }
}

describe('the conflict vocabulary', () => {
  it('lists every kind exactly once, in kebab-case', () => {
    expect(new Set(CONFLICT_KINDS).size).toBe(CONFLICT_KINDS.length)
    for (const kind of CONFLICT_KINDS) expect(kind).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
  })

  it('covers every conflict the product plan names', () => {
    expect([...CONFLICT_KINDS].sort()).toEqual(
      [
        'duplicate-exercise',
        'duplicate-movement-pattern',
        'muscle-overlap',
        'joint-stress',
        'grip',
        'equipment',
        'station',
        'superset',
        'recovery',
        'time',
        'limitation',
        'location',
        'progression-role',
      ].sort(),
    )
  })

  it('lists every superset rule exactly once', () => {
    expect(new Set(SUPERSET_RULES).size).toBe(SUPERSET_RULES.length)
  })
})

describe('severity', () => {
  it('runs advisory -> strong -> blocking, ascending', () => {
    expect(CONFLICT_SEVERITIES).toEqual(['advisory', 'strong', 'blocking'])
    expect(CONFLICT_SEVERITY_SCALE.rank('advisory')).toBe(0)
    expect(CONFLICT_SEVERITY_SCALE.rank('blocking')).toBe(2)
  })

  it('compares by rank, not by the strings, which sort the other way', () => {
    // 'blocking' < 'strong' as plain strings; the scale must disagree.
    expect('blocking' < 'strong').toBe(true)
    expect(CONFLICT_SEVERITY_SCALE.atLeast('blocking', 'strong')).toBe(true)
    expect(CONFLICT_SEVERITY_SCALE.atLeast('advisory', 'strong')).toBe(false)
    expect(CONFLICT_SEVERITY_SCALE.highest('advisory', 'strong')).toBe('strong')
  })

  it('reports the highest present, and null for nothing', () => {
    expect(highestSeverity([])).toBeNull()
    expect(highestSeverity([aConflict('advisory'), aConflict('blocking'), aConflict('strong')])).toBe(
      'blocking',
    )
  })
})

describe('report ordering', () => {
  it('puts the worst first, whatever order they arrived in', () => {
    const sorted = sortConflicts([aConflict('advisory'), aConflict('blocking'), aConflict('strong')])
    expect(sorted.map((conflict) => conflict.severity)).toEqual(['blocking', 'strong', 'advisory'])
  })

  it('breaks a severity tie on kind order, worst kind first', () => {
    const equipment: Conflict = {
      kind: 'equipment',
      severity: 'blocking',
      exerciseIds: ['z'],
      reason: 'because',
      detail: { missing: ['barbell'], locationId: 'loc', locationName: 'Gym' },
    }
    const duplicate = aConflict('blocking', ['a'])
    expect(sortConflicts([duplicate, equipment]).map((conflict) => conflict.kind)).toEqual([
      'equipment',
      'duplicate-exercise',
    ])
  })

  it('breaks a kind tie on the exercise ids, so the order never wobbles', () => {
    const first = aConflict('strong', ['aaa'])
    const second = aConflict('strong', ['bbb'])
    expect(compareConflicts(first, second)).toBeLessThan(0)
    expect(sortConflicts([second, first])).toEqual([first, second])
  })

  it('never mutates the array it was given', () => {
    const input = [aConflict('advisory'), aConflict('blocking')]
    const before = [...input]
    sortConflicts(input)
    expect(input).toEqual(before)
  })
})

describe('createConflictReport', () => {
  it('is clean for no conflicts', () => {
    const report = createConflictReport([])
    expect(report).toEqual(NO_CONFLICTS)
    expect(report.worst).toBeNull()
    expect(report.blocked).toBe(false)
  })

  it('is blocked only when something blocking is present', () => {
    expect(createConflictReport([aConflict('strong')]).blocked).toBe(false)
    expect(createConflictReport([aConflict('strong')]).worst).toBe('strong')
    expect(createConflictReport([aConflict('advisory'), aConflict('blocking')]).blocked).toBe(true)
  })

  it('answers "is everything at or below this rung"', () => {
    expect(withinSeverity(createConflictReport([]), 'advisory')).toBe(true)
    expect(withinSeverity(createConflictReport([aConflict('strong')]), 'advisory')).toBe(false)
    expect(withinSeverity(createConflictReport([aConflict('strong')]), 'strong')).toBe(true)
  })
})

describe('conflictsOfKind', () => {
  it('narrows to one kind and keeps the rest out', () => {
    const equipment: Conflict = {
      kind: 'equipment',
      severity: 'blocking',
      exerciseIds: ['z'],
      reason: 'because',
      detail: { missing: ['barbell'], locationId: 'loc', locationName: 'Gym' },
    }
    const found = conflictsOfKind([aConflict('strong'), equipment], 'equipment')
    expect(found).toHaveLength(1)
    // The detail is narrowed, so this reads without a cast.
    expect(found[0].detail.missing).toEqual(['barbell'])
  })
})
