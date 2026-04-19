export function shouldShowOrthographicBasemapLayers({
  isOrthographicMode,
  isOSMActive,
  hasReferenceBasemap,
  hasUserData
}: {
  isOrthographicMode: boolean;
  isOSMActive: boolean;
  hasReferenceBasemap: boolean;
  hasUserData: boolean;
}): boolean {
  if (isOSMActive || !isOrthographicMode) {
    return false;
  }

  return hasReferenceBasemap || !hasUserData;
}
