'use client';

import { useEffect, useState } from 'react';
import { AccountShell } from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet } from '@/lib/api';
import { formatKes } from '@/lib/format';
import { accountQuery, getAccountPhone } from '@/lib/account';

type OrderRow = {
  id: string;
  status: string;
  total: number;
  payment_status: string;
  created_at: string;
};

type OrderDetail = OrderRow & {
  items: { product_name: string; quantity: number; unit_price: number }[];
  shipping_address: { line1?: string; city?: string; phone?: string };
};

export function OrdersClient() {
  const { sessionId } = useCart();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const phone = getAccountPhone() || '0712345678';
    let cancelled = false;
    async function load() {
      try {
        const res = await apiGet<{ orders: OrderRow[] }>(
          `/account/orders${accountQuery(sessionId, { phone })}`,
        );
        if (!cancelled) setOrders(res.orders);
      } catch {
        if (!cancelled) {
          setOrders([]);
          setError('Could not load orders');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function openOrder(id: string) {
    const phone = getAccountPhone() || '0712345678';
    try {
      const detail = await apiGet<OrderDetail>(
        `/account/orders/${id}${accountQuery(sessionId, { phone })}`,
      );
      setSelected(detail);
    } catch {
      setError('Could not load order');
    }
  }

  return (
    <AccountShell title="Order history">
      {error ? (
        <p className="ds-caption" role="alert">
          {error}
        </p>
      ) : null}
      {orders.length === 0 ? (
        <p className="ds-body">No orders found. Complete checkout with your saved phone.</p>
      ) : (
        <ul className="account__list" data-testid="order-history-list">
          {orders.map((o) => (
            <li key={o.id} className="account__row">
              <button
                type="button"
                className="account__order-btn"
                data-testid="order-history-item"
                onClick={() => void openOrder(o.id)}
              >
                <span className="ds-label">{o.status}</span>
                <span className="ds-body">
                  {o.id.slice(0, 8)} · {formatKes(o.total)}
                </span>
                <span className="ds-caption">
                  {new Date(o.created_at).toLocaleDateString('en-KE')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="account__detail" data-testid="order-history-detail">
          <h2 className="ds-display ds-display--sm">Order {selected.id.slice(0, 8)}</h2>
          <p className="ds-body" data-testid="order-status">
            Status: <strong>{selected.status}</strong> · Payment:{' '}
            {selected.payment_status}
          </p>
          <ul className="account__list">
            {selected.items?.map((it, i) => (
              <li key={i} className="ds-body">
                {it.product_name} × {it.quantity} — {formatKes(it.unit_price)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AccountShell>
  );
}
