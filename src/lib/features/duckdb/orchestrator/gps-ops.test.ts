import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../../data-pipeline/__tests__/duckdb-node-helper';
import {
  detectGPSColumns,
  validateGPSColumns,
  type DuckDBClientForGPS
} from './gps-ops';
import { DuckDBSimplifiedType, type AnalysisResult } from '../types';

function createNodeDuckClient(db: TestDuckDB): DuckDBClientForGPS {
  return {
    async query(sql: string): Promise<unknown> {
      return query(db, sql);
    }
  };
}

describe('validateGPSColumns', () => {
  let db: TestDuckDB;
  let duckClient: DuckDBClientForGPS;

  beforeAll(async () => {
    db = await createTestInstance();
    duckClient = createNodeDuckClient(db);
  });

  beforeEach(async () => {
    await db.connection.run('DROP TABLE IF EXISTS gps_test_data');
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('returns valid result for correct GPS coordinates', async () => {
    await db.connection.run(`
      CREATE TABLE gps_test_data (lat DOUBLE, lon DOUBLE, name VARCHAR)
    `);
    await db.connection.run(`
      INSERT INTO gps_test_data VALUES
        (48.8566, 2.3522, 'Paris'),
        (40.7128, -74.0060, 'New York'),
        (35.6762, 139.6503, 'Tokyo')
    `);

    const result = await validateGPSColumns(
      'gps_test_data',
      'lat',
      'lon',
      duckClient
    );

    expect(result.isValid).toBe(true);
    expect(result.possibleInversion).toBe(false);
    expect(result.latColumn).toBe('lat');
    expect(result.lonColumn).toBe('lon');
    expect(result.warning).toBeUndefined();
    expect(result.latStats).not.toBeNull();
    expect(result.latStats?.min).toBeCloseTo(35.6762, 3);
    expect(result.latStats?.max).toBeCloseTo(48.8566, 3);
    expect(result.lonStats).not.toBeNull();
    expect(result.lonStats?.min).toBeCloseTo(-74.006, 3);
    expect(result.lonStats?.max).toBeCloseTo(139.6503, 3);
  });

  it('detects coordinate inversion when lat looks like lon and vice versa', async () => {
    await db.connection.run(`
      CREATE TABLE gps_test_data (lat DOUBLE, lon DOUBLE, name VARCHAR)
    `);
    await db.connection.run(`
      INSERT INTO gps_test_data VALUES
        (2.3522, 48.8566, 'Paris'),
        (-74.0060, 40.7128, 'New York'),
        (139.6503, 35.6762, 'Tokyo')
    `);

    const result = await validateGPSColumns(
      'gps_test_data',
      'lat',
      'lon',
      duckClient
    );

    expect(result.isValid).toBe(false);
    expect(result.possibleInversion).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('lat');
    expect(result.warning).toContain('lon');
  });

  it('detects latitude values out of valid range', async () => {
    await db.connection.run(`
      CREATE TABLE gps_test_data (lat DOUBLE, lon DOUBLE, name VARCHAR)
    `);
    await db.connection.run(`
      INSERT INTO gps_test_data VALUES
        (48.8566, 2.3522, 'Paris'),
        (150.0, 150.0, 'Invalid Lat/Lon'),
        (-100.0, -150.0, 'Invalid Lat/Lon 2')
    `);

    const result = await validateGPSColumns(
      'gps_test_data',
      'lat',
      'lon',
      duckClient
    );

    expect(result.isValid).toBe(false);
    expect(result.possibleInversion).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('lat');
  });

  it('detects longitude values out of valid range', async () => {
    await db.connection.run(`
      CREATE TABLE gps_test_data (lat DOUBLE, lon DOUBLE, name VARCHAR)
    `);
    await db.connection.run(`
      INSERT INTO gps_test_data VALUES
        (48.8566, 2.3522, 'Paris'),
        (10.0, 250.0, 'Invalid Lon'),
        (20.0, -200.0, 'Invalid Lon 2')
    `);

    const result = await validateGPSColumns(
      'gps_test_data',
      'lat',
      'lon',
      duckClient
    );

    expect(result.isValid).toBe(false);
    expect(result.possibleInversion).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('lon');
  });

  it('returns invalid when no valid coordinates found', async () => {
    await db.connection.run(`
      CREATE TABLE gps_test_data (lat DOUBLE, lon DOUBLE, name VARCHAR)
    `);
    await db.connection.run(`
      INSERT INTO gps_test_data VALUES
        (NULL, NULL, 'Empty'),
        (NULL, 2.3522, 'No Lat'),
        (48.8566, NULL, 'No Lon')
    `);

    const result = await validateGPSColumns(
      'gps_test_data',
      'lat',
      'lon',
      duckClient
    );

    expect(result.isValid).toBe(false);
    expect(result.latStats).toBeNull();
    expect(result.lonStats).toBeNull();
    expect(result.warning).toBeDefined();
  });

  it('handles validation error gracefully', async () => {
    const errorClient: DuckDBClientForGPS = {
      async query(): Promise<unknown> {
        throw new Error('Database connection failed');
      }
    };

    const result = await validateGPSColumns(
      'nonexistent_table',
      'lat',
      'lon',
      errorClient
    );

    expect(result.isValid).toBe(false);
    expect(result.warning).toBeDefined();
  });

  it('correctly handles edge cases at boundary values', async () => {
    await db.connection.run(`
      CREATE TABLE gps_test_data (lat DOUBLE, lon DOUBLE, name VARCHAR)
    `);
    await db.connection.run(`
      INSERT INTO gps_test_data VALUES
        (-90.0, -180.0, 'South Pole West'),
        (90.0, 180.0, 'North Pole East'),
        (0.0, 0.0, 'Null Island')
    `);

    const result = await validateGPSColumns(
      'gps_test_data',
      'lat',
      'lon',
      duckClient
    );

    expect(result.isValid).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.latStats?.min).toBe(-90);
    expect(result.latStats?.max).toBe(90);
    expect(result.lonStats?.min).toBe(-180);
    expect(result.lonStats?.max).toBe(180);
  });
});

describe('detectGPSColumns', () => {
  function createAnalysisResult(name: string): AnalysisResult {
    return {
      name,
      type_simple: DuckDBSimplifiedType.NUMERIC,
      null_count: 0,
      unique_count: 10,
      is_unique: false,
      min_value: null,
      max_value: null,
      avg_value: null,
      sum_value: null,
      median_value: null,
      std_dev: null,
      sample_values: [],
      patterns: [],
      top_values: [],
      geo_type: null,
      geo_confidence: null,
      numeric_type: null,
      decimal_info: null
    };
  }

  it('detects common latitude/longitude column name patterns', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('lat'),
      createAnalysisResult('lon'),
      createAnalysisResult('name')
    ];

    const result = detectGPSColumns(columns);

    expect(result).not.toBeNull();
    expect(result?.lat).toBe('lat');
    expect(result?.lon).toBe('lon');
  });

  it('detects latitude and longitude with various naming conventions', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('latitude'),
      createAnalysisResult('longitude'),
      createAnalysisResult('city')
    ];

    const result = detectGPSColumns(columns);

    expect(result).not.toBeNull();
    expect(result?.lat).toBe('latitude');
    expect(result?.lon).toBe('longitude');
  });

  it('detects GPS columns with coordinate suffixes', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('y_coord'),
      createAnalysisResult('x_coord'),
      createAnalysisResult('id')
    ];

    const result = detectGPSColumns(columns);

    expect(result).not.toBeNull();
    expect(result?.lat).toBe('y_coord');
    expect(result?.lon).toBe('x_coord');
  });

  it('returns null when no GPS columns are found', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('country'),
      createAnalysisResult('population'),
      createAnalysisResult('year')
    ];

    const result = detectGPSColumns(columns);

    expect(result).toBeNull();
  });

  it('returns null when only latitude column is found', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('lat'),
      createAnalysisResult('country'),
      createAnalysisResult('year')
    ];

    const result = detectGPSColumns(columns);

    expect(result).toBeNull();
  });

  it('returns null when only longitude column is found', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('lon'),
      createAnalysisResult('country'),
      createAnalysisResult('year')
    ];

    const result = detectGPSColumns(columns);

    expect(result).toBeNull();
  });

  it('detects GPS columns case-insensitively', () => {
    const columns: AnalysisResult[] = [
      createAnalysisResult('LAT'),
      createAnalysisResult('LON'),
      createAnalysisResult('NAME')
    ];

    const result = detectGPSColumns(columns);

    expect(result).not.toBeNull();
    expect(result?.lat).toBe('LAT');
    expect(result?.lon).toBe('LON');
  });
});
