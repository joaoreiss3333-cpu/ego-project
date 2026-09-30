import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@ego/content', '@ego/engine', '@ego/db', '@ego/render'],
  serverExternalPackages: ['@prisma/client', '@napi-rs/canvas'],
  // raiz do monorepo (evita que o Next escolha outro lockfile da máquina)
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // retrato: arquivo de até 1 MB + sobra do multipart
    serverActions: { bodySizeLimit: '2mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
