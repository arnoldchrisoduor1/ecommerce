'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

type Purchase = {
  customer_name: string;
  product_name: string;
  product_slug: string;
  purchased_at: string;
};

export function PurchaseTicker() {
  const [items, setItems] = useState<Purchase[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiGet<{ purchases: Purchase[] }>(
          '/activity/recent-purchases?limit=8',
        );
        if (!cancelled && res.purchases?.length) {
          setItems(res.purchases);
          setVisible(true);
        }
      } catch {
        /* optional ambient */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
      setVisible(true);
    }, 6000);
    return () => window.clearInterval(id);
  }, [items.length]);

  if (!items.length || !visible) return null;
  const item = items[index];

  return (
    <aside
      className="purchase-ticker"
      data-testid="purchase-ticker"
      aria-live="polite"
    >
      <p className="ds-caption purchase-ticker__text">
        <strong>{item.customer_name}</strong> bought {item.product_name}
      </p>
      <button
        type="button"
        className="purchase-ticker__close"
        aria-label="Dismiss"
        onClick={() => setVisible(false)}
      >
        ×
      </button>
    </aside>
  );
}
