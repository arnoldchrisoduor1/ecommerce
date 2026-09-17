'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend, getAdminToken } from '@/lib/admin';

type Subscriber = {
  id: string;
  email: string;
  name?: string | null;
  source: string;
  status: string;
  is_registered: boolean;
  created_at: string;
  unsubscribed_at?: string | null;
};

type Stats = {
  total: number;
  new_this_week: number;
  new_this_month: number;
  unsubscribed: number;
  unsubscribe_rate: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AdminNewsletterClient() {
  const { ready } = useAdminUi();
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [status, setStatus] = useState('');
  const [registered, setRegistered] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyNote, setCopyNote] = useState('');

  const queryBase = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (registered) p.set('registered', registered);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p;
  }, [q, status, registered, from, to]);

  const load = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const listQ = new URLSearchParams(queryBase);
      listQ.set('page', String(page));
      listQ.set('limit', '25');
      const [list, st] = await Promise.all([
        adminGet<{
          subscribers: Subscriber[];
          total: number;
          pages: number;
        }>(`/newsletter?${listQ}`),
        adminGet<Stats>('/newsletter/stats'),
      ]);
      setSubscribers(list.subscribers);
      setTotal(list.total);
      setPages(list.pages);
      setStats(st);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [ready, queryBase, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    const token = getAdminToken();
    const res = await fetch(`/api/admin/newsletter/export?${queryBase}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newsletter-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyEmails() {
    setCopyNote('');
    try {
      const data = await adminGet<{ emails: string; count: number; excludes_unsubscribed: boolean }>(
        `/newsletter/emails?${queryBase}`,
      );
      await navigator.clipboard.writeText(data.emails || '');
      setCopyNote(
        data.excludes_unsubscribed
          ? `Copied ${data.count} email(s). Unsubscribed addresses are excluded.`
          : `Copied ${data.count} email(s).`,
      );
    } catch {
      setCopyNote('Could not copy emails.');
    }
  }

  async function toggleStatus(row: Subscriber) {
    const next = row.status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    try {
      await adminSend(`/newsletter/${row.id}`, 'PATCH', { status: next });
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <AdminShell title="Newsletter">
      <div className="admin-newsletter" data-testid="admin-newsletter">
        <div className="admin-newsletter__stats" data-testid="newsletter-stats">
          <div className="admin-stat admin-stat--spark">
            <span className="admin-stat__label">Total subscribers</span>
            <strong className="admin-stat__value" data-testid="newsletter-stat-total">
              {stats?.total ?? 0}
            </strong>
          </div>
          <div className="admin-stat admin-stat--spark">
            <span className="admin-stat__label">New this week</span>
            <strong className="admin-stat__value" data-testid="newsletter-stat-week">
              {stats?.new_this_week ?? 0}
            </strong>
          </div>
          <div className="admin-stat admin-stat--spark">
            <span className="admin-stat__label">New this month</span>
            <strong className="admin-stat__value" data-testid="newsletter-stat-month">
              {stats?.new_this_month ?? 0}
            </strong>
          </div>
          <div className="admin-stat admin-stat--spark">
            <span className="admin-stat__label">Unsubscribe rate</span>
            <strong className="admin-stat__value" data-testid="newsletter-stat-rate">
              {(stats?.unsubscribe_rate ?? 0).toFixed(1)}%
            </strong>
          </div>
        </div>

        <div className="admin-newsletter__filters">
          <label className="admin-field admin-field--grow">
            <span className="ds-caption">Search email</span>
            <input
              type="search"
              value={qDraft}
              placeholder="email@example.com"
              data-testid="newsletter-search"
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setQ(qDraft);
                }
              }}
            />
          </label>
          <label className="admin-field">
            <span className="ds-caption">Status</span>
            <select
              value={status}
              data-testid="newsletter-status-filter"
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </label>
          <label className="admin-field">
            <span className="ds-caption">Account</span>
            <select
              value={registered}
              data-testid="newsletter-registered-filter"
              onChange={(e) => {
                setPage(1);
                setRegistered(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="registered">Registered</option>
              <option value="guest">Guest</option>
            </select>
          </label>
          <label className="admin-field">
            <span className="ds-caption">From</span>
            <input
              type="date"
              value={from}
              data-testid="newsletter-from"
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
              data-testid="newsletter-to"
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            data-testid="newsletter-search-btn"
            onClick={() => {
              setPage(1);
              setQ(qDraft);
            }}
          >
            Search
          </button>
        </div>

        <div className="admin-newsletter__actions">
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            data-testid="newsletter-export"
            onClick={() => void exportCsv()}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            data-testid="newsletter-copy-emails"
            onClick={() => void copyEmails()}
          >
            Copy all emails
          </button>
          <p className="ds-caption admin-newsletter__exclude-note" data-testid="newsletter-exclude-note">
            Export and copy exclude unsubscribed addresses by default.
          </p>
          {copyNote ? (
            <p className="ds-caption admin-newsletter__copy-note" data-testid="newsletter-copy-note">
              {copyNote}
            </p>
          ) : null}
        </div>

        <div className="admin-newsletter__meta ds-caption">
          {busy ? 'Loading…' : `${total} result${total === 1 ? '' : 's'}`}
        </div>

        <div className="admin-table-scroll"><table className="admin-table" data-testid="newsletter-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Signed up</th>
              <th>Source</th>
              <th>Status</th>
              <th>Account</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subscribers.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-newsletter__empty">
                  No subscribers match these filters.
                </td>
              </tr>
            ) : (
              subscribers.map((row) => (
                <tr key={row.id} data-testid="newsletter-row">
                  <td>{row.email}</td>
                  <td>{row.name || '—'}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td className="admin-newsletter__source">{row.source}</td>
                  <td>
                    <AdminStatusPill status={row.status} />
                  </td>
                  <td>{row.is_registered ? 'Registered' : 'Guest'}</td>
                  <td>
                    <button
                      type="button"
                      className="ds-btn ds-btn--ghost ds-btn--sm"
                      data-testid="newsletter-toggle"
                      onClick={() => void toggleStatus(row)}
                    >
                      {row.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>

        <div className="admin-newsletter__pager">
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            disabled={page <= 1}
            data-testid="newsletter-prev"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="ds-caption">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            disabled={page >= pages}
            data-testid="newsletter-next"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
