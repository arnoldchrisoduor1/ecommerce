'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet, apiSend } from '@/lib/api';
import { formatKes } from '@/lib/format';
import { setAccountPhone } from '@/lib/account';

type Step = 'delivery' | 'payment' | 'confirm';

type Quote = {
  delivery_fee: number;
  estimated_days: number;
  estimated_delivery_min_days?: number;
  estimated_delivery_max_days?: number;
  estimated_delivery_label?: string;
  courier: string;
};

type Order = {
  id: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  status: string;
  estimated_delivery_label?: string;
};

export function CheckoutClient() {
  const router = useRouter();
  const { cart, cartId, ensureCartWithItem, refreshCart } = useCart();
  const [step, setStep] = useState<Step>('delivery');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('0712345678');
  const [payment, setPayment] = useState('mpesa');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promo, setPromo] = useState('');
  const [discountCode, setDiscountCode] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        await ensureCartWithItem();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not prepare checkout');
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [ensureCartWithItem]);

  const address = useMemo(
    () => ({ line1, city, phone }),
    [line1, city, phone],
  );

  const subtotal = cart?.subtotal ?? 0;
  const deliveryFee = quote?.delivery_fee ?? 0;
  const total = Math.max(0, subtotal + deliveryFee - discountAmount);
  const promoApplied = Boolean(discountCode);
  const deliveryLabel =
    quote?.estimated_delivery_label ||
    (quote?.estimated_days ? `${quote.estimated_days} business days` : '3–8 business days');

  async function applyPromo() {
    setError('');
    const code = promo.trim().toUpperCase();
    if (!code) return;
    try {
      const d = await apiGet<{
        code: string;
        type: string;
        value: number;
        is_active: boolean;
      }>(`/discounts/${code}`);
      if (!d.is_active) {
        setError('Promo is not active');
        return;
      }
      const amount =
        d.type === 'percentage' ? (subtotal * d.value) / 100 : d.value;
      setDiscountCode(d.code);
      setDiscountAmount(amount);
      setPromo(d.code);
    } catch {
      setError('Invalid promo code');
      setDiscountCode(null);
      setDiscountAmount(0);
    }
  }

  async function goPayment(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!line1.trim() || !city.trim()) {
      setError('Address and city are required');
      return;
    }
    const id = cartId || localStorage.getItem('studio_cart_id');
    if (!id) {
      setError('Cart missing');
      return;
    }
    setBusy(true);
    try {
      const q = await apiSend<Quote>('/checkout/quote', 'POST', {
        cart_id: id,
        shipping_address: { ...address, phone: phone || '0712345678' },
      });
      setQuote(q);
      setStep('payment');
    } catch {
      setError('Could not get delivery quote');
    } finally {
      setBusy(false);
    }
  }

  function goConfirm() {
    setError('');
    setStep('confirm');
  }

  async function placeOrder() {
    setError('');
    const id = cartId || localStorage.getItem('studio_cart_id');
    if (!id) {
      setError('Cart missing');
      return;
    }
    setBusy(true);
    try {
      const created = await apiSend<Order>('/checkout/', 'POST', {
        cart_id: id,
        shipping_address: { ...address, phone: phone || '0712345678' },
        payment_method: payment,
        discount_code: discountCode,
        delivery_fee: quote?.delivery_fee,
      });
      setOrder(created);
      setAccountPhone(phone || '0712345678');
      localStorage.removeItem('studio_cart_id');
      await refreshCart();
    } catch {
      setError('Could not place order — check stock and try again');
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    return (
      <div className="checkout" data-testid="order-confirmation">
        <h1 className="ds-display ds-display--lg">Order confirmed</h1>
        <p className="ds-body">
          Order <strong>{order.id.slice(0, 8)}</strong> · {formatKes(order.total)}
        </p>
        <p className="ds-caption">
          Payment: {payment} · Status: {order.status}
        </p>
        <p className="ds-caption" data-testid="confirmed-delivery-estimate">
          Estimated delivery: {order.estimated_delivery_label || deliveryLabel}
        </p>
        <Button variant="primary" size="lg" onClick={() => router.push('/shop')}>
          Continue shopping
        </Button>
      </div>
    );
  }

  if (!ready) {
    return <p className="ds-body">{error || 'Preparing checkout…'}</p>;
  }

  return (
    <div className="checkout">
      <h1 className="ds-display ds-display--lg">Checkout</h1>
      <ol className="checkout__steps ds-label">
        <li className={step === 'delivery' ? 'is-active' : ''}>Delivery</li>
        <li className={step === 'payment' ? 'is-active' : ''}>Payment</li>
        <li className={step === 'confirm' ? 'is-active' : ''}>Confirm</li>
      </ol>

      <div className="checkout__promo">
        <input
          className="checkout__input ds-body"
          data-testid="promo-code-input"
          placeholder="Promo code"
          value={promo}
          onChange={(e) => {
            setPromo(e.target.value);
            if (discountCode) {
              setDiscountCode(null);
              setDiscountAmount(0);
            }
          }}
          disabled={promoApplied}
          readOnly={promoApplied}
        />
        <Button
          type="button"
          variant="secondary"
          size="md"
          data-testid="promo-code-apply"
          onClick={() => void applyPromo()}
          disabled={promoApplied || busy}
        >
          {promoApplied ? 'Applied' : 'Apply'}
        </Button>
        {discountAmount > 0 ? (
          <p className="ds-body" data-testid="discount-line">
            Discount ({discountCode}) −{formatKes(discountAmount)}
          </p>
        ) : null}
      </div>

      {step === 'delivery' ? (
        <form className="checkout__form" onSubmit={(e) => void goPayment(e)}>
          <label className="checkout__field">
            <span className="ds-label">Address</span>
            <input
              className="checkout__input ds-body"
              data-testid="address-line1"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              autoComplete="address-line1"
              required
            />
          </label>
          <label className="checkout__field">
            <span className="ds-label">City</span>
            <input
              className="checkout__input ds-body"
              data-testid="address-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              required
            />
          </label>
          <label className="checkout__field">
            <span className="ds-label">Phone</span>
            <input
              className="checkout__input ds-body"
              data-testid="address-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            data-testid="checkout-next"
            disabled={busy}
          >
            Continue
          </Button>
        </form>
      ) : null}

      {step === 'payment' ? (
        <div className="checkout__form">
          <div className="checkout__quote" data-testid="delivery-quote">
            <p className="ds-body">
              {quote?.courier}: {formatKes(quote?.delivery_fee ?? 0)} · {deliveryLabel}
            </p>
          </div>
          <fieldset className="checkout__pay">
            <legend className="ds-label">Payment</legend>
            <button
              type="button"
              className={`checkout__pay-opt ${payment === 'mpesa' ? 'is-active' : ''}`}
              data-testid="payment-method-mpesa"
              onClick={() => setPayment('mpesa')}
            >
              M-Pesa
            </button>
            <button
              type="button"
              className={`checkout__pay-opt ${payment === 'card' ? 'is-active' : ''}`}
              data-testid="payment-method-card"
              onClick={() => setPayment('card')}
            >
              Card
            </button>
          </fieldset>
          <Button
            type="button"
            variant="primary"
            size="lg"
            data-testid="checkout-next"
            onClick={goConfirm}
          >
            Continue
          </Button>
        </div>
      ) : null}

      {step === 'confirm' ? (
        <div className="checkout__form">
          <div className="checkout__summary" data-testid="order-summary">
            <div className="checkout__ship" data-testid="confirm-location">
              <p className="ds-label">Delivery to</p>
              <p className="ds-body">
                {line1}
                {city ? `, ${city}` : ''}
              </p>
              {phone ? <p className="ds-caption">{phone}</p> : null}
            </div>
            <p className="ds-body" data-testid="confirm-delivery-estimate">
              Estimated delivery <strong>{deliveryLabel}</strong>
            </p>
            <p className="ds-body">
              Subtotal <strong>{formatKes(subtotal)}</strong>
            </p>
            <p className="ds-body">
              Delivery <strong>{formatKes(deliveryFee)}</strong>
            </p>
            {discountAmount > 0 ? (
              <p className="ds-body">
                Discount ({discountCode}) −{formatKes(discountAmount)}
              </p>
            ) : null}
            <p className="ds-display ds-display--sm">Total {formatKes(total)}</p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            data-testid="place-order"
            disabled={busy}
            onClick={() => void placeOrder()}
          >
            Place order
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="ds-caption email-capture__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
