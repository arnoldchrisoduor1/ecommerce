'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { AccountShell } from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet, apiSend } from '@/lib/api';
import { accountQuery, setAccountPhone } from '@/lib/account';

type Address = {
  id: string;
  label?: string | null;
  line1: string;
  city: string;
  phone: string;
  is_default: boolean;
};

export function AddressesClient() {
  const { sessionId } = useCart();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('0712345678');
  const [label, setLabel] = useState('home');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!sessionId) return;
    try {
      const res = await apiGet<{ addresses: Address[] }>(
        `/account/addresses${accountQuery(sessionId)}`,
      );
      setAddresses(res.addresses);
    } catch {
      setAddresses([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      await apiSend('/account/addresses', 'POST', {
        session_id: sessionId,
        line1,
        city,
        phone,
        label,
        is_default: addresses.length === 0,
      });
      setAccountPhone(phone);
      setLine1('');
      await load();
    } catch {
      setError('Could not save address');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell title="Saved addresses">
      <ul className="account__list" data-testid="address-list">
        {addresses.map((a) => (
          <li key={a.id} className="account__row" data-testid="address-item">
            <p className="ds-label">{a.label || 'Address'}</p>
            <p className="ds-body">
              {a.line1}, {a.city}
            </p>
            <p className="ds-caption">{a.phone}</p>
          </li>
        ))}
      </ul>

      <form className="account__form" onSubmit={(e) => void onSubmit(e)}>
        <h2 className="ds-display ds-display--sm">Add address</h2>
        <label className="shop__control">
          <span className="ds-label">Label</span>
          <input className="shop__select" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="shop__control">
          <span className="ds-label">Line 1</span>
          <input
            className="shop__select"
            required
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            data-testid="address-form-line1"
          />
        </label>
        <label className="shop__control">
          <span className="ds-label">City</span>
          <input
            className="shop__select"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            data-testid="address-form-city"
          />
        </label>
        <label className="shop__control">
          <span className="ds-label">Phone</span>
          <input
            className="shop__select"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="address-form-phone"
          />
        </label>
        {error ? (
          <p className="ds-caption" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="address-form-submit">
          Save address
        </Button>
      </form>
    </AccountShell>
  );
}
