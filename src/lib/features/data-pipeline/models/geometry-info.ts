/**
 * Geometry information value object
 *
 * Metadata about spatial data extracted from GeoJSON/Shapefile.
 *
 * @example
 * ```typescript
 * const geomInfo: GeometryInfo = {
 *   type: 'Polygon',
 *   bounds: [-10.0, 35.0, 10.0, 55.0],
 *   centroid: [0.0, 45.0],
 *   crs: 'EPSG:4326',
 *   featureCount: 332
 * };
 * Bounds follow the [minLon, minLat, maxLon, maxLat] order and centroids are [lon, lat].
 * ```
 */
export interface GeometryInfo {
  /**
   * Geometry type (Point, LineString, Polygon, Multi*)
   */
  type: string;

  /**
   * Bounding box [minLon, minLat, maxLon, maxLat]
   */
  bounds: [number, number, number, number];

  /**
   * Centroid [lon, lat]
   */
  centroid: [number, number];

  /**
   * Coordinate reference system (e.g., 'EPSG:4326')
   */
  crs?: string;

  /**
   * Number of features (for feature collections)
   */
  featureCount?: number;
}

/**
 * Compute centroid from bounds
 *
 * @param bounds - Bounding box [minLon, minLat, maxLon, maxLat]
 * @returns Centroid [lon, lat]
 */
export function computeCentroid(
  bounds: [number, number, number, number]
): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

/**
 * Check if bounds are valid
 *
 * @param bounds - Bounding box to validate
 * @returns true if bounds are valid (min < max for both axes)
 */
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

/**
 * Compute bounds area (approximate, for comparison)
 *
 * @param bounds - Bounding box
 * @returns Approximate area in square degrees
 */
export function computeBoundsArea(
  bounds: [number, number, number, number]
): number {
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  return width * height;
}
