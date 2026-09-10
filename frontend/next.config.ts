import type { NextConfig } from 'next';

const apiOrigin = process.env.API_URL?.replace(/\/$/, '') || 'http://localhost:8081';

const nextConfig: NextConfig = {
  // Required for Docker/Linux deploy packaging (self-contained server.js tree).
  output: 'standalone',
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
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
