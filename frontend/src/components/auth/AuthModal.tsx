'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import type { AuthUser } from '@/components/auth/AuthProvider';

type Props = {
  open: boolean;
  tab: 'login' | 'signup';
  onTabChange: (t: 'login' | 'signup') => void;
  onClose: () => void;
  onSuccess: (user: AuthUser, token: string, opts?: { suggest2fa?: boolean }) => void;
  suggest2fa: boolean;
  onSkip2fa: () => void;
  onEnable2fa: () => Promise<void>;
};

function strength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[Math.max(0, score - 1)] || 'Weak' };
}

export function AuthModal({
  open,
  tab,
  onTabChange,
  onClose,
  onSuccess,
  suggest2fa,
  onSkip2fa,
  onEnable2fa,
}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const meter = strength(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = tab === 'signup' ? '/api/auth/register' : '/api/auth/login';
      const body: Record<string, string> = { email, password };
      if (tab === 'signup' && fullName) body.full_name = fullName;
      if (need2fa && code) body.code = code;
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      if (data.two_factor_required) {
        setNeed2fa(true);
        setError('');
        return;
      }
      onSuccess(data.user as AuthUser, data.access_token as string, {
        suggest2fa: Boolean(data.suggest_2fa),
      });
      setNeed2fa(false);
      setCode('');
      setPassword('');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (suggest2fa) {
    return (
      <Modal open={open} onClose={onSkip2fa} title="Secure your account" data-testid="auth-2fa-suggest">
        <p className="ds-body">Add an extra layer of security to your account</p>
        <div className="auth-modal__actions">
          <Button type="button" variant="primary" onClick={() => void onEnable2fa()} data-testid="enable-2fa">
            Enable two-step verification
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip2fa} data-testid="skip-2fa">
            Maybe later
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tab === 'signup' ? 'Create account' : 'Sign in'}
      data-testid="auth-modal"
    >
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          className={`auth-tabs__btn${tab === 'login' ? ' is-active' : ''}`}
          onClick={() => {
            onTabChange('login');
            setNeed2fa(false);
            setError('');
          }}
        >
          Login
        </button>
        <button
          type="button"
          className={`auth-tabs__btn${tab === 'signup' ? ' is-active' : ''}`}
          onClick={() => {
            onTabChange('signup');
            setNeed2fa(false);
            setError('');
          }}
        >
          Create account
        </button>
      </div>
      <form className="auth-form" onSubmit={submit} data-testid="auth-form">
        {tab === 'signup' ? (
          <label className="auth-field">
            <span className="ds-label">Name</span>
            <input
              className="auth-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="auth-field">
          <span className="ds-label">Email</span>
          <input
            className="auth-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            data-testid="auth-email"
          />
        </label>
        <label className="auth-field">
          <span className="ds-label">Password</span>
          <div className="auth-pass-row">
            <input
              className="auth-input"
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              data-testid="auth-password"
            />
            <button type="button" className="auth-show-pass" onClick={() => setShowPass((v) => !v)}>
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        {tab === 'signup' && password ? (
          <div className="auth-strength" data-testid="password-strength">
            <div className="auth-strength__track">
              <span style={{ width: `${(meter.score / 4) * 100}%` }} />
            </div>
            <p className="ds-caption">{meter.label}</p>
          </div>
        ) : null}
        {need2fa ? (
          <label className="auth-field">
            <span className="ds-label">Verification code</span>
            <input
              className="auth-input"
              inputMode="numeric"
              maxLength={5}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              data-testid="auth-2fa-code"
            />
          </label>
        ) : null}
        {error ? (
          <p className="auth-error" data-testid="auth-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy} data-testid="auth-submit">
          {busy ? 'Please wait…' : tab === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </Modal>
  );
}
