import { describe, expect, it } from 'vitest';
import {
  hasGPSCoordinateColumns,
  resolveGPSCoordinateColumns,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';

function createGeoDetectionResult(): GeoDetectionResult {
  return {
    hasGeoColumns: true,
    geoColumns: [
      {
        index: 0,
        columnName: 'Latitude_WGS84',
        type: 'latitude',
        confidence: 0.99
      },
      {
        index: 1,
        columnName: 'Longitude_WGS84',
        type: 'longitude',
        confidence: 0.98
      }
    ],
    warnings: []
  };
}

describe('resolveGPSCoordinateColumns', () => {
  it('uses geo detection metadata for custom GPS column names', () => {
    const columns = [
      { name: 'Latitude_WGS84' },
      { name: 'Longitude_WGS84' },
      { name: 'site_name' }
    ];

    expect(
      resolveGPSCoordinateColumns(columns, createGeoDetectionResult())
    ).toEqual({
      lat: 'Latitude_WGS84',
      lon: 'Longitude_WGS84'
    });
  });

  it('falls back to flexible tokenized column names', () => {
    const columns = [
      { name: 'Latitude_WGS84' },
      { name: 'Longitude_WGS84' },
      { name: 'site_name' }
    ];

    expect(resolveGPSCoordinateColumns(columns)).toEqual({
      lat: 'Latitude_WGS84',
      lon: 'Longitude_WGS84'
    });
  });

  it('uses semantic analysis markers when available', () => {
    const columns = [
      { name: 'coord_y', semioType: 'geolat', semioScore: 0.95 },
      { name: 'coord_x', semioType: 'geolon', semioScore: 0.94 }
    ];

    expect(resolveGPSCoordinateColumns(columns)).toEqual({
      lat: 'coord_y',
      lon: 'coord_x'
    });
  });
});

describe('hasGPSCoordinateColumns', () => {
  it('returns true when geo detection recognizes latitude and longitude columns', () => {
    const columns = [
      { name: 'Latitude_WGS84' },
      { name: 'Longitude_WGS84' },
      { name: 'site_name' }
    ];

    expect(hasGPSCoordinateColumns(columns, createGeoDetectionResult())).toBe(
      true
    );
  });
});
