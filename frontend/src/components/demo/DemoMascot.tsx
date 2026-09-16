/**
 * Demo-mode gate. When NEXT_PUBLIC_APP_MODE !== 'demo', the client module
 * is not required so webpack can drop toast/contact strings from the bundle.
 */
import type { ComponentType } from 'react';

function DemoMascotOff() {
  return null;
}

export const DemoMascot: ComponentType =
  process.env.NEXT_PUBLIC_APP_MODE === 'demo'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./DemoMascotClient') as { DemoMascot: ComponentType }).DemoMascot
    : DemoMascotOff;
