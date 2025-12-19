import type { ProcessedDataset } from '$lib/features/data-pipeline';
import {
  duckDBOrchestrator,
  type DataTableFilter,
  type FilterStats
} from '$lib/features/duckdb';

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

export function useTableFilters(
  props: UseTableFiltersProps
): UseTableFiltersReturn {
  let filters = $state<DataTableFilter[]>([]);
  let filterStats = $state<FilterStats>({ total: 0, filtered: 0 });
  let numRows = $state<number>(0);

  async function refreshFiltersState(): Promise<void> {
    const tableName = getValue(props.tableName);
    const dataset = getValue(props.dataset);

    if (!tableName) {
      filters = [];
      filterStats = {
        total: dataset?.rowCount ?? 0,
        filtered: dataset?.rowCount ?? 0
      };
      numRows = filterStats.filtered;
      return;
    }

    filters = duckDBOrchestrator.getFilters(tableName);
    filterStats = await duckDBOrchestrator.getRowStats(tableName);
    numRows = filterStats.filtered;
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
