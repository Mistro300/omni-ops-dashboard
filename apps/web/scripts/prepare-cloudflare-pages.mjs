import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nextDir = join(process.cwd(), '.next');
const outDir = join(process.cwd(), 'out');

// If Next.js built a static export (CF_PAGES=1 / STATIC_EXPORT=1 -> out/),
// mirror out/ into .next/ because Cloudflare Pages is configured with output directory "apps/web/.next"
if (existsSync(outDir)) {
  rmSync(nextDir, { recursive: true, force: true });
  mkdirSync(nextDir, { recursive: true });
  cpSync(outDir, nextDir, { recursive: true });

  const redirectsContent = [
    '/orders/* /orders/default.html 200',
    '/products/* /products/default.html 200',
  ].join('\n');
  writeFileSync(join(nextDir, '_redirects'), `${redirectsContent}\n`, 'utf8');
  console.log('[prepare-cloudflare-pages] Mirrored static export (out/) into .next/ with _redirects for Cloudflare Pages.');
  process.exit(0);
}

if (!existsSync(nextDir)) {
  console.log('[prepare-cloudflare-pages] .next directory not found, skipping.');
  process.exit(0);
}

// 1. Remove .next/cache (webpack pack files exceed Cloudflare Pages 25 MiB file limit)
const cacheDir = join(nextDir, 'cache');
if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true });
  console.log('[prepare-cloudflare-pages] Removed .next/cache to satisfy Cloudflare Pages 25 MiB limit.');
}

// 2. Remove any standalone/trace files over 24 MiB if present
function pruneOversizedFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneOversizedFiles(fullPath);
    } else if (entry.isFile()) {
      const sizeMb = statSync(fullPath).size / (1024 * 1024);
      if (sizeMb > 24) {
        rmSync(fullPath, { force: true });
        console.log(`[prepare-cloudflare-pages] Removed oversized build artifact: ${fullPath} (${sizeMb.toFixed(1)} MiB)`);
      }
    }
  }
}
pruneOversizedFiles(nextDir);
