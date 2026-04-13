import * as m from '$lib/paraglide/messages';
import type { GeoProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3geoProjection from 'd3-geo-projection';
import type { Feature, FeatureCollection } from 'geojson';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import { proj4d3 } from '$lib/features/map/utils/proj4d3';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

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

export function projectGeoJSON(
  geojson: ProjectableGeoJSON,
  projectionId: string,
  options?: {
    scale?: number;
    translate?: [number, number];
    rotate?: [number, number, number];
    center?: [number, number];
    clipExtent?: [[number, number], [number, number]];
    customCode?: string;
  }
): ProjectableGeoJSON {
  let projection: GeoProjection;

  if (options?.customCode) {
    try {
      projection = proj4d3(options.customCode);
    } catch (error) {
      logger.error(
        'Custom CRS code failed, falling back to built-in projection',
        LogCategory.MAP,
        { customCode: options.customCode, error }
      );
      const fallback = getProjectionById(projectionId);
      if (!fallback) {
        throw new Error(`Unknown projection: ${projectionId}`);
      }
      projection = fallback.projection();
    }
  } else {
    const projectionInfo = getProjectionById(projectionId);
    if (!projectionInfo) {
      throw new Error(`Unknown projection: ${projectionId}`);
    }
    projection = projectionInfo.projection();
  }

  if (options?.scale) projection.scale(options.scale);
  if (options?.translate) projection.translate(options.translate);
  if (options?.rotate) projection.rotate(options.rotate);
  if (options?.center) projection.center(options.center);
  if (options?.clipExtent) projection.clipExtent(options.clipExtent);

  const path = d3geo.geoPath(projection);

  if (geojson.type === GEOJSON_TYPE.FEATURE_COLLECTION) {
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
  } else if (geojson.type === GEOJSON_TYPE.FEATURE) {
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
  padding: number = 20,
  customCode?: string
): GeoProjection {
  let projection: GeoProjection;

  if (customCode) {
    try {
      projection = proj4d3(customCode);
    } catch (error) {
      logger.error(
        'Custom CRS code failed in fitProjection, falling back to built-in projection',
        LogCategory.MAP,
        { customCode, error }
      );
      const fallback = getProjectionById(projectionId);
      if (!fallback) {
        throw new Error(`Unknown projection: ${projectionId}`);
      }
      projection = fallback.projection();
    }
  } else {
    const projectionInfo = getProjectionById(projectionId);
    if (!projectionInfo) {
      throw new Error(`Unknown projection: ${projectionId}`);
    }
    projection = projectionInfo.projection();
  }

  projection.fitSize([width - padding * 2, height - padding * 2], geojson);

  projection.translate([
    projection.translate()[0] + padding,
    projection.translate()[1] + padding
  ]);

  return projection;
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

function createProjectionFitTarget(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  const isWorldBbox =
    west <= -179.5 && south <= -89.5 && east >= 179.5 && north >= 89.5;

  return isWorldBbox
    ? { type: 'Sphere' as const }
    : {
        type: GEOJSON_TYPE.FEATURE,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south]
            ]
          ]
        },
        properties: {}
      };
}
