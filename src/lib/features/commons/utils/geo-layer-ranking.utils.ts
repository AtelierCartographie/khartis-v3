export interface RankableGeoLayer {
  geometryType: string | null;
  featureCount: number;
}

function getGeometryPriority(geometryType: string | null): number {
  const normalized = geometryType?.toLowerCase() ?? '';

  if (normalized.includes('polygon')) return 0;
  if (normalized.includes('line')) return 1;
  if (normalized.includes('point')) return 2;

  return 3;
}

/**
 * Orders the layers of a multi-layer source the way a single-layer read picks
 * one: polygons, then lines, then points, the largest first. The sort is
 * stable, so ties keep the source order.
 */
export function rankGeoLayers<T extends RankableGeoLayer>(layers: T[]): T[] {
  return [...layers].sort(
    (left, right) =>
      getGeometryPriority(left.geometryType) -
        getGeometryPriority(right.geometryType) ||
      right.featureCount - left.featureCount
  );
}
