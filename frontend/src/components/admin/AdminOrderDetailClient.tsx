'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet } from '@/lib/admin';
import { formatKes } from '@/lib/format';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';

type OrderDetail = {
  id: string;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  total: number;
  subtotal?: number;
  created_at?: string;
  customer_name?: string | null;
  customer_email?: string | null;
};

export function AdminOrderDetailClient({ id }: { id: string }) {
  const { ready } = useAdminUi();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await adminGet<OrderDetail>(`/orders/${id}`);
        if (!cancelled) setOrder(r);
      } catch {
        if (!cancelled) setErr('Order not found');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, id]);

  return (
    <AdminShell title="Order">
      <p className="ds-caption">
        <Link href="/admin/orders">← Orders</Link>
      </p>
      {err ? <p className="ds-body">{err}</p> : null}
      {order ? (
        <div className="admin-panel" data-testid="order-detail">
          <h2 className="ds-display ds-display--sm">Order {order.id.slice(0, 8)}</h2>
          <div className="admin-activity__filters" style={{ marginBottom: '1rem' }}>
            <AdminStatusPill status={order.status} />
            <AdminStatusPill status={order.payment_status} />
          </div>
          <dl className="admin-dl">
            <dt>Total</dt>
            <dd>{formatKes(order.total)}</dd>
            <dt>Customer</dt>
            <dd>{order.customer_name || order.customer_email || '—'}</dd>
            <dt>ID</dt>
            <dd>
              <code>{order.id}</code>
            </dd>
          </dl>
        </div>
      ) : !err ? (
        <p className="ds-caption">Loading…</p>
      ) : null}
    </AdminShell>
  );
}
