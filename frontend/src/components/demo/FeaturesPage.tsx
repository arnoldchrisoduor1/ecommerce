/**
 * Demo-mode gate for Features sales page content.
 * Production builds resolve to null so FeaturesPageClient stays out of the bundle.
 */
import type { ComponentType } from 'react';

function FeaturesOff() {
  return null;
}

export const FeaturesPageClient: ComponentType =
  process.env.NEXT_PUBLIC_APP_MODE === 'demo'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./FeaturesPageClient') as { FeaturesPageClient: ComponentType })
        .FeaturesPageClient
    : FeaturesOff;
