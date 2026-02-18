import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

// Mock paraglide messages (used by getGeoColumnDescription only)
vi.mock('$lib/paraglide/messages', () => ({
  geo_detector_latitude: () => 'Latitude coordinates',
  geo_detector_longitude: () => 'Longitude coordinates',
  geo_detector_country_name: () => 'Country names',
  geo_detector_iso2: () => 'ISO Alpha-2 country codes',
  geo_detector_iso3: () => 'ISO Alpha-3 country codes',
  geo_detector_nuts: () => 'NUTS codes',
  geo_detector_region: () => 'Regions',
  geo_detector_city: () => 'Cities',
  geo_detector_coordinates: () => 'Coordinates',
  geo_detector_unknown: () => 'Unknown',
  geo_detector_default: () => 'Default'
}));

import { GeoColumnDetector } from './geo-detector.utils';
import type { GeoColumnResult } from './geo-detector.utils';

/**
 * Parse a CSV string into headers + data rows for GeoColumnDetector.
 */
function parseCsvForDetector(csv: string): {
  headers: string[];
  data: unknown[][];
} {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  const data = lines.slice(1).map((line) => {
    const values: unknown[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });

  return { headers, data };
}

describe('GeoColumnDetector - fossil-fuel CSV (ISO3 detection)', () => {
  const csvPath = join(
    process.cwd(),
    'tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv'
  );
  const csvContent = readFileSync(csvPath, 'utf-8');
  const { headers, data } = parseCsvForDetector(csvContent);

  it('should parse the CSV with correct structure', () => {
    expect(headers).toEqual([
      'Entity',
      'Code',
      'Year',
      'Fossil-fuel subsidies (consumption and production) as a proportion of total GDP (%)'
    ]);
    expect(data.length).toBeGreaterThanOrEqual(80);
  });

  it('should detect both Entity (country_name) and Code (iso3) columns', async () => {
    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const entityColumn = result.geoColumns.find(
      (col) => col.columnName === 'Entity'
    );
    const codeColumn = result.geoColumns.find(
      (col) => col.columnName === 'Code'
    );

    expect(entityColumn).toBeDefined();
    expect(entityColumn!.type).toBe('country_name');

    expect(codeColumn).toBeDefined();
    expect(codeColumn!.type).toBe('iso3');
  });

  it('should select Entity (country_name) over Code (iso3) as primary geo column', async () => {
    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    expect(result.suggestedPrimaryGeoColumn).toBeDefined();
    expect(result.suggestedPrimaryGeoColumn!.type).toBe('country_name');
    expect(result.suggestedPrimaryGeoColumn!.columnName).toBe('Entity');
  });

  it('should not produce warnings for this dataset', async () => {
    const result = await GeoColumnDetector.detectGeoColumns(headers, data);
    expect(result.warnings).toHaveLength(0);
  });

  it('should not detect Year or numeric columns as geo', async () => {
    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const yearColumn = result.geoColumns.find(
      (col) => col.columnName === 'Year'
    );
    const subsidyColumn = result.geoColumns.find(
      (col) =>
        col.columnName ===
        'Fossil-fuel subsidies (consumption and production) as a proportion of total GDP (%)'
    );

    expect(yearColumn).toBeUndefined();
    expect(subsidyColumn).toBeUndefined();
  });
});

describe('GeoColumnDetector - ISO3 value-based detection', () => {
  it('should detect a column of ISO3 codes by values alone', async () => {
    const headers = ['id', 'country_iso'];
    const iso3Values = [
      ['1', 'FRA'],
      ['2', 'DEU'],
      ['3', 'ESP'],
      ['4', 'ITA'],
      ['5', 'GBR'],
      ['6', 'POL'],
      ['7', 'NLD'],
      ['8', 'BEL'],
      ['9', 'PRT'],
      ['10', 'GRC']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(
      headers,
      iso3Values
    );

    const isoCol = result.geoColumns.find((col) => col.type === 'iso3');
    expect(isoCol).toBeDefined();
    expect(isoCol!.columnName).toBe('country_iso');
    expect(isoCol!.confidence).toBeGreaterThan(0.8);
  });

  it('should detect iso3 via column name pattern (country_code)', async () => {
    const headers = ['country_code', 'value'];
    const data = [
      ['FRA', '100'],
      ['DEU', '200'],
      ['ESP', '300'],
      ['ITA', '400']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const geoCol = result.geoColumns.find(
      (col) => col.columnName === 'country_code'
    );
    expect(geoCol).toBeDefined();
    expect(geoCol!.type).toBe('iso3');
  });

  it('should reject a column with insufficient distinct ISO3 values', async () => {
    const headers = ['code'];
    // All same value - not enough distinct codes
    const data = Array.from({ length: 20 }, () => ['FRA']);

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const isoCol = result.geoColumns.find((col) => col.type === 'iso3');
    expect(isoCol).toBeUndefined();
  });

  it('should not confuse ISO3 with ISO2 codes', async () => {
    const headers = ['geo'];
    const iso2Data = [
      ['FR'],
      ['DE'],
      ['ES'],
      ['IT'],
      ['GB'],
      ['PL'],
      ['NL'],
      ['BE'],
      ['PT'],
      ['GR']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, iso2Data);

    const geoCol = result.geoColumns.find((col) => col.columnName === 'geo');
    if (geoCol) {
      expect(geoCol.type).toBe('iso2');
    }
  });
});

describe('GeoColumnDetector - selectPrimaryGeoColumn', () => {
  it('should prefer country_name over iso3', () => {
    const columns: GeoColumnResult[] = [
      {
        index: 0,
        columnName: 'Entity',
        type: 'country_name',
        confidence: 0.7
      },
      { index: 1, columnName: 'Code', type: 'iso3', confidence: 0.95 }
    ];

    const primary = GeoColumnDetector.selectPrimaryGeoColumn(columns);
    expect(primary).toBeDefined();
    expect(primary!.type).toBe('country_name');
  });

  it('should prefer iso3 over iso2', () => {
    const columns: GeoColumnResult[] = [
      { index: 0, columnName: 'alpha2', type: 'iso2', confidence: 0.9 },
      { index: 1, columnName: 'alpha3', type: 'iso3', confidence: 0.9 }
    ];

    const primary = GeoColumnDetector.selectPrimaryGeoColumn(columns);
    expect(primary).toBeDefined();
    expect(primary!.type).toBe('iso3');
  });

  it('should return undefined for empty column list', () => {
    const primary = GeoColumnDetector.selectPrimaryGeoColumn([]);
    expect(primary).toBeUndefined();
  });

  it('should pick highest confidence within same type', () => {
    const columns: GeoColumnResult[] = [
      { index: 0, columnName: 'code1', type: 'iso3', confidence: 0.7 },
      { index: 1, columnName: 'code2', type: 'iso3', confidence: 0.95 }
    ];

    const primary = GeoColumnDetector.selectPrimaryGeoColumn(columns);
    expect(primary!.columnName).toBe('code2');
  });
});

describe('GeoColumnDetector - Entity column detection', () => {
  it('should detect Entity column as country_name by name pattern', async () => {
    const headers = ['Entity', 'Value'];
    const data = [
      ['France', '100'],
      ['Germany', '200'],
      ['Spain', '300']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const entityCol = result.geoColumns.find(
      (col) => col.columnName === 'Entity'
    );
    expect(entityCol).toBeDefined();
    expect(entityCol!.type).toBe('country_name');
  });

  it('should detect Area column as country_name by name pattern', async () => {
    const headers = ['Area', 'Population'];
    const data = [
      ['France', '67000000'],
      ['Germany', '83000000']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const areaCol = result.geoColumns.find((col) => col.columnName === 'Area');
    expect(areaCol).toBeDefined();
    expect(areaCol!.type).toBe('country_name');
  });

  it('should prefer country_name (Entity) over iso3 for primary selection', async () => {
    const csvPath = join(
      process.cwd(),
      'tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv'
    );
    const csvContent = readFileSync(csvPath, 'utf-8');
    const { headers, data } = parseCsvForDetector(csvContent);

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    expect(result.suggestedPrimaryGeoColumn).toBeDefined();
    expect(result.suggestedPrimaryGeoColumn!.type).toBe('country_name');
    expect(result.suggestedPrimaryGeoColumn!.columnName).toBe('Entity');
  });

  it('should detect country_name from values when column name does not match', async () => {
    const headers = ['location', 'value'];
    const data = [
      ['France', '100'],
      ['Germany', '200'],
      ['Spain', '300'],
      ['Italy', '400'],
      ['Poland', '500'],
      ['Brazil', '600'],
      ['Argentina', '700'],
      ['Japan', '800'],
      ['China', '900'],
      ['India', '1000']
    ];

    const result = await GeoColumnDetector.detectGeoColumns(headers, data);

    const geoCol = result.geoColumns.find(
      (col) => col.columnName === 'location'
    );
    expect(geoCol).toBeDefined();
    expect(geoCol!.type).toBe('country_name');
    expect(geoCol!.confidence).toBeGreaterThan(0.3);
  });
});
