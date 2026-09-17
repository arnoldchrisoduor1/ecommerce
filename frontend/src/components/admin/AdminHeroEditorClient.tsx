'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { HeroCropEditor } from '@/components/admin/HeroCropEditor';
import { adminSend, adminUpload } from '@/lib/admin';
import {
  apiGet,
  type ContentBlock,
  type HeroCrop,
  type HeroData,
  type HeroSlide,
  heroSlides,
  parseBlockData,
} from '@/lib/api';
import {
  defaultHeroCrop,
  HERO_ASPECT_DESKTOP,
  HERO_ASPECT_MOBILE,
  normalizeCrop,
} from '@/lib/heroCrop';
import { Button } from '@/components/ui';

type CropBreakpoint = 'mobile' | 'desktop';

function withDefaultCrops(slide: HeroSlide): HeroSlide {
  return {
    ...slide,
    crop_mobile: normalizeCrop(slide.crop_mobile ?? defaultHeroCrop()),
    crop_desktop: normalizeCrop(slide.crop_desktop ?? defaultHeroCrop()),
  };
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
  const [editIdx, setEditIdx] = useState(0);
  const [cropBp, setCropBp] = useState<CropBreakpoint>('mobile');

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/hero').then((block) => {
      const data = parseBlockData<HeroData>(block.data);
      setHeadline(data.headline || '');
      setSubheadline(data.subheadline || '');
      setCtaLabel(data.cta_label || '');
      setCtaUrl(data.cta_url || '');
      setSlides(heroSlides(data).map(withDefaultCrops));
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
      const full = defaultHeroCrop();
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
          crop_mobile: full,
          crop_desktop: full,
        });
      }
      setSlides((prev) => {
        const next = [...prev, ...uploaded];
        setEditIdx(next.length - 1);
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
    setEditIdx((cur) => {
      if (cur === idx) return idx + dir;
      if (cur === idx + dir) return idx;
      return cur;
    });
  }

  function updateCrop(idx: number, bp: CropBreakpoint, crop: HeroCrop) {
    setSlides((prev) =>
      prev.map((s, i) =>
        i === idx
          ? {
              ...s,
              ...(bp === 'mobile'
                ? { crop_mobile: normalizeCrop(crop) }
                : { crop_desktop: normalizeCrop(crop) }),
            }
          : s,
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
      const normalized = slides.map(withDefaultCrops);
      const urls = normalized.map((s) => s.url);
      await adminSend('/content/blocks/hero', 'PUT', {
        data: {
          headline,
          subheadline,
          cta_label: ctaLabel,
          cta_url: ctaUrl,
          slides: normalized,
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

  const active = slides[editIdx];
  const activeCrop =
    cropBp === 'mobile'
      ? normalizeCrop(active?.crop_mobile)
      : normalizeCrop(active?.crop_desktop);

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
            Upload images, pick a slide, then drag the crop box for mobile and desktop
            breakpoints.
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
                    className={`admin-hero-slide__pick${idx === editIdx ? ' admin-hero-slide__pick--active' : ''}`}
                    onClick={() => setEditIdx(idx)}
                    aria-pressed={idx === editIdx}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.url} alt="" className="admin-hero-slide__img" />
                  </button>
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
                        setEditIdx((cur) =>
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
          <div className="admin-field admin-hero-crop-panel">
            <span className="ds-label">Crop / reframe</span>
            <div className="admin-hero-crop-panel__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={cropBp === 'mobile'}
                className={`admin-hero-crop-panel__tab${cropBp === 'mobile' ? ' admin-hero-crop-panel__tab--active' : ''}`}
                onClick={() => setCropBp('mobile')}
              >
                Mobile (5:6)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cropBp === 'desktop'}
                className={`admin-hero-crop-panel__tab${cropBp === 'desktop' ? ' admin-hero-crop-panel__tab--active' : ''}`}
                onClick={() => setCropBp('desktop')}
              >
                Desktop (21:9)
              </button>
            </div>
            <HeroCropEditor
              url={active.url}
              crop={activeCrop}
              previewAspect={cropBp === 'mobile' ? HERO_ASPECT_MOBILE : HERO_ASPECT_DESKTOP}
              onChange={(crop) => updateCrop(editIdx, cropBp, crop)}
            />
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
