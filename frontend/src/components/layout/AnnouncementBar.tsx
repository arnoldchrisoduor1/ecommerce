'use client';

import { useEffect, useState } from 'react';

type Props = {
  messages: string[];
};

export function AnnouncementBar({ messages }: Props) {
  const safe = messages.filter(Boolean);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (safe.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % safe.length);
    }, /* duration from CSS var */ readAnnounceMs());
    return () => window.clearInterval(id);
  }, [safe.length]);

  if (safe.length === 0) return null;

  return (
    <div className="announce" data-testid="announcement-bar" role="status">
      <p className="announce__text ds-caption">{safe[index]}</p>
    </div>
  );
}

function readAnnounceMs(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--duration-announce')
    .trim();
  if (raw.endsWith('ms')) return Number.parseFloat(raw);
  if (raw.endsWith('s')) return Number.parseFloat(raw) * 1000;
  return 4000;
}
