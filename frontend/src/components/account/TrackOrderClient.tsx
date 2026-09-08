'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui';
import { AccountShell } from '@/components/account/AccountShell';
import { apiGet } from '@/lib/api';
import { formatKes } from '@/lib/format';
import { getAccountPhone, setAccountPhone } from '@/lib/account';

type Tracked = {
  id: string;
  status: string;
  payment_status: string;
  total: number;
  items: { product_name: string; quantity: number }[];
  shipping_address: { line1?: string; city?: string };
};

export function TrackOrderClient() {
  const [orderId, setOrderId] = useState('');
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' ? getAccountPhone() || '0712345678' : '0712345678',
  );
  const [order, setOrder] = useState<Tracked | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOrder(null);
    try {
      setAccountPhone(phone);
      const q = new URLSearchParams({
        order_id: orderId.trim(),
        phone: phone.trim(),
      });
      const res = await apiGet<Tracked>(`/orders/track?${q.toString()}`);
      setOrder(res);
    } catch {
      setError('Order not found — check ID and phone');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell title="Track an order">
      <form className="account__form" onSubmit={(e) => void onSubmit(e)} data-testid="track-order-form">
        <p className="ds-body">No account needed — use your order ID and checkout phone.</p>
        <label className="shop__control">
          <span className="ds-label">Order ID</span>
          <input
            className="shop__select"
            required
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            data-testid="track-order-id"
          />
        </label>
        <label className="shop__control">
          <span className="ds-label">Phone</span>
          <input
            className="shop__select"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="track-order-phone"
          />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="track-order-submit">
          Track
        </Button>
      </form>

      {error ? (
        <p className="ds-caption" role="alert">
          {error}
        </p>
      ) : null}

      {order ? (
        <div className="account__detail" data-testid="track-order-result">
          <p className="ds-label" data-testid="track-order-status">
            {order.status}
          </p>
          <p className="ds-body">
            Payment {order.payment_status} · {formatKes(order.total)}
          </p>
          <ul className="account__list">
            {order.items?.map((it, i) => (
              <li key={i} className="ds-body">
                {it.product_name} × {it.quantity}
              </li>
            ))}
          </ul>
          {order.shipping_address ? (
            <p className="ds-caption">
              Ship to {order.shipping_address.line1}, {order.shipping_address.city}
            </p>
          ) : null}
        </div>
      ) : null}
    </AccountShell>
  );
}
