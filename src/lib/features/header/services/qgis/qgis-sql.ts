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

  // At the pole the longitude means nothing.
  const kept = samples.filter(([, lat]) => Math.abs(lat) < POLE);
  const lines: LonLat[][] = [];
  let line: LonLat[] = [kept[0]];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1];
    const b = kept[i];
    if (longitudeGap(a, b) > MAX_GAP * 20 && Math.abs(a[1]) >= 89) {
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
  lines.push(line);
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
  if (north > 90 - POLE_CAP) {
    bands.push(
      `ST_MakeEnvelope(-180, ${formatNumber(90 - POLE_CAP)}, 180, 90)`
    );
  }
  if (south < -90 + POLE_CAP) {
    bands.push(
      `ST_MakeEnvelope(-180, -90, 180, ${formatNumber(-90 + POLE_CAP)})`
    );
  }
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
  const bands = resolveSeamLines(seam).flatMap(seamBands);
  if (bands.length === 0) {
    return geometry;
  }
  const cutter = bands.reduce((union, band) => `ST_Union(${union}, ${band})`);
  return `(CASE WHEN ST_Intersects(${geometry}, ${cutter}) THEN ST_Difference(ST_MakeValid(${geometry}), ${cutter}) ELSE ${geometry} END)`;
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
