'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import {
  AdminOrderCards,
  type AdminOrderCardData,
} from '@/components/admin/AdminOrderCards';
import { adminGet, type AdminOverview, type LowStockVariant } from '@/lib/admin';
import { formatKes } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui';

type OverviewPayload = AdminOverview & {
  recent_orders?: AdminOrderCardData[];
};

type MostViewedProduct = {
  rank: number;
  product_id: string;
  name: string;
  slug: string;
  thumbnail_url?: string | null;
  total_views: number;
  unique_viewers: number;
  avg_seconds: number;
};

type VisitedPage = {
  rank: number;
  path: string;
  total_views: number;
  unique_visitors: number;
  avg_seconds: number;
};

type ActiveWindow = {
  count: number;
  sparkline: number[];
};

type TrafficPresence = {
  currently_online: number;
  windows: Record<string, ActiveWindow>;
  cached?: boolean;
};

type ProductViewer = {
  label: string;
  session_id: string;
  view_count: number;
  total_seconds: number;
  last_viewed_at: string;
};

const ACTIVE_WINDOWS: { key: string; label: string }[] = [
  { key: '1h', label: 'Last 1 hour' },
  { key: '12h', label: 'Last 12 hours' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="admin-sparkline" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="admin-sparkline__bar"
          style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

export function AdminOverviewClient() {
  const { ready } = useAdminUi();
  const [stats, setStats] = useState<OverviewPayload | null>(null);
  const [lowStock, setLowStock] = useState<LowStockVariant[]>([]);
  const [from, setFrom] = useState(() => daysAgoISO(7));
  const [to, setTo] = useState(() => todayISO());
  const [pagesFrom, setPagesFrom] = useState(() => daysAgoISO(7));
  const [pagesTo, setPagesTo] = useState(() => todayISO());
  const [mostViewed, setMostViewed] = useState<MostViewedProduct[]>([]);
  const [visitedPages, setVisitedPages] = useState<VisitedPage[]>([]);
  const [presence, setPresence] = useState<TrafficPresence | null>(null);
  const [modalProduct, setModalProduct] = useState<MostViewedProduct | null>(null);
  const [viewers, setViewers] = useState<ProductViewer[]>([]);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerTotal, setViewerTotal] = useState(0);
  const [viewerSort, setViewerSort] = useState<'last_viewed' | 'views' | 'time' | 'name'>(
    'last_viewed',
  );
  const [viewersBusy, setViewersBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        const [overview, stock] = await Promise.all([
          adminGet<OverviewPayload>('/overview'),
          adminGet<{ variants: LowStockVariant[] }>('/analytics/low-stock'),
        ]);
        if (!cancelled) {
          setStats(overview);
          setLowStock(stock.variants);
        }
      } catch {
        /* ignore */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function loadPresence() {
      try {
        const res = await adminGet<TrafficPresence>('/analytics/traffic-presence');
        if (!cancelled) setPresence(res);
      } catch {
        /* ignore */
      }
    }
    void loadPresence();
    const id = window.setInterval(() => {
      void loadPresence();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        const q = new URLSearchParams({ from, to, limit: '25' });
        const res = await adminGet<{ products: MostViewedProduct[] }>(
          `/analytics/most-viewed-products?${q}`,
        );
        if (!cancelled) setMostViewed(res.products ?? []);
      } catch {
        if (!cancelled) setMostViewed([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, from, to]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        const q = new URLSearchParams({ from: pagesFrom, to: pagesTo, limit: '25' });
        const res = await adminGet<{ pages: VisitedPage[] }>(
          `/analytics/most-visited-pages?${q}`,
        );
        if (!cancelled) setVisitedPages(res.pages ?? []);
      } catch {
        if (!cancelled) setVisitedPages([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, pagesFrom, pagesTo]);

  useEffect(() => {
    if (!ready || !modalProduct) return;
    let cancelled = false;
    async function loadViewers() {
      setViewersBusy(true);
      try {
        const q = new URLSearchParams({
          from,
          to,
          page: String(viewerPage),
          page_size: '10',
          sort: viewerSort,
        });
        const res = await adminGet<{ viewers: ProductViewer[]; total: number }>(
          `/analytics/most-viewed-products/${modalProduct!.product_id}/viewers?${q}`,
        );
        if (!cancelled) {
          setViewers(res.viewers ?? []);
          setViewerTotal(res.total ?? 0);
        }
      } catch {
        if (!cancelled) {
          setViewers([]);
          setViewerTotal(0);
        }
      } finally {
        if (!cancelled) setViewersBusy(false);
      }
    }
    void loadViewers();
    return () => {
      cancelled = true;
    };
  }, [ready, modalProduct, from, to, viewerPage, viewerSort]);

  const viewerPages = Math.max(1, Math.ceil(viewerTotal / 10));

  return (
    <AdminShell title="Overview">
      <div className="admin-grid">
        <div className="admin-stat" data-testid="stat-orders-today">
          <p className="ds-label admin-stat__label">Orders today</p>
          <p className="ds-display ds-display--sm admin-stat__value">
            {stats?.orders_today ?? '—'}
          </p>
        </div>
        <div className="admin-stat" data-testid="stat-revenue-today">
          <p className="ds-label admin-stat__label">Revenue today</p>
          <p className="ds-display ds-display--sm admin-stat__value">
            {stats != null ? formatKes(stats.revenue_today) : '—'}
          </p>
        </div>
        <div className="admin-stat" data-testid="stat-active-viewers">
          <p className="ds-label admin-stat__label">Active viewers</p>
          <p className="ds-display ds-display--sm admin-stat__value">
            {stats?.active_viewers ?? '—'}
          </p>
        </div>
        <div className="admin-stat" data-testid="stat-discount-claims">
          <p className="ds-label admin-stat__label">Discount claims today</p>
          <p className="ds-display ds-display--sm admin-stat__value">
            {stats?.discount_claims_today ?? '—'}
          </p>
        </div>
        <div className="admin-stat admin-stat--online" data-testid="stat-currently-online">
          <p className="ds-label admin-stat__label">
            <span className="admin-online-dot" aria-hidden="true" />
            Currently online
          </p>
          <p className="ds-display ds-display--sm admin-stat__value">
            {presence?.currently_online ?? '—'}
          </p>
        </div>
      </div>

      <section className="admin-panel" data-testid="active-users-panel">
        <div className="admin-panel__head">
          <h2 className="ds-display ds-display--sm">Active users</h2>
          {presence?.cached ? (
            <span className="ds-caption">Cached 60s</span>
          ) : null}
        </div>
        <div className="admin-grid admin-grid--traffic">
          {ACTIVE_WINDOWS.map((w) => {
            const win = presence?.windows?.[w.key];
            return (
              <div
                key={w.key}
                className="admin-stat admin-stat--spark"
                data-testid={`stat-active-${w.key}`}
              >
                <p className="ds-label admin-stat__label">{w.label}</p>
                <p className="ds-display ds-display--sm admin-stat__value">
                  {win?.count ?? '—'}
                </p>
                {win?.sparkline?.length ? <Sparkline values={win.sparkline} /> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="admin-panel" data-testid="most-visited-pages-panel">
        <div className="admin-panel__head">
          <h2 className="ds-display ds-display--sm">Most visited pages</h2>
          <div className="admin-date-range" data-testid="most-visited-range">
            <label className="admin-field">
              <span className="ds-label visually-hidden">From</span>
              <input
                className="admin-input"
                type="date"
                value={pagesFrom}
                onChange={(e) => setPagesFrom(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="ds-label visually-hidden">To</span>
              <input
                className="admin-input"
                type="date"
                value={pagesTo}
                onChange={(e) => setPagesTo(e.target.value)}
              />
            </label>
          </div>
        </div>
        {visitedPages.length === 0 ? (
          <p className="ds-body">No page views in this range yet.</p>
        ) : (
          <table className="admin-table" data-testid="most-visited-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Path</th>
                <th>Views</th>
                <th>Unique</th>
                <th>Avg time</th>
              </tr>
            </thead>
            <tbody>
              {visitedPages.map((p) => (
                <tr key={p.path} data-testid="most-visited-row">
                  <td>{p.rank}</td>
                  <td>
                    <code className="admin-path">{p.path}</code>
                  </td>
                  <td>{p.total_views}</td>
                  <td>{p.unique_visitors}</td>
                  <td>{formatDuration(p.avg_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-panel" data-testid="most-viewed-panel">
        <div className="admin-panel__head">
          <h2 className="ds-display ds-display--sm">Most viewed products</h2>
          <div className="admin-date-range" data-testid="most-viewed-range">
            <label className="admin-field">
              <span className="ds-label visually-hidden">From</span>
              <input
                className="admin-input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="ds-label visually-hidden">To</span>
              <input
                className="admin-input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        </div>
        {mostViewed.length === 0 ? (
          <p className="ds-body">No product views in this range yet.</p>
        ) : (
          <table className="admin-table" data-testid="most-viewed-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Views</th>
                <th>Unique</th>
                <th>Avg time</th>
              </tr>
            </thead>
            <tbody>
              {mostViewed.map((p) => (
                <tr
                  key={p.product_id}
                  data-testid="most-viewed-row"
                  className="admin-table__row--click"
                  onClick={() => {
                    setViewerPage(1);
                    setModalProduct(p);
                  }}
                >
                  <td>{p.rank}</td>
                  <td>
                    <div className="admin-product-cell">
                      {p.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail_url} alt="" className="admin-product-thumb" />
                      ) : (
                        <span className="admin-product-thumb admin-product-thumb--empty" />
                      )}
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td>{p.total_views}</td>
                  <td>{p.unique_viewers}</td>
                  <td>{formatDuration(p.avg_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-panel" data-testid="recent-orders-panel">
        <div className="admin-panel__head">
          <h2 className="ds-display ds-display--sm">Recent orders</h2>
          <Link href="/admin/orders" className="ds-caption">
            View all
          </Link>
        </div>
        <AdminOrderCards
          orders={stats?.recent_orders ?? []}
          emptyLabel="No recent orders."
        />
      </section>

      <section className="admin-panel" data-testid="low-stock-panel">
        <h2 className="ds-display ds-display--sm">Low stock alerts</h2>
        {lowStock.length === 0 ? (
          <p className="ds-body">No variants at or below threshold.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Stock</th>
                <th>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((v) => (
                <tr key={v.variant_id} data-testid="low-stock-row">
                  <td>{v.product_name}</td>
                  <td>{v.sku}</td>
                  <td>{v.stock_qty}</td>
                  <td>{v.low_stock_threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal
        open={!!modalProduct}
        onClose={() => setModalProduct(null)}
        title={modalProduct ? `Viewers · ${modalProduct.name}` : 'Viewers'}
        data-testid="product-viewers-modal"
        panelClassName="admin-viewers-modal"
      >
        <div className="admin-viewers-toolbar">
          <label className="admin-field">
            <span className="ds-label">Sort</span>
            <select
              className="admin-input"
              value={viewerSort}
              onChange={(e) => {
                setViewerPage(1);
                setViewerSort(e.target.value as typeof viewerSort);
              }}
            >
              <option value="last_viewed">Last viewed</option>
              <option value="views">View count</option>
              <option value="time">Time spent</option>
              <option value="name">Name</option>
            </select>
          </label>
          <p className="ds-caption">{viewerTotal} viewers</p>
        </div>
        {viewersBusy ? (
          <p className="ds-body">Loading…</p>
        ) : viewers.length === 0 ? (
          <p className="ds-body">No viewers in this range.</p>
        ) : (
          <table className="admin-table" data-testid="product-viewers-table">
            <thead>
              <tr>
                <th>Viewer</th>
                <th>Views</th>
                <th>Time</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {viewers.map((v) => (
                <tr key={v.session_id} data-testid="product-viewer-row">
                  <td>{v.label}</td>
                  <td>{v.view_count}</td>
                  <td>{formatDuration(v.total_seconds)}</td>
                  <td>{new Date(v.last_viewed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="admin-viewers-pager">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={viewerPage <= 1}
            onClick={() => setViewerPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="ds-caption">
            Page {viewerPage} / {viewerPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={viewerPage >= viewerPages}
            onClick={() => setViewerPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </Modal>
    </AdminShell>
  );
}
