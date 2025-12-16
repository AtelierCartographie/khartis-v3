import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Database from 'duckdb';

const DATASETS_PATH = join(process.cwd(), 'tests-datasets');

let db: Database.Database;
let conn: Database.Connection;

describe('DuckDB Pipeline Integration Tests', () => {
  beforeAll(async () => {
    db = new Database.Database(':memory:');
    conn = db.connect();

    // Install and load spatial extension
    await new Promise<void>((resolve, reject) => {
      conn.run('INSTALL spatial; LOAD spatial;', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(() => {
    conn.close();
    db.close();
  });

  function query(sql: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      conn.all(sql, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as unknown[]);
      });
    });
  }

  function run(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      conn.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  describe('CSV File Processing', () => {
    describe('Comma-delimited CSV files', () => {
      const commaDelimitedFiles = [
        'FAOSTAT_data_en_3-4-2024.csv',
        'PostOfficesLocatedinUpperWestRegion_0.csv',
        'UN_population_by_country_2021.csv',
        'archive_financial_secrecy_index_2022.csv',
        'comparitech-ransomware-dataset.csv',
        'fossil-fuel-subsidies-gdp-2021.csv',
        'nuts2_data.csv',
        'world-bank-rural-pop.csv',
        'world_bank_capture_fish_2021.csv'
      ];

      commaDelimitedFiles.forEach((filename) => {
        it(`should read ${filename} with DuckDB`, async () => {
          const filePath = join(DATASETS_PATH, 'csv', filename);
          if (!existsSync(filePath)) {
            console.warn(`Skipping ${filename} - file not found`);
            return;
          }

          const tableName = filename.replace(/[^a-zA-Z0-9]/g, '_');

          await run(`
            CREATE OR REPLACE TABLE ${tableName} AS
            SELECT * FROM read_csv('${filePath}', auto_detect=true, ignore_errors=true)
          `);

          const countResult = await query(
            `SELECT COUNT(*) as cnt FROM ${tableName}`
          );
          const count = (countResult[0] as { cnt: number }).cnt;

          expect(count).toBeGreaterThan(0);

          // Get column info
          const columns = await query(`DESCRIBE ${tableName}`);
          expect(columns.length).toBeGreaterThan(0);

          // Clean up
          await run(`DROP TABLE IF EXISTS ${tableName}`);
        });
      });
    });

    describe('Semicolon-delimited CSV files', () => {
      const semicolonFiles = [
        'naissances-par-commune-departement-et-region-2018.csv',
        'sites-seveso-idf.csv'
      ];

      semicolonFiles.forEach((filename) => {
        it(`should read ${filename} with DuckDB (semicolon delimiter)`, async () => {
          const filePath = join(DATASETS_PATH, 'csv', filename);
          if (!existsSync(filePath)) {
            console.warn(`Skipping ${filename} - file not found`);
            return;
          }

          const tableName = filename.replace(/[^a-zA-Z0-9]/g, '_');

          await run(`
            CREATE OR REPLACE TABLE ${tableName} AS
            SELECT * FROM read_csv('${filePath}', delim=';', auto_detect=true, ignore_errors=true)
          `);

          const countResult = await query(
            `SELECT COUNT(*) as cnt FROM ${tableName}`
          );
          const count = (countResult[0] as { cnt: number }).cnt;

          expect(count).toBeGreaterThan(0);

          // Clean up
          await run(`DROP TABLE IF EXISTS ${tableName}`);
        });
      });
    });

    describe('Files with spaces in names', () => {
      it('should handle "population projection Upper West 2010-2020.csv"', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'population projection Upper West 2010-2020.csv'
        );
        if (!existsSync(filePath)) return;

        await run(`
          CREATE OR REPLACE TABLE pop_projection AS
          SELECT * FROM read_csv('${filePath}', auto_detect=true)
        `);

        const countResult = await query(
          'SELECT COUNT(*) as cnt FROM pop_projection'
        );
        const count = (countResult[0] as { cnt: number }).cnt;

        expect(count).toBeGreaterThan(0);
        await run('DROP TABLE IF EXISTS pop_projection');
      });

      it('should handle "TOP15 medailles OR jeux olymiques 2024.csv"', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'TOP15 medailles OR jeux olymiques 2024.csv'
        );
        if (!existsSync(filePath)) return;

        await run(`
          CREATE OR REPLACE TABLE top15_medailles AS
          SELECT * FROM read_csv('${filePath}', auto_detect=true)
        `);

        const countResult = await query(
          'SELECT COUNT(*) as cnt FROM top15_medailles'
        );
        const count = (countResult[0] as { cnt: number }).cnt;

        expect(count).toBeGreaterThan(0);
        await run('DROP TABLE IF EXISTS top15_medailles');
      });
    });
  });

  describe('Spatial File Processing', () => {
    it('should read GeoJSON file with ST_Read', async () => {
      const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
      if (!existsSync(filePath)) return;

      await run(`
        CREATE OR REPLACE TABLE nuts2_geojson AS
        SELECT * FROM ST_Read('${filePath}')
      `);

      const countResult = await query(
        'SELECT COUNT(*) as cnt FROM nuts2_geojson'
      );
      const count = (countResult[0] as { cnt: number }).cnt;

      expect(count).toBeGreaterThan(200);

      // Verify geometry column exists
      const columns = await query('DESCRIBE nuts2_geojson');
      const hasGeometry = (columns as { column_name: string }[]).some(
        (col) => col.column_name === 'geom' || col.column_name === 'geometry'
      );
      expect(hasGeometry).toBe(true);

      await run('DROP TABLE IF EXISTS nuts2_geojson');
    });

    it('should read Shapefile with ST_Read', async () => {
      const filePath = join(
        DATASETS_PATH,
        'spatial',
        'ne_50m_admin_0_countries_lakes.shp'
      );
      if (!existsSync(filePath)) return;

      await run(`
        CREATE OR REPLACE TABLE countries AS
        SELECT * FROM ST_Read('${filePath}')
      `);

      const countResult = await query('SELECT COUNT(*) as cnt FROM countries');
      const count = (countResult[0] as { cnt: number }).cnt;

      expect(count).toBeGreaterThan(200);

      await run('DROP TABLE IF EXISTS countries');
    });
  });

  describe('Data Analysis Functions', () => {
    it('should compute statistics on CSV data', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'nuts2_data.csv');
      if (!existsSync(filePath)) return;

      await run(`
        CREATE OR REPLACE TABLE nuts2_stats AS
        SELECT * FROM read_csv('${filePath}', auto_detect=true)
      `);

      // Test aggregate functions that the pipeline uses
      const stats = await query(`
        SELECT
          COUNT(*) as total_count,
          COUNT(DISTINCT NUTS_ID) as unique_nuts,
          AVG(POP_TOT_2023) as avg_population,
          MIN(POP_TOT_2023) as min_population,
          MAX(POP_TOT_2023) as max_population
        FROM nuts2_stats
      `);

      const result = stats[0] as {
        total_count: number;
        unique_nuts: number;
        avg_population: number;
        min_population: number;
        max_population: number;
      };

      expect(result.total_count).toBeGreaterThan(300);
      expect(result.unique_nuts).toBeGreaterThan(200);
      expect(result.avg_population).toBeGreaterThan(0);

      await run('DROP TABLE IF EXISTS nuts2_stats');
    });

    it('should detect column types correctly', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'nuts2_data.csv');
      if (!existsSync(filePath)) return;

      await run(`
        CREATE OR REPLACE TABLE type_test AS
        SELECT * FROM read_csv('${filePath}', auto_detect=true)
      `);

      const columns = await query('DESCRIBE type_test');
      const columnTypes = columns as { column_name: string; column_type: string }[];

      // NUTS_ID should be VARCHAR (string)
      const nutsCol = columnTypes.find((c) => c.column_name === 'NUTS_ID');
      expect(nutsCol?.column_type).toBe('VARCHAR');

      // Population columns should be numeric
      const popCol = columnTypes.find((c) => c.column_name === 'POP_TOT_2023');
      expect(['BIGINT', 'DOUBLE', 'INTEGER']).toContain(popCol?.column_type);

      await run('DROP TABLE IF EXISTS type_test');
    });
  });

  describe('BOM and Encoding Handling', () => {
    it('should handle UTF-8 BOM in CSV files', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'UN_population_by_country_2021.csv');
      if (!existsSync(filePath)) return;

      // DuckDB should handle BOM automatically
      await run(`
        CREATE OR REPLACE TABLE un_pop AS
        SELECT * FROM read_csv('${filePath}', auto_detect=true)
      `);

      const columns = await query('DESCRIBE un_pop');
      const firstCol = (columns as { column_name: string }[])[0];

      // First column name should NOT start with BOM character
      expect(firstCol.column_name.charCodeAt(0)).not.toBe(0xfeff);

      await run('DROP TABLE IF EXISTS un_pop');
    });
  });

  describe('Coordinate Detection', () => {
    it('should read coordinate columns correctly', async () => {
      const filePath = join(
        DATASETS_PATH,
        'csv',
        'PostOfficesLocatedinUpperWestRegion_0.csv'
      );
      if (!existsSync(filePath)) return;

      await run(`
        CREATE OR REPLACE TABLE post_offices AS
        SELECT * FROM read_csv('${filePath}', auto_detect=true)
      `);

      // Check latitude/longitude ranges
      const coordStats = await query(`
        SELECT
          MIN(Latitude) as min_lat,
          MAX(Latitude) as max_lat,
          MIN(Longitude) as min_lon,
          MAX(Longitude) as max_lon
        FROM post_offices
        WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL
      `);

      const result = coordStats[0] as {
        min_lat: number;
        max_lat: number;
        min_lon: number;
        max_lon: number;
      };

      // Valid coordinate ranges
      expect(result.min_lat).toBeGreaterThanOrEqual(-90);
      expect(result.max_lat).toBeLessThanOrEqual(90);
      expect(result.min_lon).toBeGreaterThanOrEqual(-180);
      expect(result.max_lon).toBeLessThanOrEqual(180);

      await run('DROP TABLE IF EXISTS post_offices');
    });
  });
});
