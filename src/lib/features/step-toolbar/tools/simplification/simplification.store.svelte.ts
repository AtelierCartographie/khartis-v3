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
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import {
  simplifyGeometryTable,
  calculateToleranceFromRate
} from '$lib/features/duckdb/operations/simplification';
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
  applySimplification: (
    geometryData?: unknown
  ) => Promise<SimplificationResult | null>;
  undoLastSimplification: () => boolean;
};

const { actions, getState } = createToolStore<
  SimplificationState,
  SimplificationActions
>(DEFAULT_STATE, (s) => {
  const performSimplification = async (
    _geometryData?: unknown
  ): Promise<SimplificationResult> => {
    if (s.source === SimplificationSource.Basemap) {
      if (osmBasemapStore.isActive) {
        logger.info(
          'Skipping simplification for active OSM basemap',
          LogCategory.DUCKDB
        );
        return {
          type: SimplificationTarget.BASEMAP,
          level: s.level,
          simplified: false,
          vertexReduction: 0,
          originalVertices: 0,
          simplifiedVertices: 0
        };
      }

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

      // Basemap simplification uses pre-built variant files prepared by the Atelier.
      // No on-the-fly SQL simplification — variants must be declared in metadata.
      const variantFile = metadata.variants?.[s.level];
      if (!variantFile) {
        logger.info(
          'No variant available for this basemap at this level',
          LogCategory.DUCKDB,
          { basemapId, level: s.level }
        );

        return {
          type: SimplificationTarget.BASEMAP,
          level: s.level,
          simplified: false,
          vertexReduction: 0,
          originalVertices: 0,
          simplifiedVertices: 0
        };
      }

      logger.info(
        'Loading basemap variant for simplification',
        LogCategory.DUCKDB,
        { basemapId, level: s.level, variantFile }
      );

      await basemapService.loadVariant(basemapId, variantFile, s.level);

      logger.success('Basemap variant loaded', LogCategory.DUCKDB, {
        basemapId,
        variantFile
      });

      return {
        type: SimplificationTarget.BASEMAP,
        level: s.level,
        simplified: true,
        vertexReduction: 0,
        originalVertices: 0,
        simplifiedVertices: 0
      };
    } else {
      const dataset = datasetsStore.selectedDataset;
      if (!dataset) {
        logger.error(
          'No dataset selected for simplification',
          LogCategory.DUCKDB
        );
        throw new Error('No dataset selected');
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

      logger.info('Starting dataset simplification', LogCategory.DUCKDB, {
        datasetId: dataset.id,
        rate: s.rate,
        tolerance
      });

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

      logger.success('Dataset simplification completed', LogCategory.DUCKDB, {
        datasetId: dataset.id,
        metrics
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
  };

  return {
    setSource: (source: SimplificationSource) => {
      s.source = source;
      if (source === SimplificationSource.Basemap && s.lastApplied) {
        s.level = s.lastApplied.level || SimplificationLevel.Medium;
      }
    },
    setLevel: (level: SimplificationLevel) => {
      if (s.source === SimplificationSource.Basemap) {
        s.level = level;
      }
    },
    setRate: (rate: number) => {
      if (s.source === SimplificationSource.Geo) {
        s.rate = Math.max(0, Math.min(100, rate));
      }
    },
    applySimplification: async (
      geometryData?: unknown
    ): Promise<SimplificationResult | null> => {
      if (s.isProcessing) {
        return null;
      }
      s.isProcessing = true;
      try {
        const result = await performSimplification(geometryData);
        if (result?.simplified) {
          s.lastApplied = {
            source: s.source,
            level:
              s.source === SimplificationSource.Basemap ? s.level : undefined,
            rate: s.source === SimplificationSource.Geo ? s.rate : undefined,
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
});

export const simplificationActions = actions;
export const getSimplificationState = getState;
