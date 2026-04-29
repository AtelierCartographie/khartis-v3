import { describe, expect, it } from 'vitest';
import {
  GeoColumnDetector,
  collectGPSRangeWarnings,
  type GeoColumnResult
} from '$lib/features/commons/utils/geo-detector.utils';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';

function latColumn(index: number, name: string = 'lat'): GeoColumnResult {
  return {
    index,
    columnName: name,
    type: GEO_COLUMN_TYPE.LATITUDE,
    confidence: 0.9,
    sampleValues: [],
    matchedPatterns: []
  };
}

function lonColumn(index: number, name: string = 'long'): GeoColumnResult {
  return {
    index,
    columnName: name,
    type: GEO_COLUMN_TYPE.LONGITUDE,
    confidence: 0.9,
    sampleValues: [],
    matchedPatterns: []
  };
}

describe('[D-06][D-07] collectGPSRangeWarnings', () => {
  it('emits no warning when lat/lon values are within valid ranges', () => {
    const warnings = collectGPSRangeWarnings(latColumn(0), lonColumn(1), {
      headers: ['lat', 'long'],
      data: [
        [48.8566, 2.3522],
        [48.857, 2.353]
      ]
    });
    expect(warnings).toEqual([]);
  });

  it('flags swapped columns when lat holds longitude-range values and lon holds latitude-range values', () => {
    const warnings = collectGPSRangeWarnings(latColumn(0), lonColumn(1), {
      headers: ['lat', 'long'],
      data: [
        [2.497, 48.974],
        [2.645, 48.989],
        [2.417, 48.758]
      ]
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/swapped|invers/i);
  });

  it('flags latitude out of range when only latitude contains bad values', () => {
    const warnings = collectGPSRangeWarnings(latColumn(0), lonColumn(1), {
      headers: ['lat', 'long'],
      data: [
        [95.123, 2.497],
        [-91, 181]
      ]
    });
    expect(warnings.join(' ')).toMatch(/Latitude|out of range|outside/i);
  });

  it('flags longitude out of range when only longitude contains bad values', () => {
    const warnings = collectGPSRangeWarnings(latColumn(0), lonColumn(1), {
      headers: ['lat', 'long'],
      data: [
        [48.0, 200.417],
        [49.0, -300.5]
      ]
    });
    expect(warnings.join(' ')).toMatch(/Longitude|outside/i);
  });

  it('returns no warning when only one axis is provided (lat only, no lon counterpart)', () => {
    const warnings = collectGPSRangeWarnings(latColumn(0), undefined, {
      headers: ['lat'],
      data: [[45], [46]]
    });
    expect(warnings).toEqual([]);
  });
});

describe('[D-06][D-07] GeoColumnDetector.detectGeoColumns surfaces range warnings', () => {
  it('produces a swap warning for the CSV-11 fixture shape (lat=1-3, long=48-49)', async () => {
    const headers = ['lat', 'long', 'site'];
    const rows = [
      [2.497, 48.974, 'A'],
      [2.645, 48.989, 'B'],
      [2.417, 48.758, 'C'],
      [2.884, 48.698, 'D']
    ];
    const result = await GeoColumnDetector.detectGeoColumns(headers, rows, {
      sampleSize: rows.length
    });
    const joined = result.warnings.join(' | ');
    expect(joined).toMatch(/swap|longitude|latitude/i);
  });

  it('produces an out-of-range warning for CSV-12 fixture shape (lat=-91/95, long=200)', async () => {
    const headers = ['lat', 'long', 'site'];
    const rows = [
      [48.974, 2.497, 'NORD STOCK CHEM'],
      [95.123, 2.645, 'INVALID_LAT'],
      [48.758, 200.417, 'INVALID_LON'],
      [-91, 181, 'INVALID_BOTH']
    ];
    const result = await GeoColumnDetector.detectGeoColumns(headers, rows, {
      sampleSize: rows.length
    });
    const joined = result.warnings.join(' | ');
    expect(joined).toMatch(/outside|range|hors/i);
  });
});
