import type { NextConfig } from 'next';

const isStaticExport =
  Boolean(process.env.CF_PAGES) ||
  Boolean(process.env.CF_PAGES_URL) ||
  Boolean(process.env.CF_PAGES_BRANCH) ||
  Boolean(process.env.WORKERS_CI) ||
  process.env.STATIC_EXPORT === '1' ||
  process.cwd().startsWith('/opt/buildhome');

const nextConfig: NextConfig = {
  transpilePackages: ['@omni-ops/shared'],
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
