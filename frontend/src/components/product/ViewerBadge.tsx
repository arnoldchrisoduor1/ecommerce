'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/api';
import { useCart } from '@/components/cart/CartProvider';

type Props = {
  productId: string;
  testId?: string;
  showHighDemand?: boolean;
};

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
}: Props) {
  const { sessionId } = useCart();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!productId || !sessionId) return;
    let cancelled = false;

    async function tick() {
      try {
        await apiSend(`/presence/products/${productId}/heartbeat`, 'POST', {
          session_id: sessionId,
        });
        const res = await apiGet<{ count: number }>(`/presence/products/${productId}`);
        if (!cancelled) setCount(res.count);
      } catch {
        /* presence optional */
      }
    }

    void tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [productId, sessionId]);

  const high = showHighDemand && count >= highDemandThreshold();

  return (
    <span className="viewer-badge-wrap">
      <Badge variant="presence" data-testid={testId}>
        {count} viewing
      </Badge>
      {high ? (
        <Badge variant="accent" data-testid="high-demand-tag">
          High demand
        </Badge>
      ) : null}
    </span>
  );
}
