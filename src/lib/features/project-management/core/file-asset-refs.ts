import type {
  AssetRef,
  UploadedFile
} from '$lib/features/commons/types/create-project.types';

export function collectFileAssetRefs(file: UploadedFile): AssetRef[] {
  return [
    ...(file.assetRef ? [file.assetRef] : []),
    ...(file.companionAssetRefs ?? []),
    ...(file.enrichmentSnapshot ? [file.enrichmentSnapshot] : [])
  ];
}
