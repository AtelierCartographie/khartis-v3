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

export interface StoredAssetEntry extends StoredAssetSize {
  createdAt: string;
}

export interface StorageGarbageInput {
  projectIds: ReadonlySet<string>;
  refs: readonly StoredAssetRef[];
  assets: readonly StoredAssetEntry[];
  /** Asset ids that own at least one chunk. */
  chunkAssetIds: ReadonlySet<string>;
  now: number;
  /** An unreferenced asset younger than this may belong to an unsaved project. */
  graceMs: number;
  /**
   * Chunks without metadata are a write in progress unless every writer is
   * known to be idle, which only the cross-tab write lock establishes.
   */
  noWriteInProgress: boolean;
}

export interface StorageGarbage {
  /** References left behind by a project whose deletion was interrupted. */
  staleRefs: StoredAssetRef[];
  orphanAssetIds: string[];
}

export function selectStorageGarbage({
  projectIds,
  refs,
  assets,
  chunkAssetIds,
  now,
  graceMs,
  noWriteInProgress
}: StorageGarbageInput): StorageGarbage {
  const staleRefs = refs.filter((ref) => !projectIds.has(ref.projectId));
  const referenced = new Set(
    refs
      .filter((ref) => projectIds.has(ref.projectId))
      .map((ref) => ref.assetId)
  );

  const orphanAssetIds = assets
    .filter((asset) => {
      const age = now - Date.parse(asset.createdAt);
      return !referenced.has(asset.assetId) && age > graceMs;
    })
    .map((asset) => asset.assetId);

  if (noWriteInProgress) {
    const withMetadata = new Set(assets.map((asset) => asset.assetId));
    for (const assetId of chunkAssetIds) {
      if (!withMetadata.has(assetId) && !referenced.has(assetId)) {
        orphanAssetIds.push(assetId);
      }
    }
  }

  return { staleRefs, orphanAssetIds };
}
