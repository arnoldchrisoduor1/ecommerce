'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  messages: string[];
  intervalSeconds?: number;
};

const FADE_MS = 320;

export function AnnouncementBar({ messages, intervalSeconds = 4 }: Props) {
  const safe = messages.map((m) => m.trim()).filter(Boolean);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const fadeRef = useRef<number | null>(null);

  const dwellMs = Math.max(2, intervalSeconds) * 1000;

  useEffect(() => {
    setIndex(0);
    setVisible(true);
  }, [safe.join('|'), dwellMs]);

  useEffect(() => {
    if (safe.length < 2 || paused) return;

    function scheduleNext() {
      timerRef.current = window.setTimeout(() => {
        setVisible(false);
        fadeRef.current = window.setTimeout(() => {
          setIndex((i) => (i + 1) % safe.length);
          setVisible(true);
          scheduleNext();
        }, FADE_MS);
      }, dwellMs);
    }

    scheduleNext();
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      if (fadeRef.current != null) window.clearTimeout(fadeRef.current);
    };
  }, [safe.length, paused, dwellMs, safe.join('|')]);

  if (safe.length === 0) return null;

  return (
    <div
      className="announce"
      data-testid="announcement-bar"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p
        className={`announce__text ds-caption${visible ? ' announce__text--visible' : ' announce__text--hidden'}`}
        data-testid="announcement-bar-message"
      >
        {safe[index]}
      </p>
    </div>
  );
}
