import { describe, expect, it } from 'vitest';
import {
  validateGPSColumns,
  type DuckDBClientForGPS
} from '$lib/features/duckdb/orchestrator/gps-ops';

function mockDuck(result: Record<string, number>): DuckDBClientForGPS {
  return {
    async query() {
      return [result];
    }
  };
}

describe('[D-06] validateGPSColumns — magnitude-based swap detection (CSV-11)', () => {
  it('flags swap when lat cluster is small and lon cluster is around 48-49 (IDF shape)', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 1.55,
        lat_max: 3.17,
        lat_median: 2.5,
        lon_min: 48.18,
        lon_max: 49.21,
        lon_median: 48.9
      })
    );
    expect(result.possibleInversion).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it('does NOT flag swap for normal IDF GPS (lat ~48-49, lon ~2-3)', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 48.18,
        lat_max: 49.21,
        lat_median: 48.9,
        lon_min: 1.55,
        lon_max: 3.17,
        lon_median: 2.5
      })
    );
    expect(result.possibleInversion).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

describe('[D-07] validateGPSColumns — out-of-range warnings (CSV-12)', () => {
  it('warns when latitude max exceeds 90', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 48,
        lat_max: 95.12,
        lat_median: 70,
        lon_min: 2,
        lon_max: 3,
        lon_median: 2.5
      })
    );
    // lat_max > 90 AND lonInRange -> latLooksLikeLon + lonLooksLikeLat -> inversion path
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeTruthy();
  });

  it('warns when longitude max exceeds 180', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: 48,
        lat_max: 49,
        lat_median: 48.5,
        lon_min: 2,
        lon_max: 200.42,
        lon_median: 100
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeTruthy();
  });

  it('warns when latitude values are strictly negative out of range', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'long',
      mockDuck({
        lat_min: -91,
        lat_max: -80,
        lat_median: -85,
        lon_min: 2,
        lon_max: 3,
        lon_median: 2.5
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeTruthy();
  });
});

describe('[D-06][D-07] validateGPSColumns — clean GPS data (CSV-04, CSV-06, CSV-09)', () => {
  it('returns isValid without warning for realistic world GPS', async () => {
    const result = await validateGPSColumns(
      'tbl',
      'lat',
      'lon',
      mockDuck({
        lat_min: -33.87,
        lat_max: 64.8,
        lat_median: 12,
        lon_min: -122.4,
        lon_max: 151.2,
        lon_median: 14
      })
    );
    expect(result.isValid).toBe(true);
    expect(result.possibleInversion).toBe(false);
    expect(result.warning).toBeUndefined();
  });
});
