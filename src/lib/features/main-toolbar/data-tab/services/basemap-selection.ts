export function resolveNextBasemapSelectionId(
  currentBasemapId: string | undefined,
  requestedBasemapId: string
): string | undefined {
  if (!requestedBasemapId) {
    return undefined;
  }

  return currentBasemapId === requestedBasemapId
    ? undefined
    : requestedBasemapId;
}
