import * as m from '$lib/paraglide/messages';
import type { GeoProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3geoProjection from 'd3-geo-projection';
import type { Feature, FeatureCollection } from 'geojson';

export interface ProjectionInfo {
  id: string;
  name: string;
  category: 'standard' | 'cylindrical' | 'conic' | 'azimuthal' | 'other';
  description?: string;
  projection: () => GeoProjection;
  recommended?: boolean;
  bounds?: [[number, number], [number, number]];
}

type FeatureWithPath = Feature & { svgPath?: string };
type FeatureCollectionWithPath = FeatureCollection & {
  features: FeatureWithPath[];
};
type ProjectableGeoJSON = FeatureWithPath | FeatureCollectionWithPath;

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
  }
];

export function getProjectionById(id: string): ProjectionInfo | undefined {
  return PROJECTIONS.find((p) => p.id === id);
}

export function suggestProjection(
  bounds: [[number, number], [number, number]]
): string {
  const [minLon, minLat] = bounds[0];
  const [maxLon, maxLat] = bounds[1];

  const width = maxLon - minLon;
  const height = maxLat - minLat;
  const centerLat = (minLat + maxLat) / 2;

  if (width > 180) {
    return 'natural-earth';
  }

  if (Math.abs(centerLat) > 60) {
    return 'stereographic';
  }

  if (height < 30 && width < 60) {
    if (Math.abs(centerLat) < 30) {
      return 'mercator';
    } else {
      return 'lambert-conformal';
    }
  }

  if (width > 90) {
    return 'robinson';
  }

  return 'albers';
}

export function projectGeoJSON(
  geojson: ProjectableGeoJSON,
  projectionId: string,
  options?: {
    scale?: number;
    translate?: [number, number];
    rotate?: [number, number, number];
    center?: [number, number];
    clipExtent?: [[number, number], [number, number]];
  }
): ProjectableGeoJSON {
  const projectionInfo = getProjectionById(projectionId);
  if (!projectionInfo) {
    throw new Error(`Unknown projection: ${projectionId}`);
  }

  const projection = projectionInfo.projection();

  if (options?.scale) projection.scale(options.scale);
  if (options?.translate) projection.translate(options.translate);
  if (options?.rotate) projection.rotate(options.rotate);
  if (options?.center) projection.center(options.center);
  if (options?.clipExtent) projection.clipExtent(options.clipExtent);

  const path = d3geo.geoPath(projection);

  if (geojson.type === 'FeatureCollection') {
    const featuresWithPaths: FeatureWithPath[] = geojson.features.map(
      (feature) => ({
        ...feature,
        svgPath: path(feature) ?? undefined
      })
    );

    return {
      ...geojson,
      features: featuresWithPaths
    };
  } else if (geojson.type === 'Feature') {
    return {
      ...geojson,
      svgPath: path(geojson) ?? undefined
    };
  }

  return geojson;
}

export function fitProjectionToGeoJSON(
  geojson: FeatureCollection,
  projectionId: string,
  width: number,
  height: number,
  padding: number = 20
): GeoProjection {
  const projectionInfo = getProjectionById(projectionId);
  if (!projectionInfo) {
    throw new Error(`Unknown projection: ${projectionId}`);
  }

  const projection = projectionInfo.projection();

  projection.fitSize([width - padding * 2, height - padding * 2], geojson);

  projection.translate([
    projection.translate()[0] + padding,
    projection.translate()[1] + padding
  ]);

  return projection;
}
