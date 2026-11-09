import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { geoRotation } from 'd3-geo';
import proj4 from 'proj4';
import {
  cutAtSeam,
  densifyLines,
  representativePoint,
  resolveSeamLines
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
const UNTILTED_ON_10E = { longitude: 10, latitude: 0, meridian: 180 };

const wrap = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;

// Same ob_tran as the projection tool: d3 tilts the sphere by
// [-longitude, -latitude], then draws the base.
function obliqueProj4(base: string, longitude: number, latitude: number) {
  const [poleLongitude, poleLatitude] = geoRotation([-longitude, -latitude, 0])(
    [0, 90]
  );
  const baseLongitude = Number(base.match(/\+lon_0=(\S+)/)?.[1] ?? 0);
  const inner = base
    .replace(/^\s*\+proj=/, '')
    .replace(/\s*\+lon_0=\S+/, '')
    .replace(/\s*\+no_defs\b/, '');
  return [
    `+proj=ob_tran +o_proj=${inner}`,
    `+o_lon_p=${wrap(-poleLongitude - baseLongitude)}`,
    `+o_lat_p=${poleLatitude}`,
    `+lon_0=${wrap(longitude + poleLongitude)}`,
    '+no_defs'
  ].join(' ');
}

// The whole sphere in 10° cells and a meridian every 10°, with a vertex
// every degree: PROJ draws straight segments between vertices.
const range = (from: number, to: number, step: number) =>
  Array.from(
    { length: Math.round((to - from) / step) + 1 },
    (_, i) => from + i * step
  );
const cellWkt = (x: number, y: number) => {
  const ring = [
    ...range(x, x + 10, 1).map((lon) => `${lon} ${y}`),
    ...range(y + 1, y + 10, 1).map((lat) => `${x + 10} ${lat}`),
    ...range(x + 9, x, -1).map((lon) => `${lon} ${y + 10}`),
    ...range(y + 9, y, -1).map((lat) => `${x} ${lat}`)
  ];
  return `POLYGON((${ring.join(', ')}))`;
};
const fromWkt = (wkts: string[]) =>
  `(SELECT ST_GeomFromText(wkt) AS geom FROM (VALUES ${wkts.map((wkt) => `('${wkt}')`).join(', ')}) t(wkt))`;
const WORLD_CELLS = fromWkt(
  range(-180, 170, 10).flatMap((x) =>
    range(-90, 80, 10).map((y) => cellWkt(x, y))
  )
);
const WORLD_MERIDIANS = fromWkt(
  range(-170, 170, 10).map(
    (x) =>
      `LINESTRING(${range(-90, 90, 1)
        .map((lat) => `${x} ${lat}`)
        .join(', ')})`
  )
);

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
    const cut = await projectedParts(
      cutAtSeam(STRADDLING_BOX, UNTILTED_ON_10E)
    );

    // Unsplit, PROJ wraps one side to the far edge of the world.
    expect(uncut).toHaveLength(1);
    expect(Number(uncut[0].width)).toBeGreaterThan(30_000_000);
    expect(cut).toHaveLength(2);
    for (const part of cut) {
      expect(Number(part.width)).toBeLessThan(1_000_000);
    }
  });

  it('should leave geometry alone when the map is centred on Greenwich', () => {
    expect(
      cutAtSeam(STRADDLING_BOX, { longitude: 0, latitude: 0, meridian: 180 })
    ).toBe(STRADDLING_BOX);
  });

  it('should follow the turned meridian of a tilted map, through the pole', () => {
    // Centre 57° E, 50° S: the seam climbs 57° E from 40° N to the pole,
    // then comes down 123° W to 40° S.
    const lines = resolveSeamLines({
      longitude: 57,
      latitude: -50,
      meridian: 180
    });
    const spans = lines.map((line) => ({
      longitude: line[0][0],
      south: Math.min(...line.map(([, lat]) => lat)),
      north: Math.max(...line.map(([, lat]) => lat))
    }));
    expect(spans).toHaveLength(2);
    const byLongitude = Object.fromEntries(
      spans.map((span) => [Math.round(span.longitude), span])
    );
    expect(byLongitude[57].south).toBeCloseTo(40, 6);
    expect(byLongitude[57].north).toBe(90);
    expect(byLongitude[-123].south).toBeCloseTo(-40, 6);
    expect(byLongitude[-123].north).toBe(90);
  });

  it('should keep the seam on the turned meridian when it misses the poles', () => {
    const seam = { longitude: 20, latitude: 30, meridian: 190 };
    const turn = geoRotation([-seam.longitude, -seam.latitude, 0]);
    const lines = resolveSeamLines(seam);
    for (const line of lines) {
      for (let i = 0; i < line.length; i++) {
        const [lon, lat] = turn(line[i]);
        if (Math.abs(lat) < 89.9) {
          expect(Math.abs(wrap(lon - 190))).toBeLessThan(1e-6);
        }
        // Planar segments short enough to follow the great circle.
        if (i > 0) {
          expect(Math.abs(line[i][0] - line[i - 1][0])).toBeLessThan(1);
        }
      }
    }
  });

  // Consecutive vertices that land far apart on the map, away from the turned
  // poles (drawn as a line, which a ring around them follows): a streak.
  async function streaks(
    from: string,
    cut: (geometry: string) => string,
    target: string,
    seam: { longitude: number; latitude: number }
  ) {
    const rows = (await query(
      db,
      `SELECT ST_AsText(part.geom) AS source,
              ST_AsText(ST_Transform(part.geom, 'EPSG:4326', '${target}', true)) AS projected
       FROM (SELECT UNNEST(ST_Dump(${cut('geom')})) AS part FROM ${from})`
    )) as Array<{ source: string; projected: string }>;
    const turn = geoRotation([-seam.longitude, -seam.latitude, 0]);
    const points = (wkt: string) =>
      [...wkt.matchAll(/(-?[\d.e]+) (-?[\d.e]+)/g)].map(
        (match): [number, number] => [Number(match[1]), Number(match[2])]
      );
    let count = 0;
    for (const row of rows) {
      const source = points(row.source);
      const projected = points(row.projected);
      for (let i = 1; i < projected.length; i++) {
        const nearPole = [source[i - 1], source[i]].some(
          (point) => Math.abs(turn(point)[1]) > 89
        );
        if (
          !nearPole &&
          Math.abs(projected[i][0] - projected[i - 1][0]) > 8_000_000
        ) {
          count += 1;
        }
      }
    }
    return count;
  }

  it.each([
    [
      'Equal Earth tilted to 57° E, 50° S',
      '+proj=eqearth +x_0=0 +y_0=0 +R=6371000 +units=m +no_defs',
      57,
      -50
    ],
    [
      'Robinson on 10° E tilted to 20° E, 30° N',
      '+proj=robin +lon_0=10 +R=6371000 +units=m +no_defs',
      20,
      30
    ]
  ])(
    'should not streak polygons nor lines across %s',
    async (_name, base, longitude, latitude) => {
      const target = obliqueProj4(base, longitude, latitude);
      const baseLongitude = Number(base.match(/\+lon_0=(\S+)/)?.[1] ?? 0);
      const seam = { longitude, latitude, meridian: baseLongitude + 180 };
      const keep = (geometry: string) => geometry;
      const cut = (geometry: string) => cutAtSeam(geometry, seam);

      expect(await streaks(WORLD_CELLS, keep, target, seam)).toBeGreaterThan(0);
      expect(await streaks(WORLD_CELLS, cut, target, seam)).toBe(0);
      expect(
        await streaks(WORLD_MERIDIANS, keep, target, seam)
      ).toBeGreaterThan(0);
      expect(await streaks(WORLD_MERIDIANS, cut, target, seam)).toBe(0);
    }
  );

  it.each([
    [
      'Albers tilted to 96° W, 30° S',
      '+proj=aea +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +R=6371000 +units=m +no_defs',
      -96,
      -30
    ],
    [
      'Albers on 96° W',
      '+proj=aea +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +R=6371000 +units=m +no_defs',
      -96,
      0
    ],
    [
      'Equal Earth tilted to 57° E, 50° S',
      '+proj=eqearth +x_0=0 +y_0=0 +R=6371000 +units=m +no_defs',
      57,
      -50
    ]
  ])(
    'should keep the area of the sphere on %s, turned poles included',
    async (_name, base, longitude, latitude) => {
      // Equal-area: the cut globe covers 4πR² on the map, unless a ring round
      // a pole the map draws as a line or an arc takes a chord instead. The
      // tilt then the base projection, as the map (and the JS fallback) does:
      // the PROJ of DuckDB for Node gives no ob_tran round a cone.
      const turn = geoRotation([-longitude, -latitude, 0]);
      // proj4js needs lat_0 and lon_0, which PROJ defaults to 0.
      const forward = proj4('EPSG:4326', `${base} +lat_0=0 +lon_0=0`).forward;
      const project = ([lon, lat]: [number, number]) =>
        forward(turn([lon, lat]) as [number, number]) as [number, number];
      const rows = (await query(
        db,
        `SELECT ST_AsText(part.geom) AS wkt
       FROM (SELECT UNNEST(ST_Dump(${cutAtSeam('geom', { longitude, latitude, meridian: 180 })})) AS part FROM ${WORLD_CELLS})`
      )) as Array<{ wkt: string }>;
      let area = 0;
      for (const { wkt } of rows) {
        const rings = [...wkt.matchAll(/\(([^()]+)\)/g)].map((ring) =>
          ring[1]
            .split(',')
            .map((pair) =>
              project(pair.trim().split(/\s+/).map(Number) as [number, number])
            )
        );
        rings.forEach((ring, index) => {
          let twice = 0;
          for (let i = 0; i < ring.length - 1; i++) {
            twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
          }
          area += (index === 0 ? 1 : -1) * Math.abs(twice / 2);
        });
      }
      const sphere = 4 * Math.PI * 6371000 ** 2;
      expect(Math.abs(area / sphere - 1)).toBeLessThan(0.001);
    }
  );

  it('should give a graticule line a vertex every degree, its own kept', async () => {
    const line =
      "ST_GeomFromText('MULTILINESTRING((0 0, 10 0, 10 2.5), (-180 66.5, 180 66.5))')";
    const [row] = (await query(
      db,
      `SELECT ST_NPoints(g) AS points, ST_Length(g) AS length,
              ST_Intersects(g, ST_Point(0, 0)) AS keepsStart,
              ST_Contains(ST_Buffer(g, 1e-9), ST_Point(10, 0)) AS keepsCorner
       FROM (SELECT ${densifyLines(line, 1)} AS g)`
    )) as Array<{
      points: number;
      length: number;
      keepsStart: boolean;
      keepsCorner: boolean;
    }>;

    // 10 + 3 + 360 segments of a degree or less.
    expect(Number(row.points)).toBe(11 + 3 + 361);
    expect(Number(row.length)).toBeCloseTo(12.5 + 360, 9);
    expect(row.keepsStart).toBe(true);
    expect(row.keepsCorner).toBe(true);
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
