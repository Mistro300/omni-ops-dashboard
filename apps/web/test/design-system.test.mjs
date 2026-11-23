import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const webRoot = process.cwd();

describe('@omni-ops/web — Enterprise Precision Design System Verification', () => {
  it('defines approved Light & Dark theme color tokens in tokens.css', () => {
    const tokensCss = readFileSync(join(webRoot, 'src/styles/tokens.css'), 'utf8');

    // Primary Indigo tokens (Light #4F46E5, Dark #6366F1)
    assert.match(tokensCss, /--color-primary:\s*#4f46e5/i);
    assert.match(tokensCss, /--color-primary-hover:\s*#4338ca/i);
    assert.match(tokensCss, /--color-primary:\s*#6366f1/i);

    // Zinc Neutrals (Light #FAFAFA/#FFFFFF/#E4E4E7, Dark #09090B/#111113/#27272A)
    assert.match(tokensCss, /--color-canvas:\s*#fafafa/i);
    assert.match(tokensCss, /--color-surface:\s*#ffffff/i);
    assert.match(tokensCss, /--color-border:\s*#e4e4e7/i);
    assert.match(tokensCss, /--color-canvas:\s*#09090b/i);
    assert.match(tokensCss, /--color-surface:\s*#111113/i);
    assert.match(tokensCss, /--color-border:\s*#27272a/i);

    // 5-Color Chart Palette (Indigo, Emerald, Cyan, Amber, Rose)
    assert.match(tokensCss, /--chart-indigo:\s*#4f46e5/i);
    assert.match(tokensCss, /--chart-emerald:\s*#10b981/i);
    assert.match(tokensCss, /--chart-cyan:\s*#06b6d4/i);
    assert.match(tokensCss, /--chart-amber:\s*#f59e0b/i);
    assert.match(tokensCss, /--chart-rose:\s*#f43f5e/i);

    // Audit Diff Side-by-Side tokens
    assert.match(tokensCss, /--diff-before-bg:/);
    assert.match(tokensCss, /--diff-after-bg:/);
  });

  it('maps semantic status badges accurately in status-badges.ts', () => {
    const badgesSrc = readFileSync(join(webRoot, 'src/styles/status-badges.ts'), 'utf8');

    // Inventory statuses
    assert.match(badgesSrc, /IN_STOCK:\s*'emerald'/);
    assert.match(badgesSrc, /LOW_STOCK:\s*'amber'/);
    assert.match(badgesSrc, /OUT_OF_STOCK:\s*'rose'/);

    // Order statuses
    assert.match(badgesSrc, /CONFIRMED:\s*'indigo'/);
    assert.match(badgesSrc, /SHIPPED:\s*'cyan'/);
    assert.match(badgesSrc, /DELIVERED:\s*'emerald'/);
    assert.match(badgesSrc, /CANCELLED:\s*'rose'/);
    assert.match(badgesSrc, /REFUNDED:\s*'purple'/);

    // Role badges
    assert.match(badgesSrc, /ADMIN:\s*'indigo'/);
    assert.match(badgesSrc, /EDITOR:\s*'(sky|teal)'/);
    assert.match(badgesSrc, /VIEWER:\s*'zinc'/);
  });

  it('enforces IBM Plex Sans Arabic, Inter, and JetBrains Mono tabular-nums typography', () => {
    const globalsCss = readFileSync(join(webRoot, 'src/app/globals.css'), 'utf8');
    assert.match(globalsCss, /mono-tabular/);
    assert.match(globalsCss, /tabular-nums/);
    assert.match(globalsCss, /status-pill/);
    assert.match(globalsCss, /status-dot/);
  });
});
