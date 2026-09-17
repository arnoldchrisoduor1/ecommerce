'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/api';
import { useCart } from '@/components/cart/CartProvider';
import { useProductPresenceBatch } from '@/components/product/ProductPresenceProvider';

type Props = {
  productId: string;
  testId?: string;
  showHighDemand?: boolean;
  /** When false, only GET count (shop grid). PDP should heartbeat. */
  heartbeat?: boolean;
  /** Absolute overlay on main PDP image (Task 7). */
  overlay?: boolean;
};

const HIDE_BELOW = 1;

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
  const batchCounts = useProductPresenceBatch();
  const inBatchMode = batchCounts !== null;
  const [count, setCount] = useState(0);
  const [display, setDisplay] = useState(0);
  const [anim, setAnim] = useState(false);
  const prev = useRef(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(!overlay);

  useEffect(() => {
    if (!inBatchMode || !productId) return;
    const batch = batchCounts[productId] ?? 0;
    if (!inView) {
      setCount(batch);
      return;
    }
    // Keep optimistic self-count until the next batch poll catches up.
    setCount((c) => Math.max(c, batch));
  }, [inBatchMode, batchCounts, productId, inView]);

  // Listing cards: register presence only while the card is on-screen.
  // Without this, only PDP heartbeats — shop/home stay at 0 under hide-below.
  useEffect(() => {
    if (!inBatchMode || !productId || !sessionId) return;
    const el = rootRef.current?.closest('.product-card') ?? rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '0px', threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inBatchMode, productId, sessionId]);

  useEffect(() => {
    if (inBatchMode) {
      if (!productId || !sessionId || !inView) return;
      async function beat() {
        try {
          await apiSend(`/presence/products/${productId}/heartbeat`, 'POST', {
            session_id: sessionId,
          });
          // Self counts immediately — batch poll may lag one tick.
          setCount((c) => Math.max(c, 1));
        } catch {
          /* presence optional */
        }
      }
      void beat();
      const id = window.setInterval(beat, 15000);
      return () => window.clearInterval(id);
    }

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
  }, [productId, sessionId, heartbeat, inBatchMode, inView]);

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

  if (count < hideBelowThreshold()) {
    return (
      <span
        ref={(n) => {
          rootRef.current = n;
        }}
        className="viewer-badge-anchor"
        aria-hidden="true"
      />
    );
  }

  const high = showHighDemand && count >= highDemandThreshold();
  const label = `${display} viewing now`;

  if (overlay) {
    return (
      <div
        ref={(n) => {
          rootRef.current = n;
        }}
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
    <span
      ref={(n) => {
        rootRef.current = n;
      }}
      className="viewer-badge-wrap"
    >
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
