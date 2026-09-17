'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

type Props = {
  productId: string;
  productName: string;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
};

type Phase = 'idle' | 'loading' | 'result' | 'error' | 'blocked';

async function fetchTryOnStatus(): Promise<{ configured: boolean; mock_mode?: boolean }> {
  const res = await fetch('/api/tryon/status', { cache: 'no-store' });
  if (!res.ok) return { configured: false };
  return res.json() as Promise<{ configured: boolean; mock_mode?: boolean }>;
}

export function TryWithAI({
  productId,
  productName,
  autoOpen,
  onAutoOpenHandled,
}: Props) {
  const { user, ready, accessToken, requireAuth, authFetch } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    void fetchTryOnStatus().then((s) => setConfigured(s.configured));
  }, []);

  useEffect(() => {
    if (!autoOpen || !ready) return;
    if (!user) {
      requireAuth({ type: 'try_on', productId });
      onAutoOpenHandled?.();
      return;
    }
    inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onAutoOpenHandled?.();
  }, [autoOpen, ready, user, productId, requireAuth, onAutoOpenHandled]);

  const canTry =
    user?.email_verified && user.two_factor_enabled && configured === true;

  const onPickFile = useCallback(() => {
    if (!ready) return;
    if (!user) {
      requireAuth({ type: 'try_on', productId });
      return;
    }
    if (!user.email_verified || !user.two_factor_enabled) {
      setPhase('blocked');
      return;
    }
    if (configured !== true) {
      setPhase('error');
      setErrorMsg('AI try-on not connected');
      return;
    }
    inputRef.current?.click();
  }, [ready, user, configured, requireAuth, productId]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !accessToken) return;
      if (!file.type.startsWith('image/')) {
        setPhase('error');
        setErrorMsg('Please choose a photo (JPEG, PNG, or WebP).');
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        setPhase('error');
        setErrorMsg('Photo must be 4MB or smaller.');
        return;
      }
      setSelectedFile(file);
      setPhase('loading');
      setErrorMsg('');
      setResultUrl(null);

      try {
        const dataUrl = await readFileAsDataURL(file);
        const res = await fetch('/api/tryon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ product_id: productId, photo_base64: dataUrl }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          two_factor_required?: boolean;
          image_data_url?: string;
        };
        if (res.status === 403 && body.two_factor_required) {
          setPhase('blocked');
          return;
        }
        if (!res.ok) {
          setPhase('error');
          setErrorMsg(
            body.error === 'AI try-on not connected' || res.status === 503
              ? 'AI try-on not connected'
              : 'AI try-on not connected',
          );
          return;
        }
        if (!body.image_data_url) {
          setPhase('error');
          setErrorMsg('AI try-on not connected');
          return;
        }
        setResultUrl(body.image_data_url);
        setPhase('result');
      } catch {
        setPhase('error');
        setErrorMsg('AI try-on not connected');
      } finally {
        setSelectedFile(null);
      }
    },
    [accessToken, productId],
  );

  const downloadResult = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${productName.replace(/\s+/g, '-').toLowerCase()}-tryon.png`;
    a.click();
  }, [resultUrl, productName]);

  const startEnable2fa = useCallback(async () => {
    if (!user?.email) return;
    await authFetch('/auth/two-factor', {
      method: 'POST',
      body: JSON.stringify({ enabled: true }),
    });
    window.location.href = `/verify?purpose=two_factor&email=${encodeURIComponent(user.email)}`;
  }, [authFetch, user?.email]);

  return (
    <section className="try-on" data-testid="try-with-ai">
      <p className="ds-label try-on__label">Try with AI</p>
      <p className="ds-caption try-on__hint">
        Upload a photo to preview {productName} on you. Requires verified account with two-step
        verification.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        data-testid="try-on-file-input"
        onChange={(e) => void onFileChange(e)}
      />

      {phase === 'blocked' ? (
        <div className="try-on__blocked" role="alert" data-testid="try-on-2fa-block">
          <p className="ds-body--sm">
            Two-step verification is required for this feature.
          </p>
          <Link href="/account#security" className="ds-label try-on__link">
            Enable in your profile
          </Link>
          <button
            type="button"
            className="ds-btn ds-btn--secondary ds-btn--sm"
            onClick={() => void startEnable2fa()}
            data-testid="try-on-enable-2fa"
          >
            Set up two-step verification
          </button>
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div className="try-on__loading" data-testid="try-on-loading">
          <span className="try-on__spinner" aria-hidden="true" />
          <p className="ds-caption">Generating try-on… this may take a minute.</p>
          {selectedFile ? (
            <p className="ds-caption try-on__file">{selectedFile.name}</p>
          ) : null}
        </div>
      ) : null}

      {phase === 'error' ? (
        <p className="try-on__error ds-caption" role="alert" data-testid="try-on-error">
          {errorMsg}
        </p>
      ) : null}

      {phase === 'result' && resultUrl ? (
        <div className="try-on__result" data-testid="try-on-result">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt={`AI try-on preview for ${productName}`} className="try-on__preview" />
          <button
            type="button"
            className="ds-btn ds-btn--primary ds-btn--sm"
            data-testid="try-on-download"
            onClick={downloadResult}
          >
            Download
          </button>
        </div>
      ) : null}

      {phase !== 'loading' && phase !== 'result' ? (
        <button
          type="button"
          className="ds-btn ds-btn--secondary ds-btn--sm try-on__upload"
          data-testid="try-with-ai-trigger"
          disabled={configured === false}
          onClick={onPickFile}
        >
          {canTry ? 'Upload your photo' : 'Try with AI'}
        </button>
      ) : null}
    </section>
  );
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
