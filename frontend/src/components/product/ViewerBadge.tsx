'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/api';
import { useCart } from '@/components/cart/CartProvider';

type Props = {
  productId: string;
  testId?: string;
  showHighDemand?: boolean;
  /** When false, only GET count (shop grid). PDP should heartbeat. */
  heartbeat?: boolean;
  /** Absolute overlay on main PDP image (Task 7). */
  overlay?: boolean;
};

const HIDE_BELOW = 2;

function hideBelowThreshold(): number {
  if (typeof window === 'undefined') return HIDE_BELOW;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--presence-hide-below')
    .trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : HIDE_BELOW;
}

function highDemandThreshold(): number {
  if (typeof window === 'undefined') return 3;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--presence-high-demand')
    .trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 3;
}

export function ViewerBadge({
  productId,
  testId = 'viewer-count-badge',
  showHighDemand = false,
  heartbeat = false,
  overlay = false,
}: Props) {
  const { sessionId } = useCart();
  const [count, setCount] = useState(0);
  const [display, setDisplay] = useState(0);
  const [anim, setAnim] = useState(false);
  const prev = useRef(0);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;

    async function tick() {
      try {
        if (heartbeat && sessionId) {
          await apiSend(`/presence/products/${productId}/heartbeat`, 'POST', {
            session_id: sessionId,
          });
        }
        const res = await apiGet<{ count: number }>(`/presence/products/${productId}`);
        if (!cancelled) setCount(res.count);
      } catch {
        /* presence optional — keep last count */
      }
    }

    void tick();
    if (!heartbeat) {
      return () => {
        cancelled = true;
      };
    }

    const id = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [productId, sessionId, heartbeat]);

  useEffect(() => {
    if (count === prev.current) {
      setDisplay(count);
      return;
    }
    setAnim(true);
    const t = window.setTimeout(() => {
      setDisplay(count);
      prev.current = count;
      setAnim(false);
    }, 160);
    return () => window.clearTimeout(t);
  }, [count]);

  if (count < hideBelowThreshold()) return null;

  const high = showHighDemand && count >= highDemandThreshold();
  const label = `${display} viewing now`;

  if (overlay) {
    return (
      <div
        className="viewer-overlay"
        data-testid="pdp-viewer-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className={`viewer-overlay__pill${anim ? ' viewer-overlay__pill--swap' : ''}`}
          data-testid={testId}
        >
          <span className="viewer-overlay__dot" aria-hidden="true" />
          <span className="viewer-overlay__count">{label}</span>
        </span>
        {high ? (
          <span className="viewer-overlay__demand" data-testid="high-demand-tag">
            High demand
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <span className="viewer-badge-wrap">
      <Badge
        variant="presence"
        data-testid={testId}
        className={anim ? 'viewer-badge--swap' : undefined}
      >
        {label}
      </Badge>
      {high ? (
        <Badge variant="accent" data-testid="high-demand-tag">
          High demand
        </Badge>
      ) : null}
    </span>
  );
}
