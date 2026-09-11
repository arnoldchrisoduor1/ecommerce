'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui';
import { AccountShell } from '@/components/account/AccountShell';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet, apiSend } from '@/lib/api';
import { formatKes } from '@/lib/format';

type GiftCard = {
  id: string;
  code: string;
  initial_balance: number;
  balance: number;
  status: string;
};

export function GiftCardsClient() {
  const { sessionId } = useCart();
  const [amount, setAmount] = useState('1000');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('100');
  const [card, setCard] = useState<GiftCard | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function purchase(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const g = await apiSend<GiftCard>('/gift-cards/purchase', 'POST', {
        amount: Number(amount),
        email: email || undefined,
      });
      setCard(g);
      setCode(g.code);
      setMessage(`Purchased ${g.code} — balance ${formatKes(g.balance)}`);
    } catch {
      setError('Purchase failed');
    } finally {
      setBusy(false);
    }
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const g = await apiGet<GiftCard>(`/gift-cards/${encodeURIComponent(code.trim())}`);
      setCard(g);
      setMessage(`Balance ${formatKes(g.balance)} (${g.status})`);
    } catch {
      setError('Gift card not found');
      setCard(null);
    }
  }

  async function redeem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const g = await apiSend<GiftCard>('/gift-cards/redeem', 'POST', {
        code: code.trim(),
        amount: Number(redeemAmount),
        session_id: sessionId || undefined,
      });
      setCard(g);
      setMessage(`Redeemed — remaining ${formatKes(g.balance)}`);
    } catch {
      setError('Redemption failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell title="Gift cards">
      <form className="account__form" onSubmit={(e) => void purchase(e)} data-testid="gift-card-purchase">
        <h2 className="ds-display ds-display--sm">Purchase</h2>
        <label className="shop__control">
          <span className="ds-label">Amount (KES)</span>
          <input
            className="shop__select"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="gift-card-amount"
          />
        </label>
        <label className="shop__control">
          <span className="ds-label">Email (optional)</span>
          <input className="shop__select" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={busy}>
          Buy gift card
        </Button>
      </form>

      <form className="account__form" onSubmit={(e) => void lookup(e)}>
        <h2 className="ds-display ds-display--sm">Check balance</h2>
        <label className="shop__control">
          <span className="ds-label">Code</span>
          <input
            className="shop__select"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="gift-card-code"
          />
        </label>
        <Button type="submit" variant="secondary" size="md">
          Look up
        </Button>
      </form>

      <form className="account__form" onSubmit={(e) => void redeem(e)} data-testid="gift-card-redeem">
        <h2 className="ds-display ds-display--sm">Redeem</h2>
        <label className="shop__control">
          <span className="ds-label">Amount</span>
          <input
            className="shop__select"
            value={redeemAmount}
            onChange={(e) => setRedeemAmount(e.target.value)}
          />
        </label>
        <Button type="submit" variant="accent" size="md" disabled={busy || !code}>
          Redeem
        </Button>
      </form>

      {message ? (
        <p className="ds-body" data-testid="gift-card-result">
          {message}
        </p>
      ) : null}
      {card ? (
        <p className="ds-caption" data-testid="gift-card-balance">
          {card.code}: {formatKes(card.balance)} / {formatKes(card.initial_balance)} · {card.status}
        </p>
      ) : null}
      {error ? (
        <p className="ds-caption" role="alert">
          {error}
        </p>
      ) : null}
    </AccountShell>
  );
}
