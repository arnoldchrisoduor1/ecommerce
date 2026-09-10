'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet } from '@/lib/admin';
import { formatKes } from '@/lib/format';

type SavedItem = {
  id: string;
  saved_at: string;
  customer_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  is_guest: boolean;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_status: string;
  value: number;
  base_price: number;
  sale_price?: number | null;
  image_url?: string | null;
  is_active: boolean;
};

type ActiveFilter = 'all' | 'true' | 'false';

export function AdminSavedItemsClient() {
  const { ready } = useAdminUi();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [active, setActive] = useState<ActiveFilter>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (debouncedQ.length >= 2) params.set('q', debouncedQ);
    if (active !== 'all') params.set('active', active);
    const qs = params.toString();
    const path = qs ? `/saved-items?${qs}` : '/saved-items';

    let cancelled = false;
    setLoading(true);
    void adminGet<{ items: SavedItem[] }>(path)
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, debouncedQ, active]);

  return (
    <AdminShell title="Saved items">
      <p className="ds-caption admin-lead">
        Wishlist entries by customer — value uses sale price when set.
      </p>

      <div className="admin-filters" data-testid="admin-saved-filters">
        <label className="admin-field admin-filters__search">
          <span className="ds-label">Search</span>
          <input
            className="admin-input"
            type="search"
            value={query}
            placeholder="Customer or product (2+ characters)"
            onChange={(e) => setQuery(e.target.value)}
            data-testid="admin-saved-search"
          />
          {query.trim().length > 0 && query.trim().length < 2 ? (
            <span className="ds-caption">Type at least 2 characters to search.</span>
          ) : null}
        </label>
        <label className="admin-field">
          <span className="ds-label">Active</span>
          <select
            className="admin-input"
            value={active}
            onChange={(e) => setActive(e.target.value as ActiveFilter)}
            data-testid="admin-saved-active-filter"
          >
            <option value="all">All</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </label>
      </div>

      {loading ? <p className="ds-caption">Loading…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="ds-body">No saved items match.</p>
      ) : null}
      {items.length > 0 ? (
        <table className="admin-table" data-testid="admin-saved-items">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Product</th>
              <th>Value</th>
              <th>Active</th>
              <th>Saved</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="admin-cell-stack">
                    <span>{item.customer_name || (item.is_guest ? 'Guest' : '—')}</span>
                    <span className="ds-caption">
                      {item.customer_email || item.customer_phone || item.customer_id.slice(0, 8)}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="admin-saved-product">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="admin-saved-product__img" />
                    ) : (
                      <span className="admin-saved-product__img admin-saved-product__img--empty" />
                    )}
                    <span>{item.product_name}</span>
                  </div>
                </td>
                <td>
                  <div className="admin-cell-stack">
                    <span>{formatKes(item.value)}</span>
                    {item.sale_price != null ? (
                      <span className="ds-caption">{formatKes(item.base_price)} list</span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <span
                    className={`ds-badge ${
                      item.is_active ? 'ds-badge--success' : 'ds-badge--danger'
                    }`}
                  >
                    {item.is_active ? 'Active' : item.product_status}
                  </span>
                </td>
                <td className="ds-caption">
                  {new Date(item.saved_at).toLocaleString('en-KE', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </AdminShell>
  );
}
