import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('$lib/features/commons/utils/static-asset-url', () => ({
  resolveStaticAssetUrl: (path: string) =>
    `http://localhost/cartographie/khartisnewpprd${path}`
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { SYSTEM: 'SYSTEM' },
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

const mockMetadata = [
  {
    file: 'monde-countries-2024-low',
    title_fr: 'Monde',
    title_en: 'World',
    layers: [
      {
        file: 'monde-countries-centroids-2024-low',
        type: 'centroid',
        style: null
      },
      {
        file: 'monde-countries-limites-2024-low',
        type: 'limit',
        style: 'limit'
      }
    ]
  },
  {
    file: 'europe-nuts2-2024-low',
    title_fr: 'Europe',
    subtitle_fr: 'NUTS 2',
    title_en: 'Europe',
    layers: [
      {
        file: 'europe-nuts2-centroids-2024-low',
        type: 'centroid',
        style: null
      },
      { file: 'europe-graticule-10', type: 'graticule', style: 'graticule' }
    ]
  },
  {
    file: 'france-region-2025-high',
    title_fr: 'France',
    title_en: 'France',
    layers: [
      {
        file: 'france-region-centroids-2025-high',
        type: 'centroid',
        style: null
      },
      { file: 'france-land-2025-high', type: 'land', style: 'land' }
    ]
  },
  {
    file: 'monde-countries-2024-medium',
    title_fr: 'Monde',
    title_en: 'World',
    layers: []
  }
];

async function loadModule() {
  const mod = await import('./offline-basemap-sets');
  mod.clearBasemapMetadataCache();
  return mod;
}

describe('offline-basemap-sets', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMetadata
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('loadBasemapMetadata', () => {
    it('should fetch and parse metadata from the static URL', async () => {
      const mod = await loadModule();
      const result = await mod.loadBasemapMetadata();

      expect(result).toHaveLength(4);
      expect(result[0].file).toBe('monde-countries-2024-low');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/basemaps/all-basemaps-metadata.json')
      );
    });

    it('should return cached metadata on subsequent calls', async () => {
      const mod = await loadModule();

      await mod.loadBasemapMetadata();
      await mod.loadBasemapMetadata();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return empty array on fetch failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      } as unknown as Response);
      const mod = await loadModule();
      const result = await mod.loadBasemapMetadata();
      expect(result).toEqual([]);
    });
  });

  describe('buildEssentialDownloadEntries', () => {
    it('should return entries for the 3 essential basemaps with their layers', async () => {
      const mod = await loadModule();
      const entries = await mod.buildEssentialDownloadEntries();

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.basemapId)).toEqual([
        'monde-countries-2024-low',
        'europe-nuts2-2024-low',
        'france-region-2025-high'
      ]);
    });

    it('should include the main file plus all sub-layer files', async () => {
      const mod = await loadModule();
      const entries = await mod.buildEssentialDownloadEntries();
      const europe = entries.find(
        (e) => e.basemapId === 'europe-nuts2-2024-low'
      );

      expect(europe?.files).toContain('europe-nuts2-2024-low');
      expect(europe?.files).toContain('europe-nuts2-centroids-2024-low');
      expect(europe?.files).toContain('europe-graticule-10');
    });

    it('should resolve all URLs through resolveStaticAssetUrl', async () => {
      const mod = await loadModule();
      const entries = await mod.buildEssentialDownloadEntries();
      const monde = entries[0];

      for (const url of monde.urls) {
        expect(url).toMatch(
          /^http:\/\/localhost\/cartographie\/khartisnewpprd\//
        );
        expect(url).toContain('/basemaps/geometry/');
        expect(url).toMatch(/\.parquet$/);
      }
    });

    it('should fit within the essential budget of 7 MB', async () => {
      const mod = await loadModule();
      const ids = mod.getEssentialBasemapIds();
      const geomDir = resolve(
        __dirname,
        '../../../../../static/basemaps/geometry'
      );

      let totalBytes = 0;
      for (const id of ids) {
        const meta = mockMetadata.find((m) => m.file === id);
        if (!meta) continue;
        const allFiles = [meta.file, ...(meta.layers ?? []).map((l) => l.file)];
        for (const f of allFiles) {
          const p = resolve(geomDir, `${f}.parquet`);
          if (existsSync(p)) {
            totalBytes += statSync(p).size;
          }
        }
      }

      expect(totalBytes).toBeGreaterThan(0);
      expect(totalBytes).toBeLessThanOrEqual(mod.getEssentialBudgetBytes());
    });
  });

  describe('classifyBasemapRegion', () => {
    it('should classify by id prefix', async () => {
      const mod = await loadModule();
      expect(mod.classifyBasemapRegion('france-region-2025-high')).toBe(
        'france'
      );
      expect(mod.classifyBasemapRegion('europe-nuts2-2024-low')).toBe('europe');
      expect(mod.classifyBasemapRegion('monde-countries-2024-low')).toBe(
        'monde'
      );
      expect(mod.classifyBasemapRegion('something-else')).toBe('autre');
    });
  });

  describe('buildExtendedDownloadEntries', () => {
    it('should return one entry per metadata item', async () => {
      const mod = await loadModule();
      const entries = await mod.buildExtendedDownloadEntries();
      expect(entries).toHaveLength(mockMetadata.length);
    });
  });
});
