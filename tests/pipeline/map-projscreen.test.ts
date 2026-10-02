import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { MAP: 'MAP', PROJECT: 'PROJECT' }
}));
vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  getBasemapVariantFamily: vi.fn((file: string) =>
    file.replace(/-[a-z]+$/, '')
  ),
  getPreferredBasemapFile: vi.fn((_, file: string) => file),
  getPreferredCatalogBasemapLevel: vi.fn(() => null)
}));
vi.mock('$lib/features/commons/utils/static-asset-url', () => ({
  resolveStaticAssetUrl: vi.fn((path: string) => path)
}));

import { get_max_scale } from '$lib/features/map/core/projscreen';
import {
  getGPSBboxMatchMetrics,
  shouldPreferTextBasemapRefinementForGPS,
  getCatalogBasemapsForDisplay,
  sortCatalogBasemapsForDisplay
} from '$lib/features/map/services/basemap-catalog.service.svelte';

// ─── get_max_scale ─────────────────────────────────────────────────────────

describe('get_max_scale', () => {
  it('constrains to the tighter axis (landscape bbox, portrait canvas)', () => {
    const scale = get_max_scale({ width: 100, height: 200 }, [0, 0, 100, 50]);
    expect(scale).toBe(1);
  });

  it('constrains to the tighter axis (wide canvas, wide bbox)', () => {
    const scale = get_max_scale({ width: 800, height: 400 }, [0, 0, 100, 100]);
    expect(scale).toBe(4);
  });

  it('returns 1 when bbox has zero width', () => {
    expect(get_max_scale({ width: 100, height: 100 }, [5, 0, 5, 10])).toBe(1);
  });

  it('returns 1 when bbox has zero height', () => {
    expect(get_max_scale({ width: 100, height: 100 }, [0, 5, 10, 5])).toBe(1);
  });

  it('accounts for padding on both sides', () => {
    const noPad = get_max_scale({ width: 200, height: 200 }, [0, 0, 100, 100]);
    const withPad = get_max_scale(
      { width: 200, height: 200 },
      [0, 0, 100, 100],
      10
    );
    expect(withPad).toBeLessThan(noPad);
  });
});

// ─── getGPSBboxMatchMetrics ────────────────────────────────────────────────

describe('getGPSBboxMatchMetrics', () => {
  const gps = { minLon: 0, minLat: 0, maxLon: 10, maxLat: 10 };

  it('returns 100% coverage when GPS is fully inside basemap bbox', () => {
    const metrics = getGPSBboxMatchMetrics(gps, [-5, -5, 15, 15]);
    expect(metrics.coverageScore).toBe(100);
    expect(metrics.fullyContainsData).toBe(true);
  });

  it('returns 0 coverage when there is no overlap', () => {
    const metrics = getGPSBboxMatchMetrics(gps, [20, 20, 30, 30]);
    expect(metrics.coverageScore).toBe(0);
    expect(metrics.overlapArea).toBe(0);
  });

  it('returns partial coverage when bbox partially overlaps GPS', () => {
    const metrics = getGPSBboxMatchMetrics(gps, [5, 5, 15, 15]);
    expect(metrics.coverageScore).toBeGreaterThan(0);
    expect(metrics.coverageScore).toBeLessThan(100);
  });

  it('returns dataArea equal to GPS extent area', () => {
    const metrics = getGPSBboxMatchMetrics(gps, [-1, -1, 11, 11]);
    expect(metrics.dataArea).toBe(100);
  });
});

// ─── shouldPreferTextBasemapRefinementForGPS ───────────────────────────────

describe('shouldPreferTextBasemapRefinementForGPS', () => {
  it('returns true when no GPS suggestions and text score >= 80', () => {
    expect(shouldPreferTextBasemapRefinementForGPS([], 80)).toBe(true);
    expect(shouldPreferTextBasemapRefinementForGPS([], 95)).toBe(true);
  });

  it('returns false when no GPS suggestions and text score < 80', () => {
    expect(shouldPreferTextBasemapRefinementForGPS([], 79)).toBe(false);
  });

  it('returns false when top GPS suggestion is bbox containment (even with high text score)', () => {
    const gpsSuggestions = [{ matchReason: 'GPS bbox containment' } as never];
    expect(shouldPreferTextBasemapRefinementForGPS(gpsSuggestions, 95)).toBe(
      false
    );
  });

  it('returns true when top GPS reason is not bbox containment and text score >= 80', () => {
    const gpsSuggestions = [{ matchReason: 'text match' } as never];
    expect(shouldPreferTextBasemapRefinementForGPS(gpsSuggestions, 85)).toBe(
      true
    );
  });
});

// ─── getCatalogBasemapsForDisplay ──────────────────────────────────────────

describe('getCatalogBasemapsForDisplay', () => {
  const makeBasemap = (file: string, overrides = {}) =>
    ({
      file,
      source: 'test',
      date: '2024',
      proj_source: 'wgs84',
      title_fr: file,
      layers: [],
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      ...overrides
    }) as never;

  it('returns empty array for empty input', () => {
    expect(getCatalogBasemapsForDisplay([])).toEqual([]);
  });

  it('includes custom basemaps without deduplication', () => {
    const basemaps = [
      makeBasemap('custom.gpkg', { isCustom: true }),
      makeBasemap('custom2.gpkg', { isCustom: true })
    ];
    expect(getCatalogBasemapsForDisplay(basemaps)).toHaveLength(2);
  });

  it('deduplicates non-custom basemaps by variant family', () => {
    const basemaps = [
      makeBasemap('world-countries-simplified'),
      makeBasemap('world-countries-detailed')
    ];
    const result = getCatalogBasemapsForDisplay(basemaps);
    expect(result).toHaveLength(1);
  });

  it('keeps the preferred medium simplification variant', () => {
    const basemaps = [
      makeBasemap('world-countries-2024-low', {
        simplification_level: 'low'
      }),
      makeBasemap('world-countries-2024-medium', {
        simplification_level: 'medium'
      }),
      makeBasemap('world-countries-2024-high', {
        simplification_level: 'high'
      })
    ];

    expect(getCatalogBasemapsForDisplay(basemaps)).toEqual([
      expect.objectContaining({ file: 'world-countries-2024-medium' })
    ]);
  });

  it('excludes the reference basemap, which is activated outside the catalog', () => {
    const basemaps = [
      makeBasemap('world-countries-2024-medium', {
        simplification_level: 'medium'
      }),
      makeBasemap('osm_openstreetmap_1712000000000', { isCustom: true })
    ];

    expect(getCatalogBasemapsForDisplay(basemaps)).toEqual([
      expect.objectContaining({ file: 'world-countries-2024-medium' })
    ]);
  });
});

// ─── sortCatalogBasemapsForDisplay ────────────────────────────────────────

describe('sortCatalogBasemapsForDisplay', () => {
  const makeBasemap = (
    file: string,
    date: string,
    titleFr: string,
    subtitleFr = ''
  ) =>
    ({
      file,
      source: 'test',
      date,
      proj_source: 'wgs84',
      title_fr: titleFr,
      title_en: titleFr,
      subtitle_fr: subtitleFr,
      subtitle_en: subtitleFr,
      layers: [],
      bbox: [0, 0, 1, 1] as [number, number, number, number]
    }) as never;

  it('orders by descending year, then alphabetically inside a year', () => {
    const basemaps = [
      makeBasemap('b', '2024', 'Belgique'),
      makeBasemap('a', '2025', 'Zimbabwe'),
      makeBasemap('c', '2025', 'Élsass'),
      makeBasemap('d', '2024', 'Algérie')
    ];

    expect(
      sortCatalogBasemapsForDisplay(basemaps, 'fr').map((b) => b.file)
    ).toEqual(['c', 'a', 'd', 'b']);
  });

  it('falls back to the subtitle when several basemaps share a title', () => {
    const basemaps = [
      makeBasemap('nuts2', '2021', 'Europe', 'par régions NUTS 2'),
      makeBasemap('nuts3', '2021', 'Europe', 'par régions NUTS 3'),
      makeBasemap('nuts1', '2021', 'Europe', 'par régions NUTS 1')
    ];

    expect(
      sortCatalogBasemapsForDisplay(basemaps, 'fr').map((b) => b.file)
    ).toEqual(['nuts1', 'nuts2', 'nuts3']);
  });

  it('keeps basemaps without a parsable year last', () => {
    const basemaps = [
      makeBasemap('undated', 'n/a', 'Monde'),
      makeBasemap('dated', '2020', 'Monde')
    ];

    expect(
      sortCatalogBasemapsForDisplay(basemaps, 'fr').map((b) => b.file)
    ).toEqual(['dated', 'undated']);
  });
});
