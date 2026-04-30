export function shouldShowOrthographicBasemapLayers({
  isOrthographicMode,
  isOSMActive,
  hasDatasetContent,
  hasBasemapReference
}: {
  isOrthographicMode: boolean;
  isOSMActive: boolean;
  hasDatasetContent: boolean;
  hasBasemapReference: boolean;
}): boolean {
  if (isOSMActive || !isOrthographicMode) {
    return false;
  }

  return hasBasemapReference || !hasDatasetContent;
}
