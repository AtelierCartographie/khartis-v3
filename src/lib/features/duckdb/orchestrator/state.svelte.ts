import type { Table } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import type { DataTableFilter, DuckDBDataset } from '../types';

interface OrchestratorState {
  datasets: SvelteMap<string, DuckDBDataset>;
  currentTableName: string | null;
}

const _state = $state<OrchestratorState>({
  datasets: new SvelteMap(),
  currentTableName: null
});

let _filters = new SvelteMap<string, DataTableFilter[]>();

let _filterIdCounter = 0;

const _metadataPrefetches = new SvelteMap<string, Promise<void>>();

let _datasetsVersion = $state(0);

let _suppressVersionBump = $state(false);

let _initialized = false;

let _initPromise: Promise<void> | null = null;

export function getState(): OrchestratorState {
  return _state;
}

export function getFiltersMap(): SvelteMap<string, DataTableFilter[]> {
  return _filters;
}

export function getDatasetsVersion(): number {
  return _datasetsVersion;
}

export function touchDatasetsVersion(): void {
  void _datasetsVersion;
}

export function bumpDatasetsVersion(): void {
  if (!_suppressVersionBump) {
    _datasetsVersion++;
  }
}

export function isBatchProcessing(): boolean {
  return _suppressVersionBump;
}

export function beginBatch(): void {
  _suppressVersionBump = true;
}

export function endBatch(): void {
  _suppressVersionBump = false;
  _datasetsVersion++;
}

export function isInitialized(): boolean {
  return _initialized;
}

export function setInitialized(value: boolean): void {
  _initialized = value;
}

export function getInitPromise(): Promise<void> | null {
  return _initPromise;
}

export function setInitPromise(promise: Promise<void> | null): void {
  _initPromise = promise;
}

export function getMetadataPrefetches(): SvelteMap<string, Promise<void>> {
  return _metadataPrefetches;
}

export function getNextFilterId(): string {
  return `${Date.now()}-${++_filterIdCounter}`;
}

export function updateDatasets(
  updater: (datasets: SvelteMap<string, DuckDBDataset>) => void
): void {
  const next = new SvelteMap(_state.datasets);
  updater(next);
  _state.datasets = next;
}

export function updateFilters(
  updater: (filters: SvelteMap<string, DataTableFilter[]>) => void
): void {
  const next = new SvelteMap(_filters);
  updater(next);
  _filters = next;
}

export function setCurrentTableName(tableName: string | null): void {
  _state.currentTableName = tableName;
}

export function getCurrentTableName(): string | null {
  return _state.currentTableName;
}

export function clearState(): void {
  _state.datasets = new SvelteMap();
  _state.currentTableName = null;
  _filters = new SvelteMap();
  _datasetsVersion++;
}

export function getDatasetById(id: string): DuckDBDataset | undefined {
  touchDatasetsVersion();
  return _state.datasets.get(id);
}

export function getDatasetByTable(
  tableName: string
): DuckDBDataset | undefined {
  touchDatasetsVersion();
  for (const dataset of _state.datasets.values()) {
    if (dataset.tableName === tableName) {
      return dataset;
    }
  }
  return undefined;
}

export function getDatasetBySourceFile(
  sourceFileId: string
): DuckDBDataset | undefined {
  touchDatasetsVersion();
  for (const dataset of _state.datasets.values()) {
    if (dataset.sourceFileId === sourceFileId) {
      return dataset;
    }
  }
  return undefined;
}

export function findDatasetByIdOrSourceFile(
  idOrSourceFileId: string
): DuckDBDataset | undefined {
  const direct = _state.datasets.get(idOrSourceFileId);
  if (direct) return direct;
  return getDatasetBySourceFile(idOrSourceFileId);
}

export function getAllDatasets(): DuckDBDataset[] {
  touchDatasetsVersion();
  return Array.from(_state.datasets.values());
}

export function setDatasetArrowTable(
  tableName: string,
  arrowTable: Table
): void {
  for (const dataset of _state.datasets.values()) {
    if (dataset.tableName === tableName) {
      dataset.arrowTableWithMetadata = arrowTable;
      break;
    }
  }
}

export function getFilters(tableName: string): DataTableFilter[] {
  return [...(_filters.get(tableName) ?? [])];
}

export function setFilters(
  tableName: string,
  filters: DataTableFilter[]
): void {
  updateFilters((filterMap) => {
    filterMap.set(tableName, filters);
  });
}

export function clearFiltersForTable(tableName: string): void {
  if (_filters.has(tableName)) {
    updateFilters((filterMap) => {
      filterMap.set(tableName, []);
    });
  }
}
