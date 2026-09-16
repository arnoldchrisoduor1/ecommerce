import { Suspense } from 'react';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { UnsubscribeClient } from '@/components/newsletter/UnsubscribeClient';

export default function UnsubscribePage() {
  return (
    <StoreChrome>
      <Suspense fallback={<p className="ds-body">Loading…</p>}>
        <UnsubscribeClient />
      </Suspense>
    </StoreChrome>
  );
}
