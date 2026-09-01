import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  LOCATION_KIND_LABELS,
  REST_STYLE_LABELS,
  TRAINING_STYLE_LABELS,
  UNITS_LABELS,
  WEEKDAY_LABELS,
  daysSummary,
  locationKindLabel,
  restStyleLabel,
  segmentOptions,
  unitsLabel,
  weekdayShortLabel,
  weightUnitFor,
  type LabelEntry,
} from './labels'
import {
  WEEKDAYS,
  experienceSchema,
  goalSchema,
  locationKindSchema,
  restStyleSchema,
  trainingStyleSchema,
  unitsSchema,
  weekdaySchema,
} from '../../core/validation/schemas'

/**
 * The catalogue is driven off the Zod enums on purpose: adding a value to a
 * schema without adding its copy here fails this file, rather than shipping a
 * screen that renders a raw stored id at a person.
 */

const CATALOGUES: readonly {
  name: string
  values: readonly string[]
  entries: readonly LabelEntry<string>[]
}[] = [
  { name: 'Goal', values: goalSchema.options, entries: GOAL_LABELS },
  { name: 'Experience', values: experienceSchema.options, entries: EXPERIENCE_LABELS },
  { name: 'TrainingStyle', values: trainingStyleSchema.options, entries: TRAINING_STYLE_LABELS },
  { name: 'RestStyle', values: restStyleSchema.options, entries: REST_STYLE_LABELS },
  { name: 'Units', values: unitsSchema.options, entries: UNITS_LABELS },
  { name: 'Weekday', values: weekdaySchema.options, entries: WEEKDAY_LABELS },
  { name: 'LocationKind', values: locationKindSchema.options, entries: LOCATION_KIND_LABELS },
]

describe('the label catalogue', () => {
  it.each(CATALOGUES)('covers every $name the schema allows', ({ values, entries }) => {
    expect([...entries].map((entry) => entry.value).sort()).toEqual([...values].sort())
  })

  it.each(CATALOGUES)('maps each $name value exactly once', ({ values, entries }) => {
    expect(entries).toHaveLength(values.length)
    expect(new Set(entries.map((entry) => entry.value)).size).toBe(entries.length)
  })

  it.each(CATALOGUES)('never renders a raw $name id as its label', ({ entries }) => {
    for (const entry of entries) {
      expect(entry.label.trim(), `${entry.value} has no display copy`).not.toBe('')
      expect(entry.label, `${entry.value} renders as its own id`).not.toBe(entry.value)
      expect(entry.label[0], `${entry.label} is not sentence case`).toBe(entry.label[0].toUpperCase())
    }
  })

  it.each(CATALOGUES)('keeps every $name shortLabel shorter than its label', ({ entries }) => {
    for (const entry of entries) {
      if (entry.shortLabel === undefined) continue
      expect(entry.shortLabel.trim()).not.toBe('')
      expect(entry.shortLabel.length, `${entry.value} shortLabel is not shorter`).toBeLessThanOrEqual(
        entry.label.length,
      )
    }
  })

  it('shows the short form on a segment and the full form everywhere else', () => {
    expect(segmentOptions(REST_STYLE_LABELS)).toEqual([
      { value: 'short', label: 'Shorter' },
      { value: 'standard', label: 'Standard' },
      { value: 'long', label: 'Longer' },
    ])
    // No shortLabel means the label already fits.
    expect(segmentOptions(LOCATION_KIND_LABELS).map((option) => option.label)).toEqual([
      'Gym',
      'Home',
      'Travel',
      'Other',
    ])
  })
})

/**
 * The strings the two rival catalogues disagreed about. Locked here so a later
 * edit that reintroduces one side has to argue with a test.
 */
describe('the settled disagreements', () => {
  it('names a rest length rather than a workout mode', () => {
    expect(restStyleLabel('short')).toBe('Shorter rests')
    expect(restStyleLabel('standard')).toBe('Standard rests')
    expect(restStyleLabel('long')).toBe('Longer rests')
    // The product guard rejects any control named for a competing mode word.
    for (const entry of REST_STYLE_LABELS) {
      expect(entry.label).not.toMatch(/^(full|lazy|short|density|recovery)\b/i)
      expect(entry.shortLabel ?? entry.label).not.toMatch(/^(full|lazy|short|density|recovery)\b/i)
    }
  })

  it('calls the measurement system by name and the weight by its symbol', () => {
    expect(unitsLabel('metric')).toBe('Metric')
    expect(unitsLabel('imperial')).toBe('Imperial')
    expect(weightUnitFor('metric')).toBe('kg')
    expect(weightUnitFor('imperial')).toBe('lb')
    // One map underneath: the symbol on the segment is the symbol in prose.
    for (const entry of UNITS_LABELS) {
      expect(entry.shortLabel).toBe(weightUnitFor(entry.value))
    }
  })

  it('calls a location of no fixed kind "Other"', () => {
    expect(locationKindLabel('custom')).toBe('Other')
  })

  it('writes days as three-letter names in calendar order', () => {
    expect(weekdayShortLabel('mon')).toBe('Mon')
    expect(daysSummary(['fri', 'mon', 'wed'])).toBe('Mon, Wed, Fri')
    expect(daysSummary([])).toBe('No days chosen')
    expect(WEEKDAY_LABELS.map((entry) => entry.value)).toEqual([...WEEKDAYS])
  })
})

/**
 * The rule this catalogue exists to enforce. Two feature-level catalogues had
 * drifted apart, so the same saved profile read differently on setup and on
 * settings. A rival map has to name every value of an enum, so a feature module
 * that names them all is the shape of the defect coming back — including a
 * re-export shim, which is still a second file with the same job.
 */
describe('one owner', () => {
  /** Vitest runs from the project root, as `demoWorkout.test.ts` also relies on. */
  const FEATURES = 'src/features'

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(entry.name) ? [full] : []
    })
  }

  const files = sourceFiles(FEATURES)

  it('finds feature modules to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(CATALOGUES)('is the only module that enumerates $name', ({ name, values }) => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return values.every((value) => source.includes(`'${value}'`) || source.includes(`"${value}"`))
    })

    expect(
      offenders,
      `${name} is enumerated outside src/catalog/labels. Display copy for a stored enum belongs in the catalogue; import it instead.`,
    ).toEqual([])
  })

  it('leaves no labels module behind in a feature folder', () => {
    expect(files.filter((file) => /[\\/]labels\.tsx?$/.test(file))).toEqual([])
  })
})
