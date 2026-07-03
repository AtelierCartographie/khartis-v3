import { describe, expect, it, afterAll, beforeAll, vi } from 'vitest';
import path from 'node:path';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from './duckdb-node-helper';

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
  NUMERIC: 'numeric',
  BOOLEAN: 'boolean',
  DATE: 'date',
  STRING: 'string'
} as const;

const FIXTURES = path.resolve(__dirname, '../../static/tests-datasets/csv');

interface ColumnSummary {
  name: string;
  type_simple: string;
  count: number;
  uniques: number;
  nulls: number;
  min?: number;
  max?: number;
  share_integers?: number;
  share_floats?: number;
  share_rank_interval?: number;
  extent_magnitude?: number;
  skewness?: number;
  categories?: string[];
  share_uniques?: number;
  share_nulls?: number;
  id_words?: boolean;
  lat_words?: boolean;
  lon_words?: boolean;
  ratio_words?: boolean;
  rank_words?: boolean;
}

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
});

afterAll(async () => {
  await destroyTestInstance(db);
});

async function loadCsv(
  file: string,
  tableName: string,
  delimiter?: string
): Promise<void> {
  const escapedFile = path.join(FIXTURES, file).replace(/'/g, "''");
  const delimClause = delimiter ? `, delim = '${delimiter}'` : '';
  await run(
    db,
    `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${escapedFile}'${delimClause}, header = true)`
  );
}

function classifyType(sqlType: string): string {
  const upper = sqlType.toUpperCase();
  if (
    upper.includes('INT') ||
    upper.includes('DOUBLE') ||
    upper.includes('FLOAT') ||
    upper.includes('DECIMAL') ||
    upper.includes('BIGINT') ||
    upper.includes('REAL') ||
    upper.includes('NUMERIC')
  )
    return SIMPLE_TYPE.NUMERIC;
  if (upper.includes('BOOL')) return SIMPLE_TYPE.BOOLEAN;
  if (upper.includes('DATE') || upper.includes('TIMESTAMP'))
    return SIMPLE_TYPE.DATE;
  return SIMPLE_TYPE.STRING;
}

function matchesKeywords(name: string, keywords: string[]): boolean {
  const parts = name.toLowerCase().split(/[^a-z0-9%]+/);
  return keywords.some((kw) => parts.includes(kw));
}

async function summarizeColumn(
  table: string,
  column: string
): Promise<ColumnSummary> {
  const escapedCol = column.replace(/"/g, '""');
  const typeRows = await query(
    db,
    `SELECT data_type FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column.replace(/'/g, "''")}'`
  );
  const sqlType = String(typeRows[0]?.data_type ?? 'VARCHAR');
  const rows = await query(
    db,
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT "${escapedCol}") AS uniques,
       COUNT(*) - COUNT("${escapedCol}") AS nulls
     FROM "${table}"`
  );
  const row = rows[0];
  const type_simple = classifyType(sqlType);
  const totalCount = Number(row.total ?? 0);
  const uniqueCount = Number(row.uniques ?? 0);
  const nullCount = Number(row.nulls ?? 0);

  const summary: ColumnSummary = {
    name: column,
    type_simple,
    count: totalCount,
    uniques: uniqueCount,
    nulls: nullCount,
    share_uniques: totalCount > 0 ? uniqueCount / totalCount : 0,
    share_nulls: totalCount > 0 ? nullCount / totalCount : 0,
    id_words: matchesKeywords(column, ['id', 'code', 'name', 'nom', 'iso']),
    lat_words: matchesKeywords(column, ['lat', 'latitude']),
    lon_words: matchesKeywords(column, ['lon', 'lng', 'long', 'longitude']),
    ratio_words: matchesKeywords(column, [
      'ratio',
      'rate',
      'percent',
      'pct',
      '%',
      'taux'
    ]),
    rank_words: matchesKeywords(column, ['rank', 'order', 'niveau', 'level'])
  };

  if (type_simple === SIMPLE_TYPE.NUMERIC) {
    const stats = await query(
      db,
      `SELECT
         MIN(TRY_CAST("${escapedCol}" AS DOUBLE)) AS min_v,
         MAX(TRY_CAST("${escapedCol}" AS DOUBLE)) AS max_v,
         AVG(CASE WHEN TRY_CAST("${escapedCol}" AS BIGINT) IS NOT NULL THEN 1.0 ELSE 0.0 END) AS share_ints,
         AVG(CASE WHEN TRY_CAST("${escapedCol}" AS DOUBLE) IS NOT NULL
                   AND TRY_CAST("${escapedCol}" AS BIGINT) IS NULL
                  THEN 1.0 ELSE 0.0 END) AS share_floats,
         skewness(TRY_CAST("${escapedCol}" AS DOUBLE)) AS skew
       FROM "${table}"
       WHERE "${escapedCol}" IS NOT NULL`
    );
    const s = stats[0];
    summary.min = Number(s.min_v ?? 0);
    summary.max = Number(s.max_v ?? 0);
    summary.share_integers = Number(s.share_ints ?? 0);
    summary.share_floats = Number(s.share_floats ?? 0);
    summary.skewness = s.skew != null ? Number(s.skew) : undefined;
    summary.extent_magnitude =
      summary.max && summary.max > 0
        ? Math.log10(summary.max / Math.max(summary.min ?? 1, 1))
        : 0;
    summary.share_rank_interval = 0;
  }

  if (
    type_simple === SIMPLE_TYPE.STRING &&
    uniqueCount > 0 &&
    uniqueCount <= 24
  ) {
    const catRows = await query(
      db,
      `SELECT DISTINCT "${escapedCol}" AS category FROM "${table}" WHERE "${escapedCol}" IS NOT NULL LIMIT 24`
    );
    summary.categories = catRows.map((r) => String(r.category));
  }

  return summary;
}

const GEOID_THRESHOLD = 0.6;

async function classifyCsv(
  fileName: string,
  tableName: string,
  delimiter?: string
): Promise<Map<string, string>> {
  await loadCsv(fileName, tableName, delimiter);
  const colRows = await query(
    db,
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' ORDER BY ordinal_position`
  );
  const classifications = new Map<string, string>();
  for (const r of colRows) {
    const name = String(r.column_name);
    const summary = await summarizeColumn(tableName, name);
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

  it('CSV-03 fuzzy-countries: entity classifies as QL in the absence of id-word (no code/name/nom in header)', async () => {
    const classes = await classifyCsv('fuzzy-countries.csv', 'csv03');
    // "entity" has no id keyword (id/code/name/nom/iso) so score stays < threshold.
    // Effective classification is QL — the user still picks it as the geo reference
    // in the geolocation step, but the auto-detector does not claim it as geoid.
    expect(classes.get('entity')).toBe('QL');
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
