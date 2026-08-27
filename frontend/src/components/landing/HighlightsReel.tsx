'use client';

import { useState } from 'react';
import type { Highlight } from '@/lib/api';

type Props = {
  highlights: Highlight[];
};

export function HighlightsReel({ highlights }: Props) {
  const [active, setActive] = useState<Highlight | null>(null);
  const [viewed, setViewed] = useState<Record<string, boolean>>({});

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
              onClick={() => {
                setActive(h);
                setViewed((v) => ({ ...v, [h.id]: true }));
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.media_url} alt="" loading="lazy" decoding="async" />
            </button>
            <span className="ds-caption highlights__label">{h.title}</span>
          </li>
        ))}
      </ul>

      {active ? (
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
            onClick={() => setActive(null)}
          />
          <div className="highlight-viewer__panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.media_url}
              alt={active.title}
              className="highlight-viewer__media"
              decoding="async"
            />
            <p className="ds-display ds-display--sm highlight-viewer__title">{active.title}</p>
            <button
              type="button"
              className="ds-btn ds-btn--secondary ds-btn--md"
              onClick={() => setActive(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
