'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { AccountShell } from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet, apiSend } from '@/lib/api';
import { formatKes } from '@/lib/format';
import { accountQuery } from '@/lib/account';

type WishItem = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  sale_price?: number | null;
  image_url?: string | null;
};

export function WishlistClient() {
  const { sessionId } = useCart();
  const [items, setItems] = useState<WishItem[]>([]);
  const [error, setError] = useState('');

  async function load() {
    if (!sessionId) return;
    try {
      const res = await apiGet<{ items: WishItem[] }>(
        `/account/wishlist${accountQuery(sessionId)}`,
      );
      setItems(res.items);
      setError('');
    } catch {
      setError('Could not load wishlist');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function remove(id: string) {
    try {
      await apiSend(`/account/wishlist/${id}${accountQuery(sessionId)}`, 'DELETE');
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError('Could not remove item');
    }
  }

  return (
    <AccountShell title="Wishlist">
      {error ? (
        <p className="ds-caption" role="alert">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="ds-body" data-testid="wishlist-empty">
          Nothing saved yet. Tap Save on a product page.
        </p>
      ) : (
        <ul className="account__list" data-testid="wishlist-list">
          {items.map((p) => (
            <li key={p.id} className="account__wish" data-testid="wishlist-item">
              <Link href={`/product/${p.slug}`} className="account__wish-link">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image_url || '/media/product-placeholder.svg'}
                  alt=""
                  className="account__wish-img"
                />
                <span>
                  <span className="ds-display ds-display--sm">{p.name}</span>
                  <span className="ds-body">
                    {formatKes(p.sale_price ?? p.base_price)}
                  </span>
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(p.id)}
                data-testid="wishlist-remove"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
