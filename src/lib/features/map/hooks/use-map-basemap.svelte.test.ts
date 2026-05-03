import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-map-basemap.svelte.ts'),
  'utf8'
);

describe('useMapBasemap loading state', () => {
  it('tracks MapLibre style and OSM raster loading through the shared map loading store', () => {
    expect(source).toContain(
      "import { mapLoadingStore } from '../stores/map-loading.store.svelte';"
    );
    expect(source).toContain('mapLoadingStore.beginReferenceBasemapLoading();');
    expect(source).toContain('mapLoadingStore.endReferenceBasemapLoading();');
    expect(source).toContain("map.once('idle', rasterIdleHandler);");
    expect(source).toContain('beginRasterLoad(map, nextRasterKey);');
  });

  it('replays the latest requested style after an in-flight style load', () => {
    expect(source).toContain('let loadingStyleKey: string | null = null;');
    expect(source).toContain('let pendingStyleSync = false;');
    expect(source).toContain('function schedulePendingStyleSync(): void');
    expect(source).toContain('if (styleKey !== loadingStyleKey) {');
    expect(source).toContain('pendingStyleSync = true;');
    expect(source).toContain('schedulePendingStyleSync();');
  });

  it('uses full MapLibre style replacement for tiled basemap switches', () => {
    expect(source).toContain('map.setStyle(style, { diff: false });');
  });

  it('guards sync helpers when MapLibre style is not loaded', () => {
    expect(source).toContain('!map.isStyleLoaded()');
    expect(source).toContain('isStyleLoading ||');
    expect(source).toContain(
      "logger.warn('Failed to sync MapLibre projection'"
    );
  });
});
