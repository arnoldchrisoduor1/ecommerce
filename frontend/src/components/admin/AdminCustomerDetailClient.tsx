'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet } from '@/lib/admin';

type CustomerDetail = {
  id: string;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  is_guest: boolean;
  created_at?: string;
  order_count?: number;
};

export function AdminCustomerDetailClient({ id }: { id: string }) {
  const { ready } = useAdminUi();
  const [cust, setCust] = useState<CustomerDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await adminGet<CustomerDetail>(`/customers/${id}`);
        if (!cancelled) setCust(r);
      } catch {
        if (!cancelled) setErr('Customer not found');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, id]);

  return (
    <AdminShell title="Customer">
      <p className="ds-caption">
        <Link href="/admin/customers">← Customers</Link>
      </p>
      {err ? <p className="ds-body">{err}</p> : null}
      {cust ? (
        <div className="admin-panel" data-testid="customer-detail">
          <h2 className="ds-display ds-display--sm">{cust.full_name || 'Customer'}</h2>
          <dl className="admin-dl">
            <dt>Email</dt>
            <dd>{cust.email || '—'}</dd>
            <dt>Phone</dt>
            <dd>{cust.phone || '—'}</dd>
            <dt>Guest</dt>
            <dd>{cust.is_guest ? 'Yes' : 'No'}</dd>
            <dt>Orders</dt>
            <dd>{cust.order_count ?? 0}</dd>
            <dt>ID</dt>
            <dd>
              <code>{cust.id}</code>
            </dd>
          </dl>
        </div>
      ) : !err ? (
        <p className="ds-caption">Loading…</p>
      ) : null}
    </AdminShell>
  );
}
