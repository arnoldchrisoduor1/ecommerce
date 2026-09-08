'use client';

import { useLayoutEffect, useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/api';
import { useCart } from '@/components/cart/CartProvider';
import { EXIT_INTENT_KEY } from './exit-intent-boot';

const EXIT_CODE = 'WELCOME10';

export function ExitIntent() {
  const { sessionId } = useCart();
  const [open, setOpen] = useState(false);
  const [claims, setClaims] = useState<number | null>(null);

  useLayoutEffect(() => {
    const show = () => setOpen(true);

    // Boot script may have fired before hydrate (e2e mouseleave race).
    if (typeof window !== 'undefined' && window.__STUDIO_EXIT_PENDING) {
      show();
    }
    window.addEventListener('studio:exit-intent', show);

    // Fallback if boot script missing (e.g. partial navigate).
    const trigger = () => {
      if (sessionStorage.getItem(EXIT_INTENT_KEY)) return;
      sessionStorage.setItem(EXIT_INTENT_KEY, '1');
      window.__STUDIO_EXIT_PENDING = true;
      show();
    };
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= 10) trigger();
    };
    const onDocOut = (e: MouseEvent) => {
      const to = (e as MouseEvent & { toElement?: EventTarget | null }).toElement;
      if (!e.relatedTarget && !to) trigger();
      if (e.clientY <= 0) trigger();
    };

    document.documentElement.addEventListener('mouseleave', trigger);
    document.addEventListener('mouseout', onDocOut);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('studio:exit-intent', show);
      document.documentElement.removeEventListener('mouseleave', trigger);
      document.removeEventListener('mouseout', onDocOut);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await apiGet<{ claims_today: number }>(
          `/discounts/${EXIT_CODE}/claims-today`,
        );
        if (!cancelled) setClaims(res.claims_today);
      } catch {
        if (!cancelled) setClaims(0);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function claim() {
    try {
      await apiSend(`/discounts/${EXIT_CODE}/claim`, 'POST', {
        session_id: sessionId || undefined,
      });
      const res = await apiGet<{ claims_today: number }>(
        `/discounts/${EXIT_CODE}/claims-today`,
      );
      setClaims(res.claims_today);
    } catch {
      /* already claimed */
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      offer
      eyebrow="Welcome offer"
      title="10% off your first order"
      code={EXIT_CODE}
      data-testid="exit-intent-modal"
      dismissLabel="No thanks"
    >
      <p className="ds-caption" data-testid="exit-intent-claims-today">
        {claims == null ? '…' : `${claims} claimed today`}
      </p>
      <Button variant="accent" size="lg" onClick={() => void claim()}>
        Claim code
      </Button>
    </Modal>
  );
}
