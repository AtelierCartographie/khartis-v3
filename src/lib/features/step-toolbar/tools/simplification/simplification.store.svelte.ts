import { SimplificationTarget } from '$lib/features/commons/constants/ui.constants';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type {
  SimplificationResult,
  SimplificationState
} from './simplification.types';
import { Duck } from '$lib/features/duckdb';
import {
  basemapService,
  getPreferredBasemapSimplificationLevel,
  resolveBasemapVariantFile
} from '$lib/features/map/services/basemap.service.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import {
  simplifyGeometryTable,
  calculateToleranceFromRate
} from '$lib/features/duckdb/operations/simplification';
import {
  getBasemapRawTableName,
  refreshImportedBasemapHelperTables
} from '$lib/features/map/utils/basemap-import.utils';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const DEFAULT_STATE: SimplificationState = {
  source: SimplificationSource.Basemap,
  level: SimplificationLevel.Medium,
  rate: 50,
  isProcessing: false
};

type SimplificationActions = {
  setSource: (source: SimplificationSource) => void;
  setLevel: (level: SimplificationLevel) => void;
  setRate: (rate: number) => void;
  applySimplification: (options?: {
    datasetId?: string;
  }) => Promise<SimplificationResult | null>;
  undoLastSimplification: () => boolean;
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
        simplifiedVertices: metrics.simplifiedVertices
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

      return {
        type: SimplificationTarget.BASEMAP,
        level: requestedLevel,
        simplified: true,
        vertexReduction: 0,
        originalVertices: 0,
        simplifiedVertices: 0
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

      const metrics = await simplifyGeometryTable(
        Duck,
        dataset.tableName,
        tolerance
      );

      await datasetsStore.updateDataset(dataset.id, {
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
        simplifiedVertices: metrics.simplifiedVertices
      };
    }

    const performSimplification = async (options?: {
      datasetId?: string;
    }): Promise<SimplificationResult> => {
      if (s.source === SimplificationSource.Basemap) {
        if (osmBasemapStore.isActive || basemapStyleStore.requiresMapLibre) {
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

    return {
      setSource: (source: SimplificationSource) => {
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
      applySimplification: async (options?: {
        datasetId?: string;
      }): Promise<SimplificationResult | null> => {
        if (s.isProcessing) {
          return null;
        }
        s.isProcessing = true;
        try {
          const result = await performSimplification(options);
          if (result?.simplified) {
            const activeDataset =
              s.source === SimplificationSource.Geo
                ? options?.datasetId
                  ? datasetsStore.datasets.find(
                      (d) => d.id === options.datasetId
                    )
                  : datasetsStore.selectedDataset
                : undefined;
            const activeBasemapId =
              basemapService.currentBasemap?.metadata.file;
            s.lastApplied = {
              source: s.source,
              level:
                s.source === SimplificationSource.Basemap ? s.level : undefined,
              rate: s.source === SimplificationSource.Geo ? s.rate : undefined,
              basemapId:
                s.source === SimplificationSource.Basemap
                  ? activeBasemapId
                  : undefined,
              datasetSourceFileId:
                s.source === SimplificationSource.Geo
                  ? activeDataset?.sourceFileId
                  : undefined,
              timestamp: Date.now()
            };
          }
          return result;
        } finally {
          s.isProcessing = false;
        }
      },
      undoLastSimplification: (): boolean => {
        if (s.lastApplied) {
          s.lastApplied = undefined;
          return true;
        }
        return false;
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
