import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { rowIdSequenceName } from '$lib/features/duckdb/io/reader-utils';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;
let workDir: string;

beforeAll(async () => {
  db = await createTestInstance();
  await run(db, 'INSTALL spatial; LOAD spatial;');
  workDir = mkdtempSync(path.join(tmpdir(), 'khartis-enrichment-'));
});

afterAll(async () => {
  await destroyTestInstance(db);
  rmSync(workDir, { recursive: true, force: true });
});

describe('enrichment snapshot round trip', () => {
  it('should keep enriched columns, row ids with gaps and the source CRS when the snapshot is re-imported', async () => {
    await run(
      db,
      `CREATE TABLE communes_enriched AS
       SELECT * FROM (VALUES
         (1, 'A', ST_Point(651000, 6862000)::GEOMETRY('EPSG:2154'), 120, 'core'),
         (3, 'C', ST_Point(652000, 6863000)::GEOMETRY('EPSG:2154'), NULL, NULL)
       ) AS t(${INTERNAL_COLUMN.ID}, id, geom, population_2024, category)`
    );
    const snapshotPath = path.join(workDir, 'communes.parquet');
    await run(
      db,
      `COPY (SELECT * FROM communes_enriched) TO '${snapshotPath}' (FORMAT parquet)`
    );

    await run(
      db,
      `CREATE TABLE communes_reloaded AS SELECT * FROM read_parquet('${snapshotPath}')`
    );
    // Same statements as addRowId, which every reader runs after loading.
    const sequenceName = rowIdSequenceName('communes_reloaded');
    await run(db, `CREATE OR REPLACE SEQUENCE "${sequenceName}" START 1`);
    await run(
      db,
      `ALTER TABLE communes_reloaded ADD COLUMN IF NOT EXISTS ${INTERNAL_COLUMN.ID} INTEGER DEFAULT nextval('${sequenceName}')`
    );

    const rows = await query(
      db,
      `SELECT ${INTERNAL_COLUMN.ID} AS row_id, id, ST_AsText(geom) AS wkt,
              population_2024, category
       FROM communes_reloaded ORDER BY row_id`
    );
    expect(rows).toEqual([
      {
        row_id: 1,
        id: 'A',
        wkt: 'POINT (651000 6862000)',
        population_2024: 120,
        category: 'core'
      },
      {
        row_id: 3,
        id: 'C',
        wkt: 'POINT (652000 6863000)',
        population_2024: null,
        category: null
      }
    ]);

    const [geometryType] = await query(
      db,
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'communes_reloaded' AND column_name = 'geom'`
    );
    expect(geometryType.data_type).toBe("GEOMETRY('EPSG:2154')");
  });
});
