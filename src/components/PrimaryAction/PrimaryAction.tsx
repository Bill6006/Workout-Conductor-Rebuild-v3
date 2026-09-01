import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './PrimaryAction.module.css'

export type PrimaryActionVariant = 'primary' | 'ghost'

export interface PrimaryActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PrimaryActionVariant
  children: ReactNode
}

/**
 * The prominent call to action. Disabled placeholders keep both `disabled`
 * and `aria-disabled` so assistive tech and sighted users agree.
 */
export function PrimaryAction({
  variant = 'primary',
  className,
  disabled = false,
  type = 'button',
  children,
  ...rest
}: PrimaryActionProps) {
  const classes = [styles.action, styles[variant], className].filter(Boolean).join(' ')

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      {children}
    </button>
  )
}
