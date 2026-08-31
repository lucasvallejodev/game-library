import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import styles from './Button.module.scss'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  block?: boolean
  children: ReactNode
}

/**
 * The one button. Every appearance is ours — no component library, no utility
 * classes. See AGENTS.md rule 4.
 */
export function Button({
  variant = 'secondary',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        styles.button,
        styles[`button--${variant}`],
        block && styles['button--block'],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
