import { SvelteMap } from 'svelte/reactivity';
import {
  ALL_PRIMITIVE_FILTERS,
  visualizationStore,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { resolveRowScopeClause } from '$lib/features/commons/services/row-scope.service';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { duckDBOrchestrator, type FilterStats } from '$lib/features/duckdb';

export interface UsePrimitiveFilterStatsDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
  resolveDatasetSourceFileId: (datasetId: string) => string | undefined;
}

export interface PrimitiveFilterStatsController {
  getStatsForPrimitive(primitive: PrimitiveFilter): FilterStats | undefined;
}

interface PrimitiveScope {
  tableName: string;
  clause: string | null;
}

export function usePrimitiveFilterStats(
  deps: UsePrimitiveFilterStatsDeps
): PrimitiveFilterStatsController {
  const statsByPrimitive = new SvelteMap<PrimitiveFilter, FilterStats>();
  let generation = 0;

  function resolveScope(primitive: PrimitiveFilter): PrimitiveScope | null {
    const visualization = deps.getSelectedVisualization();
    if (!visualization?.datasetId) {
      return null;
    }

    const datasetId = deps.resolveDatasetSourceFileId(visualization.datasetId);
    const tableName = datasetId
      ? duckDBOrchestrator.getDatasetBySourceFile(datasetId)?.tableName
      : undefined;
    if (!datasetId || !tableName) {
      return null;
    }

    return {
      tableName,
      clause: resolveRowScopeClause({
        datasetId,
        vizFilters: visualization.dataFilters,
        primitive
      })
    };
  }

  const scopeSignature = $derived.by(() => {
    void duckDBOrchestrator.datasetsVersion;
    void visualizationStore.version;

    return ALL_PRIMITIVE_FILTERS.map((primitive) => {
      const scope = resolveScope(primitive);
      return `${primitive}:${scope?.tableName ?? ''}:${scope?.clause ?? ''}`;
    }).join('|');
  });

  async function loadStats(): Promise<void> {
    const thisGeneration = ++generation;

    for (const primitive of ALL_PRIMITIVE_FILTERS) {
      const scope = resolveScope(primitive);
      if (!scope) {
        statsByPrimitive.delete(primitive);
        continue;
      }

      try {
        const stats = await duckDBOrchestrator.getScopedRowStats(
          scope.tableName,
          scope.clause
        );
        if (thisGeneration !== generation) {
          return;
        }
        statsByPrimitive.set(primitive, stats);
      } catch (error) {
        logger.error(
          'Failed to count the rows a primitive filter keeps',
          LogCategory.UI,
          { tableName: scope.tableName, error }
        );
      }
    }
  }

  $effect(() => {
    void scopeSignature;

    void loadStats();
  });

  return {
    getStatsForPrimitive: (primitive) => statsByPrimitive.get(primitive)
  };
}
