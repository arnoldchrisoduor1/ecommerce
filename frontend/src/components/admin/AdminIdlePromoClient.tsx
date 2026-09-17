'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminSend, adminUpload } from '@/lib/admin';
import { apiGet, type ContentBlock, type IdlePromoData, parseBlockData } from '@/lib/api';
import { Button } from '@/components/ui';

export function AdminIdlePromoClient() {
  const { ready, toast } = useAdminUi();
  const [enabled, setEnabled] = useState(true);
  const [idleSec, setIdleSec] = useState('20');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/home_idle_promo').then((block) => {
      const data = parseBlockData<IdlePromoData>(block.data);
      setEnabled(data.enabled !== false);
      setIdleSec(String(data.idle_seconds ?? 20));
      setText(data.text || '');
      setImageUrl(data.image_url || '');
      setButtonLabel(data.button_label || '');
      setButtonUrl(data.button_url || '');
    }).catch(() => {
      /* block may not exist yet */
    });
  }, [ready]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload: IdlePromoData = {
      enabled,
      idle_seconds: Number(idleSec) || 20,
      text: text.trim() || undefined,
      image_url: imageUrl.trim() || undefined,
      button_label: buttonLabel.trim() || undefined,
      button_url: buttonUrl.trim() || undefined,
    };
    try {
      await adminSend('/content/blocks/home_idle_promo', 'PUT', {
        data: payload,
        is_active: enabled,
      });
      toast('Idle promo saved', 'content-saved-toast');
    } catch {
      toast('Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function onImagePick(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await adminUpload<{ url: string }>('/content/media', fd);
      setImageUrl(res.url);
    } catch {
      toast('Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Idle promo (home)">
      <p className="ds-caption admin-lead">
        Shown on the home page after the visitor is idle. Dismissed promos stay hidden for the session.
      </p>
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)} data-testid="idle-promo-admin">
        <label className="admin-field admin-field--row">
          <input
            type="checkbox"
            checked={enabled}
            data-testid="idle-promo-enabled"
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="ds-label">Enabled</span>
        </label>
        <label className="admin-field">
          <span className="ds-label">Idle threshold (seconds)</span>
          <input
            className="admin-input"
            type="number"
            min={3}
            max={300}
            value={idleSec}
            data-testid="idle-promo-seconds"
            onChange={(e) => setIdleSec(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Image</span>
          <input
            className="admin-input"
            type="file"
            accept="image/*"
            data-testid="idle-promo-image"
            onChange={(e) => void onImagePick(e.target.files?.[0] ?? null)}
          />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="admin-idle-promo-preview" />
          ) : null}
        </label>
        <label className="admin-field">
          <span className="ds-label">Text</span>
          <textarea
            className="admin-input"
            rows={3}
            value={text}
            data-testid="idle-promo-text"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Button label (optional)</span>
          <input
            className="admin-input"
            value={buttonLabel}
            placeholder="Shop new arrivals"
            data-testid="idle-promo-button-label"
            onChange={(e) => setButtonLabel(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Button URL (optional)</span>
          <input
            className="admin-input"
            value={buttonUrl}
            placeholder="/shop"
            data-testid="idle-promo-button-url"
            onChange={(e) => setButtonUrl(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-content-block">
          Save
        </Button>
      </form>
    </AdminShell>
  );
}
