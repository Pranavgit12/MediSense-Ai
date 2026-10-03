/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Must exceed MAX_UPLOAD_BYTES (10 MiB by default) so an upload at exactly
    // the limit is rejected by our own validator with a useful message rather
    // than by the transport with a generic one. A file between the two is
    // refused here, which is the safe direction: never larger than intended.
    serverActions: { bodySizeLimit: '12mb' },
  },
  images: {
    // Unsplash is the only external image host we load, and only for
    // decorative photography on public marketing pages. No health data is ever
    // attached to one of these requests.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
