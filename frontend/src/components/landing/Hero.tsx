import Link from 'next/link';
import type { HeroData } from '@/lib/api';

type Props = {
  hero: HeroData;
};

export function Hero({ hero }: Props) {
  const headline = hero.headline || 'New season';
  const ctaLabel = hero.cta_label || 'Shop';
  const ctaUrl = hero.cta_url || '/shop';

  return (
    <section className="hero" data-testid="hero-section" aria-label="Hero">
      {hero.media_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="hero__media"
          src={hero.media_url}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
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
    </section>
  );
}
