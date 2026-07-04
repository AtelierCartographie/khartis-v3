import { describe, expect, it, afterAll, beforeAll, vi } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
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

import { detectSemioType } from '$lib/features/commons/utils/semio-detector.utils';

const SIMPLE_TYPE = {
  NUMERIC: 'numeric'
} as const;

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
});

afterAll(async () => {
  await destroyTestInstance(db);
});

const GEOID_THRESHOLD = 0.6;

async function classifyCsv(
  fileName: string,
  tableName: string,
  delimiter?: string
): Promise<Map<string, string>> {
  await loadCsv(db, fileName, tableName, delimiter);
  const columnNames = await listColumns(db, tableName);
  const classifications = new Map<string, string>();
  for (const name of columnNames) {
    const summary = await summarizeColumn(db, tableName, name);
    const result = detectSemioType(summary as never);
    // Apply the UI's threshold: geoid only counts when score >= 4
    const effective =
      result.semioType === 'geoid' && result.semioScore < GEOID_THRESHOLD
        ? summary.type_simple === SIMPLE_TYPE.NUMERIC
          ? 'QTA'
          : 'QL'
        : result.semioType;
    classifications.set(name, effective);
  }
  return classifications;
}

describe('[S01 Phase 2] semio-detector on real CSV fixtures', () => {
  it('CSV-01 fossil-fuel-subsidies: Code → geoid (ISO3), year detected as ordered (QLO)', async () => {
    const classes = await classifyCsv(
      'fossil-fuel-subsidies-gdp-2021.csv',
      'csv01'
    );
    expect(classes.get('Code')).toBe('geoid');
    const yearClass =
      classes.get('Year') ?? classes.get('Année') ?? classes.get('_year');
    expect(yearClass).toBe('QLO');
  });

  it('CSV-02 naissances: Code INSEE Commune + Code Département → geoid, Naissances → QTA', async () => {
    const classes = await classifyCsv(
      'naissances-par-commune-departement-et-region-2018.csv',
      'csv02',
      ';'
    );
    expect(classes.get('Code INSEE Commune')).toBe('geoid');
    expect(classes.get('Code Département')).toBe('geoid');
    expect(classes.get('Naissances')).toBe('QTA');
  });

  it('CSV-03 fuzzy-countries: entity classifies as label (near-unique text names)', async () => {
    const classes = await classifyCsv('fuzzy-countries.csv', 'csv03');
    expect(classes.get('entity')).toBe('label');
  });

  it('CSV-04 sites-seveso-idf: Lat → geolat, Long → geolon', async () => {
    const classes = await classifyCsv('sites-seveso-idf.csv', 'csv04');
    const latClass = classes.get('Lat') ?? classes.get('lat');
    const lonClass =
      classes.get('Long') ?? classes.get('long') ?? classes.get('Lon');
    expect(latClass).toBe('geolat');
    expect(lonClass).toBe('geolon');
  });

  it('CSV-05 world-bank-rural-pop: Country Code → geoid', async () => {
    const classes = await classifyCsv('world-bank-rural-pop.csv', 'csv05');
    const countryCode =
      classes.get('Country Code') ??
      classes.get('country_code') ??
      classes.get('CountryCode');
    expect(countryCode).toBe('geoid');
  });

  it('CSV-06 viz-toolbox: lat/long detected + category QL', async () => {
    const classes = await classifyCsv(
      'visualization-toolbox-cases.csv',
      'csv06'
    );
    expect(classes.get('lat')).toBe('geolat');
    expect(classes.get('long')).toBe('geolon');
    expect(classes.get('category')).toBe('QL');
  });

  it('CSV-07 tiny-geo-enrich: id → geoid, category → QL', async () => {
    const classes = await classifyCsv('tiny-geo-3features-enrich.csv', 'csv07');
    expect(classes.get('id')).toBe('geoid');
    expect(classes.get('population_2024')).toBe('QTA');
    expect(classes.get('category')).toBe('QL');
  });

  it('CSV-08 france-regions: Code Région 2016 → geoid', async () => {
    const classes = await classifyCsv(
      'france-regions-simplification-check.csv',
      'csv08'
    );
    const codeRegion =
      classes.get('Code Région 2016') ??
      classes.get('code_region_2016') ??
      classes.get('code_region') ??
      classes.get('Code_Region_2016');
    expect(codeRegion).toBe('geoid');
  });

  it('CSV-09 gcpnt custom GPS: gcpnt_lat/gcpnt_lon detected via keyword fallback', async () => {
    const classes = await classifyCsv('tabular-gps-gcpnt-columns.csv', 'csv09');
    expect(classes.get('gcpnt_lat')).toBe('geolat');
    expect(classes.get('gcpnt_lon')).toBe('geolon');
  });
});
