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

type OverviewPayload = AdminOverview & {
  recent_orders?: AdminOrderCardData[];
};

export function AdminOverviewClient() {
  const { ready } = useAdminUi();
  const [stats, setStats] = useState<OverviewPayload | null>(null);
  const [lowStock, setLowStock] = useState<LowStockVariant[]>([]);

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
      </div>

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
    </AdminShell>
  );
}
