import { describe, expect, it } from 'vitest';
import {
  GeoColumnDetector,
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

  it('detects gcpnt latitude and longitude columns from tokenized headers', () => {
    const columns = [
      { name: 'gcpnt_lat' },
      { name: 'gcpnt_lon' },
      { name: 'city_name' }
    ];

    expect(resolveGPSCoordinateColumns(columns)).toEqual({
      lat: 'gcpnt_lat',
      lon: 'gcpnt_lon'
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

describe('GeoColumnDetector', () => {
  it('does not detect latitude from headers that merely contain the substring lat', () => {
    expect(
      GeoColumnDetector.detectColumnType('population', ['18.5', '15.2', '22.8'])
    ).toBeNull();
  });

  it('does not classify short numeric measure columns as NUTS codes', () => {
    expect(
      GeoColumnDetector.detectColumnType('value', ['10', '20', '30', '40'])
    ).toBeNull();
  });

  it('recognizes fuzzy country datasets through geographic headers', () => {
    expect(
      GeoColumnDetector.detectColumnType('entity', [
        'Frnace',
        'Gremany',
        'Brazill'
      ])
    ).toMatchObject({
      type: 'country_name'
    });
  });

  it('recognizes normalized region headers that lost accented characters', () => {
    expect(
      GeoColumnDetector.detectColumnType('nom_r_gion', [
        'Ile-de-France',
        'Grand Est',
        'Bretagne'
      ])
    ).toMatchObject({
      type: 'region'
    });
  });
});
