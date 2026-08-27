'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Button } from './Button';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  /** Exit-intent / offer layout */
  offer?: boolean;
  /** Promo code block for offer variant */
  code?: string;
  claimsLabel?: string;
  dismissLabel?: string;
  'data-testid'?: string;
};

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  offer = false,
  code,
  claimsLabel,
  dismissLabel = 'No thanks',
  'data-testid': testId,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const panelClass = offer
    ? 'ds-modal__panel ds-modal__panel--offer'
    : 'ds-modal__panel';

  return (
    <div className="ds-modal" role="dialog" aria-modal="true" data-testid={testId}>
      <button
        type="button"
        className="ds-modal__scrim"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className={panelClass}>
        <button
          type="button"
          className="ds-modal__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        {eyebrow ? <p className="ds-modal__eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="ds-modal__title">{title}</h2> : null}
        {code ? <div className="ds-modal__code">{code}</div> : null}
        {claimsLabel ? <p className="ds-modal__claims">{claimsLabel}</p> : null}
        {children}
        {offer ? (
          <div className="ds-modal__dismiss">
            <Button variant="ghost" size="md" onClick={onClose}>
              {dismissLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
