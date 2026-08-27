import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'product' | 'panel';

export type CardProps = HTMLAttributes<HTMLElement> & {
  variant?: CardVariant;
  children: ReactNode;
  as?: 'article' | 'div' | 'section';
};

export function Card({
  variant = 'panel',
  className = '',
  children,
  as: Tag = 'article',
  ...rest
}: CardProps) {
  const classes = ['ds-card', `ds-card--${variant}`, className].filter(Boolean).join(' ');
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

export function CardMedia({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['ds-card__media', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['ds-card__body', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={['ds-card__title', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h3>
  );
}
