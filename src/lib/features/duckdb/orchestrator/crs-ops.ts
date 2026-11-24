import proj4 from 'proj4';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';

/**
 * A CRS code read from the PROJ database bundled with the spatial extension.
 * A CRS code is not user data.
 */
export interface CoordinateSystemEntry {
  /** `EPSG:2927` */
  code: string;
  name: string;
  projjson: string;
  /**
   * Whether proj4js, which draws the map, computes this CRS like PROJ. A few
   * methods come out wrong (Swiss oblique Mercator) or unsupported (EASE-Grid).
   */
  renderable: boolean;
}

export type CrsQuery = (sql: string) => Promise<Array<Record<string, unknown>>>;

export interface CrsLookupIo {
  /** A statement that returns rows. */
  run: CrsQuery;
  /** A statement whose result is not read (COPY). */
  exec: (sql: string) => Promise<void>;
  /** Where a throw-away one-row GeoParquet can be written. */
  scratchFile: (code: string) => string;
  removeFile?: (path: string) => Promise<void>;
}

// Beyond this gap, in CRS units, proj4js and PROJ disagree on the method
// rather than on a datum shift (GDA94 shifts by ~2 m).
const FIDELITY_TOLERANCE = 10;

function normalizeAuthorityCode(code: string): string | null {
  const match = code.trim().match(/^([A-Za-z]+)\s*:\s*(\d+)$/);
  return match ? `${match[1].toUpperCase()}:${match[2]}` : null;
}

interface AreaOfUse {
  south_latitude: number;
  west_longitude: number;
  north_latitude: number;
  east_longitude: number;
}

function samplePoints(projjson: Record<string, unknown>): [number, number][] {
  const area = projjson.bbox as AreaOfUse | undefined;
  if (!area) {
    return [
      [0, 0],
      [10, 45],
      [-10, -30]
    ];
  }
  const east =
    area.east_longitude < area.west_longitude
      ? area.east_longitude + 360
      : area.east_longitude;
  const at = (u: number, v: number): [number, number] => {
    const lon = area.west_longitude + (east - area.west_longitude) * u;
    return [
      lon > 180 ? lon - 360 : lon,
      area.south_latitude + (area.north_latitude - area.south_latitude) * v
    ];
  };
  return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.75), at(0.25, 0.75)];
}

async function checkProj4Fidelity(
  run: CrsQuery,
  code: string,
  projjson: Record<string, unknown>
): Promise<boolean> {
  let converter: proj4.Converter;
  try {
    converter = proj4('EPSG:4326', new proj4.Proj(projjson as never));
  } catch {
    return false;
  }

  const points = samplePoints(projjson);
  const rows = await run(
    `SELECT ST_X(p) AS x, ST_Y(p) AS y FROM (
       SELECT i, ST_Transform(ST_Point(lon, lat), 'EPSG:4326', '${escapeSqlString(code)}', true) AS p
       FROM (VALUES ${points.map(([lon, lat], i) => `(${i}, ${lon}, ${lat})`).join(', ')}) AS t(i, lon, lat)
     ) ORDER BY i`
  );

  return points.every(([lon, lat], index) => {
    const reference = rows[index];
    let ours: number[];
    try {
      ours = converter.forward([lon, lat]);
    } catch {
      return false;
    }
    const gap = Math.hypot(
      ours[0] - Number(reference?.x),
      ours[1] - Number(reference?.y)
    );
    return Number.isFinite(gap) && gap <= FIDELITY_TOLERANCE;
  });
}

// `duckdb_coordinate_systems()` fails in DuckDB WASM 1.5 (« stoi: no
// conversion », even with LIMIT 10). Writing one GeoParquet row typed with the
// CRS makes the engine resolve it and store its PROJJSON in the `geo` metadata.
async function readProjjson(
  io: CrsLookupIo,
  code: string
): Promise<string | null> {
  const path = io.scratchFile(code);
  try {
    await io.exec(
      `COPY (SELECT ST_Point(0, 0)::GEOMETRY('${escapeSqlString(code)}') AS g)
       TO '${escapeSqlString(path)}' (FORMAT parquet)`
    );
  } catch (error) {
    if (/unrecognized coordinate system/i.test(String(error))) {
      return null;
    }
    throw error;
  }
  try {
    const rows = await io.run(
      `SELECT decode(value) AS geo
       FROM parquet_kv_metadata('${escapeSqlString(path)}')
       WHERE decode(key) = 'geo'`
    );
    const geo = JSON.parse(String(rows[0]?.geo ?? '{}')) as {
      primary_column?: string;
      columns?: Record<string, { crs?: unknown }>;
    };
    const crs = geo.columns?.[geo.primary_column ?? 'g']?.crs;
    return crs ? JSON.stringify(crs) : null;
  } finally {
    await io.removeFile?.(path).catch(() => undefined);
  }
}

/** Name and PROJJSON of a CRS code, or null when PROJ does not know it. */
export async function lookupCoordinateSystem(
  io: CrsLookupIo,
  rawCode: string
): Promise<CoordinateSystemEntry | null> {
  const code = normalizeAuthorityCode(rawCode);
  if (!code) {
    return null;
  }

  const projjsonText = await readProjjson(io, code);
  if (!projjsonText) {
    return null;
  }

  const projjson = JSON.parse(projjsonText) as Record<string, unknown>;
  const renderable = await checkProj4Fidelity(io.run, code, projjson).catch(
    () => false
  );

  return {
    code,
    name: typeof projjson.name === 'string' ? projjson.name : code,
    projjson: projjsonText,
    renderable
  };
}
