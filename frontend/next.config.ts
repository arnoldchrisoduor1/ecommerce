import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/** Prefer existing process.env; fill APP_MODE / demo contacts from repo-root .env when unset. */
function hydrateRootEnv() {
  const rootEnv = resolve(__dirname, '../.env');
  if (!existsSync(rootEnv)) return;
  const keys = new Set([
    'APP_MODE',
    'NEXT_PUBLIC_APP_MODE',
    'DEMO_CONTACT_EMAIL',
    'DEMO_CONTACT_PHONE',
    'NEXT_PUBLIC_DEMO_CONTACT_EMAIL',
    'NEXT_PUBLIC_DEMO_CONTACT_PHONE',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'API_URL',
  ]);
  for (const raw of readFileSync(rootEnv, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq);
    if (!keys.has(key) || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

hydrateRootEnv();

// Rewrites are evaluated at build time for `output: 'standalone'`.
// Deploy builds MUST set API_URL=http://backend:8080 (see scripts/lib/build.sh).
const apiOrigin = process.env.API_URL?.replace(/\/$/, '') || 'http://localhost:8081';

/** demo|production — unset/invalid ⇒ production (never accidental demo). */
const rawAppMode = (process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE || '')
  .trim()
  .toLowerCase();
const appMode = rawAppMode === 'demo' ? 'demo' : 'production';

const nextConfig: NextConfig = {
  // Required for Docker/Linux deploy packaging (self-contained server.js tree).
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_MODE: appMode,
    ...(appMode === 'demo'
      ? {
          NEXT_PUBLIC_DEMO_CONTACT_EMAIL:
            process.env.DEMO_CONTACT_EMAIL ||
            process.env.NEXT_PUBLIC_DEMO_CONTACT_EMAIL ||
            'arnoldchrisoduor@gmail.com',
          NEXT_PUBLIC_DEMO_CONTACT_PHONE:
            process.env.DEMO_CONTACT_PHONE ||
            process.env.NEXT_PUBLIC_DEMO_CONTACT_PHONE ||
            '+254791165995',
        }
      : {}),
  },
  experimental: {
    externalDir: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'ecomm-api.oduor-arnold.com' },
      { protocol: 'https', hostname: 'ecommerce.oduor-arnold.com' },
    ],
  },
  async rewrites() {
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: '933207',
        hypothesisId: 'H1',
        location: 'next.config.ts:rewrites',
        message: 'bake api rewrite origin',
        data: { apiOrigin, fromEnv: Boolean(process.env.API_URL) },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
