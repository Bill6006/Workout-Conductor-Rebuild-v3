import type { SVGProps } from 'react'

/**
 * Navigation glyphs — original stroke drawings on a 24px grid. They inherit
 * colour and weight from the nav item, so the active/inactive states are a
 * single `color` change.
 */
type IconProps = SVGProps<SVGSVGElement>

function Glyph({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function TodayIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="5" width="18" height="16" rx="3.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <circle cx="12" cy="15.5" r="1.7" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

export function WorkoutIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 9.5v5M6.75 6.5v11M17.25 6.5v11M21 9.5v5M6.75 12h10.5" />
    </Glyph>
  )
}

export function ProgressIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M6.5 16.2l4-4.7 3.4 3.1L20 7.5" />
      <path d="M16.3 7.5H20v3.7" />
    </Glyph>
  )
}

export function PlanIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="4" width="7.5" height="16" rx="2.2" />
      <rect x="13.5" y="4" width="7.5" height="9.5" rx="2.2" />
    </Glyph>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h7M15 7h5M4 12h11M19 12h1M4 17h4M12 17h8" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="17" cy="12" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Glyph>
  )
}
