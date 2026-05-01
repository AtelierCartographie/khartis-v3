import * as d3geo from 'd3-geo';
import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import { GEOJSON_TYPE } from '$lib/features/commons/constants/geojson.constants';

const WORLD_SPHERE: GeoPermissibleObjects = {
  type: GEOJSON_TYPE.SPHERE
};

function isGeoProjection(
  projection: ProjectionLike
): projection is GeoProjection {
  return typeof (projection as GeoProjection).stream === 'function';
}

function hasNonFinitePathData(pathData: string): boolean {
  return pathData.includes('NaN') || pathData.includes('Infinity');
}

function hasDegenerateBounds(
  bounds: [[number, number], [number, number]]
): boolean {
  const [[minX, minY], [maxX, maxY]] = bounds;
  return (
    ![minX, minY, maxX, maxY].every(Number.isFinite) ||
    maxX <= minX ||
    maxY <= minY
  );
}

export function buildProjectionMaskPath({
  projection,
  width,
  height
}: {
  projection?: ProjectionLike;
  width: number;
  height: number;
}): string | null {
  if (
    !projection ||
    width <= 0 ||
    height <= 0 ||
    !isGeoProjection(projection)
  ) {
    return null;
  }

  const path = d3geo.geoPath(projection);
  const spherePath = path(WORLD_SPHERE);
  if (
    !spherePath ||
    hasNonFinitePathData(spherePath) ||
    hasDegenerateBounds(path.bounds(WORLD_SPHERE))
  ) {
    return null;
  }

  return spherePath;
}
