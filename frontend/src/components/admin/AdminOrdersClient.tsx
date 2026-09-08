'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';
import { formatKes } from '@/lib/format';
import { Button } from '@/components/ui';

type Order = {
  id: string;
  status: string;
  total: number;
  payment_status: string;
  created_at: string;
};

export function AdminOrdersClient() {
  const { ready } = useAdminUi();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!ready) return;
    void adminGet<{ orders: Order[] }>('/orders').then((r) => setOrders(r.orders));
  }, [ready]);

  async function setStatus(id: string, status: string) {
    await adminSend(`/orders/${id}/status`, 'PATCH', { status });
    const r = await adminGet<{ orders: Order[] }>('/orders');
    setOrders(r.orders);
  }

  return (
    <AdminShell title="Orders">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id.slice(0, 8)}</td>
              <td>{o.status}</td>
              <td>{formatKes(o.total)}</td>
              <td>{o.payment_status}</td>
              <td>
                <Button variant="ghost" size="sm" onClick={() => void setStatus(o.id, 'paid')}>
                  Mark paid
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
