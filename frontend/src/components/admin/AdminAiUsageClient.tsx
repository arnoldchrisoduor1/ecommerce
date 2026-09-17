'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { AdminApiError, adminGet, adminSend } from '@/lib/admin';
import { Button } from '@/components/ui';

type Summary = {
  key_limit_remaining?: number | null;
  key_limit?: number | null;
  account_credits_remaining?: number | null;
  spend_today: number;
  spend_this_month: number;
  low_balance_warning: boolean;
  low_balance_threshold: number;
  globally_enabled: boolean;
  key_info_raw?: unknown;
  credits_raw?: unknown;
  key_info_error?: string;
  credits_error?: string;
  usage_log_error?: string;
};

type DailyRow = { day: string; spend: number };
type BreakdownRow = {
  feature: string;
  model: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost: number;
};
type UserRow = {
  user_id?: string | null;
  user_email?: string | null;
  session_id?: string | null;
  feature: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost: number;
  ai_access_enabled?: boolean | null;
};

function fmtUsd(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toFixed(4)}`;
}

function openRouterHint(summary: Summary | null): string | null {
  if (!summary) return null;
  if (summary.usage_log_error) {
    return summary.usage_log_error;
  }
  const errs = [summary.key_info_error, summary.credits_error].filter(Boolean) as string[];
  if (errs.length === 0) return null;
  const joined = errs.join(' · ');
  if (/MANAGEMENT_KEY|not set|401|403|status 401|status 403/i.test(joined)) {
    return 'Unable to reach OpenRouter — check API key configuration (OPENROUTER_API_KEY / OPENROUTER_MANAGEMENT_KEY).';
  }
  return `Unable to reach OpenRouter — ${joined}`;
}

export function AdminAiUsageClient() {
  const { ready, toast } = useAdminUi();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('estimated_cost');

  const maxDaily = useMemo(
    () => Math.max(0.0001, ...daily.map((d) => d.spend)),
    [daily],
  );

  const orBanner = openRouterHint(summary);

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    setLoadError(null);
    try {
      const qs = refresh ? '?refresh=true' : '';
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('sort', sort);
      const range = params.toString() ? `?${params}` : '';

      // Soft-fail each endpoint so one OpenRouter/migration miss doesn't blank the page.
      const settled = await Promise.allSettled([
        adminGet<Summary>(`/ai-usage/summary${qs}`),
        adminGet<{ days: DailyRow[] }>('/ai-usage/daily?days=30'),
        adminGet<{ breakdown: BreakdownRow[] }>(`/ai-usage/breakdown${range}`),
        adminGet<{ users: UserRow[] }>(`/ai-usage/users${range}`),
      ]);

      const [sRes, dRes, bRes, uRes] = settled;
      let hardFail = 0;

      if (sRes.status === 'fulfilled') {
        setSummary(sRes.value);
      } else {
        hardFail += 1;
        setSummary(null);
      }
      if (dRes.status === 'fulfilled') {
        setDaily(dRes.value.days || []);
      } else {
        hardFail += 1;
        setDaily([]);
      }
      if (bRes.status === 'fulfilled') {
        setBreakdown(bRes.value.breakdown || []);
      } else {
        hardFail += 1;
        setBreakdown([]);
      }
      if (uRes.status === 'fulfilled') {
        setUsers(uRes.value.users || []);
      } else {
        hardFail += 1;
        setUsers([]);
      }

      if (hardFail === 4) {
        const reason =
          sRes.status === 'rejected' && sRes.reason instanceof AdminApiError
            ? sRes.reason.status === 500
              ? 'Server error loading AI usage — confirm V18 migration (ai_usage_log / ai_settings) ran in production.'
              : `AI usage API failed (${sRes.reason.status}).`
            : 'Could not load AI usage.';
        setLoadError(reason);
      } else if (hardFail > 0) {
        toast('Some AI usage panels failed to load');
      }
    } catch {
      setLoadError('Could not load AI usage.');
    } finally {
      setBusy(false);
    }
  }, [from, to, sort, toast]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  async function toggleGlobal() {
    if (!summary) return;
    setBusy(true);
    try {
      await adminSend('/ai-usage/global', 'PUT', { enabled: !summary.globally_enabled });
      toast(summary.globally_enabled ? 'AI disabled globally' : 'AI enabled globally');
      await load(true);
    } catch {
      toast('Could not update global AI setting');
    } finally {
      setBusy(false);
    }
  }

  async function toggleUserAccess(userId: string, enabled: boolean) {
    setBusy(true);
    try {
      await adminSend(`/ai-usage/users/${userId}/access`, 'PATCH', { enabled });
      toast(enabled ? 'AI access enabled' : 'AI access disabled');
      await load();
    } catch {
      toast('Could not update user AI access');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="AI Usage">
      {loadError ? (
        <div className="admin-banner admin-banner--warn" role="alert" data-testid="ai-usage-load-error">
          <p>{loadError}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void load(true)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {orBanner ? (
        <div className="admin-banner admin-banner--warn" role="status" data-testid="ai-usage-or-banner">
          <p>{orBanner}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void load(true)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {summary?.low_balance_warning ? (
        <div className="admin-banner admin-banner--warn" role="status">
          Low balance: remaining credits or key limit is below{' '}
          {fmtUsd(summary.low_balance_threshold)}.
        </div>
      ) : null}

      <div className="admin-actions" style={{ marginBottom: 'var(--space-4)' }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Refresh balances
        </Button>
        <Button
          type="button"
          variant={summary?.globally_enabled ? 'danger' : 'primary'}
          size="sm"
          disabled={busy || !summary}
          onClick={() => void toggleGlobal()}
        >
          {summary?.globally_enabled ? 'Disable AI globally' : 'Enable AI globally'}
        </Button>
      </div>

      <div className="admin-stat-grid">
        <article className="admin-stat-card">
          <p className="ds-label">Key limit remaining</p>
          <p className="admin-stat-card__value">{fmtUsd(summary?.key_limit_remaining)}</p>
          {summary?.key_info_error ? (
            <p className="ds-caption">{summary.key_info_error}</p>
          ) : null}
        </article>
        <article className="admin-stat-card">
          <p className="ds-label">Account credits remaining</p>
          <p className="admin-stat-card__value">{fmtUsd(summary?.account_credits_remaining)}</p>
          {summary?.credits_error ? (
            <p className="ds-caption">{summary.credits_error}</p>
          ) : null}
        </article>
        <article className="admin-stat-card">
          <p className="ds-label">Spend today</p>
          <p className="admin-stat-card__value">{fmtUsd(summary?.spend_today)}</p>
        </article>
        <article className="admin-stat-card">
          <p className="ds-label">Spend this month</p>
          <p className="admin-stat-card__value">{fmtUsd(summary?.spend_this_month)}</p>
        </article>
      </div>

      {summary?.key_info_raw ? (
        <details className="admin-panel" style={{ marginTop: 'var(--space-6)' }}>
          <summary className="ds-label">Raw OpenRouter key response</summary>
          <pre className="admin-code-block">{JSON.stringify(summary.key_info_raw, null, 2)}</pre>
        </details>
      ) : null}

      <section className="admin-panel" style={{ marginTop: 'var(--space-6)' }}>
        <h2>Daily spend (30 days)</h2>
        {daily.length === 0 ? (
          <p className="ds-caption">No daily spend data yet.</p>
        ) : (
          <ul className="admin-ai-chart">
            {daily.map((row) => (
              <li key={row.day} className="admin-ai-chart__row">
                <span className="admin-ai-chart__label ds-caption">{row.day.slice(5)}</span>
                <span
                  className="admin-ai-chart__bar"
                  style={{ width: `${Math.max(2, (row.spend / maxDaily) * 100)}%` }}
                  title={fmtUsd(row.spend)}
                />
                <span className="admin-ai-chart__value ds-caption">{fmtUsd(row.spend)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-panel">
        <h2>By feature &amp; model</h2>
        <div className="admin-table-scroll"><table className="admin-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Model</th>
              <th>Requests</th>
              <th>Tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={5} className="ds-caption">
                  No usage logged yet.
                </td>
              </tr>
            ) : (
              breakdown.map((row) => (
                <tr key={`${row.feature}-${row.model}`}>
                  <td>{row.feature}</td>
                  <td>{row.model}</td>
                  <td>{row.request_count}</td>
                  <td>{row.prompt_tokens + row.completion_tokens}</td>
                  <td>{fmtUsd(row.estimated_cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>Per user / session</h2>
        </div>
        <div className="admin-inline-form">
          <input
            className="admin-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="admin-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <select className="admin-input" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="estimated_cost">Sort: cost</option>
            <option value="request_count">Sort: requests</option>
            <option value="prompt_tokens">Sort: tokens</option>
          </select>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
            Apply
          </Button>
        </div>
        <div className="admin-table-scroll"><table className="admin-table">
          <thead>
            <tr>
              <th>User / session</th>
              <th>Feature</th>
              <th>Requests</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="ds-caption">
                  No per-user usage yet.
                </td>
              </tr>
            ) : (
              users.map((row, i) => (
                <tr key={`${row.user_id || row.session_id}-${row.feature}-${i}`}>
                  <td>
                    {row.user_email || row.user_id || `Guest ${row.session_id?.slice(0, 8) ?? '—'}`}
                  </td>
                  <td>{row.feature}</td>
                  <td>{row.request_count}</td>
                  <td>{row.prompt_tokens + row.completion_tokens}</td>
                  <td>{fmtUsd(row.estimated_cost)}</td>
                  <td>
                    {row.user_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void toggleUserAccess(row.user_id!, row.ai_access_enabled === false)
                        }
                      >
                        {row.ai_access_enabled === false ? 'Enable' : 'Disable'}
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </section>
    </AdminShell>
  );
}
