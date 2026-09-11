'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { AccountShell } from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet } from '@/lib/api';
import { formatKes } from '@/lib/format';
import {
  accountQuery,
  getAccountPhone,
  setAccountPhone,
} from '@/lib/account';

type OrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
};

export function AccountOverview() {
  const { sessionId } = useCart();
  const [phone, setPhone] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setPhone(getAccountPhone() || '0712345678');
  }, []);

  useEffect(() => {
    if (!phone && !sessionId) return;
    let cancelled = false;
    async function load() {
      try {
        const q = accountQuery(sessionId, { phone });
        const res = await apiGet<{ orders: OrderRow[] }>(`/account/orders${q}`);
        if (!cancelled) setOrders(res.orders);
      } catch {
        if (!cancelled) setOrders([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [phone, sessionId]);

  function onSave(e: FormEvent) {
    e.preventDefault();
    setAccountPhone(phone);
    setError('');
  }

  return (
    <AccountShell title="Your account">
      <form className="account__form" onSubmit={onSave}>
        <label className="shop__control">
          <span className="ds-label">Phone (looks up your orders)</span>
          <input
            className="shop__select"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="account-phone-input"
          />
        </label>
        <Button type="submit" variant="secondary" size="md">
          Save phone
        </Button>
      </form>
      {error ? <p className="ds-caption" role="alert">{error}</p> : null}

      <section className="account__section" aria-labelledby="recent-orders">
        <h2 id="recent-orders" className="ds-display ds-display--sm">
          Recent orders
        </h2>
        {orders.length === 0 ? (
          <p className="ds-body">No orders yet for this phone.</p>
        ) : (
          <ul className="account__list" data-testid="account-orders-preview">
            {orders.slice(0, 3).map((o) => (
              <li key={o.id} className="account__row">
                <Link href={`/account/orders`} className="ds-body">
                  {o.id.slice(0, 8)} · {o.status} · {formatKes(o.total)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/account/orders" className="ds-label account__more">
          View all orders
        </Link>
      </section>
    </AccountShell>
  );
}
