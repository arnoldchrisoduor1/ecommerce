import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant =
  | 'neutral'
  | 'accent'
  | 'sale'
  | 'stock-ok'
  | 'stock-low'
  | 'stock-out'
  | 'success'
  | 'danger'
  | 'presence';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'ds-badge--neutral',
  accent: 'ds-badge--accent',
  sale: 'ds-badge--sale',
  'stock-ok': 'ds-badge--stock-ok',
  'stock-low': 'ds-badge--stock-low',
  'stock-out': 'ds-badge--stock-out',
  success: 'ds-badge--success',
  danger: 'ds-badge--danger',
  presence: 'ds-badge--presence',
};

export function Badge({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}: BadgeProps) {
  const classes = ['ds-badge', variantClass[variant], className].filter(Boolean).join(' ');
  const presenceProps =
    variant === 'presence'
      ? { role: 'status' as const, 'aria-atomic': true as const }
      : {};

  return (
    <span className={classes} {...presenceProps} {...rest}>
      {children}
    </span>
  );
}
