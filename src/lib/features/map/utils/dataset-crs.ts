import { reprojectPoint } from '$lib/features/duckdb/io/reprojection';

export function isWgs84LikeCrs(crs: string | null | undefined): boolean {
  if (!crs) {
    return false;
  }

  const normalized = crs.trim();
  if (!normalized) {
    return false;
  }

  return (
    /^epsg:4326$/i.test(normalized) ||
    /^wgs\s*84$/i.test(normalized) ||
    /(^|:)crs84$/i.test(normalized)
  );
}

export function canUseBoundsForProjectionSuggestion(
  crs: string | null | undefined
): boolean {
  return !crs || isWgs84LikeCrs(crs);
}

export function normalizeBoundsForProjectionSuggestion(
  bounds: [number, number, number, number],
  crs: string | null | undefined
): [number, number, number, number] | null {
  if (canUseBoundsForProjectionSuggestion(crs)) {
    return [bounds[0], bounds[1], bounds[2], bounds[3]];
  }

  if (!crs) {
    return null;
  }

  const [minX, minY, maxX, maxY] = bounds;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const sampledPoints: Array<[number, number]> = [
    [minX, minY],
    [minX, maxY],
    [maxX, minY],
    [maxX, maxY],
    [midX, minY],
    [midX, maxY],
    [minX, midY],
    [maxX, midY],
    [midX, midY]
  ];

  const projectedPoints = sampledPoints
    .map(([x, y]) => reprojectPoint(x, y, crs))
    .filter(
      (
        result
      ): result is {
        success: true;
        coordinates: [number, number];
      } => Boolean(result.success && result.coordinates)
    )
    .map((result) => result.coordinates);

  if (projectedPoints.length === 0) {
    return null;
  }

  const longitudes = projectedPoints.map(([longitude]) => longitude);
  const latitudes = projectedPoints.map(([, latitude]) => latitude);

  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes)
  ];
}

export function shouldUseIdentityProjectionForDatasetCrs(
  crs: string | null | undefined
): boolean {
  return Boolean(crs) && !isWgs84LikeCrs(crs);
}
