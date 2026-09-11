'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import {
  AdminOrderCards,
  type AdminOrderCardData,
} from '@/components/admin/AdminOrderCards';
import { adminGet, adminSend } from '@/lib/admin';
import { Button } from '@/components/ui';

export function AdminOrdersClient() {
  const { ready } = useAdminUi();
  const [orders, setOrders] = useState<AdminOrderCardData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [minDays, setMinDays] = useState(3);
  const [maxDays, setMaxDays] = useState(8);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await adminGet<{ orders: AdminOrderCardData[] }>('/orders');
    setOrders(r.orders);
  }

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready]);

  async function setStatus(id: string, status: string) {
    await adminSend(`/orders/${id}/status`, 'PATCH', { status });
    await load();
  }

  function startEdit(o: AdminOrderCardData) {
    setEditingId(o.id);
    setMinDays(o.estimated_delivery_min_days || 3);
    setMaxDays(o.estimated_delivery_max_days || 8);
  }

  async function saveEstimate(id: string) {
    setBusy(true);
    try {
      await adminSend(`/orders/${id}/delivery-estimate`, 'PATCH', {
        estimated_delivery_min_days: minDays,
        estimated_delivery_max_days: maxDays,
      });
      setEditingId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Orders">
      <AdminOrderCards
        orders={orders}
        emptyLabel="No orders yet."
        actions={(o) => (
          <>
            {editingId === o.id ? (
              <div className="admin-inline-form">
                <input
                  type="number"
                  min={1}
                  value={minDays}
                  onChange={(e) => setMinDays(Number(e.target.value))}
                  aria-label="Min delivery days"
                  style={{ width: 64 }}
                />
                <span>–</span>
                <input
                  type="number"
                  min={1}
                  value={maxDays}
                  onChange={(e) => setMaxDays(Number(e.target.value))}
                  aria-label="Max delivery days"
                  style={{ width: 64 }}
                />
                <span className="ds-caption">business days</span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void saveEstimate(o.id)}
                >
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => void setStatus(o.id, 'paid')}>
                  Mark paid
                </Button>
                <Button variant="ghost" size="sm" onClick={() => startEdit(o)}>
                  Edit estimate
                </Button>
              </>
            )}
          </>
        )}
      />
    </AdminShell>
  );
}
