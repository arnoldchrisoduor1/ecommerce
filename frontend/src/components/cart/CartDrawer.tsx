'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { useCart } from './CartProvider';
import { formatKes } from '@/lib/format';

export function CartDrawer() {
  const { cart, open, closeCart } = useCart();

  if (!open) return null;

  return (
    <div className="cart-drawer" data-testid="cart-drawer" role="dialog" aria-modal="true" aria-label="Cart">
      <button type="button" className="cart-drawer__scrim" aria-label="Close cart" onClick={closeCart} />
      <aside className="cart-drawer__panel">
        <header className="cart-drawer__header">
          <h2 className="ds-display ds-display--sm">Bag</h2>
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={closeCart}>
            Close
          </button>
        </header>

        {!cart || cart.items.length === 0 ? (
          <p className="ds-body cart-drawer__empty">Your bag is empty.</p>
        ) : (
          <ul className="cart-drawer__list">
            {cart.items.map((item) => (
              <li key={item.id} className="cart-drawer__item">
                <div>
                  <p className="ds-body--sm cart-drawer__name">{item.product_name}</p>
                  <p className="ds-caption">
                    {[item.size, item.color].filter(Boolean).join(' · ')}
                    {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
                  </p>
                </div>
                <p className="ds-body--sm">{formatKes(item.line_total)}</p>
              </li>
            ))}
          </ul>
        )}

        <footer className="cart-drawer__footer">
          <p className="ds-body cart-drawer__subtotal">
            Subtotal <strong>{formatKes(cart?.subtotal ?? 0)}</strong>
          </p>
          <Link href="/checkout" className="ds-btn ds-btn--primary ds-btn--lg" onClick={closeCart}>
            Checkout
          </Link>
          <Button variant="secondary" size="md" onClick={closeCart}>
            Continue shopping
          </Button>
        </footer>
      </aside>
    </div>
  );
}
