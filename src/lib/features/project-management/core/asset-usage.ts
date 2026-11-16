export interface StoredAssetSize {
  assetId: string;
  size: number;
}

export interface StoredAssetRef {
  projectId: string;
  assetId: string;
}

export interface ProjectAssetUsage {
  /** Every file the project references, shared ones included. */
  assetBytes: number;
  /** Files no other project references: what deleting the project frees. */
  exclusiveAssetBytes: number;
}

export function computeProjectAssetUsage(
  assets: readonly StoredAssetSize[],
  refs: readonly StoredAssetRef[]
): Map<string, ProjectAssetUsage> {
  const sizeByAsset = new Map(
    assets.map((asset) => [asset.assetId, asset.size])
  );
  const projectsByAsset = new Map<string, Set<string>>();

  for (const { projectId, assetId } of refs) {
    let projects = projectsByAsset.get(assetId);
    if (!projects) {
      projects = new Set();
      projectsByAsset.set(assetId, projects);
    }
    projects.add(projectId);
  }

  const usage = new Map<string, ProjectAssetUsage>();

  for (const [assetId, projects] of projectsByAsset) {
    const size = sizeByAsset.get(assetId) ?? 0;

    for (const projectId of projects) {
      const entry = usage.get(projectId) ?? {
        assetBytes: 0,
        exclusiveAssetBytes: 0
      };
      entry.assetBytes += size;
      if (projects.size === 1) {
        entry.exclusiveAssetBytes += size;
      }
      usage.set(projectId, entry);
    }
  }

  return usage;
}
