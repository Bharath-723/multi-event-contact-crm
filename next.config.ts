import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          }
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/admin/operator',
        destination: '/operator',
        permanent: false,
      },
      {
        source: '/admin/operator/portal',
        destination: '/operator/portal',
        permanent: false,
      },
      {
        source: '/admin/operator/visitor',
        destination: '/operator/visitor',
        permanent: false,
      },
      {
        source: '/admin/visitor',
        destination: '/visitor',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

