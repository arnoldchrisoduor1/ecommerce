'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminSend, adminUpload } from '@/lib/admin';
import {
  apiGet,
  type ContentBlock,
  type HeroData,
  type HeroSlide,
  heroSlides,
  parseBlockData,
} from '@/lib/api';
import { Button } from '@/components/ui';

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function AdminHeroEditorClient() {
  const { ready, toast } = useAdminUi();
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [intervalSec, setIntervalSec] = useState('5.5');
  const [busy, setBusy] = useState(false);
  const [focalIdx, setFocalIdx] = useState(0);
  const previewRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/hero').then((block) => {
      const data = parseBlockData<HeroData>(block.data);
      setHeadline(data.headline || '');
      setSubheadline(data.subheadline || '');
      setCtaLabel(data.cta_label || '');
      setCtaUrl(data.cta_url || '');
      setSlides(heroSlides(data));
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
      const uploaded: HeroSlide[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'cms/hero');
        const res = await adminUpload<{ url: string; object_key: string }>(
          '/content/media',
          form,
        );
        uploaded.push({
          url: res.url || res.object_key,
          focal_x: 0.5,
          focal_y: 0.5,
        });
      }
      setSlides((prev) => {
        const next = [...prev, ...uploaded];
        setFocalIdx(next.length - 1);
        return next;
      });
      toast('Image uploaded', 'content-saved-toast');
    } catch {
      toast('Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    setSlides((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setFocalIdx((cur) => {
      if (cur === idx) return idx + dir;
      if (cur === idx + dir) return idx;
      return cur;
    });
  }

  function setFocalFromClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setSlides((prev) =>
      prev.map((s, i) =>
        i === focalIdx ? { ...s, focal_x: x, focal_y: y } : s,
      ),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const secs = Number(intervalSec);
      const media_interval_ms =
        Number.isFinite(secs) && secs >= 2 ? Math.round(secs * 1000) : 5500;
      const urls = slides.map((s) => s.url);
      await adminSend('/content/blocks/hero', 'PUT', {
        data: {
          headline,
          subheadline,
          cta_label: ctaLabel,
          cta_url: ctaUrl,
          slides,
          media_urls: urls,
          media_url: urls[0] || '',
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

  const active = slides[focalIdx];

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
            Upload one or more images. Click a preview to set the focal point
            (where the crop stays locked).
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
          {slides.length === 0 ? (
            <p className="ds-caption">No images yet.</p>
          ) : (
            <ul className="admin-hero-slides">
              {slides.map((slide, idx) => (
                <li key={`${slide.url}-${idx}`} className="admin-hero-slide">
                  <button
                    type="button"
                    className={`admin-hero-slide__pick${idx === focalIdx ? ' admin-hero-slide__pick--active' : ''}`}
                    onClick={() => setFocalIdx(idx)}
                    aria-pressed={idx === focalIdx}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.url} alt="" className="admin-hero-slide__img" />
                  </button>
                  <div className="admin-hero-slide__actions">
                    <span className="ds-caption">
                      Focal {((slide.focal_x ?? 0.5) * 100).toFixed(0)}% /{' '}
                      {((slide.focal_y ?? 0.5) * 100).toFixed(0)}%
                    </span>
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
                      disabled={idx === slides.length - 1 || busy}
                      onClick={() => moveSlide(idx, 1)}
                    >
                      Down
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setSlides((prev) => prev.filter((_, i) => i !== idx));
                        setFocalIdx((cur) =>
                          cur > idx ? cur - 1 : cur === idx ? Math.max(0, idx - 1) : cur,
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {active ? (
          <div className="admin-field admin-hero-focal">
            <span className="ds-label">Focal point</span>
            <p className="ds-caption">
              Click the image to set focus. Storefront uses this for crop position.
            </p>
            <button
              ref={previewRef}
              type="button"
              className="admin-hero-focal__preview"
              data-testid="hero-focal-preview"
              onClick={setFocalFromClick}
              aria-label="Set focal point"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={active.url} alt="" />
              <span
                className="admin-hero-focal__mark"
                style={{
                  left: `${(active.focal_x ?? 0.5) * 100}%`,
                  top: `${(active.focal_y ?? 0.5) * 100}%`,
                }}
                aria-hidden="true"
              />
            </button>
          </div>
        ) : null}

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
