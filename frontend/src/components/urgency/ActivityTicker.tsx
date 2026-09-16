'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/api';

type ActivityEvent = {
  type: string;
  name: string;
  item_name?: string | null;
  thumbnail_url?: string | null;
  message: string;
  created_at: string;
};

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function ItemIcon({ kind }: { kind: string }) {
  if (kind === 'newsletter_signup') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="1" />
        <path d="M3 7l9 7 9-7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 7h12l-1 12H7L6 7z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function ActivityTicker() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fadeIdx, setFadeIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiGet<{ events: ActivityEvent[] }>('/activity/recent?limit=20');
        if (!cancelled && res.events?.length) setEvents(res.events);
      } catch {
        /* optional ambient */
      }
    }
    void load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!reduceMotion || events.length < 2) return;
    const id = window.setInterval(() => {
      setFadeIdx((i) => (i + 1) % events.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [reduceMotion, events.length]);

  const loop = useMemo(() => {
    if (events.length === 0) return [];
    // Duplicate for seamless CSS marquee when few items.
    const base = events.length < 6 ? [...events, ...events, ...events] : [...events, ...events];
    return base;
  }, [events]);

  if (events.length === 0) return null;

  if (reduceMotion) {
    const item = events[fadeIdx % events.length];
    return (
      <section className="activity-ticker activity-ticker--static" aria-label="Recent activity" data-testid="activity-ticker">
        <ActivityRow event={item} />
      </section>
    );
  }

  return (
    <section className="activity-ticker" aria-label="Recent activity" data-testid="activity-ticker">
      <div className="activity-ticker__viewport">
        <ul className="activity-ticker__track">
          {loop.map((ev, i) => (
            <li key={`${ev.type}-${ev.created_at}-${i}`} className="activity-ticker__item">
              <ActivityRow event={ev} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <div className="activity-ticker__row">
      <span className="activity-ticker__thumb" aria-hidden="true">
        {event.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.thumbnail_url} alt="" />
        ) : (
          <ItemIcon kind={event.type} />
        )}
      </span>
      <p className="ds-caption activity-ticker__msg">{event.message}</p>
      <time className="ds-caption activity-ticker__time" dateTime={event.created_at}>
        {relativeTime(event.created_at)}
      </time>
    </div>
  );
}
