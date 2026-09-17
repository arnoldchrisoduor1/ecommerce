'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCart, SESSION_KEY } from '@/components/cart/CartProvider';

const HEARTBEAT_MS = 15_000;

function ensureSessionId(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  let sid = localStorage.getItem(SESSION_KEY) || fallback;
  if (!sid) {
    sid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

/**
 * Page-view analytics: start on navigation, heartbeat every 15s while visible,
 * sendBeacon close on unload / route change.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const { sessionId } = useCart();
  const { user, accessToken } = useAuth();
  const viewIdRef = useRef<string | null>(null);
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
    let cancelled = false;
    const sid = ensureSessionId(sessionId);
    const customerId = user?.customer_id || null;
    viewIdRef.current = null;

    const authHeaders: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};

    async function start() {
      try {
        const res = await fetch('/api/analytics/views', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            session_id: sid,
            path: pathname,
            referrer: typeof document !== 'undefined' ? document.referrer || null : null,
            user_id: customerId,
          }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { id: string };
        if (!cancelled) viewIdRef.current = data.id;
      } catch {
        /* analytics optional */
      }
    }

    void start();

    const beat = () => {
      const id = viewIdRef.current;
      if (!id) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetch(`/api/analytics/views/${id}/heartbeat`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ session_id: sid, visible: true, seconds: 15 }),
        keepalive: true,
      }).catch(() => {});
    };

    const onVis = () => {
      /* heartbeats only when visible — interval callback checks visibilityState */
    };

    const interval = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVis);

    const close = () => {
      const id = viewIdRef.current;
      if (!id) return;
      viewIdRef.current = null;
      const body = JSON.stringify({ session_id: sid, seconds: 0 });
      const url = `/api/analytics/views/${id}/close`;
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
        return;
      }
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('pagehide', close);
    window.addEventListener('beforeunload', close);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('beforeunload', close);
      close();
    };
  }, [pathname, sessionId, user?.customer_id, accessToken]);

  return null;
}
