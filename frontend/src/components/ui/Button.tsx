import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: 'ds-btn--primary',
  accent: 'ds-btn--accent',
  secondary: 'ds-btn--secondary',
  ghost: 'ds-btn--ghost',
  danger: 'ds-btn--danger',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'ds-btn--sm',
  md: 'ds-btn--md',
  lg: 'ds-btn--lg',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['ds-btn', variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
