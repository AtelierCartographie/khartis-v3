import type { BasemapMetadata } from '../types/basemap.types';

export interface ActiveBasemapMetadataInput {
  referenceBasemapId: string | null | undefined;
  resolvedBasemapId?: string | null;
  availableBasemaps: readonly BasemapMetadata[];
  currentMetadata: BasemapMetadata | null | undefined;
}

export function resolveActiveBasemapMetadata({
  referenceBasemapId,
  resolvedBasemapId,
  availableBasemaps,
  currentMetadata
}: ActiveBasemapMetadataInput): BasemapMetadata | null {
  if (!referenceBasemapId) {
    return null;
  }

  const selectedIds = new Set(
    [referenceBasemapId, resolvedBasemapId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    )
  );

  return (
    availableBasemaps.find((basemap) => selectedIds.has(basemap.file)) ??
    (currentMetadata && selectedIds.has(currentMetadata.file)
      ? currentMetadata
      : null)
  );
}
