import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cutAtOppositeMeridian,
  representativePoint
} from '$lib/features/header/services/qgis/qgis-sql';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const ROBINSON_ON_10E = '+proj=robin +lon_0=10 +R=6371000 +units=m +no_defs';
// A box straddling 170° W, the meridian opposite 10° E.
const STRADDLING_BOX =
  "ST_GeomFromText('POLYGON((-175 10, -165 10, -165 20, -175 20, -175 10))')";

describe('QGIS export SQL', () => {
  let db: TestDuckDB;

  beforeAll(async () => {
    db = await createTestInstance();
    await run(db, 'LOAD spatial');
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  async function projectedParts(geometry: string) {
    return (await query(
      db,
      `SELECT ST_XMax(part.geom) - ST_XMin(part.geom) AS width
       FROM (SELECT UNNEST(ST_Dump(ST_Transform(${geometry}, 'EPSG:4326', '${ROBINSON_ON_10E}', true))) AS part)`
    )) as Array<{ width: number }>;
  }

  it('should split a ring across the opposite meridian instead of streaking across the map', async () => {
    const uncut = await projectedParts(STRADDLING_BOX);
    const cut = await projectedParts(cutAtOppositeMeridian(STRADDLING_BOX, 10));

    // Unsplit, PROJ wraps one side to the far edge of the world.
    expect(uncut).toHaveLength(1);
    expect(Number(uncut[0].width)).toBeGreaterThan(30_000_000);
    expect(cut).toHaveLength(2);
    for (const part of cut) {
      expect(Number(part.width)).toBeLessThan(1_000_000);
    }
  });

  it('should leave geometry alone when the map is centred on Greenwich', () => {
    expect(cutAtOppositeMeridian(STRADDLING_BOX, 0)).toBe(STRADDLING_BOX);
  });

  it('should put the symbol inside a polygon whose centroid falls outside it', async () => {
    const horseshoe =
      "ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 8, 8 8, 8 2, 0 2, 0 0))')";
    const [row] = (await query(
      db,
      `SELECT ST_Contains(${horseshoe}, ${representativePoint(horseshoe)}) AS inside,
              ST_Contains(${horseshoe}, ST_Centroid(${horseshoe})) AS centroidInside`
    )) as Array<{ inside: boolean; centroidInside: boolean }>;

    expect(row.centroidInside).toBe(false);
    expect(row.inside).toBe(true);
  });

  it('should keep a point where it is', async () => {
    const [row] = (await query(
      db,
      `SELECT ST_X(p) AS x, ST_Y(p) AS y FROM (SELECT ${representativePoint('ST_Point(2.35, 48.85)')} AS p)`
    )) as Array<{ x: number; y: number }>;

    expect([row.x, row.y]).toEqual([2.35, 48.85]);
  });
});
