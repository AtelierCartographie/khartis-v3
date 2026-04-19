import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from './duckdb-node-helper';

const FIXTURES_ROOT = path.resolve(
  __dirname,
  '../../static/tests-datasets/csv'
);

const malformed = (name: string): string => path.join(FIXTURES_ROOT, name);

type CsvOptionValue = string | number | boolean | readonly string[];

function formatCsvOption(key: string, value: CsvOptionValue): string {
  if (Array.isArray(value)) {
    const list = (value as readonly string[])
      .map((item) => `'${item.replace(/'/g, "''")}'`)
      .join(', ');
    return `${key} = [${list}]`;
  }
  if (typeof value === 'string') {
    return `${key} = '${value.replace(/'/g, "''")}'`;
  }
  return `${key} = ${value}`;
}

function readCsvViaDuckDB(
  db: TestDuckDB,
  file: string,
  options: Record<string, CsvOptionValue> = {}
) {
  const escapedFile = file.replace(/'/g, "''");
  const optionEntries = Object.entries(options)
    .map(([key, value]) => formatCsvOption(key, value))
    .join(', ');
  const optionClause = optionEntries.length > 0 ? `, ${optionEntries}` : '';
  return query(
    db,
    `SELECT * FROM read_csv_auto('${escapedFile}'${optionClause})`
  );
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('[S07] Malformed CSV robustness — fixtures under tests-datasets/csv', () => {
  it('ERR-01 (100 columns): read_csv_auto returns a wide table without crashing', async () => {
    const file = malformed('csv-malformed--with-100-columns.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).length).toBeGreaterThanOrEqual(50);
  });

  it('ERR-02 (duplicate column names): DuckDB auto-renames or rejects cleanly', async () => {
    const file = malformed('csv-malformed--with-duplicated-column-name.csv');
    expect(await fileExists(file)).toBe(true);
    // DuckDB may either rename columns automatically or throw — both are acceptable per CDC
    try {
      const rows = await readCsvViaDuckDB(db, file);
      const keys = Object.keys(rows[0]);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('ERR-03 (empty columns): DuckDB reads with null values for empty cells', async () => {
    const file = malformed('csv-malformed--with-empty-columns.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('ERR-04 (empty lines): DuckDB parses the file and preserves non-empty rows', async () => {
    const file = malformed('csv-malformed--with-empty-lines.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows.length).toBeGreaterThan(0);
    const nonEmptyRows = rows.filter((row) => {
      const values = Object.values(row);
      return values.some(
        (v) => v !== null && v !== undefined && String(v) !== ''
      );
    });
    expect(nonEmptyRows.length).toBeGreaterThanOrEqual(5);
  });

  it('ERR-05 (European format): DuckDB can read with explicit decimal separator', async () => {
    const file = malformed('csv-malformed--with-european-numeric-format.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file, {
      decimal_separator: ',',
      thousands: '.'
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('ERR-06 (header only): DuckDB reads zero data rows', async () => {
    const file = malformed('csv-malformed--with-header-only.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows).toHaveLength(0);
  });

  it('ERR-07 (no header): DuckDB generates column names when header=false', async () => {
    const file = malformed('csv-malformed--with-no-header.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file, { header: false });
    expect(rows.length).toBeGreaterThan(0);
    const keys = Object.keys(rows[0]);
    expect(
      keys.every((k) => /^column\d+$/i.test(k) || k.startsWith('column'))
    ).toBe(true);
  });

  it('ERR-08 (empty file): DuckDB errors or returns zero rows', async () => {
    const file = malformed('csv-malformed--with-nothing.csv');
    expect(await fileExists(file)).toBe(true);
    try {
      const rows = await readCsvViaDuckDB(db, file);
      expect(rows).toHaveLength(0);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('ERR-09 (null variations): DuckDB ingests data without crashing', async () => {
    const file = malformed('csv-malformed--with-null-variations.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file, {
      nullstr: ['null', 'NULL', 'N/A', 'n/a', 'NA', '-', '#N/A', 'nil', 'none']
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('ERR-10 (numeric edge cases): DuckDB parses extreme numerics safely', async () => {
    const file = malformed('csv-malformed--with-numeric-all-edge-cases.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('ERR-11 (mixed numeric formats): DuckDB parses without crashing', async () => {
    const file = malformed('csv-malformed--with-numeric-formats-mixed.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('ERR-12 (special characters): DuckDB preserves UTF-8 content', async () => {
    const file = malformed('csv-malformed--with-special-characters.csv');
    expect(await fileExists(file)).toBe(true);
    const rows = await readCsvViaDuckDB(db, file);
    expect(rows.length).toBeGreaterThan(0);
    const allText = rows.map((row) => Object.values(row).join(' ')).join(' ');
    // Ensure some non-ASCII characters survived (accents / umlauts / etc.)
    expect(/[À-ÿ]/.test(allText)).toBe(true);
  });

  it('ERR-13 (incomplete SHP): .shp without sidecars must fail', async () => {
    const shpFile = path.resolve(
      FIXTURES_ROOT,
      '../shp-incomplete/ne_50m_admin_0_countries_lakes.shp'
    );
    expect(await fileExists(shpFile)).toBe(true);
    await run(db, 'INSTALL spatial; LOAD spatial;').catch(() => undefined);
    await expect(
      query(db, `SELECT * FROM ST_Read('${shpFile.replace(/'/g, "''")}')`)
    ).rejects.toBeInstanceOf(Error);
  });
});
