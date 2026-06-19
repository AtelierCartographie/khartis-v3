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

export function shouldUseIdentityProjectionForDatasetCrs(
  crs: string | null | undefined
): boolean {
  return Boolean(crs) && !isWgs84LikeCrs(crs);
}

// A non-WGS84 dataset normally renders in its source CRS (identity projection,
// projection tool inert). When the user actively applies a d3 projection, the
// orthographic engine reprojects the geometry to WGS84 (in DuckDB) and applies
// the projection like any WGS84 dataset. This predicate gates that opt-in path
// and MUST be evaluated identically wherever the reprojection is decided.
export function shouldReprojectDatasetForActiveProjection(
  crs: string | null | undefined,
  hasActiveProjection: boolean
): boolean {
  return hasActiveProjection && shouldUseIdentityProjectionForDatasetCrs(crs);
}
