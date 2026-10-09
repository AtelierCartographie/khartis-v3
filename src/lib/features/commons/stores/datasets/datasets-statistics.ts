import type { DatasetsState } from './datasets-state.svelte';
import { isConfiguredNullValue } from '../../utils/null-values.utils';

export interface NumericStatistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  count: number;
  nullCount: number;
  /** A few real values of the column, from DuckDB — see the `value_sample` macro. */
  value_sample?: number[];
}

export interface CategoricalStatistics {
  uniqueCount: number;
  count: number;
  nullCount: number;
}

export type ColumnStatistics = NumericStatistics | CategoricalStatistics;

function parseNumericValue(value: unknown): number | null {
  if (isConfiguredNullValue(value)) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[\u00A0\u202F\s]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getColumnStatistics(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): ColumnStatistics | null {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) return null;

  const column = dataset.columns.find((c) => c.name === columnName);
  if (!column) return null;

  if (column.stats) {
    if (column.type === 'number') {
      const min = parseNumericValue(column.stats.min);
      const max = parseNumericValue(column.stats.max);

      if (min !== null && max !== null) {
        return {
          min,
          max,
          mean: column.stats.mean ?? 0,
          median: column.stats.median ?? 0,
          count: column.stats.count ?? 0,
          nullCount: column.stats.nulls ?? 0,
          value_sample: column.stats.value_sample
        };
      }
    } else {
      return {
        uniqueCount: column.stats.uniques ?? 0,
        count: column.stats.count ?? 0,
        nullCount: column.stats.nulls ?? 0
      };
    }
  }

  return null;
}
