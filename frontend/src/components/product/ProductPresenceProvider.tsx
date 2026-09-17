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

const ProductPresenceContext = createContext<Record<string, number> | null>(null);

export function useProductPresenceBatch(): Record<string, number> | null {
  return useContext(ProductPresenceContext);
}

type Props = {
  productIds: string[];
  children: ReactNode;
};

export function ProductPresenceProvider({ productIds, children }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const ids = useMemo(
    () => [...new Set(productIds.filter(Boolean))].sort(),
    [productIds],
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
          '/presence/products/batch',
          'POST',
          { product_ids: batchIds },
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
    <ProductPresenceContext.Provider value={counts}>
      {children}
    </ProductPresenceContext.Provider>
  );
}
