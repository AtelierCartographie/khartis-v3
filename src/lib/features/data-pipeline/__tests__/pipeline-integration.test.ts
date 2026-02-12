import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  dropTable,
  getColumns,
  getGeometryInfo,
  getRowCount,
  query,
  type TestDuckDB
} from './duckdb-node-helper';

const ROOT = join(process.cwd(), 'tests-datasets');

const NULL_VALUES = `['', ':', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'none', 'NONE']`;

function csvReadSql(tableName: string, filePath: string): string {
  return `CREATE OR REPLACE TABLE "${tableName}" AS FROM read_csv('${filePath}', header=true, decimal_separator='.', normalize_names=true, nullstr=${NULL_VALUES})`;
}

function geoReadSql(tableName: string, filePath: string): string {
  return `CREATE OR REPLACE TABLE "${tableName}" AS FROM ST_Read('${filePath}')`;
}

let tableCounter = 0;

function uniqueTableName(prefix: string): string {
  return `test_${prefix}_${++tableCounter}`;
}

// ---------------------------------------------------------------------------
// Test case definitions — every file in tests-datasets/ must appear here
// ---------------------------------------------------------------------------

interface CsvTestCase {
  id: string;
  relativePath: string;
  minRows: number;
  minCols: number;
}

interface GeoTestCase {
  id: string;
  relativePath: string;
  format: string;
}

// CDC 2.A.1 — CSV files that should import with data
const CSV_VALID: CsvTestCase[] = [
  {
    id: 'fossil-fuel',
    relativePath: 'csv/fossil-fuel-subsidies-gdp-2021.csv',
    minRows: 80,
    minCols: 4
  },
  {
    id: 'naissances',
    relativePath: 'csv/naissances-par-commune-departement-et-region-2018.csv',
    minRows: 34_000,
    minCols: 8
  },
  {
    id: 'seveso',
    relativePath: 'csv/sites-seveso-idf.csv',
    minRows: 90,
    minCols: 3
  },
  {
    id: 'world-bank',
    relativePath: 'csv/world-bank-rural-pop.csv',
    minRows: 200,
    minCols: 5
  },
  {
    id: 'csv-options-header',
    relativePath: 'csv/test-csv-options-header.csv',
    minRows: 1,
    minCols: 2
  },
  {
    id: 'csv-options-second-file',
    relativePath: 'csv/test-csv-options-second-file.csv',
    minRows: 1,
    minCols: 2
  },
  {
    id: 'csv-options-thousands',
    relativePath: 'csv/test-csv-options-thousands.csv',
    minRows: 1,
    minCols: 2
  }
];

// CSV files that are structurally problematic but should not crash
const CSV_MALFORMED: CsvTestCase[] = [
  {
    id: 'no-header',
    relativePath: 'csv/csv-malformed--with-no-header.csv',
    minRows: 1,
    minCols: 1
  },
  {
    id: 'empty-lines',
    relativePath: 'csv/csv-malformed--with-empty-lines.csv',
    minRows: 1,
    minCols: 1
  },
  {
    id: 'empty-columns',
    relativePath: 'csv/csv-malformed--with-empty-columns.csv',
    minRows: 1,
    minCols: 3
  },
  {
    id: 'duplicated-names',
    relativePath: 'csv/csv-malformed--with-duplicated-column-name.csv',
    minRows: 1,
    minCols: 4
  },
  {
    id: '100-columns',
    relativePath: 'csv/csv-malformed--with-100-columns.csv',
    minRows: 1,
    minCols: 90
  },
  {
    id: 'special-chars',
    relativePath: 'csv/csv-malformed--with-special-characters.csv',
    minRows: 1,
    minCols: 3
  },
  {
    id: 'null-variations',
    relativePath: 'csv/csv-malformed--with-null-variations.csv',
    minRows: 1,
    minCols: 5
  },
  {
    id: 'european-format',
    relativePath: 'csv/csv-malformed--with-european-numeric-format.csv',
    minRows: 1,
    minCols: 4
  }
];

// CDC 2.A.2 — Geospatial files: GeoJSON, GeoPackage, Shapefile + extras (GPX, KML)
const GEO_FILES: GeoTestCase[] = [
  {
    id: 'geojson-star-lines',
    relativePath: 'geojson/lignes-du-reseau-star-de-rennes-metropole.geojson',
    format: 'geojson'
  },
  {
    id: 'geojson-nuts2',
    relativePath: 'geojson/nuts2_data.geojson',
    format: 'geojson'
  },
  {
    id: 'gpkg-compagnies-herault',
    relativePath: 'gpkg/compagnies-herault-l93.gpkg',
    format: 'gpkg'
  },
  {
    id: 'gpkg-admin-express-glp',
    relativePath:
      'gpkg/ADMIN-EXPRESS_4-0__GPKG_RGAF09UTM20_GLP_2025-12-05/ADE_4-0_GPKG_RGAF09UTM20_GLP-ED2025-12-05.gpkg',
    format: 'gpkg'
  },
  {
    id: 'gpkg-ade-spaces',
    relativePath: 'gpkg/ADE 4.0 GPKG GLP ED Dec 5 2025.gpkg',
    format: 'gpkg'
  },
  {
    id: 'gpx-star-arrets',
    relativePath:
      'gpx/star_arrets_physiques_actifs/star_arrets_physiques_actifs.gpx',
    format: 'gpx'
  },
  {
    id: 'kml-aires-covoiturage',
    relativePath: 'kml-kmz/aires-covoiturage/aires-covoiturage.kml',
    format: 'kml'
  },
  {
    id: 'shp-ne-50m',
    relativePath: 'shp/ne_50m/ne_50m_admin_0_countries_lakes.shp',
    format: 'shp'
  },
  {
    id: 'shp-star-lines',
    relativePath:
      'shp/lignes-du-reseau-star-de-rennes-metropole/lignes-du-reseau-star-de-rennes-metropole.shp',
    format: 'shp'
  },
  {
    id: 'shp-eez',
    relativePath:
      'shp/Marines-regionsEEZ_land_union_v3_202003/EEZ_Land_v3_202030.shp',
    format: 'shp'
  },
  {
    id: 'shp-mos-foncier',
    relativePath: 'shp/mos_foncier_agrege_com/mos_foncier_agrege_com.shp',
    format: 'shp'
  }
];

// ---------------------------------------------------------------------------

describe(
  'Pipeline Integration — DuckDB file ingestion',
  { timeout: 120_000 },
  () => {
    let db: TestDuckDB;

    beforeAll(async () => {
      db = await createTestInstance();
    }, 60_000);

    afterAll(async () => {
      await destroyTestInstance(db);
    });

    // -----------------------------------------------------------------------
    // CDC 2.A.1 — Import tabulaire (CSV)
    // -----------------------------------------------------------------------

    describe('CDC 2.A.1 — CSV import', () => {
      it.each(CSV_VALID)(
        'should ingest $id (>= $minRows rows, >= $minCols cols)',
        async ({ relativePath, minRows, minCols }) => {
          const tableName = uniqueTableName('csv');
          const filePath = join(ROOT, relativePath);

          await db.connection.run(csvReadSql(tableName, filePath));

          const rowCount = await getRowCount(db, tableName);
          const columns = await getColumns(db, tableName);

          expect(columns.length).toBeGreaterThanOrEqual(minCols);
          expect(rowCount).toBeGreaterThanOrEqual(minRows);

          // CDC 2.A.4 — type detection: every column must have a classified type
          const described = await query(
            db,
            `FROM describe_full('${tableName}')`
          );
          expect(described.length).toBe(columns.length);
          for (const col of described) {
            expect(col.name).toBeTruthy();
            expect(col.type).toBeTruthy();
            expect(col.type_js).toBeTruthy();
            expect([
              'numeric',
              'string',
              'date',
              'geometry',
              'other'
            ]).toContain(col.type_simple);
          }

          await dropTable(db, tableName);
        }
      );
    });

    // -----------------------------------------------------------------------
    // CSV malformed / edge cases — must not crash, graceful handling
    // -----------------------------------------------------------------------

    describe('CSV malformed files — graceful handling', () => {
      it.each(CSV_MALFORMED)(
        'should handle $id without crashing (>= $minCols cols)',
        async ({ relativePath, minCols }) => {
          const tableName = uniqueTableName('csv_m');
          const filePath = join(ROOT, relativePath);

          await db.connection.run(csvReadSql(tableName, filePath));

          const rowCount = await getRowCount(db, tableName);
          const columns = await getColumns(db, tableName);

          expect(columns.length).toBeGreaterThanOrEqual(minCols);
          expect(rowCount).toBeGreaterThan(0);

          await dropTable(db, tableName);
        }
      );

      it('should handle 0-byte file without crashing', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(ROOT, 'csv/csv-malformed--with-nothing.csv');

        await db.connection.run(csvReadSql(tableName, filePath));

        expect(await getRowCount(db, tableName)).toBe(0);
        await dropTable(db, tableName);
      });

      it('should detect columns from header-only file with 0 data rows', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(ROOT, 'csv/csv-malformed--with-header-only.csv');

        await db.connection.run(csvReadSql(tableName, filePath));

        const columns = await getColumns(db, tableName);
        expect(columns.length).toBe(5);
        expect(await getRowCount(db, tableName)).toBe(0);

        await dropTable(db, tableName);
      });

      it('should not crash on unquoted commas in numeric values', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-numeric-all-edge-cases.csv'
        );

        // Commas inside unquoted fields break CSV structure — DuckDB does its best
        await db.connection.run(csvReadSql(tableName, filePath));

        expect((await getColumns(db, tableName)).length).toBeGreaterThan(0);
        await dropTable(db, tableName);
      });

      it('should not crash on mixed numeric formats', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-numeric-formats-mixed.csv'
        );

        await db.connection.run(csvReadSql(tableName, filePath));

        expect((await getColumns(db, tableName)).length).toBeGreaterThan(0);
        await dropTable(db, tableName);
      });
    });

    // -----------------------------------------------------------------------
    // CDC 2.A.4 — Type detection (text, numeric, geo hints)
    // -----------------------------------------------------------------------

    describe('CDC 2.A.4 — type detection', () => {
      it('should detect text and numeric columns on fossil-fuel CSV', async () => {
        const tableName = uniqueTableName('type');
        const filePath = join(ROOT, 'csv/fossil-fuel-subsidies-gdp-2021.csv');
        await db.connection.run(csvReadSql(tableName, filePath));

        const described = await query(db, `FROM describe_full('${tableName}')`);
        const types = described.map((r) => r.type_simple as string);

        expect(types).toContain('string');
        expect(types).toContain('numeric');

        await dropTable(db, tableName);
      });

      it('should detect semantic geo hints (id/code columns)', async () => {
        const tableName = uniqueTableName('type');
        const filePath = join(ROOT, 'csv/fossil-fuel-subsidies-gdp-2021.csv');
        await db.connection.run(csvReadSql(tableName, filePath));

        const described = await query(db, `FROM describe_full('${tableName}')`);
        const codeCol = described.find((r) => r.name === 'code');
        expect(codeCol).toBeTruthy();
        expect(codeCol!.id_words).toBe(true);

        await dropTable(db, tableName);
      });

      it('should recognize null variations as actual NULLs', async () => {
        const tableName = uniqueTableName('type');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-null-variations.csv'
        );
        await db.connection.run(csvReadSql(tableName, filePath));

        // CSV has: null, NULL, NA, N/A, #N/A, NaN, none, NONE, empty string
        // With nullstr config, these should all become SQL NULL
        // DuckDB normalize_names=true prefixes reserved words with _
        const nullCount = await query(
          db,
          `SELECT count(*) - count("_value") AS nulls FROM "${tableName}"`
        );
        expect(Number(nullCount[0].nulls)).toBeGreaterThan(0);

        await dropTable(db, tableName);
      });

      it('should handle empty columns (all NULLs)', async () => {
        const tableName = uniqueTableName('type');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-empty-columns.csv'
        );
        await db.connection.run(csvReadSql(tableName, filePath));

        const stats = await query(
          db,
          `SELECT count("empty_col1") AS filled FROM "${tableName}"`
        );
        expect(Number(stats[0].filled)).toBe(0);

        await dropTable(db, tableName);
      });

      it('should disambiguate duplicated column names', async () => {
        const tableName = uniqueTableName('type');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-duplicated-column-name.csv'
        );
        await db.connection.run(csvReadSql(tableName, filePath));

        const columns = await getColumns(db, tableName);
        const colNames = columns.map((c) => c.column_name);
        const uniqueNames = new Set(colNames);

        // DuckDB normalize_names should make all column names unique
        expect(uniqueNames.size).toBe(colNames.length);

        await dropTable(db, tableName);
      });
    });

    // -----------------------------------------------------------------------
    // CDC 2.A.5.b — Column statistics (direct SQL, see note below)
    //
    // Note: analysis macros using query_table() + "colname" (summary_general,
    // summary_numeric, histogram_*) cannot be tested here. DuckDB Node API v1.4
    // resolves "colname" as a string literal, while DuckDB WASM (production)
    // resolves it as a column reference. Only describe_full works in both.
    // We test the equivalent SQL patterns directly.
    // -----------------------------------------------------------------------

    describe('CDC 2.A.5.b — column statistics', () => {
      const statsTable = uniqueTableName('stats');

      beforeAll(async () => {
        const filePath = join(ROOT, 'csv/fossil-fuel-subsidies-gdp-2021.csv');
        await db.connection.run(csvReadSql(statsTable, filePath));
      });

      afterAll(async () => {
        await dropTable(db, statsTable);
      });

      it('should compute general stats (count, uniques, nulls)', async () => {
        const stats = await query(
          db,
          `SELECT
            count(*) AS total,
            count("code") AS non_null,
            count(DISTINCT "code") AS uniques,
            count(*) - count("code") AS nulls
          FROM "${statsTable}"`
        );
        expect(Number(stats[0].total)).toBeGreaterThan(0);
        expect(Number(stats[0].non_null)).toBeGreaterThan(0);
        expect(Number(stats[0].uniques)).toBeGreaterThan(1);
        expect(Number(stats[0].nulls)).toBeGreaterThanOrEqual(0);
      });

      it('should compute numeric min / max / extent', async () => {
        const cols = await getColumns(db, statsTable);
        const numCol = cols.find(
          (c) =>
            c.data_type === 'DOUBLE' ||
            c.data_type === 'FLOAT' ||
            c.data_type === 'INTEGER' ||
            c.data_type === 'BIGINT'
        );
        expect(numCol).toBeTruthy();

        const stats = await query(
          db,
          `SELECT
            min("${numCol!.column_name}") AS min_val,
            max("${numCol!.column_name}") AS max_val,
            max("${numCol!.column_name}") - min("${numCol!.column_name}") AS extent
          FROM "${statsTable}"`
        );
        expect(Number(stats[0].min_val)).toBeLessThanOrEqual(
          Number(stats[0].max_val)
        );
        expect(Number(stats[0].extent)).toBeGreaterThanOrEqual(0);
      });

      it('should build equi-width histogram bins', async () => {
        const cols = await getColumns(db, statsTable);
        const numCol = cols.find(
          (c) =>
            c.data_type === 'DOUBLE' ||
            c.data_type === 'FLOAT' ||
            c.data_type === 'INTEGER' ||
            c.data_type === 'BIGINT'
        );
        expect(numCol).toBeTruthy();
        const col = numCol!.column_name;

        const bins = await query(
          db,
          `WITH bins AS (
            SELECT equi_width_bins(MIN("${col}"), MAX("${col}"), 15, true) AS bins
            FROM "${statsTable}"
          ), agg AS (
            SELECT list_sort(list_distinct(FIRST(bins))) AS bins, histogram("${col}", bins) AS histogram
            FROM "${statsTable}", bins
          )
          FROM agg, UNNEST(agg.bins) AS u(bin)
          SELECT bin, histogram[bin]::DOUBLE AS count`
        );
        expect(bins.length).toBeGreaterThan(0);
        const total = bins.reduce((s, r) => s + Number(r.count), 0);
        const rowCount = await getRowCount(db, statsTable);
        expect(total).toBeLessThanOrEqual(rowCount);
      });
    });

    // -----------------------------------------------------------------------
    // CDC 2.A.2 — Import géographique (GeoJSON, GeoPackage, Shapefile, GPX, KML)
    // -----------------------------------------------------------------------

    describe('CDC 2.A.2 — geospatial import', () => {
      it.each(GEO_FILES)(
        'should ingest $id ($format) with geometry + data columns',
        async ({ relativePath }) => {
          const tableName = uniqueTableName('geo');
          const filePath = join(ROOT, relativePath);

          await db.connection.run(geoReadSql(tableName, filePath));

          const rowCount = await getRowCount(db, tableName);
          expect(rowCount).toBeGreaterThan(0);

          const columns = await getColumns(db, tableName);

          // Must have at least one geometry column (CDC 2.A.2)
          const geomColumns = columns.filter((c) => c.data_type === 'GEOMETRY');
          expect(geomColumns.length).toBeGreaterThan(0);

          // Must also have data columns (not just geometry)
          const dataColumns = columns.filter((c) => c.data_type !== 'GEOMETRY');
          expect(dataColumns.length).toBeGreaterThan(0);

          // Geometry bounds must be extractable for map display
          const geomCol = geomColumns[0].column_name;
          const geoInfo = await getGeometryInfo(db, tableName, geomCol);

          expect(geoInfo.geometryType).toBeTruthy();
          expect(geoInfo.xmin).toEqual(expect.any(Number));
          expect(geoInfo.ymin).toEqual(expect.any(Number));
          expect(geoInfo.xmax).toEqual(expect.any(Number));
          expect(geoInfo.ymax).toEqual(expect.any(Number));
          expect(geoInfo.xmax).toBeGreaterThanOrEqual(geoInfo.xmin!);
          expect(geoInfo.ymax).toBeGreaterThanOrEqual(geoInfo.ymin!);

          await dropTable(db, tableName);
        }
      );
    });

    // -----------------------------------------------------------------------
    // ZIP extraction — CDC 2.A.2 mentions Shapefile in ZIP
    // -----------------------------------------------------------------------

    describe('ZIP extraction + ingestion', () => {
      it('should extract and ingest single-csv.zip', async () => {
        const zipPath = join(ROOT, 'zip/single-csv.zip');
        const zipBuffer = readFileSync(zipPath);
        const extracted = unzipSync(new Uint8Array(zipBuffer));

        const tmpDir = mkdtempSync(join(tmpdir(), 'khartis-test-'));

        try {
          const csvFiles = Object.entries(extracted).filter(([name]) =>
            name.endsWith('.csv')
          );
          expect(csvFiles.length).toBeGreaterThan(0);

          for (const [name, content] of csvFiles) {
            const filePath = join(tmpDir, name);
            const { writeFileSync, mkdirSync } = await import('fs');
            mkdirSync(join(tmpDir, ...name.split('/').slice(0, -1)), {
              recursive: true
            });
            writeFileSync(filePath, content);

            const tableName = uniqueTableName('zip_csv');
            await db.connection.run(csvReadSql(tableName, filePath));

            expect(await getRowCount(db, tableName)).toBeGreaterThan(0);
            await dropTable(db, tableName);
          }
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it('should extract and ingest multiple-csv.zip', async () => {
        const zipPath = join(ROOT, 'zip/multiple-csv.zip');
        const zipBuffer = readFileSync(zipPath);
        const extracted = unzipSync(new Uint8Array(zipBuffer));

        const tmpDir = mkdtempSync(join(tmpdir(), 'khartis-test-'));

        try {
          const csvFiles = Object.entries(extracted).filter(([name]) =>
            name.endsWith('.csv')
          );
          expect(csvFiles.length).toBeGreaterThanOrEqual(2);

          for (const [name, content] of csvFiles) {
            const filePath = join(tmpDir, name);
            const { writeFileSync, mkdirSync } = await import('fs');
            mkdirSync(join(tmpDir, ...name.split('/').slice(0, -1)), {
              recursive: true
            });
            writeFileSync(filePath, content);

            const tableName = uniqueTableName('zip_multi');
            await db.connection.run(csvReadSql(tableName, filePath));

            expect(await getRowCount(db, tableName)).toBeGreaterThan(0);
            await dropTable(db, tableName);
          }
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it('should extract and ingest shapefile-complete.zip (CDC 2.A.2)', async () => {
        const zipPath = join(ROOT, 'zip/shapefile-complete.zip');
        const zipBuffer = readFileSync(zipPath);
        const extracted = unzipSync(new Uint8Array(zipBuffer));

        const tmpDir = mkdtempSync(join(tmpdir(), 'khartis-test-'));

        try {
          const { writeFileSync, mkdirSync } = await import('fs');

          for (const [name, content] of Object.entries(extracted)) {
            if (name.endsWith('/')) continue;
            const filePath = join(tmpDir, name);
            mkdirSync(join(tmpDir, ...name.split('/').slice(0, -1)), {
              recursive: true
            });
            writeFileSync(filePath, content);
          }

          const shpFile = Object.keys(extracted).find((name) =>
            name.endsWith('.shp')
          );
          expect(shpFile).toBeTruthy();

          const tableName = uniqueTableName('zip_shp');
          await db.connection.run(
            geoReadSql(tableName, join(tmpDir, shpFile!))
          );

          expect(await getRowCount(db, tableName)).toBeGreaterThan(0);

          const columns = await getColumns(db, tableName);
          const geomColumns = columns.filter((c) => c.data_type === 'GEOMETRY');
          expect(geomColumns.length).toBeGreaterThan(0);

          await dropTable(db, tableName);
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      });
    });
  }
);
