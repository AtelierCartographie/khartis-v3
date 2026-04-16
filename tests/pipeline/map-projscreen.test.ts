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

import {
  get_bbox_from_geoparquet,
  get_bbox_center,
  get_max_scale,
  get_model_matrix,
  get_model_matrix_from_bbox
} from '$lib/features/map/core/projscreen';
import {
  getGPSBboxMatchMetrics,
  shouldPreferTextBasemapRefinementForGPS,
  getCatalogBasemapsForDisplay
} from '$lib/features/map/services/basemap-catalog.service.svelte';

// ─── get_bbox_from_geoparquet ──────────────────────────────────────────────

describe('get_bbox_from_geoparquet', () => {
  it('returns bbox from primary_column when no columnName provided', () => {
    const meta = JSON.stringify({
      primary_column: 'geometry',
      columns: { geometry: { bbox: [1, 2, 3, 4] } }
    });
    expect(get_bbox_from_geoparquet(meta)).toEqual([1, 2, 3, 4]);
  });

  it('returns bbox from specified column', () => {
    const meta = JSON.stringify({
      primary_column: 'geometry',
      columns: {
        geometry: { bbox: [0, 0, 1, 1] },
        other: { bbox: [5, 6, 7, 8] }
      }
    });
    expect(get_bbox_from_geoparquet(meta, 'other')).toEqual([5, 6, 7, 8]);
  });

  it('returns null when column is missing', () => {
    const meta = JSON.stringify({
      primary_column: 'geometry',
      columns: {}
    });
    expect(get_bbox_from_geoparquet(meta)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(get_bbox_from_geoparquet('not valid json')).toBeNull();
  });
});

// ─── get_bbox_center ───────────────────────────────────────────────────────

describe('get_bbox_center', () => {
  it('returns the center of a bbox', () => {
    expect(get_bbox_center([0, 0, 10, 10])).toEqual([5, 5]);
  });

  it('handles negative coordinates', () => {
    expect(get_bbox_center([-20, -10, 20, 10])).toEqual([0, 0]);
  });

  it('handles non-square bbox', () => {
    const [cx, cy] = get_bbox_center([10, 20, 50, 40]);
    expect(cx).toBe(30);
    expect(cy).toBe(30);
  });
});

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

// ─── get_model_matrix ──────────────────────────────────────────────────────

describe('get_model_matrix', () => {
  it('returns null for invalid JSON metadata', () => {
    expect(get_model_matrix('invalid', { width: 100, height: 100 })).toBeNull();
  });

  it('returns a Matrix4 for valid metadata', () => {
    const meta = JSON.stringify({
      primary_column: 'geometry',
      columns: { geometry: { bbox: [0, 0, 100, 100] } }
    });
    const result = get_model_matrix(meta, { width: 500, height: 500 });
    expect(result).not.toBeNull();
    expect(typeof result!.multiplyRight).toBe('function');
  });
});

describe('get_model_matrix_from_bbox', () => {
  it('returns a Matrix4 (not null)', () => {
    const result = get_model_matrix_from_bbox([0, 0, 10, 10], {
      width: 100,
      height: 100
    });
    expect(result).not.toBeNull();
    expect(typeof result.multiplyRight).toBe('function');
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
});
