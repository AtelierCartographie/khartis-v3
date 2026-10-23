import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { isMissingDuckTableError } from '$lib/features/duckdb/utils/duckdb-error.utils';
import { datasetsStore } from '../../../stores/datasets.store.svelte';

export type HookValue<T> = T | (() => T);

export function resolveHookValue<T>(value: HookValue<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

// Tables a feature keeps outside the datasets, such as the enrichment table
// awaiting its join: the owner registers them while they exist.
const transientTables = new Set<string>();

export function registerTransientTable(tableName: string): void {
  transientTables.add(tableName);
}

export function unregisterTransientTable(tableName: string): void {
  transientTables.delete(tableName);
}

export function isRequestedTableAvailable(
  tableName: string | undefined
): boolean {
  if (!tableName) {
    return false;
  }

  return (
    transientTables.has(tableName) ||
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
