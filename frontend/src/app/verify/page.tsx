import { Suspense } from 'react';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { VerifyCodeClient } from '@/components/auth/VerifyCodeClient';

export default function VerifyPage() {
  return (
    <StoreChrome>
      <Suspense fallback={<p className="ds-body">Loading…</p>}>
        <VerifyCodeClient />
      </Suspense>
    </StoreChrome>
  );
}
