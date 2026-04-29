export function shouldShowOrthographicBasemapLayers({
  isOrthographicMode,
  isOSMActive
}: {
  isOrthographicMode: boolean;
  isOSMActive: boolean;
}): boolean {
  if (isOSMActive || !isOrthographicMode) {
    return false;
  }

  return true;
}
