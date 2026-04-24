import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'osm-basemap.store.svelte.ts'),
  'utf8'
);

describe('osmBasemapStore persistence', () => {
  it('persists manual OSM clears without notifying during store reset', () => {
    expect(source).toContain('function clear(notify = true): void');
    expect(source).toContain("persistenceRegistry.notifyChange('osmBasemap')");
    expect(source).toContain('clear(false);');
  });
});
