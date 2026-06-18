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
