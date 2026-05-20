import { SimplificationTarget } from '$lib/features/commons/constants/ui.constants';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type {
  SimplificationResult,
  SimplificationState
} from '../../types/simplification.types';
import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
import {
  basemapService,
  getBasemapSimplificationLevel,
  getBasemapVariantFamily,
  getPreferredBasemapSimplificationLevel,
  resolveBasemapVariantFile
} from '$lib/features/map/services/basemap.service.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import {
  simplifyGeometryTable,
  calculateToleranceFromRate
} from '$lib/features/duckdb/operations/simplification';
import {
  getBasemapRawTableName,
  refreshImportedBasemapHelperTables
} from '$lib/features/map/services/basemap-import.service';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';

const DEFAULT_STATE: SimplificationState = {
  source: SimplificationSource.Basemap,
  level: SimplificationLevel.Medium,
  rate: 0,
  isProcessing: false
};

const DATASET_SIMPLIFICATION_SUFFIX = '__simplified';

let pendingApplyOptions: { datasetId?: string } | null = null;

type SimplificationActions = {
  setSource: (
    source: SimplificationSource,
    options?: { datasetId?: string }
  ) => void;
  setLevel: (level: SimplificationLevel) => void;
  setRate: (rate: number) => void;
  applySimplification: (options?: {
    datasetId?: string;
  }) => Promise<SimplificationResult | null>;
  undoLastSimplification: () => Promise<boolean>;
};

const { actions, getState } = createToolStore<
  SimplificationState,
  SimplificationActions
>(
  DEFAULT_STATE,
  (s) => {
    async function simplifyCustomBasemap(): Promise<SimplificationResult> {
      const currentBasemap = basemapService.currentBasemap;
      if (!currentBasemap) {
        logger.error(
          'No basemap loaded for simplification',
          LogCategory.DUCKDB
        );
        throw new Error('No basemap loaded');
      }

      const metadata = currentBasemap.metadata;
      const basemapTableName = metadata.file;
      const rawBasemapTableName = getBasemapRawTableName(basemapTableName);
      const rawTableExists = (await Duck.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapeSqlString(rawBasemapTableName)}'`,
        { format: 'array' }
      )) as Array<{ table_name: string }>;

      const tolerance = calculateToleranceFromRate(s.rate, metadata.bbox);

      const metrics = await simplifyGeometryTable(
        Duck,
        basemapTableName,
        tolerance,
        {
          inputTableName: rawTableExists[0]?.table_name ?? basemapTableName,
          targetTableName: basemapTableName
        }
      );

      const primaryLayerType =
        metadata.layers.find((layer) => !layer.file)?.type ??
        metadata.layers[0]?.type;

      if (primaryLayerType) {
        await refreshImportedBasemapHelperTables(
          Duck,
          basemapTableName,
          primaryLayerType
        );
      }

      await basemapService.refreshCustomBasemap(basemapTableName);

      return {
        type: SimplificationTarget.BASEMAP,
        rate: s.rate,
        simplified: true,
        vertexReduction: metrics.reductionPercentage,
        originalVertices: metrics.originalVertices,
        simplifiedVertices: metrics.simplifiedVertices,
        previousBasemapTableName: rawBasemapTableName,
        primaryLayerType
      };
    }

    async function simplifyBasemapVariant(): Promise<SimplificationResult> {
      const currentBasemap = basemapService.currentBasemap;
      if (!currentBasemap) {
        logger.error(
          'No basemap loaded for simplification',
          LogCategory.DUCKDB
        );
        throw new Error('No basemap loaded');
      }

      const metadata = currentBasemap.metadata;
      const basemapId = metadata.file;
      const requestedLevel =
        getPreferredBasemapSimplificationLevel(
          basemapService.availableBasemaps,
          metadata,
          s.level
        ) ?? s.level;

      const variantFile = resolveBasemapVariantFile(
        metadata.file,
        metadata.simplification_level,
        requestedLevel
      );
      if (!variantFile) {
        return {
          type: SimplificationTarget.BASEMAP,
          level: requestedLevel,
          simplified: false,
          vertexReduction: 0,
          originalVertices: 0,
          simplifiedVertices: 0
        };
      }

      const previousLevel =
        currentBasemap.activeSimplificationLevel ??
        getBasemapSimplificationLevel(metadata) ??
        undefined;

      const variantTable = await basemapService.loadVariant(
        basemapId,
        variantFile,
        requestedLevel
      );

      if (!variantTable) {
        return {
          type: SimplificationTarget.BASEMAP,
          level: requestedLevel,
          simplified: false,
          vertexReduction: 0,
          originalVertices: 0,
          simplifiedVertices: 0
        };
      }

      persistReferenceCatalogBasemapVariant(basemapId, variantFile);
      await persistJoinedCatalogBasemapVariant(basemapId, variantFile);

      return {
        type: SimplificationTarget.BASEMAP,
        level: requestedLevel,
        simplified: true,
        vertexReduction: 0,
        originalVertices: 0,
        simplifiedVertices: 0,
        previousBasemapLevel: previousLevel
      };
    }

    async function simplifyGeoDataset(
      datasetId?: string
    ): Promise<SimplificationResult> {
      const dataset = datasetId
        ? datasetsStore.datasets.find((d) => d.id === datasetId)
        : datasetsStore.selectedDataset;

      if (!dataset) {
        logger.error(
          'No dataset found for simplification',
          LogCategory.DUCKDB,
          {
            datasetId
          }
        );
        throw new Error('No dataset found');
      }

      if (dataset.joinedBasemap) {
        logger.error(
          'Cannot simplify a dataset joined to a catalog basemap',
          LogCategory.DUCKDB,
          { datasetId: dataset.id, joinedBasemap: dataset.joinedBasemap }
        );
        throw new Error('Cannot simplify a catalog basemap dataset');
      }

      if (!dataset.geometry?.bounds) {
        logger.error(
          'Dataset has no geometry bounds for simplification',
          LogCategory.DUCKDB
        );
        throw new Error('Dataset has no geometry bounds');
      }

      const tolerance = calculateToleranceFromRate(
        s.rate,
        dataset.geometry.bounds
      );
      const datasetBaseTableName =
        s.lastApplied?.source === SimplificationSource.Geo &&
        s.lastApplied.datasetId === dataset.id &&
        s.lastApplied.datasetBaseTableName
          ? s.lastApplied.datasetBaseTableName
          : getGeoDatasetBaseTableName(dataset);
      const datasetSimplifiedTableName =
        getGeoDatasetSimplifiedTableName(datasetBaseTableName);

      const metrics = await simplifyGeometryTable(
        Duck,
        datasetSimplifiedTableName,
        tolerance,
        {
          inputTableName: datasetBaseTableName,
          targetTableName: datasetSimplifiedTableName
        }
      );

      if (dataset.sourceFileId) {
        await duckDBOrchestrator.updateDatasetTableName(
          dataset.sourceFileId,
          datasetSimplifiedTableName
        );
      }

      datasetsStore.updateDatasetTableName(
        dataset.id,
        datasetSimplifiedTableName
      );

      datasetsStore.updateDataset(dataset.id, {
        simplificationApplied: {
          rate: s.rate,
          tolerance,
          ...metrics
        }
      });

      return {
        type: SimplificationTarget.GEODATA,
        rate: s.rate,
        simplified: true,
        vertexReduction: metrics.reductionPercentage,
        originalVertices: metrics.originalVertices,
        simplifiedVertices: metrics.simplifiedVertices,
        datasetId: dataset.id,
        datasetSourceFileId: dataset.sourceFileId,
        datasetBaseTableName,
        datasetSimplifiedTableName
      };
    }

    const performSimplification = async (options?: {
      datasetId?: string;
    }): Promise<SimplificationResult> => {
      if (s.source === SimplificationSource.Basemap) {
        if (
          shouldUseMapLibreInterleaved({
            requiresMapLibre: basemapStyleStore.requiresMapLibre,
            hasOSMBasemap: osmBasemapStore.isActive
          })
        ) {
          return {
            type: SimplificationTarget.BASEMAP,
            level: s.level,
            simplified: false,
            vertexReduction: 0,
            originalVertices: 0,
            simplifiedVertices: 0
          };
        }

        const isCustom =
          basemapService.currentBasemap?.metadata.isCustom === true;
        return isCustom ? simplifyCustomBasemap() : simplifyBasemapVariant();
      } else {
        return simplifyGeoDataset(options?.datasetId);
      }
    };

    const runApply = async (options?: {
      datasetId?: string;
    }): Promise<SimplificationResult | null> => {
      if (s.isProcessing) {
        pendingApplyOptions = options ?? {};
        return null;
      }
      s.isProcessing = true;
      try {
        const result = await performSimplification(options);
        if (result?.simplified) {
          const activeDataset =
            s.source === SimplificationSource.Geo
              ? options?.datasetId
                ? datasetsStore.datasets.find((d) => d.id === options.datasetId)
                : datasetsStore.selectedDataset
              : undefined;
          const activeBasemapId = basemapService.currentBasemap?.metadata.file;
          s.lastApplied = {
            source: s.source,
            level:
              s.source === SimplificationSource.Basemap ? s.level : undefined,
            rate: s.source === SimplificationSource.Geo ? s.rate : undefined,
            basemapId:
              s.source === SimplificationSource.Basemap
                ? activeBasemapId
                : undefined,
            datasetId:
              s.source === SimplificationSource.Geo
                ? result?.datasetId
                : undefined,
            datasetSourceFileId:
              s.source === SimplificationSource.Geo
                ? (result?.datasetSourceFileId ?? activeDataset?.sourceFileId)
                : undefined,
            datasetBaseTableName:
              s.source === SimplificationSource.Geo
                ? result?.datasetBaseTableName
                : undefined,
            datasetSimplifiedTableName:
              s.source === SimplificationSource.Geo
                ? result?.datasetSimplifiedTableName
                : undefined,
            previousBasemapLevel: result?.previousBasemapLevel,
            previousBasemapTableName: result?.previousBasemapTableName,
            primaryLayerType: result?.primaryLayerType,
            timestamp: Date.now()
          };
        }
        return result;
      } finally {
        s.isProcessing = false;
        const queued = pendingApplyOptions;
        pendingApplyOptions = null;
        if (queued) {
          void runApply(queued);
        }
      }
    };

    return {
      setSource: (
        source: SimplificationSource,
        options?: { datasetId?: string }
      ) => {
        s.source = source;
        if (source === SimplificationSource.Basemap && s.lastApplied) {
          const metadata = basemapService.currentBasemap?.metadata;
          const restoredLevel =
            metadata &&
            getPreferredBasemapSimplificationLevel(
              basemapService.availableBasemaps,
              metadata,
              s.lastApplied.level
            );
          s.level = restoredLevel ?? SimplificationLevel.Medium;
        } else if (source === SimplificationSource.Geo) {
          s.rate = getGeoDatasetAppliedRate(options?.datasetId);
        }
      },
      setLevel: (level: SimplificationLevel) => {
        if (s.source === SimplificationSource.Basemap) {
          const metadata = basemapService.currentBasemap?.metadata;
          const resolvedLevel =
            metadata &&
            getPreferredBasemapSimplificationLevel(
              basemapService.availableBasemaps,
              metadata,
              level
            );
          s.level = resolvedLevel ?? level;
        }
      },
      setRate: (rate: number) => {
        s.rate = Math.max(0, Math.min(100, rate));
      },
      applySimplification: runApply,
      undoLastSimplification: async (): Promise<boolean> => {
        const lastApplied = s.lastApplied;
        if (!lastApplied) {
          return false;
        }

        if (lastApplied.source === SimplificationSource.Geo) {
          if (!lastApplied.datasetBaseTableName) {
            s.lastApplied = undefined;
            return false;
          }

          const dataset = lastApplied.datasetId
            ? datasetsStore.datasets.find((d) => d.id === lastApplied.datasetId)
            : datasetsStore.selectedDataset;

          if (!dataset) {
            logger.warn(
              'Cannot undo dataset simplification: dataset not found',
              LogCategory.DUCKDB,
              lastApplied
            );
            return false;
          }

          try {
            if (lastApplied.datasetSourceFileId) {
              await duckDBOrchestrator.updateDatasetTableName(
                lastApplied.datasetSourceFileId,
                lastApplied.datasetBaseTableName
              );
            }

            datasetsStore.updateDatasetTableName(
              dataset.id,
              lastApplied.datasetBaseTableName
            );
            datasetsStore.updateDataset(dataset.id, {
              simplificationApplied: undefined
            });
            s.lastApplied = undefined;
            s.rate = 0;
            return true;
          } catch (error) {
            logger.error(
              'Failed to undo dataset simplification',
              LogCategory.DUCKDB,
              { lastApplied, error }
            );
            return false;
          }
        }

        if (!lastApplied.basemapId) {
          s.lastApplied = undefined;
          return false;
        }

        try {
          const currentBasemap = basemapService.currentBasemap;
          if (
            !currentBasemap ||
            currentBasemap.metadata.file !== lastApplied.basemapId
          ) {
            logger.warn(
              'Cannot undo basemap simplification: basemap changed or not loaded',
              LogCategory.DUCKDB,
              lastApplied
            );
            s.lastApplied = undefined;
            return false;
          }

          const isCustom = currentBasemap.metadata.isCustom === true;

          if (isCustom) {
            const tableName = lastApplied.basemapId;
            const rawTableName =
              lastApplied.previousBasemapTableName ??
              getBasemapRawTableName(tableName);

            await Duck.query(
              `CREATE OR REPLACE TABLE "${escapeSqlString(tableName)}" AS SELECT * FROM "${escapeSqlString(rawTableName)}"`
            );

            if (lastApplied.primaryLayerType) {
              await refreshImportedBasemapHelperTables(
                Duck,
                tableName,
                lastApplied.primaryLayerType
              );
            }

            await basemapService.refreshCustomBasemap(tableName);
          } else {
            const metadata = currentBasemap.metadata;
            const basemapId = metadata.file;
            const baseLevel =
              getBasemapSimplificationLevel(metadata) ?? undefined;
            const previousLevel = lastApplied.previousBasemapLevel ?? baseLevel;

            if (previousLevel && previousLevel !== baseLevel) {
              const previousFile = resolveBasemapVariantFile(
                basemapId,
                baseLevel,
                previousLevel
              );
              if (previousFile) {
                await basemapService.loadVariant(
                  basemapId,
                  previousFile,
                  previousLevel
                );
              }
            } else {
              await basemapService.loadVariant(
                basemapId,
                basemapId,
                baseLevel ?? SimplificationLevel.Medium
              );
            }

            restoreReferenceCatalogBasemapVariant(basemapId);
            await restoreJoinedCatalogBasemapToOriginal(basemapId);
          }

          s.lastApplied = undefined;
          s.rate = 0;
          return true;
        } catch (error) {
          logger.error(
            'Failed to undo basemap simplification',
            LogCategory.DUCKDB,
            { lastApplied, error }
          );
          return false;
        }
      }
    };
  },
  {
    key: 'simplification',
    serializeFilter: ({ isProcessing: _isProcessing, ...persisted }) =>
      persisted
  }
);

export const simplificationActions = actions;
export const getSimplificationState = getState;

function getGeoDatasetBaseTableName(dataset: {
  sourceFileId?: string;
  tableName: string;
}): string {
  const sourceFileTableName = dataset.sourceFileId
    ? projectStore.currentProject?.data?.sourceFiles?.find(
        (file) => file.id === dataset.sourceFileId
      )?.duckdbTableName
    : undefined;

  return trimDatasetSimplificationSuffix(
    sourceFileTableName ?? dataset.tableName
  );
}

function getGeoDatasetSimplifiedTableName(baseTableName: string): string {
  return `${trimDatasetSimplificationSuffix(baseTableName)}${DATASET_SIMPLIFICATION_SUFFIX}`;
}

function getGeoDatasetAppliedRate(datasetId?: string): number {
  const dataset = datasetId
    ? datasetsStore.datasets.find((d) => d.id === datasetId)
    : datasetsStore.selectedDataset;

  return dataset?.simplificationApplied?.rate ?? 0;
}

function trimDatasetSimplificationSuffix(tableName: string): string {
  return tableName.endsWith(DATASET_SIMPLIFICATION_SUFFIX)
    ? tableName.slice(0, -DATASET_SIMPLIFICATION_SUFFIX.length)
    : tableName;
}

async function updateDatasetJoinsForBasemapFamily(
  familyBasemapId: string,
  targetJoinedBasemapId: string
): Promise<void> {
  const family = getBasemapVariantFamily(familyBasemapId);

  for (const dataset of datasetsStore.datasets) {
    const joinedBasemap =
      dataset.joinedBasemap ??
      (dataset.sourceFileId
        ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
            ?.joinedBasemap
        : undefined);

    if (!joinedBasemap || getBasemapVariantFamily(joinedBasemap) !== family) {
      continue;
    }

    await duckDBOrchestrator.updateDatasetJoinInfo(dataset.id, {
      joinedBasemap: targetJoinedBasemapId
    });
    datasetsStore.updateDatasetJoinBasemap(dataset.id, targetJoinedBasemapId);

    if (dataset.sourceFileId) {
      await projectStore.updateFileJoinedBasemap(
        dataset.sourceFileId,
        targetJoinedBasemapId
      );
    }
  }
}

async function persistJoinedCatalogBasemapVariant(
  currentBasemapId: string,
  variantBasemapId: string
): Promise<void> {
  if (currentBasemapId === variantBasemapId) {
    return;
  }
  await updateDatasetJoinsForBasemapFamily(currentBasemapId, variantBasemapId);
}

async function restoreJoinedCatalogBasemapToOriginal(
  originalBasemapId: string
): Promise<void> {
  await updateDatasetJoinsForBasemapFamily(
    originalBasemapId,
    originalBasemapId
  );
}

function persistReferenceCatalogBasemapVariant(
  currentBasemapId: string,
  variantBasemapId: string
): void {
  if (currentBasemapId === variantBasemapId) {
    return;
  }

  const referenceBasemapId = basemapStyleStore.referenceBasemapId;
  if (!referenceBasemapId) {
    return;
  }

  const currentFamily = getBasemapVariantFamily(currentBasemapId);
  if (getBasemapVariantFamily(referenceBasemapId) !== currentFamily) {
    return;
  }

  basemapStyleStore.setReferenceBasemap(variantBasemapId);
}

function restoreReferenceCatalogBasemapVariant(
  originalBasemapId: string
): void {
  const referenceBasemapId = basemapStyleStore.referenceBasemapId;
  if (!referenceBasemapId) {
    return;
  }

  const currentFamily = getBasemapVariantFamily(originalBasemapId);
  if (getBasemapVariantFamily(referenceBasemapId) !== currentFamily) {
    return;
  }

  basemapStyleStore.setReferenceBasemap(originalBasemapId);
}
