'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet } from '@/lib/api';
import {
  accountQuery,
  WISHLIST_CHANGED_EVENT,
} from '@/lib/account';
import type { Category } from '@/lib/api';

type Props = {
  categories: Category[];
};

export function MainNav({ categories }: Props) {
  const { openCart, cart, sessionId } = useCart();
  const links = categories.slice(0, 6);
  const count = cart?.item_count ?? 0;
  const [wishCount, setWishCount] = useState(0);

  const refreshWishlistCount = useCallback(async () => {
    if (!sessionId) {
      setWishCount(0);
      return;
    }
    try {
      const res = await apiGet<{ items: unknown[] }>(
        `/account/wishlist${accountQuery(sessionId)}`,
      );
      setWishCount(res.items?.length ?? 0);
    } catch {
      /* keep prior count */
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshWishlistCount();
  }, [refreshWishlistCount]);

  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === 'number') {
        setWishCount(detail.count);
        return;
      }
      void refreshWishlistCount();
    }
    window.addEventListener(WISHLIST_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, onChanged);
  }, [refreshWishlistCount]);

  return (
    <header className="main-nav" data-testid="main-nav">
      <div className="main-nav__inner">
        <Link href="/" className="main-nav__brand ds-display ds-display--sm">
          Studio
        </Link>

        <nav className="main-nav__links" aria-label="Primary">
          <Link href="/shop" className="ds-label main-nav__link">
            Shop
          </Link>
          {links.map((c) => (
            <Link
              key={c.id}
              href={`/shop?category=${c.slug}`}
              className="ds-label main-nav__link"
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="main-nav__actions">
          <Link href="/account" className="main-nav__icon" aria-label="Account" data-testid="nav-account">
            <AccountIcon />
          </Link>
          <Link href="/search" className="main-nav__icon" aria-label="Search">
            <SearchIcon />
          </Link>
          <Link
            href="/wishlist"
            className="main-nav__icon"
            aria-label={wishCount ? `Wishlist, ${wishCount} items` : 'Wishlist'}
            data-testid="nav-wishlist"
          >
            <HeartIcon />
            {wishCount > 0 ? (
              <span className="main-nav__badge ds-caption" data-testid="nav-wishlist-count">
                {wishCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className="main-nav__icon main-nav__cart"
            aria-label={count ? `Cart, ${count} items` : 'Cart'}
            data-testid="nav-cart"
            onClick={openCart}
          >
            <BagIcon />
            {count > 0 ? (
              <span className="main-nav__badge ds-caption">{count}</span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20z" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  );
}
