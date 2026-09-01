/**
 * The injectable clock.
 *
 * No module in the app calls `new Date()` inline. Everything that stamps a time —
 * `createdAt`, `updatedAt`, `exportedAt`, session metadata — reads it from here, so
 * tests can freeze time and assertions stay deterministic.
 */

export interface Clock {
  /** The current instant as an ISO 8601 string in UTC, e.g. `2026-09-01T14:22:00.000Z`. */
  now(): string
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
}

let activeClock: Clock = systemClock

/** The clock the app is currently using. Prefer injecting a `Clock` where you can. */
export function getClock(): Clock {
  return activeClock
}

/** Test seam. Passing `null` restores the system clock. */
export function setClock(clock: Clock | null): void {
  activeClock = clock ?? systemClock
}

/** Shorthand for `getClock().now()`. */
export function nowIso(): string {
  return activeClock.now()
}

/** A clock frozen at one instant. */
export function fixedClock(iso: string): Clock {
  return { now: () => iso }
}

/**
 * A clock that advances by `stepMs` on every read, starting at `startIso`.
 * Useful for asserting that `updatedAt` actually moved.
 */
export function steppingClock(startIso: string, stepMs = 1000): Clock {
  let current = Date.parse(startIso)
  if (Number.isNaN(current)) throw new Error(`steppingClock needs a valid ISO start, got: ${startIso}`)
  return {
    now: () => {
      const iso = new Date(current).toISOString()
      current += stepMs
      return iso
    },
  }
}

/**
 * ISO 8601 extended format — the only shape this app writes, and now the only one
 * it accepts: `YYYY-MM-DD`, optionally `THH:MM`, `:SS`, `.sss`, and a `Z` or
 * `±HH:MM` offset. The basic format (`20260901T142200Z`, `+0200`) is deliberately
 * out: `Date.parse` is not specified to read it, so accepting it here would only
 * move the failure somewhere less obvious.
 *
 * `Date.parse` alone was far too loose for a check whose failure message claims
 * ISO 8601 — it takes `March 5, 2026`, `2026/09/01`, and `12/25/2026`, none of
 * which are ISO and the last of which means different days in different locales.
 */
const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/

/** True for a string this app is willing to store as a timestamp. */
export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_8601.exec(value)
  if (!match) return false
  if (Number.isNaN(Date.parse(value))) return false

  // `Date.parse` catches an out-of-range month, hour, minute and second, but it
  // rolls an out-of-range DAY over instead of refusing it: `2026-02-30` parses as
  // 2 March. Storing a timestamp that silently means a different day than it reads
  // is worse than rejecting it, so the calendar day is checked against its month.
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(0)
  probe.setUTCFullYear(year, month - 1, day)
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}
