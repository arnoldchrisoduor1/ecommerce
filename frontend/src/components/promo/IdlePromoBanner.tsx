'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import type { IdlePromoData } from '@/lib/api';

const DISMISS_KEY = 'studio_idle_promo_dismissed';

type Props = {
  config: IdlePromoData;
};

export function IdlePromoBanner({ config }: Props) {
  const [open, setOpen] = useState(false);
  const lastActivity = useRef(Date.now());
  const firedRef = useRef(false);

  const enabled = config.enabled !== false;
  const hasContent = Boolean(config.text?.trim() || config.image_url?.trim());
  const thresholdMs = Math.max(3, config.idle_seconds ?? 20) * 1000;
  const showButton =
    Boolean(config.button_label?.trim()) && Boolean(config.button_url?.trim());

  useEffect(() => {
    if (!enabled || !hasContent) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
    for (const ev of events) {
      window.addEventListener(ev, bump, { passive: true });
    }

    const tick = window.setInterval(() => {
      if (firedRef.current) return;
      if (Date.now() - lastActivity.current >= thresholdMs) {
        firedRef.current = true;
        setOpen(true);
      }
    }, 400);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bump);
      }
      window.clearInterval(tick);
    };
  }, [enabled, hasContent, thresholdMs]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!enabled || !hasContent) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      dismissLabel="Close"
      panelClassName="idle-promo-panel"
      data-testid="idle-promo-modal"
    >
      <div className="idle-promo" data-testid="idle-promo-banner">
        {config.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.image_url} alt="" className="idle-promo__image" />
        ) : null}
        {config.text ? <p className="ds-body idle-promo__text">{config.text}</p> : null}
        {showButton ? (
          <Link href={config.button_url!} className="idle-promo__cta" onClick={dismiss}>
            <Button variant="primary" size="md" data-testid="idle-promo-cta">
              {config.button_label}
            </Button>
          </Link>
        ) : null}
      </div>
    </Modal>
  );
}
