import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nextDir = join(process.cwd(), '.next');

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

// 3. Mirror .next/static -> .next/_next/static so Cloudflare Pages serves /_next/static/* directly
const staticSrc = join(nextDir, 'static');
const staticDest = join(nextDir, '_next', 'static');
if (existsSync(staticSrc)) {
  mkdirSync(staticDest, { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log('[prepare-cloudflare-pages] Copied .next/static -> .next/_next/static');
}

// 4. Copy prerendered HTML & RSC payloads from .next/server/app to .next/ root for Cloudflare Pages static routing
const serverAppDir = join(nextDir, 'server', 'app');
if (existsSync(serverAppDir)) {
  for (const entry of readdirSync(serverAppDir, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.rsc'))) {
      cpSync(join(serverAppDir, entry.name), join(nextDir, entry.name));
    }
  }
  const notFoundHtml = join(serverAppDir, '_not-found.html');
  if (existsSync(notFoundHtml)) {
    cpSync(notFoundHtml, join(nextDir, '404.html'));
  }
  console.log('[prepare-cloudflare-pages] Staged prerendered HTML routes into .next root.');
}

// 5. Write Cloudflare Pages _redirects for dynamic client-rendered routes
const redirectsContent = [
  '/orders/* /orders.html 200',
  '/products/* /products.html 200',
].join('\n');
writeFileSync(join(nextDir, '_redirects'), `${redirectsContent}\n`, 'utf8');
console.log('[prepare-cloudflare-pages] Wrote .next/_redirects for Cloudflare Pages.');
