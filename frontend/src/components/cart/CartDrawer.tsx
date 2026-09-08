'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { useCart, freeDeliveryThreshold } from './CartProvider';
import { formatKes } from '@/lib/format';

type Props = {
  /** Full-page cart uses same line UI without drawer chrome */
  embedded?: boolean;
};

export function CartContents({ embedded = false }: Props) {
  const { cart, updateQuantity, closeCart } = useCart();
  const threshold = freeDeliveryThreshold();
  const subtotal = cart?.subtotal ?? 0;
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, (subtotal / threshold) * 100);

  return (
    <>
      {!cart || cart.items.length === 0 ? (
        <p className="ds-body cart-drawer__empty">Your bag is empty.</p>
      ) : (
        <ul className="cart-drawer__list">
          {cart.items.map((item) => (
            <li key={item.id} className="cart-drawer__item">
              <div className="cart-drawer__item-main">
                <p className="ds-body--sm cart-drawer__name">{item.product_name}</p>
                <p className="ds-caption">
                  {[item.size, item.color].filter(Boolean).join(' · ')}
                </p>
                <div className="cart-qty">
                  <button
                    type="button"
                    className="cart-qty__btn"
                    data-testid="cart-item-decrement"
                    aria-label="Decrease quantity"
                    disabled={item.quantity <= 1}
                    onClick={() => void updateQuantity(item.id, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="ds-body--sm cart-qty__value">{item.quantity}</span>
                  <button
                    type="button"
                    className="cart-qty__btn"
                    data-testid="cart-item-increment"
                    aria-label="Increase quantity"
                    onClick={() => void updateQuantity(item.id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="ds-body--sm">{formatKes(item.line_total)}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="cart-delivery" data-testid="free-delivery-bar">
        <div className="cart-delivery__track" aria-hidden="true">
          <div className="cart-delivery__fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="ds-caption">
          {remaining > 0
            ? `${formatKes(remaining)} away from free delivery`
            : 'You have free delivery'}
        </p>
      </div>

      <footer className="cart-drawer__footer">
        <p className="ds-body cart-drawer__subtotal">
          Subtotal{' '}
          <strong data-testid="cart-subtotal">{formatKes(subtotal)}</strong>
        </p>
        <Link
          href="/checkout"
          className="ds-btn ds-btn--primary ds-btn--lg"
          onClick={() => {
            if (!embedded) closeCart();
          }}
        >
          Checkout
        </Link>
        {!embedded ? (
          <Button variant="secondary" size="md" onClick={closeCart}>
            Continue shopping
          </Button>
        ) : (
          <Link href="/shop" className="ds-btn ds-btn--secondary ds-btn--md">
            Continue shopping
          </Link>
        )}
      </footer>
    </>
  );
}

export function CartDrawer() {
  const { open, closeCart } = useCart();

  if (!open) return null;

  return (
    <div
      className="cart-drawer"
      data-testid="cart-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Cart"
    >
      <button
        type="button"
        className="cart-drawer__scrim"
        aria-label="Close cart"
        onClick={closeCart}
      />
      <aside className="cart-drawer__panel">
        <header className="cart-drawer__header">
          <h2 className="ds-display ds-display--sm">Bag</h2>
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            onClick={closeCart}
          >
            Close
          </button>
        </header>
        <CartContents />
      </aside>
    </div>
  );
}
