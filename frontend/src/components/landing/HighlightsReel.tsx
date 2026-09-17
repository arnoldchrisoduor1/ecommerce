'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Highlight, HighlightSlide } from '@/lib/api';

type Props = {
  highlights: Highlight[];
};

const STORY_MS = 5000;

function slidesFor(h: Highlight): HighlightSlide[] {
  if (h.slides?.length) return h.slides;
  if (h.media_url) {
    return [
      {
        id: `${h.id}-fallback`,
        image_url: h.media_url,
        caption: '',
        caption_position: 'bottom',
        sort_order: 0,
      },
    ];
  }
  return [];
}

function thumbUrl(h: Highlight): string {
  return slidesFor(h)[0]?.image_url || h.media_url || '';
}

export function HighlightsReel({ highlights }: Props) {
  const [active, setActive] = useState<Highlight | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [viewed, setViewed] = useState<Record<string, boolean>>({});
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const pointerX = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const activeRef = useRef(active);
  const slideIdxRef = useRef(slideIdx);
  const highlightsRef = useRef(highlights);
  activeRef.current = active;
  slideIdxRef.current = slideIdx;
  highlightsRef.current = highlights;

  const slides = active ? slidesFor(active) : [];
  const current = slides[slideIdx];

  const close = useCallback(() => {
    setActive(null);
    setSlideIdx(0);
    setProgress(0);
    setPaused(false);
  }, []);

  const goNext = useCallback(() => {
    const cur = activeRef.current;
    if (!cur) return;
    const list = slidesFor(cur);
    const idx = slideIdxRef.current;
    if (idx < list.length - 1) {
      setSlideIdx(idx + 1);
      setProgress(0);
      return;
    }
    const hi = highlightsRef.current.findIndex((h) => h.id === cur.id);
    const next = highlightsRef.current[hi + 1];
    if (next) {
      setActive(next);
      setSlideIdx(0);
      setProgress(0);
      setViewed((v) => ({ ...v, [next.id]: true }));
      return;
    }
    close();
  }, [close]);

  const goPrev = useCallback(() => {
    const cur = activeRef.current;
    if (!cur) return;
    const idx = slideIdxRef.current;
    if (idx > 0) {
      setSlideIdx(idx - 1);
      setProgress(0);
      return;
    }
    const hi = highlightsRef.current.findIndex((h) => h.id === cur.id);
    const prev = highlightsRef.current[hi - 1];
    if (prev) {
      const prevSlides = slidesFor(prev);
      setActive(prev);
      setSlideIdx(Math.max(0, prevSlides.length - 1));
      setProgress(0);
      setViewed((v) => ({ ...v, [prev.id]: true }));
    }
  }, []);

  useEffect(() => {
    if (!active || paused || slides.length === 0) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / STORY_MS);
      setProgress(t);
      if (t >= 1) {
        goNext();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, slideIdx, paused, slides.length, goNext]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, goNext, goPrev]);

  function openHighlight(h: Highlight) {
    setActive(h);
    setSlideIdx(0);
    setProgress(0);
    setViewed((v) => ({ ...v, [h.id]: true }));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerX.current = e.clientX;
    held.current = false;
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setPaused(true);
    }, 140);
  }

  function clearHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    clearHold();
    const startX = pointerX.current;
    pointerX.current = null;
    const wasHeld = held.current;
    held.current = false;
    if (wasHeld) {
      setPaused(false);
      return;
    }
    setPaused(false);
    if (startX != null && Math.abs(e.clientX - startX) > 40) {
      if (e.clientX < startX) goNext();
      else goPrev();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.35) goPrev();
    else goNext();
  }

  if (highlights.length === 0) return null;

  return (
    <section className="highlights" aria-label="Highlights">
      <ul className="highlights__list">
        {highlights.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              className={[
                'ds-highlight',
                'highlights__item',
                viewed[h.id] ? 'ds-highlight--viewed' : '',
                active?.id === h.id ? 'ds-highlight--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid="highlight-item"
              aria-label={h.title}
              onClick={() => openHighlight(h)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(h)} alt="" loading="lazy" decoding="async" />
            </button>
            <span className="ds-caption highlights__label">{h.title}</span>
          </li>
        ))}
      </ul>

      {active && current ? (
        <div
          className="highlight-viewer"
          data-testid="highlight-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
        >
          <button
            type="button"
            className="highlight-viewer__scrim"
            aria-label="Close story"
            onClick={close}
          />
          <div
            className="highlight-viewer__panel"
            data-testid="highlight-story"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              clearHold();
              setPaused(false);
              pointerX.current = null;
            }}
          >
            <div className="highlight-viewer__progress" aria-hidden="true">
              {slides.map((s, i) => (
                <div key={s.id} className="highlight-viewer__seg">
                  <div
                    className="highlight-viewer__seg-fill"
                    style={{
                      width:
                        i < slideIdx
                          ? '100%'
                          : i === slideIdx
                            ? `${Math.round(progress * 100)}%`
                            : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {current.product_slug ? (
              <Link
                href={`/product/${current.product_slug}`}
                className="highlight-viewer__media-link"
                data-testid="highlight-product-link"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={() => close()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.image_url}
                  alt={current.caption || active.title}
                  decoding="async"
                  draggable={false}
                />
              </Link>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.image_url}
                alt={current.caption || active.title}
                className="highlight-viewer__media"
                decoding="async"
                draggable={false}
              />
            )}

            {current.caption ? (
              <p
                className={`highlight-viewer__caption highlight-viewer__caption--${current.caption_position || 'bottom'}`}
                data-testid="highlight-caption"
              >
                {current.caption}
              </p>
            ) : null}

            <p className="ds-label highlight-viewer__title">{active.title}</p>
            <button
              type="button"
              className="ds-btn ds-btn--secondary ds-btn--sm highlight-viewer__close"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
