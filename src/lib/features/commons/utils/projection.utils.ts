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
    name: 'Mercator',
    category: 'cylindrical',
    description: 'Conforme, préserve les angles',
    projection: () => d3geo.geoMercator(),
    recommended: true
  },
  {
    id: 'natural-earth',
    name: 'Natural Earth',
    category: 'other',
    description: 'Bon compromis pour les cartes mondiales',
    projection: () => d3geo.geoNaturalEarth1(),
    recommended: true
  },
  {
    id: 'equirectangular',
    name: 'Équirectangulaire',
    category: 'cylindrical',
    description: 'Simple, distances équidistantes sur les méridiens',
    projection: () => d3geo.geoEquirectangular()
  },
  {
    id: 'orthographic',
    name: 'Orthographique',
    category: 'azimuthal',
    description: "Vue globe depuis l'espace",
    projection: () => d3geo.geoOrthographic()
  },
  {
    id: 'albers',
    name: 'Albers',
    category: 'conic',
    description: 'Équivalente, préserve les surfaces',
    projection: () => d3geo.geoAlbers()
  },
  {
    id: 'lambert-conformal',
    name: 'Lambert conforme conique',
    category: 'conic',
    description: 'Conforme, bon pour les latitudes moyennes',
    projection: () => d3geo.geoConicConformal()
  },
  {
    id: 'robinson',
    name: 'Robinson',
    category: 'other',
    description: 'Pseudo-cylindrique, esthétique',
    projection: () => d3geoProjection.geoRobinson(),
    recommended: true
  },
  {
    id: 'winkel-tripel',
    name: 'Winkel Tripel',
    category: 'other',
    description: 'Minimise les distorsions',
    projection: () => d3geoProjection.geoWinkel3(),
    recommended: true
  },
  {
    id: 'aitoff',
    name: 'Aitoff',
    category: 'other',
    description: 'Azimutale modifiée',
    projection: () => d3geoProjection.geoAitoff()
  },
  {
    id: 'mollweide',
    name: 'Mollweide',
    category: 'other',
    description: 'Équivalente, elliptique',
    projection: () => d3geoProjection.geoMollweide()
  },
  {
    id: 'stereographic',
    name: 'Stéréographique',
    category: 'azimuthal',
    description: 'Conforme, régions polaires',
    projection: () => d3geo.geoStereographic()
  },
  {
    id: 'azimuthal-equal-area',
    name: 'Azimutale équivalente',
    category: 'azimuthal',
    description: 'Préserve les surfaces',
    projection: () => d3geo.geoAzimuthalEqualArea()
  }
];

export function getProjectionById(id: string): ProjectionInfo | undefined {
  return PROJECTIONS.find((p) => p.id === id);
}

export function getProjectionsByCategory(
  category: ProjectionInfo['category']
): ProjectionInfo[] {
  return PROJECTIONS.filter((p) => p.category === category);
}

export function getRecommendedProjections(): ProjectionInfo[] {
  return PROJECTIONS.filter((p) => p.recommended);
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

export function getBoundsFromGeoJSON(
  geojson: ProjectableGeoJSON
): [[number, number], [number, number]] {
  const bounds = d3geo.geoBounds(geojson);
  return bounds as [[number, number], [number, number]];
}

export function getCentroidFromGeoJSON(
  geojson: ProjectableGeoJSON
): [number, number] {
  return d3geo.geoCentroid(geojson);
}

export function getAreaFromGeoJSON(geojson: ProjectableGeoJSON): number {
  return d3geo.geoArea(geojson);
}
