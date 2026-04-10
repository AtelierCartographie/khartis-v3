interface BasemapSelectionOptions {
  allowToggleOff?: boolean;
}

export function resolveNextBasemapSelectionId(
  currentBasemapId: string | undefined,
  requestedBasemapId: string,
  options: BasemapSelectionOptions = {}
): string | undefined {
  if (!requestedBasemapId) {
    return undefined;
  }

  return currentBasemapId === requestedBasemapId &&
    options.allowToggleOff !== false
    ? undefined
    : requestedBasemapId;
}
