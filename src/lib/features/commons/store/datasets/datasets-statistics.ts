import type { DatasetsState } from './datasets-state.svelte';

export interface NumericStatistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  count: number;
  nullCount: number;
}

export interface CategoricalStatistics {
  uniqueCount: number;
  count: number;
  nullCount: number;
}

export type ColumnStatistics = NumericStatistics | CategoricalStatistics;

function calculateMedian(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getColumnValues(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): unknown[] {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset || !dataset.data) return [];

  return dataset.data.map((row) => row[columnName]);
}

export function getUniqueValues(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): unknown[] {
  const values = getColumnValues(state, datasetId, columnName);
  return Array.from(new Set(values));
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

  const values = getColumnValues(state, datasetId, columnName);
  const nonNullValues = values.filter((v) => v !== null && v !== undefined);

  if (column.type === 'number') {
    const numbers = nonNullValues.map(Number).filter((n) => !isNaN(n));
    return {
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      mean: numbers.reduce((a, b) => a + b, 0) / numbers.length,
      median: calculateMedian(numbers),
      count: numbers.length,
      nullCount: values.length - numbers.length
    };
  }

  return {
    uniqueCount: new Set(nonNullValues).size,
    count: nonNullValues.length,
    nullCount: values.length - nonNullValues.length
  };
}
