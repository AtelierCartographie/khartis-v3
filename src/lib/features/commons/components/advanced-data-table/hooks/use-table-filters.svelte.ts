import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { type DataTableFilter, type FilterStats } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { datasetsStore } from '../../../stores/datasets.store.svelte';

export interface UseTableFiltersProps {
  tableName?: string | (() => string | undefined);
  dataset?: ProcessedDataset | (() => ProcessedDataset | undefined);
  onRecordTransformation?: (summary: string) => void;
}

export interface UseTableFiltersReturn {
  filters: DataTableFilter[];
  filterStats: FilterStats;
  numRows: number;
  refreshFiltersState: () => Promise<void>;
  afterFilterChange: (transformationLabel?: string) => Promise<void>;
}

function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

function isMissingDuckTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Catalog Error:\s*Table with name .*?(does not exist|not found)/i.test(
      error.message
    )
  );
}

function hasRequestedTable(tableName: string | undefined): boolean {
  if (!tableName) {
    return false;
  }

  return (
    Boolean(duckDBOrchestrator.getDatasetByTable(tableName)) ||
    datasetsStore
      .getAllDatasets()
      .some((dataset) => dataset.tableName === tableName)
  );
}

export function useTableFilters(
  props: UseTableFiltersProps
): UseTableFiltersReturn {
  let filters = $state<DataTableFilter[]>([]);
  let filterStats = $state<FilterStats>({ total: 0, filtered: 0 });
  let numRows = $state<number>(0);
  let refreshRequestId = 0;

  async function refreshFiltersState(): Promise<void> {
    const tableName = getValue(props.tableName);
    const dataset = getValue(props.dataset);
    const requestId = ++refreshRequestId;
    const fallbackStats: FilterStats = {
      total: dataset?.rowCount ?? 0,
      filtered: dataset?.rowCount ?? 0
    };

    if (!tableName) {
      if (requestId !== refreshRequestId) {
        return;
      }

      filters = [];
      filterStats = fallbackStats;
      numRows = filterStats.filtered;
      return;
    }

    if (!hasRequestedTable(tableName)) {
      if (requestId !== refreshRequestId) {
        return;
      }

      filters = [];
      filterStats = { total: 0, filtered: 0 };
      numRows = 0;
      return;
    }

    try {
      const nextFilters = duckDBOrchestrator.getFilters(tableName);
      const nextFilterStats = await duckDBOrchestrator.getRowStats(tableName);

      if (requestId !== refreshRequestId) {
        return;
      }

      filters = nextFilters;
      filterStats = nextFilterStats;
      numRows = nextFilterStats.filtered;
    } catch (error) {
      if (
        requestId !== refreshRequestId ||
        (isMissingDuckTableError(error) && !hasRequestedTable(tableName))
      ) {
        if (requestId === refreshRequestId) {
          filters = [];
          filterStats = fallbackStats;
          numRows = filterStats.filtered;
        }
        return;
      }

      throw error;
    }
  }

  async function afterFilterChange(
    transformationLabel?: string
  ): Promise<void> {
    await refreshFiltersState();

    if (transformationLabel) {
      props.onRecordTransformation?.(transformationLabel);
    }
  }

  return {
    get filters() {
      return filters;
    },
    get filterStats() {
      return filterStats;
    },
    get numRows() {
      return numRows;
    },
    refreshFiltersState,
    afterFilterChange
  };
}
