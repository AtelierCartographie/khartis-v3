import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { detectSemioType } from '$lib/features/commons/utils/semio-detector.utils';
import {
  extractGeoArrowMetadata,
  type ProcessedDataset
} from '$lib/features/data-pipeline';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core/persistence-registry';
import * as m from '$lib/paraglide/messages';
import type {
  SerializedTableFilterRecord,
  SerializedTableFiltersState
} from '$lib/types/serialization.types';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import type { Table } from 'apache-arrow/Arrow';
import { Duck, initDuckDB } from '../duck';
import {
  FileType,
  RefineOperation,
  type AnalysisResult,
  type ArrowTableLike,
  type DataTableFilter,
  type DataTableFilterInput,
  type DuckDBDataset,
  type FilterOperator,
  type FilterStats,
  type GPSColumns,
  type SearchStats
} from '../types';

import * as arrowOps from './arrow-ops';
import * as columnOps from './column-ops';
import * as conversionOps from './conversion-ops';
import * as datasetOps from './dataset-ops';
import * as densityOps from './density-ops';
import { buildFilterWhereClause, createFilterRecord } from './filter-ops';
import * as gpsOps from './gps-ops';
import * as joinOps from './join-ops';
import * as state from './state.svelte';
import * as tableDataOps from './table-data-ops';

export {
  FileType,
  RefineOperation,
  type AnalysisResult,
  type DataTableFilter,
  type DataTableFilterInput,
  type DuckDBDataset,
  type FilterOperator,
  type FilterStats
};

async function ensureInitialized(): Promise<void> {
  if (state.isInitialized()) return;
  await initialize();
}

async function initialize(): Promise<void> {
  if (state.isInitialized()) return;

  const existingPromise = state.getInitPromise();
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const start = performance.now();
  logger.info(
    'Starting DuckDB orchestrator initialization',
    LogCategory.DUCKDB
  );

  const initPromise = (async () => {
    try {
      await initDuckDB();
      state.setInitialized(true);
      logger.success('DuckDB orchestrator initialized', LogCategory.DUCKDB, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      state.setInitPromise(null);
      logger.error('Failed to initialize DuckDB', LogCategory.DUCKDB, error);
      showError(m.error_duckdb_init_title(), m.error_duckdb_init_message());
      throw error;
    }
  })();

  state.setInitPromise(initPromise);
  await initPromise;
}

async function prefetchArrowMetadata(dataset: DuckDBDataset): Promise<void> {
  if (dataset.arrowTableWithMetadata) {
    return Promise.resolve();
  }

  const hasGeometryColumn = dataset.columns.some((column) => {
    const name = column.name.toLowerCase();
    return (
      name === INTERNAL_COLUMN.GEOM.toLowerCase() ||
      name === INTERNAL_COLUMN.GEOMETRY.toLowerCase()
    );
  });

  if (!hasGeometryColumn) {
    return Promise.resolve();
  }

  const prefetches = state.getMetadataPrefetches();
  const existing = prefetches.get(dataset.tableName);
  if (existing) {
    return existing;
  }

  const prefetchPromise = (async () => {
    try {
      const { arrowTableWithMetadata, geoArrowMetadata } =
        await arrowOps.createArrowTableWithMetadata(
          dataset.tableName,
          Duck,
          (table) => extractGeoArrowMetadata(table)
        );

      dataset.arrowTableWithMetadata = arrowTableWithMetadata;
      dataset.geoArrowMetadata = geoArrowMetadata || undefined;
    } catch (error) {
      logger.debug(
        'Failed to prefetch Arrow metadata',
        LogCategory.DUCKDB,
        error
      );
    } finally {
      prefetches.delete(dataset.tableName);
    }
  })();

  prefetches.set(dataset.tableName, prefetchPromise);
  return prefetchPromise;
}

const joinedArrowCache: Map<string, Table> = new Map();

function isMissingDuckTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Catalog Error:\s*Table with name .*?(does not exist|not found)/i.test(
      error.message
    )
  );
}

function shouldIgnoreFinalizeJoinError(
  datasetId: string,
  expectedTableName: string,
  error: unknown
): boolean {
  if (!isMissingDuckTableError(error)) {
    return false;
  }

  const currentDataset = state.findDatasetByIdOrSourceFile(datasetId);
  return !currentDataset || currentDataset.tableName !== expectedTableName;
}

function joinedArrowCacheKey(
  datasetTableName: string,
  basemapId: string
): string {
  return `${datasetTableName}::${basemapId}`;
}

function invalidateJoinedArrowCacheForTable(tableName: string): void {
  const prefix = `${tableName}::`;
  for (const key of joinedArrowCache.keys()) {
    if (key.startsWith(prefix)) {
      joinedArrowCache.delete(key);
    }
  }
}

function invalidateDatasetCache(tableName: string): void {
  const dataset = state.getDatasetByTable(tableName);
  if (dataset) {
    dataset.arrowTableWithMetadata = undefined;
    dataset.geoArrowMetadata = undefined;
  }
  if (Duck) {
    Duck.invalidateTableCache(tableName);
  }
  invalidateJoinedArrowCacheForTable(tableName);
}

async function createArrowTableWithMetadata(tableName: string): Promise<{
  arrowTableWithMetadata: Table;
  geoArrowMetadata: GeoArrowMetadata | null;
}> {
  if (!Duck) {
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }

  return arrowOps.createArrowTableWithMetadata(tableName, Duck, (table) =>
    extractGeoArrowMetadata(table)
  );
}

async function getRowCountInternal(tableName: string): Promise<number> {
  if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());
  return tableDataOps.getRowCount(tableName, Duck);
}

let pendingPersistedTableFilters: SerializedTableFiltersState | null = null;

function notifyTableFiltersPersistence(
  priority: keyof typeof SavePriority = 'DEBOUNCED'
): void {
  persistenceRegistry.notifyChange('tableFilters', SavePriority[priority]);
  state.bumpDatasetsVersion();
}

function serializePersistedTableFilters(): SerializedTableFiltersState {
  const filtersBySourceFileId = Object.fromEntries(
    state.getAllDatasets().flatMap((dataset) => {
      if (!dataset.sourceFileId) {
        return [];
      }

      const filters = state.getFilters(dataset.tableName).map((filter) => ({
        id: filter.id,
        column: filter.column,
        operator: filter.operator,
        value: filter.value,
        secondaryValue: filter.secondaryValue,
        limit: filter.limit
      }));

      return filters.length > 0 ? [[dataset.sourceFileId, filters]] : [];
    })
  ) as Record<string, SerializedTableFilterRecord[]>;

  return { filtersBySourceFileId };
}

function restorePersistedTableFilters(data: unknown): void {
  pendingPersistedTableFilters =
    (data as SerializedTableFiltersState | null) ?? {
      filtersBySourceFileId: {}
    };
}

function applyPersistedTableFilters(): void {
  if (!pendingPersistedTableFilters) {
    return;
  }

  const filtersBySourceFileId =
    pendingPersistedTableFilters.filtersBySourceFileId ?? {};

  for (const dataset of state.getAllDatasets()) {
    if (!dataset.sourceFileId) {
      continue;
    }

    const serializedFilters = filtersBySourceFileId[dataset.sourceFileId] ?? [];
    const filters = serializedFilters.map((filter) =>
      createFilterRecord(
        dataset.tableName,
        {
          column: filter.column,
          operator: filter.operator,
          value: filter.value,
          secondaryValue: filter.secondaryValue,
          limit: filter.limit
        },
        filter.id
      )
    );

    state.setFilters(dataset.tableName, filters);
  }

  pendingPersistedTableFilters = serializePersistedTableFilters();
}

export const duckDBOrchestrator = {
  get datasetsVersion(): number {
    return state.getDatasetsVersion();
  },

  get isBatchProcessing(): boolean {
    return state.isBatchProcessing();
  },

  bumpDatasetsVersion: state.bumpDatasetsVersion,
  beginBatch: state.beginBatch,
  endBatch: state.endBatch,

  async invalidateAndReanalyse(tableName: string): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());
    invalidateDatasetCache(tableName);
    await Duck.analyse(tableName, { force: true });
    state.bumpDatasetsVersion();
  },

  initialize,

  async waitForInitialization(): Promise<void> {
    await ensureInitialized();
  },

  async registerExistingTable(
    tableName: string,
    sourceFileId: string,
    fileName: string,
    options?: {
      geoDetection?: GeoDetectionResult;
      preserveExistingJoinState?: boolean;
      preferredDatasetId?: string;
    }
  ): Promise<DuckDBDataset | null> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return datasetOps.registerExistingTable(
      tableName,
      sourceFileId,
      fileName,
      Duck,
      {
        getRowCount: getRowCountInternal,
        createArrowTableWithMetadata,
        prefetchArrowMetadata
      },
      options
    );
  },

  async updateDatasetTableName(
    sourceFileId: string,
    newTableName: string
  ): Promise<DuckDBDataset | null> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return datasetOps.updateDatasetTableName(sourceFileId, newTableName, Duck, {
      getRowCount: getRowCountInternal,
      createArrowTableWithMetadata,
      prefetchArrowMetadata
    });
  },

  async processFile(file: UploadedFile): Promise<DuckDBDataset | null> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    try {
      const dataset = await datasetOps.processFile(file, Duck, {
        getRowCount: getRowCountInternal,
        createArrowTableWithMetadata,
        prefetchArrowMetadata
      });

      return dataset;
    } catch (error) {
      showError(
        m.error_process_file_title(),
        error instanceof Error ? error.message : m.error_unknown()
      );
      return null;
    }
  },

  getBasemapAttributesId: joinOps.getBasemapAttributesId,

  updateDatasetJoinInfo: datasetOps.updateDatasetJoinInfo,

  async getBasemapAttributeValues(basemap: BasemapMetadata): Promise<string[]> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return joinOps.getBasemapAttributeValues(basemap, Duck);
  },

  async getBasemapAttributeAliasesByValue(
    basemap: BasemapMetadata
  ): Promise<Record<string, joinOps.BasemapAlias[]>> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return joinOps.getBasemapAttributeAliasesByValue(basemap, Duck);
  },

  async computeJoinStats(
    datasetId: string,
    basemap: BasemapMetadata,
    geoColumn: string
  ): Promise<JoinQuality> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const dataset = state.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error(m.error_dataset_not_found());

    const filterClause = buildFilterWhereClause(
      state.getFiltersMap().get(dataset.tableName)
    );
    return joinOps.computeJoinStats(
      dataset,
      basemap,
      geoColumn,
      Duck,
      filterClause
    );
  },

  async computeJoinSynthesis(
    datasetId: string,
    geoColumn: string
  ): Promise<joinOps.JoinSynthesisResult[]> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const dataset = state.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error(m.error_dataset_not_found());

    const filterClause = buildFilterWhereClause(
      state.getFiltersMap().get(dataset.tableName)
    );
    return joinOps.computeJoinSynthesis(dataset, geoColumn, Duck, filterClause);
  },

  async applyJoinCorrections(
    datasetId: string,
    geoColumn: string,
    corrections: Record<string, string>
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const dataset = state.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error(m.error_dataset_not_found());

    await joinOps.applyJoinCorrections(dataset, geoColumn, corrections, Duck);

    invalidateDatasetCache(dataset.tableName);
    const columns = await Duck.analyse(dataset.tableName);
    datasetOps.updateDatasetColumns(dataset.id, columns);
  },

  async finalizeJoin(
    datasetId: string,
    basemap: BasemapMetadata,
    geoColumn: string,
    options?: joinOps.FinalizeJoinOptions
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const dataset = state.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error(m.error_dataset_not_found());

    try {
      const result = await joinOps.finalizeJoin(
        dataset,
        basemap,
        geoColumn,
        Duck,
        options
      );

      datasetOps.updateDatasetJoinInfo(dataset.id, result);
      invalidateDatasetCache(dataset.tableName);
      state.bumpDatasetsVersion();
    } catch (error) {
      if (shouldIgnoreFinalizeJoinError(datasetId, dataset.tableName, error)) {
        return;
      }

      logger.error('Failed to finalize join', LogCategory.DATA, {
        datasetId,
        basemap: basemap.file,
        error
      });
      throw error;
    }
  },

  async computeDensityLevels(
    tableName: string,
    columnName: string,
    maxPoints: number = 100000
  ) {
    await ensureInitialized();
    return densityOps.computeDensityLevels(tableName, columnName, maxPoints);
  },

  async computeDensityLevelsFromJoin(
    basemapId: string,
    datasetTableName: string,
    dataColumn: string,
    maxPoints: number = 100000
  ) {
    await ensureInitialized();
    const geometryTableName =
      await basemapService.loadGeometryIntoDuckDB(basemapId);
    return densityOps.computeDensityLevelsFromJoin(
      geometryTableName,
      datasetTableName,
      dataColumn,
      maxPoints
    );
  },

  async computeDensityLevelsFromGpsJoin(
    basemapId: string,
    datasetTableName: string,
    dataColumn: string,
    gpsColumns: GPSColumns,
    maxPoints: number = 100000
  ) {
    await ensureInitialized();
    const geometryTableName =
      await basemapService.loadGeometryIntoDuckDB(basemapId);
    return densityOps.computeDensityLevelsFromGpsJoin(
      geometryTableName,
      datasetTableName,
      dataColumn,
      gpsColumns.lat,
      gpsColumns.lon,
      maxPoints
    );
  },

  async generateDotDensityArrow(
    tableName: string,
    geomColumn: string,
    dataColumn: string,
    ratio: number,
    options?: { seed?: number }
  ): Promise<Table> {
    await ensureInitialized();
    return densityOps.generateDotDensityArrow(
      tableName,
      geomColumn,
      dataColumn,
      ratio,
      options
    );
  },

  async generateDotDensityArrowFromJoin(
    basemapId: string,
    datasetTableName: string,
    dataColumn: string,
    ratio: number,
    options?: { seed?: number }
  ): Promise<Table> {
    await ensureInitialized();
    const geometryTableName =
      await basemapService.loadGeometryIntoDuckDB(basemapId);
    return densityOps.generateDotDensityFromJoin(
      geometryTableName,
      datasetTableName,
      dataColumn,
      ratio,
      options
    );
  },

  async generateDotDensityArrowFromGpsJoin(
    basemapId: string,
    datasetTableName: string,
    dataColumn: string,
    gpsColumns: GPSColumns,
    ratio: number,
    options?: { seed?: number }
  ): Promise<Table> {
    await ensureInitialized();
    const geometryTableName =
      await basemapService.loadGeometryIntoDuckDB(basemapId);
    return densityOps.generateDotDensityFromGpsJoin(
      geometryTableName,
      datasetTableName,
      dataColumn,
      gpsColumns.lat,
      gpsColumns.lon,
      ratio,
      options
    );
  },

  async generateDotDensityArrowFromGeoTable(
    tableName: string,
    dataColumn: string,
    ratio: number,
    options?: { seed?: number }
  ): Promise<Table> {
    await ensureInitialized();
    return densityOps.generateDotDensityFromGeoTable(
      tableName,
      dataColumn,
      ratio,
      options
    );
  },

  async getJoinedArrowTable(
    datasetTableName: string,
    basemapId: string
  ): Promise<Table> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const cacheKey = joinedArrowCacheKey(datasetTableName, basemapId);
    const cached = joinedArrowCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const fresh = await joinOps.getJoinedArrowTable(
      datasetTableName,
      basemapId,
      Duck,
      (bid) => basemapService.loadGeometryIntoDuckDB(bid),
      (tn) => duckDBOrchestrator.getArrowTableDirect(tn)
    );
    joinedArrowCache.set(cacheKey, fresh);
    return fresh;
  },

  async getGPSArrowTable(datasetId: string): Promise<{
    table: Table;
    latColumn: string;
    lonColumn: string;
  }> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const dataset = state.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) {
      throw new Error(m.error_dataset_not_found_id({ datasetId }));
    }

    return gpsOps.getGPSArrowTable(dataset, Duck, (tn) =>
      duckDBOrchestrator.getArrowTableDirect(tn)
    );
  },

  async getGPSBounds(datasetId: string): Promise<gpsOps.GPSBounds | null> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const dataset = state.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) return null;

    return gpsOps.getGPSBounds(dataset, Duck);
  },

  async getTableData(
    tableName: string,
    options?: tableDataOps.GetTableDataOptions
  ): Promise<ArrowTableLike> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.getTableData(tableName, Duck, options);
  },

  async getRowCount(tableName: string): Promise<number> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.getRowCount(tableName, Duck);
  },

  async getRowPosition(
    tableName: string,
    rowId: number,
    options?: {
      orderBy?: string | null;
      orderByType?: string | null;
      order?: 'ASC' | 'DESC' | null;
    }
  ): Promise<number> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.getRowPosition(tableName, rowId, Duck, options);
  },

  async getRowStats(tableName: string): Promise<FilterStats> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.getRowStats(tableName, Duck);
  },

  async analyzeTable(tableName: string): Promise<Record<string, unknown>[]> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.analyzeTable(tableName, Duck);
  },

  async getBasicColumnInfo(tableName: string): Promise<AnalysisResult[]> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.getBasicColumnInfo(tableName, Duck);
  },

  async getFullAnalysis(
    tableName: string,
    force = false
  ): Promise<AnalysisResult[]> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.getFullAnalysis(
      tableName,
      Duck,
      detectSemioType,
      force
    );
  },

  async renameColumn(
    tableName: string,
    oldName: string,
    newName: string,
    options?: { skipAnalysis?: boolean }
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    await columnOps.renameColumn(tableName, oldName, newName, Duck, options);

    const filters = state.getFilters(tableName);
    if (filters.length > 0) {
      const updatedFilters = filters.map((f) => {
        if (f.column !== oldName) return f;
        return createFilterRecord(tableName, { ...f, column: newName }, f.id);
      });
      state.setFilters(tableName, updatedFilters);
    }

    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
  },

  async changeColumnType(
    tableName: string,
    columnName: string,
    newType: string,
    options?: { skipAnalysis?: boolean }
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    await columnOps.changeColumnType(
      tableName,
      columnName,
      newType,
      Duck,
      options
    );
    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
  },

  async dropColumn(
    tableName: string,
    columnName: string,
    options?: { skipAnalysis?: boolean }
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    await columnOps.dropColumn(tableName, columnName, Duck, options);
    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
  },

  async dropRows(
    tableName: string,
    rowIds: number[],
    options?: { skipAnalysis?: boolean }
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    await columnOps.dropRows(tableName, rowIds, Duck, options);
    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
  },

  async deleteFilteredRows(tableName: string): Promise<{
    count: number;
    rowIds: number[];
  }> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const rowIds = await tableDataOps.getExcludedRowIds(tableName, Duck);
    if (rowIds.length === 0) return { count: 0, rowIds: [] };

    await columnOps.dropRows(tableName, rowIds, Duck);
    invalidateDatasetCache(tableName);
    state.bumpDatasetsVersion();
    return { count: rowIds.length, rowIds };
  },

  async refineColumn(
    tableName: string,
    columnName: string,
    operation: RefineOperation,
    options?: { skipAnalysis?: boolean }
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    await columnOps.refineColumn(
      tableName,
      columnName,
      operation,
      Duck,
      options
    );
    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
  },

  async replaceInColumn(
    tableName: string,
    columnName: string,
    searchValue: string,
    replaceValue: string,
    options?: { skipAnalysis?: boolean }
  ): Promise<number> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const count = await columnOps.replaceInColumn(
      tableName,
      columnName,
      searchValue,
      replaceValue,
      Duck,
      options
    );
    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
    return count;
  },

  async addCalculatedColumn(
    tableName: string,
    columnName: string,
    expression: string,
    options?: { skipAnalysis?: boolean }
  ): Promise<void> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const updatedColumns = await columnOps.addCalculatedColumn(
      tableName,
      columnName,
      expression,
      Duck,
      options
    );

    const dataset = state.getDatasetByTable(tableName);
    if (dataset) {
      datasetOps.updateDatasetColumns(dataset.id, updatedColumns);
    }
    if (!options?.skipAnalysis) {
      invalidateDatasetCache(tableName);
      state.bumpDatasetsVersion();
    }
  },

  async testExpression(
    tableName: string,
    expression: string
  ): Promise<unknown> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return columnOps.testExpression(tableName, expression, Duck);
  },

  async runQuery(query: string): Promise<ArrowTableLike> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return tableDataOps.runQuery(query, Duck);
  },

  getFilters: state.getFilters,

  async addFilter(
    tableName: string,
    input: DataTableFilterInput
  ): Promise<DataTableFilter[]> {
    await ensureInitialized();

    const filterId = state.getNextFilterId();
    const filter = createFilterRecord(tableName, input, filterId);
    const filters = [...state.getFilters(tableName), filter];
    state.setFilters(tableName, filters);
    notifyTableFiltersPersistence('IMMEDIATE');

    return state.getFilters(tableName);
  },

  async removeFilter(
    tableName: string,
    filterId: string
  ): Promise<DataTableFilter[]> {
    const filters = state.getFilters(tableName);
    const updated = filters.filter((filter) => filter.id !== filterId);
    state.setFilters(tableName, updated);
    notifyTableFiltersPersistence('IMMEDIATE');

    return state.getFilters(tableName);
  },

  clearFilters(tableName: string): void {
    state.clearFiltersForTable(tableName);
    notifyTableFiltersPersistence('IMMEDIATE');
  },

  async getArrowTableDirect(
    tableName: string,
    yearFilter?: { column: string; value: number | string }
  ): Promise<Table> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    const whereClause = yearFilter
      ? arrowOps.buildYearFilterWhereClause(yearFilter)
      : null;

    return arrowOps.getArrowTableDirect(
      tableName,
      Duck,
      () => {
        for (const dataset of state.getAllDatasets()) {
          if (
            dataset.tableName === tableName &&
            dataset.arrowTableWithMetadata
          ) {
            return dataset.arrowTableWithMetadata;
          }
        }
        return undefined;
      },
      (table) => state.setDatasetArrowTable(tableName, table),
      whereClause
    );
  },

  async getArrowTableReprojectedToWGS84(tableName: string): Promise<Table> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return arrowOps.getArrowTableReprojected(tableName, Duck, 'EPSG:4326');
  },

  async getArrowTable(tableName: string): Promise<Table> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    try {
      return await arrowOps.getArrowTableWithCache(
        tableName,
        Duck,
        (table) => extractGeoArrowMetadata(table),
        () => {
          for (const dataset of state.getAllDatasets()) {
            if (
              dataset.tableName === tableName &&
              dataset.arrowTableWithMetadata
            ) {
              return dataset.arrowTableWithMetadata;
            }
          }
          return undefined;
        },
        (table, metadata) => {
          for (const dataset of state.getAllDatasets()) {
            if (dataset.tableName === tableName) {
              dataset.arrowTableWithMetadata = table;
              dataset.geoArrowMetadata = metadata || undefined;
              break;
            }
          }
        }
      );
    } catch (error) {
      logger.error('Error getting Arrow table', LogCategory.DUCKDB, error);
      throw new DuckDBError(m.error_failed_get_arrow_table({ tableName }));
    }
  },

  getDataset: state.getDatasetById,
  getDatasetByTable: state.getDatasetByTable,
  getDatasetBySourceFile: state.getDatasetBySourceFile,
  getDatasetById: state.getDatasetById,
  findDatasetByIdOrSourceFile: state.findDatasetByIdOrSourceFile,
  getAllDatasets: state.getAllDatasets,
  getCurrentTable: state.getCurrentTableName,
  setCurrentTable: state.setCurrentTableName,
  serializePersistedTableFilters,
  restorePersistedTableFilters,
  applyPersistedTableFilters,

  async dropTable(tableName: string): Promise<void> {
    if (!state.isInitialized()) return;
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    await datasetOps.dropTable(tableName, Duck);
    state.clearFiltersForTable(tableName);
  },

  async clear(): Promise<void> {
    const start = performance.now();
    const datasets = state.getAllDatasets();
    for (const dataset of datasets) {
      await duckDBOrchestrator.dropTable(dataset.tableName);
    }

    state.clearState();

    logger.info('Cleared DuckDB orchestrator state', LogCategory.DUCKDB, {
      durationMs: (performance.now() - start).toFixed(2)
    });
  },

  async convertToProcessedDataset(
    duckDataset: DuckDBDataset
  ): Promise<ProcessedDataset> {
    return conversionOps.convertToProcessedDataset(
      duckDataset,
      (tableName, options) =>
        duckDBOrchestrator.getTableData(tableName, options)
    );
  },

  async joinDataWithBasemap(
    dataTableName: string,
    dataColumnName: string,
    basemapTableName: string,
    basemapColumnName: string
  ): Promise<string> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());

    return joinOps.joinDataWithBasemap(
      dataTableName,
      dataColumnName,
      basemapTableName,
      basemapColumnName,
      Duck
    );
  },

  async searchInTable(
    tableName: string,
    query: string,
    options: { threshold?: number; column?: string } = {}
  ): Promise<SearchStats> {
    await ensureInitialized();
    if (!Duck) throw new DuckDBError(m.error_duckdb_not_initialized());
    return Duck.searchInTable(tableName, query, options);
  }
};

persistenceRegistry.register({
  key: 'tableFilters',
  serialize: () => duckDBOrchestrator.serializePersistedTableFilters(),
  deserialize: (data: unknown) =>
    duckDBOrchestrator.restorePersistedTableFilters(data),
  reset: () => duckDBOrchestrator.restorePersistedTableFilters(undefined),
  priority: 'debounced'
});
