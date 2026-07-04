import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { isMissingDuckTableError } from '$lib/features/duckdb/utils/duckdb-error.utils';
import { datasetsStore } from '../../../stores/datasets.store.svelte';

export type HookValue<T> = T | (() => T);

export function resolveHookValue<T>(value: HookValue<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

export function isRequestedTableAvailable(
  tableName: string | undefined
): boolean {
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

export function isMissingRequestedTableError(
  error: unknown,
  tableName: string | undefined
): boolean {
  return (
    Boolean(tableName) &&
    isMissingDuckTableError(error) &&
    !isRequestedTableAvailable(tableName)
  );
}
