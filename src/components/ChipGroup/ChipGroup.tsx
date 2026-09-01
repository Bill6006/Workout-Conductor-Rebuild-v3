import styles from './ChipGroup.module.css'

export interface ChipItem {
  id: string
  label: string
}

export interface ChipGroupProps {
  items: ChipItem[]
  /** Ids of the selected items. Order of `items` drives render order. */
  selected: string[]
  onChange: (selected: string[]) => void
  'aria-label'?: string
  /** Point at a FormField label instead of naming the group inline. */
  'aria-labelledby'?: string
  disabled?: boolean
  className?: string
}

/**
 * Multi-select pills for equipment, focus areas, and anything else with a
 * handful of independent answers. Wraps onto more rows rather than scrolling
 * sideways — a hidden option is an option nobody picks.
 */
export function ChipGroup({
  items,
  selected,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  disabled = false,
  className,
}: ChipGroupProps) {
  function toggle(id: string) {
    const isOn = selected.includes(id)
    onChange(isOn ? selected.filter((entry) => entry !== id) : [...selected, id])
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={[styles.group, className].filter(Boolean).join(' ')}
    >
      {items.map((item) => {
        const isOn = selected.includes(item.id)

        return (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            className={[styles.chip, isOn ? styles.on : null].filter(Boolean).join(' ')}
            onClick={() => toggle(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
