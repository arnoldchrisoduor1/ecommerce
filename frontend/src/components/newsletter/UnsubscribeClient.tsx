'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui';

export function UnsubscribeClient() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing unsubscribe token.');
      return;
    }
    let cancelled = false;
    async function run() {
      setStatus('loading');
      try {
        const res = await fetch(
          `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
          { method: 'POST', headers: { Accept: 'application/json' } },
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
        if (cancelled) return;
        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Could not unsubscribe.');
          return;
        }
        setStatus('ok');
        setMessage('You have been unsubscribed from our newsletter.');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Network error. Please try again.');
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="unsubscribe-page" data-testid="unsubscribe-page">
      <h1 className="ds-display ds-display--sm">Unsubscribe</h1>
      {status === 'loading' || status === 'idle' ? (
        <p className="ds-body">Updating your preferences…</p>
      ) : (
        <p className="ds-body" data-testid="unsubscribe-message">
          {message}
        </p>
      )}
      {status === 'error' && token ? (
        <Button
          type="button"
          variant="ghost"
          data-testid="unsubscribe-retry"
          onClick={() => {
            setStatus('idle');
            // remount effect by toggling — force reload
            window.location.reload();
          }}
        >
          Try again
        </Button>
      ) : null}
      {status === 'ok' ? (
        <p className="ds-caption">You can close this page.</p>
      ) : null}
    </div>
  );
}
