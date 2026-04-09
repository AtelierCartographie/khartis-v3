import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  initDuckDB: vi.fn()
}));

import {
  exportToGeoJson,
  exportToJson
} from '$lib/features/commons/utils/file-export.utils';

describe('file export utils BigInt serialization', () => {
  it('serializes BigInt properties in GeoJSON exports', async () => {
    const blob = exportToGeoJson([
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [2.35, 48.85]
        },
        properties: {
          count: BigInt(7)
        }
      }
    ]);

    const payload = JSON.parse(await blob.text()) as {
      features: Array<{ properties: { count: number } }>;
    };

    expect(payload.features[0]?.properties.count).toBe(7);
  });

  it('serializes BigInt values in JSON exports', async () => {
    const blob = exportToJson({
      count: BigInt(12),
      nested: {
        total: BigInt(3)
      }
    });

    const payload = JSON.parse(await blob.text()) as {
      count: number;
      nested: { total: number };
    };

    expect(payload.count).toBe(12);
    expect(payload.nested.total).toBe(3);
  });
});
