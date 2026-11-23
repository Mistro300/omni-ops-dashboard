import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@omni-ops/shared'],
  reactStrictMode: true,
};

export default nextConfig;
