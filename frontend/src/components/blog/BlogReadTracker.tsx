'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/api';
import { useCart } from '@/components/cart/CartProvider';

type Props = {
  postId: string;
  initialReading?: number;
  initialReads?: number;
};

const MILESTONES = [25, 50, 75, 100] as const;

function ensureSessionId(fallback: string): string {
  if (fallback) return fallback;
  try {
    const existing = localStorage.getItem('studio_session_id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem('studio_session_id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function BlogReadTracker({
  postId,
  initialReading = 0,
  initialReads = 0,
}: Props) {
  const { sessionId: cartSid } = useCart();
  const [reading, setReading] = useState(initialReading);
  const [display, setDisplay] = useState(initialReading);
  const [totalReads, setTotalReads] = useState(initialReads);
  const [anim, setAnim] = useState(false);
  const fired = useRef<Set<number>>(new Set());
  const prev = useRef(initialReading);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    const sid = ensureSessionId(cartSid);

    async function start() {
      try {
        const res = await apiSend<{
          total_reads: number;
          currently_reading: number;
          created: boolean;
        }>(`/analytics/blog/${postId}/read`, 'POST', { session_id: sid });
        if (!cancelled) {
          setTotalReads(res.total_reads);
          setReading(res.currently_reading);
        }
      } catch {
        /* optional */
      }
    }

    async function heartbeat() {
      try {
        await apiSend(`/analytics/blog/${postId}/read/heartbeat`, 'POST', {
          session_id: sid,
          seconds: 15,
        });
        const res = await apiGet<{ count: number }>(
          `/analytics/blog/${postId}/presence`,
        );
        if (!cancelled) setReading(res.count);
      } catch {
        /* ignore */
      }
    }

    void start().then(() => void heartbeat());
    const id = window.setInterval(() => void heartbeat(), 15_000);

    function onScroll() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = Math.round((window.scrollY / scrollable) * 100);
      for (const m of MILESTONES) {
        if (pct >= m && !fired.current.has(m)) {
          fired.current.add(m);
          void apiSend(`/analytics/blog/${postId}/read/scroll`, 'POST', {
            session_id: sid,
            percent: m,
          });
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('scroll', onScroll);
    };
  }, [postId, cartSid]);

  useEffect(() => {
    if (reading === prev.current) {
      setDisplay(reading);
      return;
    }
    setAnim(true);
    const t = window.setTimeout(() => {
      setDisplay(reading);
      setAnim(false);
      prev.current = reading;
    }, 180);
    return () => window.clearTimeout(t);
  }, [reading]);

  const showReading = display >= 1;

  return (
    <div className="blog-read-meta" data-testid="blog-read-meta">
      {showReading ? (
        <span
          className={anim ? 'viewer-badge--swap' : undefined}
          data-testid="blog-reading-now"
        >
          <Badge variant="presence">
            {display === 1 ? '1 reading now' : `${display} reading now`}
          </Badge>
        </span>
      ) : null}
      <span className="ds-caption" data-testid="blog-total-reads">
        {totalReads === 1 ? '1 read' : `${totalReads} reads`}
      </span>
    </div>
  );
}
