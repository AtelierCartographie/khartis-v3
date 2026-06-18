import * as m from '$lib/paraglide/messages';
import type { GeoProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3geoProjection from 'd3-geo-projection';
import { GEOJSON_TYPE } from '$lib/features/commons/constants/geojson.constants';

type D3GeoProjectionModule = Record<string, (() => GeoProjection) | undefined>;

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
    name: m.projection_name_mercator(),
    category: 'cylindrical',
    description: m.projection_desc_mercator(),
    projection: () => d3geo.geoMercator(),
    recommended: true
  },
  {
    id: 'natural-earth',
    name: m.projection_name_natural_earth(),
    category: 'other',
    description: m.projection_desc_natural_earth(),
    projection: () => d3geo.geoNaturalEarth1(),
    recommended: true
  },
  {
    id: 'equirectangular',
    name: m.projection_name_equirectangular(),
    category: 'cylindrical',
    description: m.projection_desc_equirectangular(),
    projection: () => d3geo.geoEquirectangular()
  },
  {
    id: 'orthographic',
    name: m.projection_name_orthographic(),
    category: 'azimuthal',
    description: m.projection_desc_orthographic(),
    projection: () => d3geo.geoOrthographic()
  },
  {
    id: 'albers',
    name: m.projection_name_albers(),
    category: 'conic',
    description: m.projection_desc_albers(),
    projection: () => d3geo.geoAlbers()
  },
  {
    id: 'lambert-conformal',
    name: m.projection_name_lambert_conformal(),
    category: 'conic',
    description: m.projection_desc_lambert_conformal(),
    projection: () => d3geo.geoConicConformal()
  },
  {
    id: 'robinson',
    name: m.projection_name_robinson(),
    category: 'other',
    description: m.projection_desc_robinson(),
    projection: () => d3geoProjection.geoRobinson(),
    recommended: true
  },
  {
    id: 'winkel-tripel',
    name: m.projection_name_winkel_tripel(),
    category: 'other',
    description: m.projection_desc_winkel_tripel(),
    projection: () => d3geoProjection.geoWinkel3(),
    recommended: true
  },
  {
    id: 'aitoff',
    name: m.projection_name_aitoff(),
    category: 'other',
    description: m.projection_desc_aitoff(),
    projection: () => d3geoProjection.geoAitoff()
  },
  {
    id: 'mollweide',
    name: m.projection_name_mollweide(),
    category: 'other',
    description: m.projection_desc_mollweide(),
    projection: () => d3geoProjection.geoMollweide()
  },
  {
    id: 'stereographic',
    name: m.projection_name_stereographic(),
    category: 'azimuthal',
    description: m.projection_desc_stereographic(),
    projection: () => d3geo.geoStereographic()
  },
  {
    id: 'azimuthal-equal-area',
    name: m.projection_name_azimuthal_equal_area(),
    category: 'azimuthal',
    description: m.projection_desc_azimuthal_equal_area(),
    projection: () => d3geo.geoAzimuthalEqualArea()
  },
  {
    id: 'gall-peters',
    name: m.projection_name_gall_peters(),
    category: 'cylindrical',
    description: m.projection_desc_gall_peters(),
    projection: () =>
      (d3geoProjection as D3GeoProjectionModule).geoCylindricalEqualArea!()
  },
  {
    id: 'equal-earth',
    name: m.projection_name_equal_earth(),
    category: 'other',
    description: m.projection_desc_equal_earth(),
    projection: () => d3geo.geoEqualEarth()
  },
  {
    id: 'bonne',
    name: m.projection_name_bonne(),
    category: 'conic',
    description: m.projection_desc_bonne(),
    projection: () => (d3geoProjection as D3GeoProjectionModule).geoBonne!()
  },
  {
    id: 'armadillo',
    name: m.projection_name_armadillo(),
    category: 'other',
    description: m.projection_desc_armadillo(),
    projection: () => (d3geoProjection as D3GeoProjectionModule).geoArmadillo!()
  },
  {
    id: 'atlantis',
    name: m.projection_name_atlantis(),
    category: 'other',
    description: m.projection_desc_atlantis(),
    projection: () => d3geoProjection.geoMollweide().rotate([30, -45, 0])
  },
  {
    id: 'bertin-1953',
    name: m.projection_name_bertin_1953(),
    category: 'other',
    description: m.projection_desc_bertin_1953(),
    projection: () =>
      (d3geoProjection as D3GeoProjectionModule).geoBertin1953!()
  },
  {
    id: 'interrupted-mollweide',
    name: m.projection_name_interrupted_mollweide(),
    category: 'other',
    description: m.projection_desc_interrupted_mollweide(),
    projection: () =>
      (d3geoProjection as D3GeoProjectionModule).geoInterruptedMollweide!()
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

export function getProjectedBboxForBbox(
  projection: GeoProjection,
  bbox: [number, number, number, number]
): [number, number, number, number] {
  const fitTarget = createProjectionFitTarget(bbox);
  const path = d3geo.geoPath(projection);
  const [[minX, minY], [maxX, maxY]] = path.bounds(fitTarget);

  return [minX, minY, maxX, maxY];
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
