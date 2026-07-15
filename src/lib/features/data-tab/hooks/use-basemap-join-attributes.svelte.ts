import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { BasemapAlias } from '$lib/features/duckdb/orchestrator/join-ops';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

const MAX_EAGER_BASEMAP_ALIAS_VALUES = 5000;

export interface UseBasemapJoinAttributesOptions {
  getSelectedBasemapId: () => string | undefined;
  getBasemaps: () => readonly BasemapMetadata[];
}

export interface UseBasemapJoinAttributesReturn {
  readonly values: string[];
  readonly loading: boolean;
  readonly aliasesByValue: Record<string, BasemapAlias[]>;
  clearValues: () => void;
  requestValues: () => void;
}

export function useBasemapJoinAttributes({
  getSelectedBasemapId,
  getBasemaps
}: UseBasemapJoinAttributesOptions): UseBasemapJoinAttributesReturn {
  let values = $state<string[]>([]);
  let loading = $state(false);
  let requestId = 0;
  let basemapId = $state<string | null>(null);
  let loadingKey = $state<string | null>(null);
  let aliasesByValue = $state<Record<string, BasemapAlias[]>>({});

  function clearValues(): void {
    requestId += 1;
    values = [];
    aliasesByValue = {};
    basemapId = null;
    loading = false;
    loadingKey = null;
  }

  function isCurrentRequest(
    currentRequestId: number,
    currentBasemapId: string
  ) {
    return requestId === currentRequestId && loadingKey === currentBasemapId;
  }

  function fetchValues(basemap: BasemapMetadata): void {
    const currentBasemapId = basemap.file;
    if (loading && loadingKey === currentBasemapId) {
      return;
    }

    const currentRequestId = ++requestId;
    loading = true;
    loadingKey = currentBasemapId;

    void (async () => {
      try {
        const nextValues =
          await duckDBOrchestrator.getBasemapAttributeValues(basemap);
        if (!isCurrentRequest(currentRequestId, currentBasemapId)) {
          return;
        }

        values = nextValues;
        basemapId = currentBasemapId;

        if (
          nextValues.length === 0 ||
          nextValues.length > MAX_EAGER_BASEMAP_ALIAS_VALUES
        ) {
          aliasesByValue = {};
          return;
        }

        try {
          const aliases =
            await duckDBOrchestrator.getBasemapAttributeAliasesByValue(basemap);
          if (!isCurrentRequest(currentRequestId, currentBasemapId)) {
            return;
          }
          aliasesByValue = aliases;
        } catch (error) {
          if (!isCurrentRequest(currentRequestId, currentBasemapId)) {
            return;
          }
          logger.error(
            'Failed to fetch basemap attribute aliases',
            LogCategory.MAP,
            error
          );
          aliasesByValue = {};
        }
      } catch (error) {
        if (!isCurrentRequest(currentRequestId, currentBasemapId)) {
          return;
        }
        logger.error(
          'Failed to fetch basemap attribute values',
          LogCategory.MAP,
          error
        );
        values = [];
        aliasesByValue = {};
        basemapId = null;
      } finally {
        if (currentRequestId === requestId && loadingKey === currentBasemapId) {
          loading = false;
          loadingKey = null;
        }
      }
    })();
  }

  function requestValues(): void {
    const selectedBasemapId = getSelectedBasemapId();
    if (!selectedBasemapId) {
      return;
    }

    if (
      basemapId === selectedBasemapId ||
      (loading && loadingKey === selectedBasemapId)
    ) {
      return;
    }

    const basemap = getBasemaps().find(
      (candidate) => candidate.file === selectedBasemapId
    );
    if (!basemap) return;

    fetchValues(basemap);
  }

  return {
    get values() {
      return values;
    },
    get loading() {
      return loading;
    },
    get aliasesByValue() {
      return aliasesByValue;
    },
    clearValues,
    requestValues
  };
}
