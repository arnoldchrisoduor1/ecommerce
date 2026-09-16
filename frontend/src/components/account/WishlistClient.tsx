'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { AccountEmpty, AccountShell } from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { apiGet, type ProductDetail } from '@/lib/api';
import { formatKes } from '@/lib/format';
import { notifyWishlistChanged } from '@/lib/account';

type WishItem = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  sale_price?: number | null;
  image_url?: string | null;
};

export function WishlistClient() {
  const { addToCart, openCart } = useCart();
  const { user, authFetch, ready } = useAuth();
  const [items, setItems] = useState<WishItem[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    try {
      const res = await authFetch<{ items: WishItem[] }>('/account/wishlist');
      setItems(res.items);
      setError('');
      notifyWishlistChanged(res.items.length);
    } catch {
      setError('Could not load wishlist');
    }
  }

  useEffect(() => {
    if (!ready || !user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  async function remove(id: string) {
    try {
      await authFetch(`/account/wishlist/${id}`, { method: 'DELETE' });
      setItems((prev) => {
        const next = prev.filter((p) => p.id !== id);
        notifyWishlistChanged(next.length);
        return next;
      });
    } catch {
      setError('Could not remove item');
    }
  }

  async function moveToCart(item: WishItem) {
    setBusyId(item.id);
    setError('');
    try {
      const detail = await apiGet<ProductDetail>(`/catalog/products/${item.slug}`);
      const variant =
        detail.variants.find((v) => v.stock_qty > 0) ?? detail.variants[0];
      if (!variant) {
        setError('This item has no available sizes right now');
        return;
      }
      await addToCart(variant.id, 1);
      await authFetch(`/account/wishlist/${item.id}`, { method: 'DELETE' });
      setItems((prev) => {
        const next = prev.filter((p) => p.id !== item.id);
        notifyWishlistChanged(next.length);
        return next;
      });
      openCart();
    } catch {
      setError('Could not move item to cart');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AccountShell title="Wishlist">
      {error ? (
        <p className="ds-caption account-card__alert" role="alert">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <AccountEmpty
          title="Your wishlist is empty"
          body="Save pieces you love from a product page — they’ll wait for you here."
          testId="wishlist-empty"
          icon={<HeartEmptyIcon />}
          action={
            <Link href="/shop" className="ds-btn ds-btn--primary ds-btn--sm">
              Explore the shop
            </Link>
          }
        />
      ) : (
        <ul className="account-wish-list" data-testid="wishlist-list">
          {items.map((p) => {
            const price = p.sale_price ?? p.base_price;
            return (
              <li
                key={p.id}
                className="account-card account-wish-card"
                data-testid="wishlist-item"
              >
                <Link href={`/product/${p.slug}`} className="account-wish-card__link">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url || '/media/product.svg'}
                    alt=""
                    className="account-wish-card__img"
                  />
                  <span className="account-wish-card__meta">
                    <span className="ds-display ds-display--sm">{p.name}</span>
                    <span className="ds-body">{formatKes(price)}</span>
                  </span>
                </Link>
                <div className="account-wish-card__actions">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busyId === p.id}
                    onClick={() => void moveToCart(p)}
                    data-testid="wishlist-move-cart"
                  >
                    {busyId === p.id ? 'Adding…' : 'Move to cart'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(p.id)}
                    data-testid="wishlist-remove"
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}

function HeartEmptyIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M32 50s-16-10-16-22a10 10 0 0 1 18-6 10 10 0 0 1 18 6c0 12-16 22-16 22z" />
    </svg>
  );
}
