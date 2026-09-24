import type { AssetRef } from '$lib/features/commons/types/create-project.types';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { SerializedProjectData } from '$lib/types/serialization.types';
import { createAssetRefFromFile } from './asset-store.service';

export async function persistCustomBasemapSource(
  basemap: BasemapMetadata,
  sourceFile: File
): Promise<BasemapMetadata> {
  const sourceAsset = await createAssetRefFromFile(sourceFile, 'primary');
  return { ...basemap, sourceAsset };
}

export function collectCustomBasemapAssetRefs(
  data: Pick<SerializedProjectData, 'customBasemaps'> | undefined
): AssetRef[] {
  const metadata = data?.customBasemaps?.metadata;
  if (!Array.isArray(metadata)) {
    return [];
  }

  return metadata.flatMap((basemap) =>
    basemap?.sourceAsset ? [basemap.sourceAsset] : []
  );
}
