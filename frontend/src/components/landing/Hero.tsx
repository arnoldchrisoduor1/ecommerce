'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import type { HeroData } from '@/lib/api';
import { heroSlides } from '@/lib/api';

type Props = {
  hero: HeroData;
};

function srcSetFor(url: string): string | undefined {
  // Same asset at multiple density hints — desktop browsers prefer the largest.
  // When a resize CDN exists, swap these for width-specific derivatives.
  if (!url || url.startsWith('data:') || url.endsWith('.svg')) return undefined;
  return `${url} 800w, ${url} 1280w, ${url} 1920w`;
}

export function Hero({ hero }: Props) {
  const headline = hero.headline || 'New season';
  const ctaLabel = hero.cta_label || 'Shop';
  const ctaUrl = hero.cta_url || '/shop';
  const slides = heroSlides(hero);
  const intervalMs =
    typeof hero.media_interval_ms === 'number' && hero.media_interval_ms >= 2000
      ? hero.media_interval_ms
      : 5500;
  const [active, setActive] = useState(0);
  const slideKey = slides.map((s) => s.url).join('|');

  useEffect(() => {
    setActive(0);
  }, [slideKey]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [slides.length, intervalMs, slideKey]);

  return (
    <section className="hero" data-testid="hero-section" aria-label="Hero">
      {slides.length ? (
        <div className="hero__media-stack" aria-hidden="true">
          {slides.map((slide, i) => {
            const fx = slide.focal_x ?? 0.5;
            const fy = slide.focal_y ?? 0.5;
            const srcSet = srcSetFor(slide.url);
            return (
              <div
                key={`${slide.url}-${i}`}
                className={`hero__frame${i === active ? ' hero__frame--active' : ''}`}
                style={
                  {
                    '--hero-focal-x': String(fx),
                    '--hero-focal-y': String(fy),
                  } as CSSProperties
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="hero__media"
                  src={slide.url}
                  srcSet={srcSet}
                  sizes="100vw"
                  alt=""
                  fetchPriority={i === 0 ? 'high' : 'low'}
                  decoding="async"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hero__media hero__media--fallback" aria-hidden="true" />
      )}
      <div className="hero__content">
        <p className="hero__brand ds-display ds-display--md">Studio</p>
        <h1 className="hero__headline ds-display ds-display--xl">{headline}</h1>
        {hero.subheadline ? (
          <p className="hero__sub ds-body">{hero.subheadline}</p>
        ) : null}
        <div className="hero__cta">
          <Link href={ctaUrl} className="ds-btn ds-btn--primary ds-btn--lg">
            {ctaLabel}
          </Link>
        </div>
      </div>
      {slides.length > 1 ? (
        <div className="hero__dots" role="tablist" aria-label="Hero slides">
          {slides.map((slide, i) => (
            <button
              key={`${slide.url}-dot-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`hero__dot${i === active ? ' hero__dot--active' : ''}`}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
