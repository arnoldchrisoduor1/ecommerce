'use client';

import { useEffect, useState } from 'react';
import { CartContents } from '@/components/cart/CartDrawer';
import { useCart } from '@/components/cart/CartProvider';

export function CartPageClient() {
  const { ensureCartWithItem, cart } = useCart();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        await ensureCartWithItem();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load cart');
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [ensureCartWithItem]);

  if (error) {
    return <p className="ds-body email-capture__error">{error}</p>;
  }
  if (!ready || !cart) {
    return <p className="ds-body">Loading bag…</p>;
  }

  return (
    <div className="cart-page">
      <h1 className="ds-display ds-display--lg">Your bag</h1>
      <CartContents embedded />
    </div>
  );
}
