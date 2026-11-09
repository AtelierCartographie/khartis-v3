import { geoRotation } from 'd3-geo';
import type { MapSeam } from '$lib/features/step-toolbar/tools/projections';

/** SQL expressions over a DuckDB spatial geometry, for the QGIS export. */

type LonLat = [number, number];

const SAMPLE_STEP = 0.5;
const MAX_GAP = 0.05;
// Well inside the band cut around a curved seam (CURVED_HALF_WIDTH).
const FLATNESS = 2e-5;
const MAX_DEPTH = 40;
const POLE = 90 - 1e-6;

function wrapLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function longitudeGap(a: LonLat, b: LonLat): number {
  const gap = Math.abs(a[0] - b[0]) % 360;
  return Math.min(gap, 360 - gap);
}

/**
 * The seam in plain longitude and latitude, as lines. A turned meridian is a
 * half great circle: it can cross the antimeridian of the data, where it is
 * split, or run through a pole, where it jumps meridian (the pole is the
 * whole top or bottom edge of the lon/lat plane).
 */
export function resolveSeamLines(seam: MapSeam): LonLat[][] {
  const unturn = geoRotation([-seam.longitude, -seam.latitude, 0]).invert;
  const meridian = wrapLongitude(seam.meridian);
  const at = (latitude: number): LonLat => {
    const [lon, lat] = unturn([meridian, latitude]);
    return [wrapLongitude(lon), lat];
  };

  const samples: LonLat[] = [];
  const refine = (
    t0: number,
    p0: LonLat,
    t1: number,
    p1: LonLat,
    depth: number
  ) => {
    const atPole = Math.abs(p0[1]) >= POLE && Math.abs(p1[1]) >= POLE;
    if (atPole || depth >= MAX_DEPTH) {
      samples.push(p1);
      return;
    }
    const t = (t0 + t1) / 2;
    const p = at(t);
    // Straight enough in the lon/lat plane to stand for the great circle.
    const unwrap = (point: LonLat) => p0[0] + wrapLongitude(point[0] - p0[0]);
    const deviation = Math.hypot(
      unwrap(p) - (p0[0] + unwrap(p1)) / 2,
      p[1] - (p0[1] + p1[1]) / 2
    );
    if (longitudeGap(p0, p1) <= MAX_GAP * 20 && deviation <= FLATNESS) {
      samples.push(p1);
      return;
    }
    refine(t0, p0, t, p, depth + 1);
    refine(t, p, t1, p1, depth + 1);
  };
  let previous = at(-90);
  samples.push(previous);
  for (let t = -90 + SAMPLE_STEP; t <= 90 + 1e-9; t += SAMPLE_STEP) {
    const next = at(Math.min(t, 90));
    refine(t - SAMPLE_STEP, previous, Math.min(t, 90), next, 0);
    previous = next;
  }

  // At the pole the longitude means nothing: a line reaching it ends there
  // on its own meridian, and the next one starts there on its own.
  const lines: LonLat[][] = [];
  let line: LonLat[] = [];
  let poleReached: number | null = null;
  for (const b of samples) {
    if (Math.abs(b[1]) >= POLE) {
      if (line.length > 0) {
        line.push([line[line.length - 1][0], Math.sign(b[1]) * 90]);
        lines.push(line);
        line = [];
      }
      poleReached = Math.sign(b[1]) * 90;
      continue;
    }
    const a = line[line.length - 1];
    if (!a) {
      line = poleReached === null ? [b] : [[b[0], poleReached], b];
      poleReached = null;
    } else if (longitudeGap(a, b) > MAX_GAP * 20 && Math.abs(a[1]) >= 89) {
      // Through the pole: down one meridian to the edge, up another.
      const pole = Math.sign(a[1]) * 90;
      line.push([a[0], pole]);
      lines.push(line);
      line = [[b[0], pole], b];
    } else if (Math.abs(a[0] - b[0]) > 180) {
      // Across the antimeridian of the data.
      const edge = a[0] > 0 ? 180 : -180;
      const unwrapped = b[0] + 2 * edge;
      const ratio = (edge - a[0]) / (unwrapped - a[0]);
      const latitude = a[1] + (b[1] - a[1]) * ratio;
      line.push([edge, latitude]);
      lines.push(line);
      line = [[-edge, latitude], b];
    } else {
      line.push(b);
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.filter(
    (part) =>
      part.length > 1 &&
      // The antimeridian of the data already splits the geometry.
      !part.every((point) => Math.abs(Math.abs(point[0]) - 180) < 1e-9)
  );
}

// About a metre on the ground either side of the seam: wide enough that
// PROJ, given the rounded parameters of the map, puts every vertex left out
// on its side, and invisible on a map.
const SEAM_HALF_WIDTH = 1e-5;
// A seam off the meridians is a chain of chords: about 10 m either side.
const CURVED_HALF_WIDTH = 1e-4;
// Where a metre is a degree of longitude, the band becomes a cap round the
// pole (about 60 m).
const POLE_CAP = 90 - (Math.acos(SEAM_HALF_WIDTH) * 180) / Math.PI;

function formatNumber(value: number): string {
  return String(Number(value.toFixed(10)));
}

function polygonSql(ring: LonLat[]): string {
  const wkt = [...ring, ring[0]]
    .map(([lon, lat]) => `${formatNumber(lon)} ${formatNumber(lat)}`)
    .join(', ');
  return `ST_GeomFromText('POLYGON((${wkt}))')`;
}

// A cone or a flat-polar projection draws a pole as an arc or a line: a ring
// cut round it must follow it, one vertex per degree, or QGIS joins its ends
// with a chord.
const ARC_STEP = 1;

function poleCap(pole: 1 | -1): string {
  const edge = pole * (90 - POLE_CAP);
  const ring: LonLat[] = [];
  for (let lon = -180; lon <= 180; lon += ARC_STEP) ring.push([lon, edge]);
  ring.push([180, pole * 90], [-180, pole * 90]);
  return polygonSql(ring);
}

/**
 * The poles of the turned sphere, which the map draws as a line or an arc:
 * a small disk round each, whose edge follows that line.
 */
function turnedPoleDisks(seam: MapSeam): string[] {
  const unturn = geoRotation([-seam.longitude, -seam.latitude, 0]).invert;
  return ([1, -1] as const).map((pole) => {
    const [, centre] = unturn([0, pole * 90]);
    if (Math.abs(centre) > 90 - POLE_CAP) {
      return poleCap(pole);
    }
    const ring: LonLat[] = [];
    for (let lon = -180; lon < 180; lon += ARC_STEP) {
      const [x, y] = unturn([lon, pole * (90 - POLE_CAP)]);
      const previous = ring[ring.length - 1];
      // Unwrapped, in case the disk straddles the antimeridian.
      ring.push([
        previous ? previous[0] + wrapLongitude(x - previous[0]) : x,
        y
      ]);
    }
    const disk = polygonSql(ring);
    const west = Math.min(...ring.map(([lon]) => lon));
    const east = Math.max(...ring.map(([lon]) => lon));
    const shift = west < -180 ? 360 : east > 180 ? -360 : 0;
    return shift === 0
      ? disk
      : `ST_Union(${disk}, ST_Translate(${disk}, ${shift}, 0))`;
  });
}

function halfWidthAt(latitude: number): number {
  return SEAM_HALF_WIDTH / Math.cos((latitude * Math.PI) / 180);
}

function meridianBand(
  longitude: number,
  south: number,
  north: number
): string[] {
  const bottom = Math.max(south, -90 + POLE_CAP);
  const top = Math.min(north, 90 - POLE_CAP);
  const latitudes = new Set<number>([bottom, top]);
  for (let lat = Math.ceil(bottom); lat < top; lat += 1) latitudes.add(lat);
  // The width grows fast near a pole: more samples there.
  for (let gap = POLE_CAP * 2; gap < 1; gap *= 2) {
    for (const lat of [90 - gap, -90 + gap]) {
      if (lat > bottom && lat < top) latitudes.add(lat);
    }
  }
  const sorted = [...latitudes].sort((a, b) => a - b);
  const ring = [
    ...sorted.map((lat): LonLat => [longitude - halfWidthAt(lat), lat]),
    ...sorted
      .reverse()
      .map((lat): LonLat => [longitude + halfWidthAt(lat), lat])
  ];
  ring.push(ring[0]);
  const wkt = ring
    .map(([lon, lat]) => `${formatNumber(lon)} ${formatNumber(lat)}`)
    .join(', ');
  const bands = [`ST_GeomFromText('POLYGON((${wkt}))')`];
  if (north > 90 - POLE_CAP) bands.push(poleCap(1));
  if (south < -90 + POLE_CAP) bands.push(poleCap(-1));
  return bands;
}

function seamBands(line: LonLat[]): string[] {
  const longitudes = line.map(([lon]) => lon);
  const latitudes = line.map(([, lat]) => lat);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  // A meridian piece, give or take the rounding of the rotation.
  if (east - west < 1e-6) {
    return meridianBand(
      (west + east) / 2,
      Math.min(...latitudes),
      Math.max(...latitudes)
    );
  }
  const wkt = line
    .map(([lon, lat]) => `${formatNumber(lon)} ${formatNumber(lat)}`)
    .join(', ');
  return [
    `ST_Buffer(ST_GeomFromText('LINESTRING(${wkt})'), ${CURVED_HALF_WIDTH}, 1)`
  ];
}

/**
 * Cuts lon/lat geometry along the seam of the map. d3 does it while drawing;
 * PROJ does not, and a ring across the seam would streak over the whole map.
 */
export function cutAtSeam(geometry: string, seam: MapSeam): string {
  const bands = [
    ...new Set([
      ...resolveSeamLines(seam).flatMap(seamBands),
      ...(seam.latitude !== 0 ? turnedPoleDisks(seam) : [])
    ])
  ];
  if (bands.length === 0) {
    return geometry;
  }
  const cutter = bands.reduce((union, band) => `ST_Union(${union}, ${band})`);
  return `(CASE WHEN ST_Intersects(${geometry}, ${cutter}) THEN ST_Difference(ST_MakeValid(${geometry}), ${cutter}) ELSE ${geometry} END)`;
}

/**
 * Lines in lon/lat with a vertex at least every `step` degrees, the vertices
 * kept. d3 bends a segment along the projection while drawing; PROJ only
 * moves vertices, so a graticule line drawn with few of them comes out as
 * chords.
 */
export function densifyLines(geometry: string, step: number): string {
  const point = (line: string, index: string) =>
    `ST_PointN(${line}, (${index})::INTEGER)`;
  const pieces = (line: string, i: string) =>
    `greatest(1, ceil(ST_Distance(${point(line, i)}, ${point(line, `${i} + 1`)}) / ${step})::INTEGER)`;
  const along = (line: string, i: string, j: string, axis: 'X' | 'Y') =>
    `ST_${axis}(${point(line, i)}) + (ST_${axis}(${point(line, `${i} + 1`)}) - ST_${axis}(${point(line, i)})) * ${j} / ${pieces(line, i)}`;
  const densified = (line: string) =>
    `ST_MakeLine(list_append(flatten(list_transform(range(1, ST_NPoints(${line})), i -> list_transform(range(${pieces(line, 'i')}), j -> ST_Point(${along(line, 'i', 'j', 'X')}, ${along(line, 'i', 'j', 'Y')})))), ${point(line, `ST_NPoints(${line})`)}))`;
  return `(CASE WHEN ST_GeometryType(${geometry}) IN ('LINESTRING', 'MULTILINESTRING') THEN ST_Collect(list_transform(ST_Dump(${geometry}), part -> ${densified('part.geom')})) ELSE ${geometry} END)`;
}

export function representativePoint(geometry: string): string {
  // Same point the map puts a symbol or a label on.
  return `(CASE
    WHEN ${geometry} IS NULL OR ST_IsEmpty(${geometry}) THEN NULL
    WHEN ST_GeometryType(${geometry}) = 'POINT' THEN ${geometry}
    WHEN ST_GeometryType(${geometry}) IN ('POLYGON', 'MULTIPOLYGON') THEN
      CASE WHEN NOT ST_IsValid(${geometry}) THEN ST_PointOnSurface(${geometry})
      ELSE COALESCE(ST_MaximumInscribedCircle(${geometry}).center, ST_PointOnSurface(${geometry})) END
    ELSE ST_PointOnSurface(${geometry})
  END)`;
}
