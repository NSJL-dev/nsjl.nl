import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Only immutable site assets may use the optimizer. In particular, deny
  // /api/media, /api/admin/media and former direct Storage sources, even when
  // someone constructs an optimizer URL manually.
  images: { localPatterns: [{pathname:'/img/**',search:''}], remotePatterns: [] },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  ] }]; },
};
export default nextConfig;
