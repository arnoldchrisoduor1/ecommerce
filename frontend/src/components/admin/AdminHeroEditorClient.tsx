'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminSend, adminUpload } from '@/lib/admin';
import {
  apiGet,
  type ContentBlock,
  type HeroData,
  heroMediaUrls,
  parseBlockData,
} from '@/lib/api';
import { Button } from '@/components/ui';

export function AdminHeroEditorClient() {
  const { ready, toast } = useAdminUi();
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [intervalSec, setIntervalSec] = useState('5.5');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/hero').then((block) => {
      const data = parseBlockData<HeroData>(block.data);
      setHeadline(data.headline || '');
      setSubheadline(data.subheadline || '');
      setCtaLabel(data.cta_label || '');
      setCtaUrl(data.cta_url || '');
      setMediaUrls(heroMediaUrls(data));
      setIntervalSec(
        String(
          typeof data.media_interval_ms === 'number'
            ? data.media_interval_ms / 1000
            : 5.5,
        ),
      );
    });
  }, [ready]);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'cms/hero');
        const res = await adminUpload<{ url: string }>('/content/media', form);
        uploaded.push(res.url);
      }
      setMediaUrls((prev) => [...prev, ...uploaded]);
      toast('Image uploaded', 'content-saved-toast');
    } catch {
      toast('Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    setMediaUrls((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const secs = Number(intervalSec);
      const media_interval_ms =
        Number.isFinite(secs) && secs >= 2 ? Math.round(secs * 1000) : 5500;
      await adminSend('/content/blocks/hero', 'PUT', {
        data: {
          headline,
          subheadline,
          cta_label: ctaLabel,
          cta_url: ctaUrl,
          media_urls: mediaUrls,
          media_url: mediaUrls[0] || '',
          media_interval_ms,
        },
        is_active: true,
      });
      toast('Content saved', 'content-saved-toast');
    } catch {
      toast('Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Hero editor">
      <form className="admin-form admin-form--wide" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Headline</span>
          <input
            className="admin-input"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            data-testid="hero-headline-input"
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Subheadline</span>
          <input
            className="admin-input"
            value={subheadline}
            onChange={(e) => setSubheadline(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">CTA label</span>
          <input
            className="admin-input"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">CTA URL</span>
          <input
            className="admin-input"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="/shop"
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Slide interval (seconds)</span>
          <input
            className="admin-input"
            type="number"
            min={2}
            step={0.5}
            value={intervalSec}
            onChange={(e) => setIntervalSec(e.target.value)}
          />
        </label>

        <div className="admin-field">
          <span className="ds-label">Hero images</span>
          <p className="ds-caption">
            Upload one or more images. Multiple images crossfade on the landing page.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            data-testid="hero-image-upload"
            onChange={(e) => {
              void onUpload(e.target.files);
              e.target.value = '';
            }}
          />
          {mediaUrls.length === 0 ? (
            <p className="ds-caption">No images yet.</p>
          ) : (
            <ul className="admin-hero-slides">
              {mediaUrls.map((url, idx) => (
                <li key={`${url}-${idx}`} className="admin-hero-slide">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="admin-hero-slide__img" />
                  <div className="admin-hero-slide__actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={idx === 0 || busy}
                      onClick={() => moveSlide(idx, -1)}
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={idx === mediaUrls.length - 1 || busy}
                      onClick={() => moveSlide(idx, 1)}
                    >
                      Down
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setMediaUrls((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={busy}
          data-testid="save-content-block"
        >
          Save
        </Button>
      </form>
    </AdminShell>
  );
}
