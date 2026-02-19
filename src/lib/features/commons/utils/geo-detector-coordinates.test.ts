import { describe, expect, it } from 'vitest';
import {
  GeoColumnDetector,
  GPS_COLUMN_PATTERNS,
  hasGPSCoordinateColumns
} from './geo-detector.utils';

describe('GPS_COLUMN_PATTERNS', () => {
  it('should match common latitude column names', () => {
    expect(GPS_COLUMN_PATTERNS.latitude.test('lat')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('Lat')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('LAT')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('latitude')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('Latitude')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('y_coord')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('lat_dd')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('latitude_dd')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.latitude.test('geo_lat')).toBe(true);
  });

  it('should match common longitude column names', () => {
    expect(GPS_COLUMN_PATTERNS.longitude.test('lon')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('Lon')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('long')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('Long')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('longitude')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('Longitude')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('lng')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('x_coord')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('lon_dd')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('longitude_dd')).toBe(true);
    expect(GPS_COLUMN_PATTERNS.longitude.test('geo_lon')).toBe(true);
  });

  it('should not match non-coordinate column names', () => {
    expect(GPS_COLUMN_PATTERNS.latitude.test('longitude')).toBe(false);
    expect(GPS_COLUMN_PATTERNS.longitude.test('latitude')).toBe(false);
    expect(GPS_COLUMN_PATTERNS.latitude.test('name')).toBe(false);
    expect(GPS_COLUMN_PATTERNS.longitude.test('country')).toBe(false);
    expect(GPS_COLUMN_PATTERNS.latitude.test('city')).toBe(false);
    expect(GPS_COLUMN_PATTERNS.longitude.test('id')).toBe(false);
  });
});

describe('hasGPSCoordinateColumns', () => {
  it('should return true when both lat and lon columns exist', () => {
    const columns = [
      { name: 'id' },
      { name: 'lat' },
      { name: 'lon' },
      { name: 'name' }
    ];
    expect(hasGPSCoordinateColumns(columns)).toBe(true);
  });

  it('should return true with alternative column names', () => {
    const columns = [{ name: 'latitude' }, { name: 'longitude' }];
    expect(hasGPSCoordinateColumns(columns)).toBe(true);
  });

  it('should return true with mixed case column names', () => {
    const columns = [{ name: 'Lat' }, { name: 'Long' }];
    expect(hasGPSCoordinateColumns(columns)).toBe(true);
  });

  it('should return true with y_coord and x_coord', () => {
    const columns = [{ name: 'y_coord' }, { name: 'x_coord' }];
    expect(hasGPSCoordinateColumns(columns)).toBe(true);
  });

  it('should return false when only latitude column exists', () => {
    const columns = [{ name: 'id' }, { name: 'lat' }, { name: 'name' }];
    expect(hasGPSCoordinateColumns(columns)).toBe(false);
  });

  it('should return false when only longitude column exists', () => {
    const columns = [{ name: 'id' }, { name: 'lon' }, { name: 'name' }];
    expect(hasGPSCoordinateColumns(columns)).toBe(false);
  });

  it('should return false when no coordinate columns exist', () => {
    const columns = [{ name: 'id' }, { name: 'name' }, { name: 'country' }];
    expect(hasGPSCoordinateColumns(columns)).toBe(false);
  });

  it('should return false for empty columns array', () => {
    expect(hasGPSCoordinateColumns([])).toBe(false);
  });
});

describe('GeoColumnDetector - Coordinate detection', () => {
  it('should detect latitude column by name pattern with valid values', async () => {
    const headers = ['id', 'lat', 'lon', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London'],
      ['3', 40.7128, -74.006, 'New York']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    expect(latColumn).toBeDefined();
    expect(latColumn?.columnName).toBe('lat');
    expect(latColumn?.confidence).toBeGreaterThan(0.8);
  });

  it('should detect longitude column by name pattern with valid values', async () => {
    const headers = ['id', 'lat', 'lon', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London'],
      ['3', 40.7128, -74.006, 'New York']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');
    expect(lonColumn).toBeDefined();
    expect(lonColumn?.columnName).toBe('lon');
    expect(lonColumn?.confidence).toBeGreaterThan(0.8);
  });

  it('should detect both lat and lon columns', async () => {
    const headers = ['id', 'latitude', 'longitude', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London'],
      ['3', 40.7128, -74.006, 'New York']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');

    expect(latColumn).toBeDefined();
    expect(lonColumn).toBeDefined();
    expect(latColumn?.columnName).toBe('latitude');
    expect(lonColumn?.columnName).toBe('longitude');
  });

  it('should set hasGeoColumns to true when both lat and lon are detected', async () => {
    const headers = ['id', 'lat', 'lon', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    expect(result.hasGeoColumns).toBe(true);
  });

  it('should not produce warnings when both lat and lon are present', async () => {
    const headers = ['id', 'lat', 'lon', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    expect(result.warnings).toHaveLength(0);
  });

  it('should produce warning when latitude exists without longitude', async () => {
    const headers = ['id', 'lat', 'name'];
    const data = [
      ['1', 48.8566, 'Paris'],
      ['2', 51.5074, 'London']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    expect(result.warnings).toContain(
      'Latitude column detected without corresponding longitude'
    );
  });

  it('should produce warning when longitude exists without latitude', async () => {
    const headers = ['id', 'lon', 'name'];
    const data = [
      ['1', 2.3522, 'Paris'],
      ['2', -0.1278, 'London']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    expect(result.warnings).toContain(
      'Longitude column detected without corresponding latitude'
    );
  });

  it('should validate latitude values within -90 to 90 range', async () => {
    const headers = ['lat'];
    const validData = [[45.0], [-45.0], [0], [90], [-90]];

    const result = await GeoColumnDetector.detectGeoColumns(headers, validData);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    expect(latColumn).toBeDefined();
    expect(latColumn?.confidence).toBe(1);
  });

  it('should validate longitude values within -180 to 180 range', async () => {
    const headers = ['lon'];
    const validData = [[90.0], [-90.0], [0], [180], [-180]];

    const result = await GeoColumnDetector.detectGeoColumns(headers, validData);

    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');
    expect(lonColumn).toBeDefined();
    expect(lonColumn?.confidence).toBe(1);
  });

  it('should reject latitude column with invalid values', async () => {
    const headers = ['lat'];
    const invalidData = [[100], [200], [300]];

    const result = await GeoColumnDetector.detectGeoColumns(
      headers,
      invalidData
    );

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    expect(latColumn).toBeUndefined();
  });

  it('should reject longitude column with invalid values', async () => {
    const headers = ['lon'];
    const invalidData = [[200], [300], [400]];

    const result = await GeoColumnDetector.detectGeoColumns(
      headers,
      invalidData
    );

    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');
    expect(lonColumn).toBeUndefined();
  });

  it('should detect lat/lon by partial name match (lat in column name)', async () => {
    const headers = ['id', 'geo_lat', 'geo_lon', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');

    expect(latColumn).toBeDefined();
    expect(latColumn?.columnName).toBe('geo_lat');
    expect(lonColumn).toBeDefined();
    expect(lonColumn?.columnName).toBe('geo_lon');
  });

  it('should detect lat/lon with alternative naming (y_coord/x_coord)', async () => {
    const headers = ['id', 'y_coord', 'x_coord', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', 51.5074, -0.1278, 'London']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');

    expect(latColumn).toBeDefined();
    expect(latColumn?.columnName).toBe('y_coord');
    expect(lonColumn).toBeDefined();
    expect(lonColumn?.columnName).toBe('x_coord');
  });

  it('should handle mixed data types in coordinate columns', async () => {
    const headers = ['id', 'lat', 'lon', 'name'];
    const data = [
      ['1', '48.8566', '2.3522', 'Paris'],
      ['2', 51.5074, -0.1278, 'London'],
      ['3', '40.7128', -74.006, 'New York']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');

    expect(latColumn).toBeDefined();
    expect(lonColumn).toBeDefined();
  });

  it('should handle null and empty values in coordinate columns', async () => {
    const headers = ['id', 'lat', 'lon', 'name'];
    const data = [
      ['1', 48.8566, 2.3522, 'Paris'],
      ['2', null, -0.1278, 'London'],
      ['3', 40.7128, '', 'New York'],
      ['4', 35.6762, 139.6503, 'Tokyo']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const latColumn = result.geoColumns.find((col) => col.type === 'latitude');
    const lonColumn = result.geoColumns.find((col) => col.type === 'longitude');

    expect(latColumn).toBeDefined();
    expect(lonColumn).toBeDefined();
  });
});
