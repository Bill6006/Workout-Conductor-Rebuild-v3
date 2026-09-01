export interface BrandMarkProps {
  size?: number
  className?: string
}

/**
 * The Workout Conductor mark: a conductor's baton sweeping over three
 * equalizer bars. Original artwork, drawn in `currentColor` so the caller
 * owns the tint.
 */
export function BrandMark({ size = 30, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="15" width="5" height="12.5" rx="2.5" fill="currentColor" opacity="0.5" />
      <rect x="13" y="10.5" width="5" height="17" rx="2.5" fill="currentColor" />
      <rect x="22" y="18.5" width="5" height="9" rx="2.5" fill="currentColor" opacity="0.72" />
      <path
        d="M5 11.4 24.4 5.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.8"
      />
      <circle cx="26.4" cy="4.9" r="2.4" fill="currentColor" />
    </svg>
  )
}
