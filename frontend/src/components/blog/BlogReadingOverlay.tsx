'use client';

import { useBlogPresenceBatch } from '@/components/blog/BlogPresenceProvider';

type Props = {
  postId: string;
  testId?: string;
};

export function BlogReadingOverlay({ postId, testId = 'blog-card-reading-now' }: Props) {
  const counts = useBlogPresenceBatch();
  const count = counts?.[postId] ?? 0;
  if (count < 1) return null;

  const label = count === 1 ? '1 reading now' : `${count} reading now`;

  return (
    <div
      className="viewer-overlay blog-preview__reading-overlay"
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <span className="viewer-overlay__pill">
        <span className="viewer-overlay__dot" aria-hidden="true" />
        <span className="viewer-overlay__count">{label}</span>
      </span>
    </div>
  );
}
