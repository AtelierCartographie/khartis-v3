import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPwaCachePrefix,
  isPwaCacheForScope,
  resolvePwaScopeUrl
} from '../../src/lib/features/commons/utils/pwa-cache';

const serviceWorkerSource = readFileSync(
  path.resolve(process.cwd(), 'src/sw.ts'),
  'utf8'
);
const appHtmlSource = readFileSync(
  path.resolve(process.cwd(), 'src/app.html'),
  'utf8'
);
const pwaComponentSource = readFileSync(
  path.resolve(
    process.cwd(),
    'src/lib/features/commons/components/pwa-service-worker.svelte'
  ),
  'utf8'
);

describe('PWA cache and retry policy', () => {
  it('should create different cache prefixes when deployment scopes differ', () => {
    const pprdScope = 'https://example.org/cartographie/khartis-pprd/';
    const prodScope = 'https://example.org/cartographie/fr/outils/khartis/app/';

    expect(createPwaCachePrefix(pprdScope)).not.toBe(
      createPwaCachePrefix(prodScope)
    );
  });

  it('should match only caches belonging to the current scope', () => {
    const scope = 'https://example.org/cartographie/khartis/';
    const adjacentScope = 'https://example.org/cartographie/khartis-other/';
    const cacheName = `${createPwaCachePrefix(scope)}images`;

    expect(isPwaCacheForScope(cacheName, scope)).toBe(true);
    expect(isPwaCacheForScope(cacheName, adjacentScope)).toBe(false);
  });

  it('should resolve the service worker scope when the document base has a file-like route', () => {
    expect(
      resolvePwaScopeUrl(
        'https://example.org/cartographie/fr/outils/khartis/app/'
      )
    ).toBe('https://example.org/cartographie/fr/outils/khartis/app/');
  });

  it('should avoid immediate retries when the server returns 403 or 429', () => {
    const statusMatch = serviceWorkerSource.match(
      /const RETRY_STATUS_CODES = new Set\(\[([^\]]+)]\)/
    );
    if (!statusMatch) throw new Error('Could not read retry status policy.');
    const statuses = statusMatch[1]
      .split(',')
      .map((value) => Number(value.trim()));

    expect(statuses).toEqual([408, 425, 500, 502, 503, 504]);
    expect(serviceWorkerSource).not.toContain('addPlugins');
  });

  it('should keep stale asset recovery out of the mounted PWA component', () => {
    expect(pwaComponentSource).not.toContain('vite:preloadError');
    expect(pwaComponentSource).not.toContain('factoryResetPwa');
    expect(pwaComponentSource).not.toContain('window.location.reload()');
  });

  it('should scope the inline reset flag to the current deployment path', () => {
    expect(appHtmlSource).toMatch(
      /sessionStorage\.setItem\(\s*cachePrefix \+ 'reset-skip-restore'/
    );
    expect(appHtmlSource).not.toContain("setItem('kh:reset-skip-restore'");
  });
});
