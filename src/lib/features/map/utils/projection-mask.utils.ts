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

  const spherePath = d3geo.geoPath(projection)(WORLD_SPHERE);
  if (!spherePath || hasNonFinitePathData(spherePath)) {
    return null;
  }

  return spherePath;
}
