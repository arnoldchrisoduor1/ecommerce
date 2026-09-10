'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HeroData } from '@/lib/api';
import { heroMediaUrls } from '@/lib/api';

type Props = {
  hero: HeroData;
};

export function Hero({ hero }: Props) {
  const headline = hero.headline || 'New season';
  const ctaLabel = hero.cta_label || 'Shop';
  const ctaUrl = hero.cta_url || '/shop';
  const slides = heroMediaUrls(hero);
  const intervalMs =
    typeof hero.media_interval_ms === 'number' && hero.media_interval_ms >= 2000
      ? hero.media_interval_ms
      : 5500;
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [slides.join('|')]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [slides.length, intervalMs]);

  return (
    <section className="hero" data-testid="hero-section" aria-label="Hero">
      {slides.length ? (
        <div className="hero__media-stack" aria-hidden="true">
          {slides.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              className={`hero__media${i === active ? ' hero__media--active' : ''}`}
              src={src}
              alt=""
              fetchPriority={i === 0 ? 'high' : 'low'}
              decoding="async"
            />
          ))}
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
          {slides.map((src, i) => (
            <button
              key={src}
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
