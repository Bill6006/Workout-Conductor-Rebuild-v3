/**
 * The visible build marker.
 *
 * Every deployment must be identifiable on screen without opening devtools,
 * so the marker is surfaced in the footer of each screen and in full on the
 * Settings screen.
 */

export interface BuildInfo {
  readonly marker: string
  readonly phase: string
  readonly commit: string
  readonly time: string
}

const UNKNOWN = 'unknown'

/** `typeof` on an undeclared identifier is safe, so this never throws in jsdom. */
export const BUILD_INFO: BuildInfo = {
  marker: typeof __BUILD_MARKER__ === 'string' ? __BUILD_MARKER__ : UNKNOWN,
  phase: typeof __BUILD_PHASE__ === 'string' ? __BUILD_PHASE__ : UNKNOWN,
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : UNKNOWN,
  time: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : UNKNOWN,
}

function shortCommit(commit: string): string {
  return /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7) : commit
}

function formatUtcMinute(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
}

/** e.g. `build a1b2c3d · 2026-09-01 14:22 UTC` */
export function formatBuildStamp(info: BuildInfo): string {
  const commit = `build ${shortCommit(info.commit)}`
  const stamp = formatUtcMinute(info.time)
  return stamp ? `${commit} · ${stamp}` : commit
}

/** Reduces a long phase description to a pill-sized tag, e.g. `Phase 0`. */
export function formatPhaseTag(phase: string): string {
  const match = /phase\s*(\d+)/i.exec(phase)
  return match ? `Phase ${match[1]}` : phase.split(/\s+[-–—]\s+/)[0].trim()
}
