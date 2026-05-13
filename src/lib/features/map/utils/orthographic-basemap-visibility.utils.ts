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

export function shouldShowGeneratedOrthographicOceanLayer({
  canShowGeneratedBasemapLayers,
  hasVisibleGeneratedOceanLayer,
  hasDatasetContent,
  hasManualProjectionOverride,
  hasCustomizedOceanStyle
}: {
  canShowGeneratedBasemapLayers: boolean;
  hasVisibleGeneratedOceanLayer: boolean;
  hasDatasetContent: boolean;
  hasManualProjectionOverride: boolean;
  hasCustomizedOceanStyle: boolean;
}): boolean {
  if (!canShowGeneratedBasemapLayers || !hasVisibleGeneratedOceanLayer) {
    return false;
  }

  return (
    !hasDatasetContent || hasManualProjectionOverride || hasCustomizedOceanStyle
  );
}
