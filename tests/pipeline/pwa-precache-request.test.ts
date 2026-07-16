import { describe, expect, it } from 'vitest';
import { canonicalizeWorkboxPrecacheRequest } from '../../src/lib/features/commons/utils/pwa-precache-request';

describe('PWA previous precache request keys', () => {
  it('should remove the Workbox revision query before snapshotting an immutable asset', () => {
    const request = new Request(
      'https://example.org/cartographie/khartis/_app/immutable/chunks/map.abc123.js?__WB_REVISION__=revision-1'
    );

    expect(canonicalizeWorkboxPrecacheRequest(request).url).toBe(
      'https://example.org/cartographie/khartis/_app/immutable/chunks/map.abc123.js'
    );
  });

  it('should preserve unrelated query parameters', () => {
    const request = new Request(
      'https://example.org/cartographie/khartis/_app/immutable/chunks/map.abc123.js?lang=fr&__WB_REVISION__=revision-1'
    );

    expect(canonicalizeWorkboxPrecacheRequest(request).url).toBe(
      'https://example.org/cartographie/khartis/_app/immutable/chunks/map.abc123.js?lang=fr'
    );
  });
});
