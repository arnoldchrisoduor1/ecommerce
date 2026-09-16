'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AccountEmpty,
  AccountShell,
  OrderStatusPill,
} from '@/components/account/AccountShell';
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, OrderDetail>>({});
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

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

  async function toggleOrder(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    const phone = getAccountPhone() || '0712345678';
    setLoadingId(id);
    try {
      const detail = await apiGet<OrderDetail>(
        `/account/orders/${id}${accountQuery(sessionId, { phone })}`,
      );
      setDetails((prev) => ({ ...prev, [id]: detail }));
      setError('');
    } catch {
      setError('Could not load order');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <AccountShell title="Order history">
      {error ? (
        <p className="ds-caption account-card__alert" role="alert">
          {error}
        </p>
      ) : null}
      {orders.length === 0 ? (
        <AccountEmpty
          title="No orders yet"
          body="Complete checkout with your saved phone and your history will appear here."
          testId="orders-empty"
          icon={<ReceiptEmptyIcon />}
          action={
            <Link href="/shop" className="ds-btn ds-btn--secondary ds-btn--sm">
              Start shopping
            </Link>
          }
        />
      ) : (
        <ul className="account-order-list" data-testid="order-history-list">
          {orders.map((o) => {
            const expanded = openId === o.id;
            const detail = details[o.id];
            return (
              <li key={o.id} className="account-card account-order-card">
                <button
                  type="button"
                  className="account-order-card__toggle"
                  data-testid="order-history-item"
                  aria-expanded={expanded}
                  onClick={() => void toggleOrder(o.id)}
                >
                  <span className="account-order-card__top">
                    <OrderStatusPill status={o.status} />
                    <span className="ds-caption">
                      {new Date(o.created_at).toLocaleDateString('en-KE', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                  <span className="account-order-card__main">
                    <span className="ds-body account-order-card__num">
                      Order #{o.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="ds-display ds-display--sm">
                      {formatKes(o.total)}
                    </span>
                  </span>
                  <span className="ds-caption account-order-card__hint">
                    {expanded ? 'Hide items' : 'Show items'}
                  </span>
                </button>

                {expanded ? (
                  <div
                    className="account-order-card__detail"
                    data-testid="order-history-detail"
                  >
                    {loadingId === o.id && !detail ? (
                      <p className="ds-caption">Loading line items…</p>
                    ) : null}
                    {detail ? (
                      <>
                        <p className="ds-caption" data-testid="order-status">
                          Payment: {detail.payment_status}
                        </p>
                        <ul className="account-order-card__lines">
                          {detail.items?.map((it, i) => (
                            <li key={i} className="ds-body">
                              <span>
                                {it.product_name} × {it.quantity}
                              </span>
                              <span>{formatKes(it.unit_price)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}

function ReceiptEmptyIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 12h24v40l-4-3-4 3-4-3-4 3-4-3-4 3V12z" />
      <path d="M26 24h12M26 32h12M26 40h8" strokeLinecap="round" />
    </svg>
  );
}
