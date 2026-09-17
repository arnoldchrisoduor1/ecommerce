'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiSend } from '@/lib/api';

const BlogPresenceContext = createContext<Record<string, number> | null>(null);

export function useBlogPresenceBatch(): Record<string, number> | null {
  return useContext(BlogPresenceContext);
}

type Props = {
  postIds: string[];
  children: ReactNode;
};

export function BlogPresenceProvider({ postIds, children }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const ids = useMemo(
    () => [...new Set(postIds.filter(Boolean))].sort(),
    [postIds],
  );
  const idsKey = ids.join(',');

  useEffect(() => {
    const batchIds = idsKey ? idsKey.split(',') : [];
    if (batchIds.length === 0) {
      setCounts({});
      return;
    }
    let cancelled = false;

    async function tick() {
      try {
        const res = await apiSend<{ counts: Record<string, number> }>(
          '/analytics/blog/presence/batch',
          'POST',
          { post_ids: batchIds },
        );
        if (!cancelled) setCounts(res.counts ?? {});
      } catch {
        /* presence optional */
      }
    }

    void tick();
    const timer = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [idsKey]);

  return (
    <BlogPresenceContext.Provider value={counts}>
      {children}
    </BlogPresenceContext.Provider>
  );
}
