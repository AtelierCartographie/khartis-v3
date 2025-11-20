/**
 * Geometry metadata derived from spatial datasets.
 */
export interface GeometryInfo {
  type: string;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  centroid: [number, number]; // [lon, lat]
  crs?: string;
  featureCount?: number;
}

export function computeCentroid(
  bounds: [number, number, number, number]
): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export function isValidBounds(
  bounds: [number, number, number, number]
): boolean {
  return (
    bounds[0] < bounds[2] &&
    bounds[1] < bounds[3] &&
    bounds[0] >= -180 &&
    bounds[2] <= 180 &&
    bounds[1] >= -90 &&
    bounds[3] <= 90
  );
}

export function computeBoundsArea(
  bounds: [number, number, number, number]
): number {
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  return width * height;
}
