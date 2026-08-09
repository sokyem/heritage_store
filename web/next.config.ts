import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "thescrubside.com",
    "www.thescrubside.com",
    "awulak-fashion.thescrubside.com",
    "awulak.com",
    "www.awulak.com",
    "matchday.awulak.com",
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.awulak.com',
        pathname: '/cdn/**',
      },
      {
        protocol: 'https',
        hostname: 'awulak.com',
        pathname: '/cdn/**',
      },
      // Admin product uploads land in Cloudinary — without this the storefront
      // <Image> component refuses to render them and you see the broken-image
      // icon (the gallery, /orders, /products/[slug] all use next/image).
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      // Legacy Shopify-hosted media used by some imported products.
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // microphone=(self) lets same-origin admin pages use voice recording
          // for AI draft creation; third-party iframes are still blocked.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
