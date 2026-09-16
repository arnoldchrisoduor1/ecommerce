'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet } from '@/lib/admin';

type Customer = {
  id: string;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  is_guest: boolean;
  order_count?: number;
  last_seen_at?: string | null;
  online?: boolean;
};

function formatRelative(iso?: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return m <= 1 ? '1 min ago' : `${m} min ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  const d = Math.floor(diffSec / 86400);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

export function AdminCustomersClient() {
  const { ready } = useAdminUi();
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await adminGet<{ customers: Customer[] }>('/customers');
        if (!cancelled) setCustomers(r.customers);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready]);

  return (
    <AdminShell title="Customers">
      <table className="admin-table" data-testid="customers-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Guest</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} data-testid="customer-row">
              <td>
                <span className="admin-customer-name">
                  {c.online ? (
                    <span
                      className="admin-online-dot"
                      title="Online"
                      aria-label="Online"
                    />
                  ) : null}
                  {c.full_name || '—'}
                </span>
              </td>
              <td>{c.email || '—'}</td>
              <td>{c.phone || '—'}</td>
              <td>{c.is_guest ? 'Yes' : 'No'}</td>
              <td data-testid="customer-last-seen">{formatRelative(c.last_seen_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
