'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui';
import { useAuth } from '@/components/auth/AuthProvider';

export function VerifyCodeClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { accessToken, setSession, showToast } = useAuth();
  const purpose = params.get('purpose') || 'email_verify';
  const emailParam = params.get('email') || '';
  const [digits, setDigits] = useState(['', '', '', '', '']);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  function setDigit(i: number, val: string) {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError('');
    if (v && i < 4) refs.current[i + 1]?.focus();
    if (v && i === 4 && next.every((d) => d)) {
      void submitCode(next.join(''));
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (text.length === 5) {
      e.preventDefault();
      const next = text.split('');
      setDigits(next);
      void submitCode(text);
    }
  }

  async function submitCode(code: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ purpose, code, email: emailParam || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid code');
        setDigits(['', '', '', '', '']);
        refs.current[0]?.focus();
        return;
      }
      if (data.user && accessToken) setSession(data.user, accessToken);
      showToast('Verified');
      router.push('/account');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    await fetch('/api/auth/resend-code', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ purpose, email: emailParam || undefined }),
    });
    setCooldown(60);
    showToast('Code sent');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submitCode(digits.join(''));
  }

  return (
    <div className="auth-page" data-testid="verify-page">
      <h1 className="ds-display ds-display--sm">Enter verification code</h1>
      <p className="ds-body">We sent a 5-digit code{emailParam ? ` to ${emailParam}` : ''}.</p>
      <form className="verify-form" onSubmit={onSubmit} onPaste={onPaste}>
        <div className="verify-digits">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="verify-digit"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) {
                  refs.current[i - 1]?.focus();
                }
              }}
              data-testid={`verify-digit-${i}`}
            />
          ))}
        </div>
        {error ? (
          <p className="auth-error" data-testid="verify-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy || digits.some((d) => !d)}>
          Verify
        </Button>
        <Button type="button" variant="ghost" disabled={cooldown > 0} onClick={() => void resend()}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </form>
    </div>
  );
}
