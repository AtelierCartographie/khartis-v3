import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
import { matchColumnsAgainstCatalog } from '$lib/features/duckdb/orchestrator/geo-detection-ops';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const ATTRIBUTES_PATH = path
  .resolve(__dirname, '../../static/basemaps/all-basemaps-attributes.parquet')
  .replace(/'/g, "''");

let db: TestDuckDB;
let duck: { query: (sql: string) => Promise<unknown> };

beforeAll(async () => {
  db = await createTestInstance();
  duck = {
    query: async (sql: string) => {
      const rows = await query(db, sql);
      return {
        numRows: rows.length,
        get: (index: number) => rows[index],
        toArray: () => rows
      };
    }
  };

  await run(db, join_macros);
  await run(
    db,
    `CREATE TABLE basemap_attributes AS
     SELECT raw, id, variant, normalized, UNNEST(basemaps) AS basemap
     FROM read_parquet('${ATTRIBUTES_PATH}')`
  );
  await run(
    db,
    `CREATE TABLE long_format AS
     SELECT pays, 1000 + i * 3.7 AS valeur, 1900 + i AS annee
     FROM (VALUES ('France'), ('Allemagne'), ('Espagne'), ('Italie'), ('Belgique'), ('Portugal')) AS p(pays),
          range(50) AS r(i)`
  );
  await run(
    db,
    `CREATE TABLE communes AS SELECT * FROM (VALUES
       ('75056', 'Paris', 'a'),
       ('69123', 'Lyon', 'b'),
       ('13055', 'Marseille', 'c'),
       ('31555', 'Toulouse', 'd'),
       ('06088', 'Nice', NULL),
       ('2A004', 'Ajaccio', 'f')
     ) AS t(code, "Nom Commune", note)`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('matchColumnsAgainstCatalog', () => {
  it('should find every distinct country name when the column repeats them', async () => {
    const [pays] = await matchColumnsAgainstCatalog(
      'long_format',
      ['pays'],
      duck
    );

    expect(pays).toMatchObject({
      column: 'pays',
      distinctValues: 6,
      matchedValues: 6
    });
    expect(
      pays.basemaps.some((basemap) => basemap.startsWith('europe-pays'))
    ).toBe(true);
  });

  it('should match commune codes and names, including Corsican codes', async () => {
    const matches = await matchColumnsAgainstCatalog(
      'communes',
      ['code', 'Nom Commune', 'note'],
      duck
    );
    const byColumn = new Map(matches.map((match) => [match.column, match]));

    expect(byColumn.get('code')).toMatchObject({
      distinctValues: 6,
      matchedValues: 6
    });
    expect(byColumn.get('Nom Commune')?.matchedValues).toBe(6);
    expect(byColumn.get('note')?.distinctValues).toBe(5);
  });

  it('should report a column without any match', async () => {
    const [valeur] = await matchColumnsAgainstCatalog(
      'long_format',
      ['valeur'],
      duck
    );

    expect(valeur).toMatchObject({ matchedValues: 0, basemaps: [] });
  });

  it('should return nothing when no column is asked', async () => {
    expect(await matchColumnsAgainstCatalog('communes', [], duck)).toEqual([]);
  });
});
