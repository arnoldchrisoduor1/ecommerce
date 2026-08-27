'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui';

type Props = {
  joinedCount?: number;
};

/**
 * Newsletter capture. No public subscribe endpoint exists yet (see
 * FRONTEND_TASKS 2.0) — success is local after client-side validation.
 */
export function EmailCapture({ joinedCount }: Props) {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  function submitEmail(raw: string) {
    setError('');
    const trimmed = raw.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email');
      return false;
    }
    setSuccess(true);
    return true;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    submitEmail(String(fd.get('email') ?? ''));
  }

  return (
    <section className="email-capture" aria-labelledby="email-heading">
      <div className="email-capture__inner">
        <h2 id="email-heading" className="ds-display ds-display--md">
          Join the list
        </h2>
        <p className="ds-body email-capture__copy">
          Early access to drops
          {joinedCount != null ? (
            <>
              {' '}
              — <span className="ds-label">{joinedCount.toLocaleString('en-KE')}</span> already
              joined
            </>
          ) : null}
        </p>

        {success ? (
          <p className="ds-body" data-testid="email-capture-success" role="status">
            You&apos;re on the list.
          </p>
        ) : (
          <form className="email-capture__form" onSubmit={onSubmit} noValidate>
            <label className="visually-hidden" htmlFor="email-capture-input">
              Email
            </label>
            <input
              id="email-capture-input"
              data-testid="email-capture-input"
              className="email-capture__input ds-body"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue=""
            />
            <Button type="submit" variant="primary" size="lg" data-testid="email-capture-submit">
              Subscribe
            </Button>
          </form>
        )}
        {error ? (
          <p className="ds-caption email-capture__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
