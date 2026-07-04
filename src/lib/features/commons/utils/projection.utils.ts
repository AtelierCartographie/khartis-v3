import * as m from '$lib/paraglide/messages';
import type { GeoProjection } from 'd3-geo';
import { GEOJSON_TYPE } from '$lib/features/commons/constants/geojson.constants';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import type { D3Usage } from 'proj-suggest';
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
  stereographic: { projection: 'geoStereographic' },
  'azimuthal-equal-area': { projection: 'geoAzimuthalEqualArea' },
  'gall-peters': { projection: 'geoCylindricalEqualArea' },
  'equal-earth': { projection: 'geoEqualEarth' },
  bonne: { projection: 'geoBonne' },
  armadillo: { projection: 'geoArmadillo' },
  atlantis: { projection: 'geoMollweide', rotate: [30, -45, 0] },
  'bertin-1953': { projection: 'geoBertin1953' },
  'interrupted-mollweide': { projection: 'geoInterruptedMollweide' }
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

export interface ProjectionInfo {
  id: string;
  name: string;
  category: 'standard' | 'cylindrical' | 'conic' | 'azimuthal' | 'other';
  description?: string;
  projection: () => GeoProjection;
  recommended?: boolean;
  bounds?: [[number, number], [number, number]];
}

export const PROJECTIONS: ProjectionInfo[] = [
  {
    id: 'mercator',
    get name() {
      return m.projection_name_mercator();
    },
    category: 'cylindrical',
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
    category: 'other',
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
    category: 'cylindrical',
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
    category: 'azimuthal',
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
    category: 'conic',
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
    category: 'conic',
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
    category: 'other',
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
    category: 'other',
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
    category: 'other',
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
    category: 'other',
    get description() {
      return m.projection_desc_mollweide();
    },
    projection: () => buildConfiguredCatalogueProjection('mollweide')
  },
  {
    id: 'stereographic',
    get name() {
      return m.projection_name_stereographic();
    },
    category: 'azimuthal',
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
    category: 'azimuthal',
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
    category: 'cylindrical',
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
    category: 'other',
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
    category: 'conic',
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
    category: 'other',
    get description() {
      return m.projection_desc_armadillo();
    },
    projection: () => buildConfiguredCatalogueProjection('armadillo')
  },
  {
    id: 'atlantis',
    get name() {
      return m.projection_name_atlantis();
    },
    category: 'other',
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
    category: 'other',
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
    category: 'other',
    get description() {
      return m.projection_desc_interrupted_mollweide();
    },
    projection: () =>
      buildConfiguredCatalogueProjection('interrupted-mollweide')
  }
];

export function getProjectionById(id: string): ProjectionInfo | undefined {
  return PROJECTIONS.find((p) => p.id === id);
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
