import type { GeoProjection, GeoRawProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3geoProjection from 'd3-geo-projection';
import {
  geoAirocean,
  geoClipPolygon,
  geoImago,
  geoInterrupt,
  geoInterruptedMollweide,
  geoInterruptedMollweideHemispheres,
  geoPolyhedralWaterman
} from 'd3-geo-polygon';
import type { D3Usage } from 'proj-suggest';

type GeoProjectionFactory = () => GeoProjection;
type D3GeoProjectionModule = Record<string, unknown>;

const d3ProjectionFactories = d3geoProjection as D3GeoProjectionModule;

const MOLLWEIDE_OCEAN_LOBES: Array<Array<Array<[number, number]>>> = [
  [
    [
      [-180, 0],
      [-130, 90],
      [-90, 5]
    ],
    [
      [-90, 5],
      [-30, 90],
      [60, 5]
    ],
    [
      [60, 5],
      [120, 90],
      [180, 0]
    ]
  ],
  [
    [
      [-180, 0],
      [-120, -90],
      [-60, -5]
    ],
    [
      [-60, -5],
      [20, -90],
      [90, -5]
    ],
    [
      [90, -5],
      [140, -90],
      [180, 0]
    ]
  ]
];

function geoMollweideOcean(): GeoProjection {
  const geoMollweideRaw =
    d3ProjectionFactories.geoMollweideRaw as GeoRawProjection;
  return geoInterrupt(geoMollweideRaw, MOLLWEIDE_OCEAN_LOBES).rotate([-200, 0]);
}

function geoCassini(
  rotate?: [number, number] | [number, number, number]
): GeoProjection {
  const [lambda = 0, phi = 0] = rotate ?? [];
  return d3geo.geoEquirectangular().angle(-90).rotate([lambda, phi, 90]);
}

function getD3ProjectionFactory(
  name: string
): GeoProjectionFactory | undefined {
  const candidate = d3ProjectionFactories[name];
  return typeof candidate === 'function'
    ? (candidate as GeoProjectionFactory)
    : undefined;
}

const D3_FACTORY_MAP: Record<string, GeoProjectionFactory | undefined> = {
  geoMercator: d3geo.geoMercator,
  geoEquirectangular: d3geo.geoEquirectangular,
  geoAlbers: d3geo.geoAlbers,
  geoOrthographic: d3geo.geoOrthographic,
  geoStereographic: d3geo.geoStereographic,
  geoEqualEarth: d3geo.geoEqualEarth,
  geoAzimuthalEqualArea: d3geo.geoAzimuthalEqualArea,
  geoAzimuthalEquidistant: d3geo.geoAzimuthalEquidistant,
  geoConicConformal: d3geo.geoConicConformal,
  geoConicEqualArea: d3geo.geoConicEqualArea,
  geoConicEquidistant: d3geo.geoConicEquidistant,
  geoTransverseMercator: d3geo.geoTransverseMercator,
  geoNaturalEarth1: d3geo.geoNaturalEarth1,
  geoGnomonic: d3geo.geoGnomonic,
  geoBonne: getD3ProjectionFactory('geoBonne'),
  geoTimes: getD3ProjectionFactory('geoTimes'),
  geoBertin1953: getD3ProjectionFactory('geoBertin1953'),
  geoArmadillo: getD3ProjectionFactory('geoArmadillo'),
  geoMollweide: getD3ProjectionFactory('geoMollweide'),
  geoInterruptedMollweide,
  geoInterruptedMollweideHemispheres,
  geoAirocean,
  geoImago,
  geoCylindricalEqualArea: getD3ProjectionFactory('geoCylindricalEqualArea'),
  geoRobinson: getD3ProjectionFactory('geoRobinson'),
  geoWinkel3: getD3ProjectionFactory('geoWinkel3'),
  geoPolyhedralWaterman
};

const AZIMUTHAL_CLIP_PROJECTIONS = new Set([
  'geoStereographic',
  'geoGnomonic',
  'geoOrthographic',
  'geoAzimuthalEqualArea',
  'geoAzimuthalEquidistant'
]);

// Projections whose pre-clip is a geographic polygon (d3-geo-polygon
// geoClipPolygon / interrupted lobes). Their interruption meridians sit on
// integer degrees, so at an exact integer orientation they become collinear
// with the round-degree ring edges of the world basemap and geoClipPolygon
// flips inside/outside for that ring (the "inverted territory" artefact).
// A sub-degree longitude offset breaks the collinearity; it is imperceptible
// at any map scale (~0.03px at world width).
const CLIP_POLYGON_PROJECTIONS = new Set([
  'geoInterrupt',
  'geoInterruptedMollweide',
  'geoInterruptedMollweideHemispheres',
  'geoPolyhedralWaterman',
  'geoAirocean',
  'geoImago',
  'geoArmadillo'
]);

export const CLIP_DEGENERACY_LON_EPSILON = 0.01;

export function isClipPolygonProjection(name: string | undefined): boolean {
  return name !== undefined && CLIP_POLYGON_PROJECTIONS.has(name);
}

// Armadillo has no built-in pre-clip: its raw forward parks back-of-sphere
// points at a sentinel y far below the shield (the "dangling" geometry). Clip
// the geometry to the visible region (north of the horizon, for the default
// 20° parallel) so both d3-geo-path (vignette) and geoarrow-deck-stream (map)
// drop it. Winding is reversed so the polygon interior is the visible side.
function buildArmadilloPreclip() {
  const tanParallel = Math.tan((20 * Math.PI) / 180);
  const horizonLat = (lon: number): number =>
    (-Math.atan2(Math.cos(((lon / 2) * Math.PI) / 180), tanParallel) * 180) /
    Math.PI;
  const ring: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    ring.push([lon, Math.max(-89, horizonLat(lon))]);
  }
  for (let lon = 180; lon >= -180; lon -= 3) {
    ring.push([lon, 89]);
  }
  ring.push(ring[0]);
  ring.reverse();
  return geoClipPolygon({ type: 'Polygon', coordinates: [ring] });
}

const ARMADILLO_PRECLIP = buildArmadilloPreclip();

function applyProjectionClip(projection: GeoProjection, name: string): void {
  if (AZIMUTHAL_CLIP_PROJECTIONS.has(name)) {
    projection.clipAngle(90);
  } else if (name === 'geoArmadillo') {
    projection.preclip(ARMADILLO_PRECLIP);
  }
}

export function buildD3ProjectionFromConfig(
  config: D3Usage
): GeoProjection | null {
  if (config.projection === 'geoInterrupt') {
    return geoMollweideOcean();
  }

  if (config.projection === 'geoCassini') {
    return geoCassini(config.rotate);
  }

  const factory = D3_FACTORY_MAP[config.projection];
  if (!factory) {
    return null;
  }

  const projection = factory();

  if (config.rotate) {
    projection.rotate([
      config.rotate[0],
      config.rotate[1],
      config.rotate[2] ?? 0
    ]);
  }

  if (config.center) {
    projection.center(config.center);
  }

  if (
    config.parallels &&
    'parallels' in projection &&
    typeof (projection as Record<string, unknown>).parallels === 'function'
  ) {
    (
      projection as unknown as { parallels: (p: [number, number]) => void }
    ).parallels(config.parallels);
  }

  applyProjectionClip(projection, config.projection);

  return projection;
}
