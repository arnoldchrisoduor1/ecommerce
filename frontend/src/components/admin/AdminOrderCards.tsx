'use client';

import type { ReactNode } from 'react';
import { formatKes } from '@/lib/format';

export type AdminOrderItem = {
  id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url?: string | null;
  size?: string | null;
  color?: string | null;
};

export type AdminOrderCardData = {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  payment_status: string;
  payment_method?: string | null;
  discount_code?: string | null;
  created_at: string;
  estimated_delivery_min_days: number;
  estimated_delivery_max_days: number;
  estimated_delivery_label: string;
  shipping_address?: {
    line1?: string;
    city?: string;
    phone?: string;
    [key: string]: unknown;
  } | null;
  items: AdminOrderItem[];
};

function formatShipTo(addr: AdminOrderCardData['shipping_address']): string {
  if (!addr) return '—';
  const parts = [addr.line1, addr.city].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function AdminOrderCards({
  orders,
  emptyLabel = 'No orders yet.',
  actions,
}: {
  orders: AdminOrderCardData[];
  emptyLabel?: string;
  actions?: (order: AdminOrderCardData) => ReactNode;
}) {
  if (orders.length === 0) {
    return <p className="ds-body">{emptyLabel}</p>;
  }

  return (
    <div className="admin-order-list">
      {orders.map((o) => (
        <article key={o.id} className="admin-order-card" data-testid="admin-order-card">
          <header className="admin-order-card__head">
            <div>
              <p className="ds-label">Order ID</p>
              <p className="admin-order-card__id ds-body" data-testid="admin-order-id">
                {o.id}
              </p>
              <p className="ds-caption">{formatWhen(o.created_at)}</p>
            </div>
            <div className="admin-order-card__meta">
              <span className="admin-order-card__pill">{o.status}</span>
              <span className="admin-order-card__pill">{o.payment_status}</span>
              {o.payment_method ? (
                <span className="admin-order-card__pill">{o.payment_method}</span>
              ) : null}
            </div>
          </header>

          <div className="admin-order-card__grid">
            <div>
              <p className="ds-label">Ship to</p>
              <p className="ds-body" data-testid="admin-order-location">
                {formatShipTo(o.shipping_address)}
              </p>
              {o.shipping_address?.phone ? (
                <p className="ds-caption">{o.shipping_address.phone}</p>
              ) : null}
            </div>
            <div>
              <p className="ds-label">Delivery estimate</p>
              <p className="ds-body" data-testid="admin-order-estimate">
                {o.estimated_delivery_label ||
                  `${o.estimated_delivery_min_days}–${o.estimated_delivery_max_days} business days`}
              </p>
            </div>
            <div>
              <p className="ds-label">Total</p>
              <p className="ds-body">
                <strong>{formatKes(o.total)}</strong>
              </p>
              <p className="ds-caption">
                Subtotal {formatKes(o.subtotal)} · Delivery {formatKes(o.delivery_fee)}
                {o.discount_amount > 0
                  ? ` · Discount −${formatKes(o.discount_amount)}${o.discount_code ? ` (${o.discount_code})` : ''}`
                  : ''}
              </p>
            </div>
          </div>

          <ul className="admin-order-items">
            {(o.items || []).map((item) => (
              <li key={item.id} className="admin-order-item">
                <div className="admin-order-item__media">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" />
                  ) : (
                    <span className="admin-order-item__placeholder" aria-hidden />
                  )}
                </div>
                <div className="admin-order-item__body">
                  <p className="ds-body admin-order-item__name">{item.product_name}</p>
                  <p className="ds-caption">
                    {[item.sku, item.size, item.color].filter(Boolean).join(' · ')}
                    {` · Qty ${item.quantity}`}
                  </p>
                </div>
                <div className="admin-order-item__price">
                  <p className="ds-body">{formatKes(item.line_total)}</p>
                  <p className="ds-caption">{formatKes(item.unit_price)} each</p>
                </div>
              </li>
            ))}
          </ul>

          {actions ? <div className="admin-order-card__actions">{actions(o)}</div> : null}
        </article>
      ))}
    </div>
  );
}
