import * as m from '$lib/paraglide/messages';
import type { GeoProjection } from 'd3-geo';
import { GEOJSON_TYPE } from '$lib/features/commons/constants/geojson.constants';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import type { D3Usage } from '@ateliercartographie/proj-suggest';
import { buildD3ProjectionFromConfig } from './d3-projection-config.utils';

const CATALOGUE_PROJECTION_D3_CONFIGS: Record<string, D3Usage> = {
  mercator: { projection: 'geoMercator' },
  'natural-earth': { projection: 'geoNaturalEarth1' },
  equirectangular: { projection: 'geoEquirectangular' },
  orthographic: { projection: 'geoOrthographic' },
  albers: { projection: 'geoAlbers' },
  'lambert-conformal': { projection: 'geoConicConformal' },
  robinson: { projection: 'geoRobinson' },
  'winkel-tripel': { projection: 'geoWinkel3' },
  aitoff: { projection: 'geoAitoff' },
  mollweide: { projection: 'geoMollweide' },
  'eckert-4': { projection: 'geoEckert4' },
  stereographic: { projection: 'geoStereographic' },
  'azimuthal-equal-area': { projection: 'geoAzimuthalEqualArea' },
  'gall-peters': { projection: 'geoCylindricalEqualArea', parallels: [45, 45] },
  'equal-earth': { projection: 'geoEqualEarth' },
  bonne: { projection: 'geoBonne' },
  armadillo: { projection: 'geoArmadillo' },
  atlantis: { projection: 'geoMollweide', rotate: [30, -45, 0] },
  'bertin-1953': { projection: 'geoBertin1953' },
  'interrupted-mollweide': { projection: 'geoInterruptedMollweide' },
  times: { projection: 'geoTimes' },
  imago: { projection: 'geoImago' },
  airocean: { projection: 'geoAirocean' },
  waterman: { projection: 'geoPolyhedralWaterman' },
  'mollweide-hemispheres': {
    projection: 'geoInterruptedMollweideHemispheres'
  },
  'mollweide-oceans': { projection: 'geoInterrupt' },
  // d3's own default (rotate [-90, -90, 45]) centres the square on the wrong
  // meridian and its 45° roll flips part of the polygon rings. The reference
  // square world map is lon_0 = 25 with no roll.
  'peirce-quincuncial': {
    projection: 'geoPeirceQuincuncial',
    rotate: [-25, -90, 0]
  },
  'transverse-mercator': { projection: 'geoTransverseMercator' },
  'azimuthal-equidistant': { projection: 'geoAzimuthalEquidistant' },
  'equidistant-conic': { projection: 'geoConicEquidistant' },
  'cylindrical-equal-area': {
    projection: 'geoCylindricalEqualArea',
    parallels: [0, 0]
  },
  cassini: { projection: 'geoCassini' }
};

function cloneD3UsageConfig(config: D3Usage): D3Usage {
  return {
    projection: config.projection,
    ...(config.rotate ? { rotate: [...config.rotate] } : {}),
    ...(config.center ? { center: [...config.center] } : {}),
    ...(config.parallels ? { parallels: [...config.parallels] } : {}),
    ...(config.snippet ? { snippet: config.snippet } : {})
  };
}

export function getProjectionD3ConfigById(id: string): D3Usage | undefined {
  const config = CATALOGUE_PROJECTION_D3_CONFIGS[id];
  return config ? cloneD3UsageConfig(config) : undefined;
}

function buildConfiguredCatalogueProjection(id: string): GeoProjection {
  const config = CATALOGUE_PROJECTION_D3_CONFIGS[id];
  const projection = config ? buildD3ProjectionFromConfig(config) : null;
  if (!projection) {
    throw new DataValidationError(
      `Unsupported catalogue projection: ${id}`,
      'projectionId',
      { projectionId: id }
    );
  }
  return projection;
}

export function buildProjectionFromCatalogueId(
  id: string
): GeoProjection | undefined {
  const config = getProjectionD3ConfigById(id);
  if (config) {
    return buildD3ProjectionFromConfig(config) ?? undefined;
  }

  return getProjectionById(id)?.projection();
}

export type ProjectionShape = 'rectangular' | 'round' | 'discontinuous';

export interface ProjectionInfo {
  id: string;
  name: string;
  shape: ProjectionShape;
  description?: string;
  projection: () => GeoProjection;
  recommended?: boolean;
  // Interrupted, polyhedral or pre-clipped projections are only defined for
  // the whole sphere: fitting them to a sub-global bbox blows the scale up and
  // leaves degenerate slivers, so the render path must fit them to the Sphere.
  worldScale?: boolean;
  bounds?: [[number, number], [number, number]];
}

export const PROJECTIONS: ProjectionInfo[] = [
  {
    id: 'mercator',
    get name() {
      return m.projection_name_mercator();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_mercator();
    },
    projection: () => buildConfiguredCatalogueProjection('mercator'),
    recommended: true
  },
  {
    id: 'natural-earth',
    get name() {
      return m.projection_name_natural_earth();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_natural_earth();
    },
    projection: () => buildConfiguredCatalogueProjection('natural-earth'),
    recommended: true
  },
  {
    id: 'equirectangular',
    get name() {
      return m.projection_name_equirectangular();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_equirectangular();
    },
    projection: () => buildConfiguredCatalogueProjection('equirectangular')
  },
  {
    id: 'orthographic',
    get name() {
      return m.projection_name_orthographic();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_orthographic();
    },
    projection: () => buildConfiguredCatalogueProjection('orthographic')
  },
  {
    id: 'albers',
    get name() {
      return m.projection_name_albers();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_albers();
    },
    projection: () => buildConfiguredCatalogueProjection('albers')
  },
  {
    id: 'lambert-conformal',
    get name() {
      return m.projection_name_lambert_conformal();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_lambert_conformal();
    },
    projection: () => buildConfiguredCatalogueProjection('lambert-conformal')
  },
  {
    id: 'robinson',
    get name() {
      return m.projection_name_robinson();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_robinson();
    },
    projection: () => buildConfiguredCatalogueProjection('robinson'),
    recommended: true
  },
  {
    id: 'winkel-tripel',
    get name() {
      return m.projection_name_winkel_tripel();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_winkel_tripel();
    },
    projection: () => buildConfiguredCatalogueProjection('winkel-tripel'),
    recommended: true
  },
  {
    id: 'aitoff',
    get name() {
      return m.projection_name_aitoff();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_aitoff();
    },
    projection: () => buildConfiguredCatalogueProjection('aitoff')
  },
  {
    id: 'mollweide',
    get name() {
      return m.projection_name_mollweide();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_mollweide();
    },
    projection: () => buildConfiguredCatalogueProjection('mollweide')
  },
  {
    id: 'eckert-4',
    get name() {
      return m.projection_name_eckert_4();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_eckert_4();
    },
    projection: () => buildConfiguredCatalogueProjection('eckert-4')
  },
  {
    id: 'stereographic',
    get name() {
      return m.projection_name_stereographic();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_stereographic();
    },
    projection: () => buildConfiguredCatalogueProjection('stereographic')
  },
  {
    id: 'azimuthal-equal-area',
    get name() {
      return m.projection_name_azimuthal_equal_area();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_azimuthal_equal_area();
    },
    projection: () => buildConfiguredCatalogueProjection('azimuthal-equal-area')
  },
  {
    id: 'gall-peters',
    get name() {
      return m.projection_name_gall_peters();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_gall_peters();
    },
    projection: () => buildConfiguredCatalogueProjection('gall-peters')
  },
  {
    id: 'equal-earth',
    get name() {
      return m.projection_name_equal_earth();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_equal_earth();
    },
    projection: () => buildConfiguredCatalogueProjection('equal-earth')
  },
  {
    id: 'bonne',
    get name() {
      return m.projection_name_bonne();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_bonne();
    },
    projection: () => buildConfiguredCatalogueProjection('bonne')
  },
  {
    id: 'armadillo',
    get name() {
      return m.projection_name_armadillo();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_armadillo();
    },
    worldScale: true,
    projection: () => buildConfiguredCatalogueProjection('armadillo')
  },
  {
    id: 'atlantis',
    get name() {
      return m.projection_name_atlantis();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_atlantis();
    },
    projection: () => buildConfiguredCatalogueProjection('atlantis')
  },
  {
    id: 'bertin-1953',
    get name() {
      return m.projection_name_bertin_1953();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_bertin_1953();
    },
    projection: () => buildConfiguredCatalogueProjection('bertin-1953')
  },
  {
    id: 'interrupted-mollweide',
    get name() {
      return m.projection_name_interrupted_mollweide();
    },
    shape: 'discontinuous',
    get description() {
      return m.projection_desc_interrupted_mollweide();
    },
    worldScale: true,
    projection: () =>
      buildConfiguredCatalogueProjection('interrupted-mollweide')
  },
  {
    id: 'times',
    get name() {
      return m.projection_name_times();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_times();
    },
    projection: () => buildConfiguredCatalogueProjection('times')
  },
  {
    id: 'cylindrical-equal-area',
    get name() {
      return m.projection_name_cylindrical_equal_area();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_cylindrical_equal_area();
    },
    projection: () =>
      buildConfiguredCatalogueProjection('cylindrical-equal-area')
  },
  {
    id: 'transverse-mercator',
    get name() {
      return m.projection_name_transverse_mercator();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_transverse_mercator();
    },
    projection: () => buildConfiguredCatalogueProjection('transverse-mercator')
  },
  {
    id: 'equidistant-conic',
    get name() {
      return m.projection_name_equidistant_conic();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_equidistant_conic();
    },
    projection: () => buildConfiguredCatalogueProjection('equidistant-conic')
  },
  {
    id: 'cassini',
    get name() {
      return m.projection_name_cassini();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_cassini();
    },
    projection: () => buildConfiguredCatalogueProjection('cassini')
  },
  {
    id: 'azimuthal-equidistant',
    get name() {
      return m.projection_name_azimuthal_equidistant();
    },
    shape: 'round',
    get description() {
      return m.projection_desc_azimuthal_equidistant();
    },
    projection: () =>
      buildConfiguredCatalogueProjection('azimuthal-equidistant')
  },
  {
    id: 'imago',
    get name() {
      return m.projection_name_imago();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_imago();
    },
    worldScale: true,
    projection: () => buildConfiguredCatalogueProjection('imago')
  },
  {
    id: 'airocean',
    get name() {
      return m.projection_name_airocean();
    },
    shape: 'discontinuous',
    get description() {
      return m.projection_desc_airocean();
    },
    worldScale: true,
    projection: () => buildConfiguredCatalogueProjection('airocean')
  },
  {
    id: 'waterman',
    get name() {
      return m.projection_name_waterman();
    },
    shape: 'discontinuous',
    get description() {
      return m.projection_desc_waterman();
    },
    worldScale: true,
    projection: () => buildConfiguredCatalogueProjection('waterman')
  },
  {
    id: 'mollweide-hemispheres',
    get name() {
      return m.projection_name_mollweide_hemispheres();
    },
    shape: 'discontinuous',
    get description() {
      return m.projection_desc_mollweide_hemispheres();
    },
    worldScale: true,
    projection: () =>
      buildConfiguredCatalogueProjection('mollweide-hemispheres')
  },
  {
    id: 'mollweide-oceans',
    get name() {
      return m.projection_name_mollweide_oceans();
    },
    shape: 'discontinuous',
    get description() {
      return m.projection_desc_mollweide_oceans();
    },
    worldScale: true,
    projection: () => buildConfiguredCatalogueProjection('mollweide-oceans')
  },
  {
    id: 'peirce-quincuncial',
    get name() {
      return m.projection_name_peirce_quincuncial();
    },
    shape: 'rectangular',
    get description() {
      return m.projection_desc_peirce_quincuncial();
    },
    worldScale: true,
    projection: () => buildConfiguredCatalogueProjection('peirce-quincuncial')
  }
];

export function getProjectionById(id: string): ProjectionInfo | undefined {
  return PROJECTIONS.find((p) => p.id === id);
}

export function isWorldScaleProjectionId(id: string): boolean {
  return getProjectionById(id)?.worldScale === true;
}

export interface ProjectionOrientationSource {
  selected?: string;
  customCode?: string;
  suggestionD3Config?: D3Usage;
}

const orientationDefaultCache = new Map<string, [number, number]>();

// A d3 projection often carries its own orientation (Bertin 1953 is rotated
// onto the inhabited landmasses, Air Ocean onto its icosahedron, the two-
// hemisphere Mollweide onto the Atlantic cut…). The render path re-applies
// `rotate([-longitude, -latitude, gamma])`, so the settings must start from
// that intrinsic orientation or the projection is silently reset to lon/lat 0.
export function resolveProjectionDefaultOrientation(
  source: ProjectionOrientationSource
): [number, number] {
  const cacheKey = getOrientationCacheKey(source);
  const cached = orientationDefaultCache.get(cacheKey);
  if (cached) {
    return [...cached];
  }

  const orientation = readProjectionOrientation(source);
  orientationDefaultCache.set(cacheKey, orientation);
  return [...orientation];
}

function readProjectionOrientation(
  source: ProjectionOrientationSource
): [number, number] {
  if (source.customCode) {
    return [0, 0];
  }

  const projection = source.suggestionD3Config
    ? buildD3ProjectionFromConfig(source.suggestionD3Config)
    : source.selected
      ? buildProjectionFromCatalogueId(source.selected)
      : undefined;
  const rotate = projection?.rotate();

  return [-(rotate?.[0] ?? 0), -(rotate?.[1] ?? 0)];
}

function getOrientationCacheKey(source: ProjectionOrientationSource): string {
  if (source.customCode) {
    return 'code';
  }

  const config = source.suggestionD3Config;
  if (!config) {
    return `id:${source.selected ?? ''}`;
  }

  return [
    'd3',
    config.projection,
    config.rotate?.join(',') ?? '',
    config.center?.join(',') ?? '',
    config.parallels?.join(',') ?? ''
  ].join('|');
}

export function fitProjectionToBbox(
  projection: GeoProjection,
  bbox: [number, number, number, number],
  width: number,
  height: number,
  padding = 20
): GeoProjection {
  const fitTarget = createProjectionFitTarget(bbox);

  projection.fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding]
    ],
    fitTarget
  );

  return projection;
}

export function isGlobalBbox(bbox: [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox;
  return west <= -179.5 && south <= -89.5 && east >= 179.5 && north >= 89.5;
}

function createProjectionFitTarget(bbox: [number, number, number, number]) {
  return isGlobalBbox(bbox)
    ? { type: 'Sphere' as const }
    : {
        type: GEOJSON_TYPE.FEATURE,
        geometry: {
          type: 'MultiPoint' as const,
          coordinates: createBboxBoundaryCoordinates(bbox)
        },
        properties: {}
      };
}

function createBboxBoundaryCoordinates(
  bbox: [number, number, number, number]
): [number, number][] {
  const [west, south, east, north] = bbox;
  const steps = 32;
  const coordinates: [number, number][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const lon = west + (east - west) * ratio;
    const lat = south + (north - south) * ratio;
    coordinates.push([lon, south], [lon, north], [west, lat], [east, lat]);
  }

  coordinates.push([(west + east) / 2, (south + north) / 2]);
  return coordinates;
}
