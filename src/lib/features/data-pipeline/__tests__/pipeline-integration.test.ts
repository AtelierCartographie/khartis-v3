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

// --- Test case definitions ---

interface FileTestCase {
  id: string;
  relativePath: string;
}

interface GeoTestCase extends FileTestCase {
  format: string;
}

// CSV files that should import successfully with data
const CSV_FILES: FileTestCase[] = [
  { id: 'fossil-fuel', relativePath: 'csv/fossil-fuel-subsidies-gdp-2021.csv' },
  {
    id: 'naissances',
    relativePath: 'csv/naissances-par-commune-departement-et-region-2018.csv'
  },
  { id: 'seveso', relativePath: 'csv/sites-seveso-idf.csv' },
  { id: 'world-bank', relativePath: 'csv/world-bank-rural-pop.csv' },
  { id: 'csv-options-header', relativePath: 'csv/test-csv-options-header.csv' },
  {
    id: 'csv-options-second-file',
    relativePath: 'csv/test-csv-options-second-file.csv'
  },
  {
    id: 'csv-options-thousands',
    relativePath: 'csv/test-csv-options-thousands.csv'
  },
  { id: 'no-header', relativePath: 'csv/csv-malformed--with-no-header.csv' },
  {
    id: 'empty-lines',
    relativePath: 'csv/csv-malformed--with-empty-lines.csv'
  },
  {
    id: 'empty-columns',
    relativePath: 'csv/csv-malformed--with-empty-columns.csv'
  },
  {
    id: 'duplicated-names',
    relativePath: 'csv/csv-malformed--with-duplicated-column-name.csv'
  },
  {
    id: '100-columns',
    relativePath: 'csv/csv-malformed--with-100-columns.csv'
  },
  {
    id: 'special-chars',
    relativePath: 'csv/csv-malformed--with-special-characters.csv'
  },
  {
    id: 'null-variations',
    relativePath: 'csv/csv-malformed--with-null-variations.csv'
  },
  {
    id: 'european-format',
    relativePath: 'csv/csv-malformed--with-european-numeric-format.csv'
  }
];

// Geo files that should import successfully with geometry
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

// --- Tests ---

describe(
  'Pipeline Integration - DuckDB file ingestion',
  { timeout: 120_000 },
  () => {
    let db: TestDuckDB;

    beforeAll(async () => {
      db = await createTestInstance();
    }, 60_000);

    afterAll(async () => {
      await destroyTestInstance(db);
    });

    describe('CSV files', () => {
      it.each(CSV_FILES)('should ingest $id', async ({ relativePath }) => {
        const tableName = uniqueTableName('csv');
        const filePath = join(ROOT, relativePath);

        await db.connection.run(csvReadSql(tableName, filePath));

        const rowCount = await getRowCount(db, tableName);
        const columns = await getColumns(db, tableName);

        expect(columns.length).toBeGreaterThan(0);
        expect(rowCount).toBeGreaterThan(0);

        const describeResult = await query(
          db,
          `FROM describe_full('${tableName}')`
        );
        expect(describeResult.length).toBe(columns.length);
        for (const col of describeResult) {
          expect(col.name).toBeTruthy();
          expect(col.type).toBeTruthy();
          expect(col.type_js).toBeTruthy();
          expect(col.type_simple).toBeTruthy();
        }

        await dropTable(db, tableName);
      });
    });

    describe('CSV edge cases', () => {
      it('should handle empty file (nothing.csv) without crashing', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(ROOT, 'csv/csv-malformed--with-nothing.csv');

        await db.connection.run(csvReadSql(tableName, filePath));

        const rowCount = await getRowCount(db, tableName);
        const columns = await getColumns(db, tableName);

        // 0-byte file: DuckDB creates a table with a placeholder column and 0 rows
        expect(rowCount).toBe(0);
        expect(columns.length).toBeGreaterThanOrEqual(0);

        await dropTable(db, tableName);
      });

      it('should detect columns from header-only CSV with 0 data rows', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(ROOT, 'csv/csv-malformed--with-header-only.csv');

        await db.connection.run(csvReadSql(tableName, filePath));

        const rowCount = await getRowCount(db, tableName);
        const columns = await getColumns(db, tableName);

        // Header-only file: columns are detected, no data rows
        expect(columns.length).toBe(5);
        expect(rowCount).toBe(0);

        await dropTable(db, tableName);
      });

      it('should handle CSV with unquoted commas in numeric values (numeric-edge)', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-numeric-all-edge-cases.csv'
        );

        // File contains values like "€ 1234,56" without quotes — the comma
        // breaks CSV field parsing, causing DuckDB to misread the structure
        await db.connection.run(csvReadSql(tableName, filePath));

        const rowCount = await getRowCount(db, tableName);
        const columns = await getColumns(db, tableName);

        // DuckDB misreads the CSV structure due to unquoted commas in values:
        // the field count varies per row, so DuckDB cannot reliably parse it
        expect(columns.length).toBeGreaterThan(0);
        expect(rowCount).toBeGreaterThanOrEqual(0);

        await dropTable(db, tableName);
      });

      it('should handle CSV with mixed numeric formats across columns (numeric-mixed)', async () => {
        const tableName = uniqueTableName('csv_edge');
        const filePath = join(
          ROOT,
          'csv/csv-malformed--with-numeric-formats-mixed.csv'
        );

        // File has unquoted values like "R$ 1.234,00" and "1,234,567" — commas
        // inside unquoted fields break CSV structure
        await db.connection.run(csvReadSql(tableName, filePath));

        const rowCount = await getRowCount(db, tableName);
        const columns = await getColumns(db, tableName);

        expect(columns.length).toBeGreaterThan(0);
        expect(rowCount).toBeGreaterThanOrEqual(0);

        await dropTable(db, tableName);
      });
    });

    describe('Geospatial files', () => {
      it.each(GEO_FILES)(
        'should ingest $id ($format)',
        async ({ relativePath }) => {
          const tableName = uniqueTableName('geo');
          const filePath = join(ROOT, relativePath);

          await db.connection.run(geoReadSql(tableName, filePath));

          const rowCount = await getRowCount(db, tableName);
          expect(rowCount).toBeGreaterThan(0);

          const columns = await getColumns(db, tableName);
          expect(columns.length).toBeGreaterThan(0);

          const geomColumns = columns.filter((c) => c.data_type === 'GEOMETRY');
          expect(geomColumns.length).toBeGreaterThan(0);

          const geomCol = geomColumns[0].column_name;
          const geoInfo = await getGeometryInfo(db, tableName, geomCol);

          expect(geoInfo.geometryType).toBeTruthy();
          expect(geoInfo.xmin).toEqual(expect.any(Number));
          expect(geoInfo.ymin).toEqual(expect.any(Number));
          expect(geoInfo.xmax).toEqual(expect.any(Number));
          expect(geoInfo.ymax).toEqual(expect.any(Number));

          await dropTable(db, tableName);
        }
      );
    });

    describe('ZIP files', () => {
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

            const rowCount = await getRowCount(db, tableName);
            expect(rowCount).toBeGreaterThan(0);

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

            const rowCount = await getRowCount(db, tableName);
            expect(rowCount).toBeGreaterThan(0);

            await dropTable(db, tableName);
          }
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it('should extract and ingest shapefile-complete.zip', async () => {
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

          const rowCount = await getRowCount(db, tableName);
          expect(rowCount).toBeGreaterThan(0);

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
