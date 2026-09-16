'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, getAdminToken } from '@/lib/admin';
import { formatKes } from '@/lib/format';

type ActivityEvent = {
  id: string;
  type: string;
  created_at: string;
  customer_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  is_guest: boolean;
  product_id?: string | null;
  product_name?: string | null;
  product_slug?: string | null;
  thumbnail_url?: string | null;
  price_at_event?: number | null;
  order_id?: string | null;
  order_total?: number | null;
};

type Summary = {
  counts: Record<string, number>;
  total: number;
};

const TYPE_OPTS = [
  { id: 'purchase', label: 'Purchase' },
  { id: 'wishlist_add', label: 'Wishlist' },
  { id: 'cart_add', label: 'Cart' },
  { id: 'newsletter_signup', label: 'Newsletter' },
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const m = Math.max(1, Math.floor(diffSec / 60));
    return m === 1 ? '1 min ago' : `${m} min ago`;
  }
  if (diffSec < 86400) {
    const h = Math.max(1, Math.floor(diffSec / 3600));
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  const d = Math.max(1, Math.floor(diffSec / 86400));
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function typeLabel(t: string): string {
  return TYPE_OPTS.find((o) => o.id === t)?.label ?? t;
}

export function AdminActivityClient() {
  const { ready } = useAdminUi();
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [types, setTypes] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const queryBase = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (types.length) p.set('types', types.join(','));
    if (q.trim()) p.set('q', q.trim());
    return p;
  }, [from, to, types, q]);

  const load = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const feedQ = new URLSearchParams(queryBase);
      feedQ.set('page', String(page));
      feedQ.set('limit', '25');
      const [feed, sum] = await Promise.all([
        adminGet<{
          events: ActivityEvent[];
          total: number;
          pages: number;
        }>(`/activity?${feedQ}`),
        adminGet<Summary>(`/activity/summary?${queryBase}`),
      ]);
      setEvents(feed.events);
      setTotal(feed.total);
      setPages(feed.pages);
      setSummary(sum);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [ready, queryBase, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleType(id: string) {
    setPage(1);
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function exportCsv() {
    const token = getAdminToken();
    const res = await fetch(`/api/admin/activity/export?${queryBase}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'activity-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="Activity">
      <div className="admin-activity" data-testid="admin-activity">
        <div className="admin-activity__summary" data-testid="activity-summary">
          {TYPE_OPTS.map((t) => (
            <div key={t.id} className="admin-activity__stat" data-testid={`activity-count-${t.id}`}>
              <span className={`admin-activity__pill admin-activity__pill--${t.id}`}>
                {t.label}
              </span>
              <strong>{summary?.counts?.[t.id] ?? 0}</strong>
            </div>
          ))}
          <div className="admin-activity__stat">
            <span className="ds-caption">Total</span>
            <strong data-testid="activity-count-total">{summary?.total ?? 0}</strong>
          </div>
        </div>

        <div className="admin-activity__filters">
          <label className="admin-field">
            <span className="ds-caption">From</span>
            <input
              type="date"
              value={from}
              data-testid="activity-from"
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          </label>
          <label className="admin-field">
            <span className="ds-caption">To</span>
            <input
              type="date"
              value={to}
              data-testid="activity-to"
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </label>
          <label className="admin-field admin-field--grow">
            <span className="ds-caption">Search customer / product</span>
            <input
              type="search"
              value={qDraft}
              placeholder="Name, email, product…"
              data-testid="activity-search"
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setQ(qDraft);
                }
              }}
            />
          </label>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            data-testid="activity-search-btn"
            onClick={() => {
              setPage(1);
              setQ(qDraft);
            }}
          >
            Search
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            data-testid="activity-export"
            onClick={() => void exportCsv()}
          >
            Export CSV
          </button>
        </div>

        <div className="admin-activity__type-filters" data-testid="activity-type-filters">
          {TYPE_OPTS.map((t) => (
            <label key={t.id} className="admin-activity__type-check">
              <input
                type="checkbox"
                checked={types.includes(t.id)}
                data-testid={`activity-type-${t.id}`}
                onChange={() => toggleType(t.id)}
              />
              {t.label}
            </label>
          ))}
        </div>

        <ul className="admin-activity__feed" data-testid="activity-feed">
          {events.map((ev) => (
            <li key={ev.id} className="admin-activity__row" data-testid="activity-row" data-type={ev.type}>
              <span className={`admin-activity__pill admin-activity__pill--${ev.type}`}>
                {typeLabel(ev.type)}
              </span>
              <div className="admin-activity__who">
                {ev.customer_id ? (
                  <Link href={`/admin/customers/${ev.customer_id}`} data-testid="activity-customer-link">
                    {ev.customer_name}
                  </Link>
                ) : (
                  <span>{ev.customer_name || 'Guest'}</span>
                )}
                <span className="ds-caption">
                  {ev.customer_email || (ev.customer_id ? '—' : 'Guest')}
                </span>
              </div>
              <div className="admin-activity__product">
                {ev.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.thumbnail_url} alt="" width={40} height={40} />
                ) : (
                  <span className="admin-activity__thumb-ph" />
                )}
                <div>
                  {ev.product_slug && ev.product_name ? (
                    <Link
                      href={`/product/${ev.product_slug}`}
                      data-testid="activity-product-link"
                    >
                      {ev.product_name}
                    </Link>
                  ) : (
                    <span>{ev.product_name || (ev.type === 'newsletter_signup' ? '—' : '—')}</span>
                  )}
                  {ev.price_at_event != null ? (
                    <span className="ds-caption">{formatKes(ev.price_at_event)}</span>
                  ) : null}
                </div>
              </div>
              <div className="admin-activity__order">
                {ev.order_id ? (
                  <>
                    <Link href={`/admin/orders/${ev.order_id}`} data-testid="activity-order-link">
                      Order {ev.order_id.slice(0, 8)}
                    </Link>
                    {ev.order_total != null ? (
                      <span className="ds-caption">{formatKes(ev.order_total)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="ds-caption">—</span>
                )}
              </div>
              <time
                className="admin-activity__time"
                dateTime={ev.created_at}
                title={new Date(ev.created_at).toLocaleString()}
              >
                {relativeTime(ev.created_at)}
              </time>
            </li>
          ))}
          {!busy && events.length === 0 ? (
            <li className="admin-activity__empty ds-caption">No events in this range.</li>
          ) : null}
        </ul>

        <div className="admin-activity__pager">
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            disabled={page <= 1}
            data-testid="activity-prev"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="ds-caption" data-testid="activity-page">
            Page {page} / {pages} · {total} events
          </span>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            disabled={page >= pages}
            data-testid="activity-next"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
