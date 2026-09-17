'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import {
  AccountEmpty,
  AccountShell,
  OrderStatusPill,
} from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { useAuth } from '@/components/auth/AuthProvider';
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
  const { user, authFetch } = useAuth();
  const { sessionId } = useCart();
  const [phone, setPhone] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [saved, setSaved] = useState(false);

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
    setSaved(true);
  }

  return (
    <AccountShell title="Your account">
      <section className="account-card" aria-labelledby="account-details">
        <h2 id="account-details" className="ds-display ds-display--sm">
          Contact
        </h2>
        <p className="ds-body account-card__lede">
          We use your phone to find orders placed as a guest.
        </p>
        <form className="account__form" onSubmit={onSave}>
          <label className="shop__control">
            <span className="ds-label">Phone</span>
            <input
              className="account-input"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setSaved(false);
              }}
              data-testid="account-phone-input"
            />
          </label>
          <Button type="submit" variant="primary" size="md">
            Save phone
          </Button>
          {saved ? (
            <p className="ds-caption account-card__hint" role="status">
              Saved
            </p>
          ) : null}
        </form>
      </section>

      <section className="account-card" id="security" aria-labelledby="account-security">
        <h2 id="account-security" className="ds-display ds-display--sm">
          Security
        </h2>
        <p className="ds-body account-card__lede">
          Two-step verification protects sensitive features like AI try-on.
        </p>
        <p className="ds-caption">
          Email verified: {user?.email_verified ? 'Yes' : 'No'}
        </p>
        <p className="ds-caption">
          Two-step verification: {user?.two_factor_enabled ? 'Enabled' : 'Not enabled'}
        </p>
        {!user?.two_factor_enabled ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="account-enable-2fa"
            onClick={() => {
              void (async () => {
                await authFetch('/auth/two-factor', {
                  method: 'POST',
                  body: JSON.stringify({ enabled: true }),
                });
                window.location.href = `/verify?purpose=two_factor&email=${encodeURIComponent(user?.email || '')}`;
              })();
            }}
          >
            Enable two-step verification
          </Button>
        ) : null}
      </section>

      <section className="account-card" aria-labelledby="recent-orders">
        <h2 id="recent-orders" className="ds-display ds-display--sm">
          Recent orders
        </h2>
        {orders.length === 0 ? (
          <AccountEmpty
            title="No orders yet"
            body="When you check out, your latest orders will show up here."
            testId="account-orders-empty"
            icon={<BagEmptyIcon />}
            action={
              <Link href="/shop" className="ds-btn ds-btn--secondary ds-btn--sm">
                Browse shop
              </Link>
            }
          />
        ) : (
          <ul className="account__list" data-testid="account-orders-preview">
            {orders.slice(0, 3).map((o) => (
              <li key={o.id} className="account-order-row">
                <div className="account-order-row__meta">
                  <OrderStatusPill status={o.status} />
                  <span className="ds-caption">
                    {new Date(o.created_at).toLocaleDateString('en-KE')}
                  </span>
                </div>
                <Link href="/account/orders" className="ds-body account-order-row__link">
                  #{o.id.slice(0, 8).toUpperCase()} · {formatKes(o.total)}
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

function BagEmptyIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 22h28l-2 28H20L18 22z" />
      <path d="M26 22a6 6 0 0 1 12 0" />
      <path d="M24 34h16" strokeLinecap="round" />
    </svg>
  );
}
