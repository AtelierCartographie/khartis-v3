import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from './duckdb-node-helper';
import { listColumns, loadCsv, summarizeColumn } from './semio-fixture-helper';

vi.mock('$lib/features/duckdb', () => ({
  DuckDBSimplifiedType: {
    NUMERIC: 'numeric',
    BOOLEAN: 'boolean',
    DATE: 'date',
    STRING: 'string',
    GEOMETRY: 'geometry',
    OTHER: 'other'
  }
}));

import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import {
  buildGeoDetection,
  type GeoDetectionColumn,
  type GeoDetectionResult
} from '$lib/features/commons/utils/geo-detection.utils';
import { resolveGPSCoordinateColumns } from '$lib/features/commons/utils/gps-columns.utils';
import { detectSemioType } from '$lib/features/commons/utils/semio-detector.utils';
import { join_macros } from '$lib/features/duckdb/macros/join';
import { matchColumnsAgainstCatalog } from '$lib/features/duckdb/orchestrator/geo-detection-ops';

function identifiers(detection: GeoDetectionResult): string[] {
  return detection.geoColumns
    .filter((column) => column.type === GEO_COLUMN_TYPE.IDENTIFIER)
    .map((column) => column.columnName);
}

describe('buildGeoDetection', () => {
  const countryCode: GeoDetectionColumn = {
    name: 'Country Code',
    semioType: 'geoid',
    semioScore: 1,
    shareUniques: 1
  };
  const countryName: GeoDetectionColumn = {
    name: 'Country Name',
    semioType: 'label',
    semioScore: 1,
    shareUniques: 1
  };
  const value: GeoDetectionColumn = {
    name: 'value',
    semioType: 'QTA',
    semioScore: 0.7,
    shareUniques: 1
  };
  const catalog = (column: string, matched: number, distinct = 100) => ({
    column,
    distinctValues: distinct,
    matchedValues: matched,
    basemaps: ['monde-countries-2024-high']
  });

  it('should prefer a catalog code over a catalog name when both are unique', () => {
    const detection = buildGeoDetection(
      [countryName, countryCode, value],
      [catalog('Country Code', 82), catalog('Country Name', 81)]
    );

    expect(detection.suggestedPrimaryGeoColumn?.columnName).toBe(
      'Country Code'
    );
    expect(identifiers(detection)).toEqual(['Country Code', 'Country Name']);
  });

  it('should keep a unique code as identifier when the catalog does not know it', () => {
    const detection = buildGeoDetection(
      [
        {
          name: 'site_id',
          semioType: 'geoid',
          semioScore: 0.9,
          shareUniques: 1
        }
      ],
      [catalog('site_id', 0)]
    );

    expect(detection.suggestedPrimaryGeoColumn?.columnName).toBe('site_id');
    expect(
      detection.suggestedPrimaryGeoColumn?.catalogBasemaps
    ).toBeUndefined();
  });

  it('should rank a catalog column first even when its values repeat', () => {
    const detection = buildGeoDetection(
      [
        {
          name: 'pays',
          semioType: 'label',
          semioScore: 0.8,
          shareUniques: 0.002
        },
        { name: 'row', semioType: 'geoid', semioScore: 0.54, shareUniques: 1 }
      ],
      [catalog('pays', 6, 6)]
    );

    expect(detection.suggestedPrimaryGeoColumn?.columnName).toBe('pays');
  });

  it('should ignore catalog matches on fewer than five distinct values', () => {
    const detection = buildGeoDetection(
      [{ name: 'flag', semioType: 'QL', semioScore: 1, shareUniques: 0.01 }],
      [catalog('flag', 3, 3)]
    );

    expect(detection.hasGeoColumns).toBe(false);
  });

  it('should not report coordinates for a dataset that has a geometry', () => {
    const columns: GeoDetectionColumn[] = [
      { name: 'lat', semioType: 'geolat', semioScore: 1 },
      { name: 'lon', semioType: 'geolon', semioScore: 1 }
    ];

    expect(buildGeoDetection(columns, []).geoColumns).toHaveLength(2);
    expect(
      buildGeoDetection(columns, [], { hasGeometry: true }).hasGeoColumns
    ).toBe(false);
  });
});

const ATTRIBUTES_PATH = path
  .resolve(__dirname, '../../static/basemaps/all-basemaps-attributes.parquet')
  .replace(/'/g, "''");

describe('geo detection on real files', () => {
  let db: TestDuckDB;
  const duck = {
    query: async (sql: string) => {
      const rows = await query(db, sql);
      return {
        numRows: rows.length,
        get: (index: number) => rows[index],
        toArray: () => rows
      };
    }
  };

  beforeAll(async () => {
    db = await createTestInstance();
    await run(db, join_macros);
    await run(
      db,
      `CREATE TABLE basemap_attributes AS
       SELECT normalized, UNNEST(basemaps) AS basemap
       FROM read_parquet('${ATTRIBUTES_PATH}')`
    );
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  async function detect(table: string): Promise<GeoDetectionResult> {
    const columns: GeoDetectionColumn[] = [];
    const candidates: string[] = [];
    for (const name of await listColumns(db, table)) {
      const summary = await summarizeColumn(db, table, name);
      const semio = detectSemioType(summary as never);
      columns.push({
        name,
        semioType: semio.semioType,
        semioScore: semio.semioScore,
        shareUniques: summary.share_uniques
      });
      if (summary.type_simple === 'string' || semio.semioType === 'geoid') {
        candidates.push(name);
      }
    }
    return buildGeoDetection(
      columns,
      await matchColumnsAgainstCatalog(table, candidates, duck)
    );
  }

  it('should pick the ISO code of a world table', async () => {
    await loadCsv(
      db,
      '../../static/examples/data/world-population-2023.csv',
      'world'
    );
    const detection = await detect('world');

    expect(detection.suggestedPrimaryGeoColumn?.columnName).toBe(
      'Country Code'
    );
    expect(identifiers(detection)).toContain('Country Name');
  });

  it('should pick the INSEE code of a commune table', async () => {
    await loadCsv(
      db,
      'naissances-par-commune-departement-et-region-2018.csv',
      'naissances',
      ';'
    );
    const detection = await detect('naissances');

    expect(detection.suggestedPrimaryGeoColumn?.columnName).toBe(
      'Code INSEE Commune'
    );
    expect(
      detection.suggestedPrimaryGeoColumn?.catalogBasemaps?.length
    ).toBeGreaterThan(0);
  });

  it('should keep country names and ignore continents', async () => {
    await loadCsv(db, 'SIPRI-Milex-data-1949-2025_v1.2-KHARTIS.csv', 'sipri');
    const detection = await detect('sipri');

    expect(identifiers(detection)).toContain('Country');
    expect(identifiers(detection)).not.toContain('Continent');
  });

  it('should find coordinates and leave site names aside', async () => {
    await loadCsv(db, 'sites-seveso-idf.csv', 'seveso', ';');
    const detection = await detect('seveso');
    const byName = new Map(
      detection.geoColumns.map((column) => [column.columnName, column.type])
    );

    expect(byName.get('Lat')).toBe(GEO_COLUMN_TYPE.LATITUDE);
    expect(byName.get('Long')).toBe(GEO_COLUMN_TYPE.LONGITUDE);
    expect(byName.has("Nom de l'installation")).toBe(false);
  });
});

describe('resolveGPSCoordinateColumns', () => {
  it('resolves lat/lon by column name pattern', () => {
    const columns = [{ name: 'lat' }, { name: 'lon' }, { name: 'population' }];
    const result = resolveGPSCoordinateColumns(columns);
    expect(result).not.toBeNull();
    expect(result?.lat).toBe('lat');
    expect(result?.lon).toBe('lon');
  });

  it('returns null when no coordinate columns found', () => {
    const columns = [{ name: 'country' }, { name: 'population' }];
    expect(resolveGPSCoordinateColumns(columns)).toBeNull();
  });

  it('returns null when only lat is present (no lon)', () => {
    const columns = [{ name: 'lat' }, { name: 'country' }];
    expect(resolveGPSCoordinateColumns(columns)).toBeNull();
  });

  it('resolves numeric x/y columns through the semio geolat/geolon path', () => {
    const columns = [
      { name: 'x', semioType: 'geolon' },
      { name: 'y', semioType: 'geolat' },
      { name: 'habitants' }
    ];
    const result = resolveGPSCoordinateColumns(columns);
    expect(result?.lat).toBe('y');
    expect(result?.lon).toBe('x');
  });

  it('prefers geo_detection metadata over name heuristics', () => {
    const columns = [{ name: 'col_a' }, { name: 'col_b' }];
    const geoDetection = {
      geoColumns: [
        {
          columnName: 'col_a',
          type: 'latitude' as const,
          confidence: 0.95,
          index: 0
        },
        {
          columnName: 'col_b',
          type: 'longitude' as const,
          confidence: 0.95,
          index: 1
        }
      ]
    };
    const result = resolveGPSCoordinateColumns(columns, geoDetection);
    expect(result?.lat).toBe('col_a');
    expect(result?.lon).toBe('col_b');
  });
});
