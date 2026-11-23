import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  lookupCoordinateSystem,
  type CrsLookupIo
} from '$lib/features/duckdb/orchestrator/crs-ops';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

describe('CRS lookup in the PROJ database', () => {
  let db: TestDuckDB;
  let io: CrsLookupIo;
  let scratch: string;

  beforeAll(async () => {
    db = await createTestInstance();
    await run(db, 'LOAD spatial');
    scratch = mkdtempSync(join(tmpdir(), 'khartis-crs-'));
    io = {
      run: (sql) => query(db, sql),
      exec: (sql) => run(db, sql),
      scratchFile: (code) => join(scratch, `${code.replace(':', '-')}.parquet`)
    };
  });

  afterAll(async () => {
    await destroyTestInstance(db);
    rmSync(scratch, { recursive: true, force: true });
  });

  it('should name and define a state plane CRS in US survey feet', async () => {
    const entry = await lookupCoordinateSystem(io, 'epsg: 2927');

    expect(entry).toMatchObject({
      code: 'EPSG:2927',
      name: 'NAD83(HARN) / Washington South (ftUS)',
      renderable: true
    });
    expect(JSON.parse(entry?.projjson ?? '{}').id).toEqual({
      authority: 'EPSG',
      code: 2927
    });
  });

  it('should flag the CRS proj4js computes unlike PROJ', async () => {
    // Swiss oblique Mercator: proj4js lands 9 km away; EASE-Grid 2.0: unsupported.
    expect(await lookupCoordinateSystem(io, 'EPSG:2056')).toMatchObject({
      renderable: false
    });
    expect(await lookupCoordinateSystem(io, 'EPSG:6933')).toMatchObject({
      renderable: false
    });
    expect(await lookupCoordinateSystem(io, 'EPSG:3413')).toMatchObject({
      renderable: true
    });
  });

  it('should return null for a code PROJ does not hold', async () => {
    expect(await lookupCoordinateSystem(io, 'EPSG:999999')).toBeNull();
    expect(await lookupCoordinateSystem(io, 'Lambert 93')).toBeNull();
  });
});
