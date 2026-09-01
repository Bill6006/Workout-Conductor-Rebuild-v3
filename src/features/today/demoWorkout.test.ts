import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEMO_WORKOUT,
  DEMO_WORKOUT_DISCLAIMER,
  describeRest,
  describeSets,
  formatRest,
  formatSets,
} from './demoWorkout'

describe('demoWorkout fixture', () => {
  it('is a hand-written sample, not a generated one', () => {
    // The same call twice must give the identical object — a generator would not.
    expect(DEMO_WORKOUT).toBe(DEMO_WORKOUT)
    expect(DEMO_WORKOUT.exercises).toHaveLength(6)
  })

  it('keeps the warning that stops Phase 3 building on it', () => {
    const source = readFileSync('src/features/today/demoWorkout.ts', 'utf8')

    expect(source).toContain('NOT A GENERATOR')
    expect(source).toContain('PHASE 3 OWNS WORKOUT GENERATION')
  })

  it('says plainly that it is a sample rather than a plan', () => {
    expect(DEMO_WORKOUT_DISCLAIMER).toMatch(/sample session, not your plan/i)
    expect(DEMO_WORKOUT_DISCLAIMER).toMatch(/phase 3/i)
  })

  it('uses generic movement names rather than a catalog', () => {
    for (const exercise of DEMO_WORKOUT.exercises) {
      expect(exercise.name).toMatch(/^[A-Za-z][A-Za-z\- ]+$/)
      expect(exercise.id).toMatch(/^demo-/)
    }
  })

  it('prescribes a plausible hybrid session', () => {
    const emphases = new Set(DEMO_WORKOUT.exercises.map((exercise) => exercise.emphasis))
    expect(emphases).toEqual(new Set(['strength', 'hypertrophy']))

    for (const exercise of DEMO_WORKOUT.exercises) {
      expect(exercise.sets).toBeGreaterThanOrEqual(2)
      expect(exercise.sets).toBeLessThanOrEqual(5)
      expect(exercise.restSeconds).toBeGreaterThanOrEqual(30)
      expect(exercise.restSeconds).toBeLessThanOrEqual(300)
    }
  })

  it('formats rest as m:ss and speaks it in words', () => {
    expect(formatRest(180)).toBe('3:00')
    expect(formatRest(150)).toBe('2:30')
    expect(formatRest(60)).toBe('1:00')
    expect(formatRest(45)).toBe('0:45')

    expect(describeRest(180)).toBe('Rest 3 minutes')
    expect(describeRest(150)).toBe('Rest 2 minutes 30 seconds')
    expect(describeRest(60)).toBe('Rest 1 minute')
    expect(describeRest(45)).toBe('Rest 45 seconds')
  })

  it('formats a set scheme and speaks it in words', () => {
    const [first] = DEMO_WORKOUT.exercises

    expect(formatSets(first)).toBe('4 × 5')
    expect(describeSets(first)).toBe('4 sets of 5 reps')
  })
})
