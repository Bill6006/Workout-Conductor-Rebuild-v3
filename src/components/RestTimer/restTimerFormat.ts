/**
 * Text for the rest timer.
 *
 * Split out of the component so the countdown's two forms — the glanceable one
 * and the spoken one — can be asserted directly, and so the component module
 * exports a component and nothing else.
 */

/** `2:31`, `0:07`, `12:00`. Seconds round up, so `0:00` shows only at true zero. */
export function formatRestClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The same value as words. `2:31` in a `<span>` is read out digit by digit by
 * some screen readers, and re-read on every tick; this is what the timer
 * actually exposes to assistive tech.
 */
export function formatRestSpoken(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (seconds > 0 || minutes === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`)
  return parts.join(' ')
}

/** `+30s`, `-15s`, `+2 min`. Minutes only when the delta is whole minutes. */
export function formatAdjustLabel(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+'
  const size = Math.abs(seconds)
  if (size >= 60 && size % 60 === 0) return `${sign}${size / 60} min`
  return `${sign}${size}s`
}

/** `Add 30 seconds of rest` — the button's real name, since `+30s` reads poorly. */
export function adjustAccessibleName(seconds: number): string {
  const verb = seconds < 0 ? 'Subtract' : 'Add'
  const size = Math.abs(seconds)
  if (size >= 60 && size % 60 === 0) {
    const minutes = size / 60
    return `${verb} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of rest`
  }
  return `${verb} ${size} ${size === 1 ? 'second' : 'seconds'} of rest`
}
