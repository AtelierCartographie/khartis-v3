import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { geoParquetReader } from '$lib/features/data-pipeline/adapters/readers/GeoParquetReader';
import type { GeoArrowMetadata } from '$lib/features/data-pipeline/models/geo-arrow-metadata';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import type { Table } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
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
  type SearchStats
} from '../types';
import { buildFilterWhereClause, createFilterRecord } from './filter-ops';

import * as columnOps from './column-ops';
import * as gpsOps from './gps-ops';
import * as arrowOps from './arrow-ops';
import * as joinOps from './join-ops';
import * as fileProcessors from './file-processors';
import * as datasetState from './dataset-state';

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

class DuckDBOrchestratorService {
  private initialized = false;

  private initPromise: Promise<void> | null = null;

  private _state = $state<{
    datasets: SvelteMap<string, DuckDBDataset>;
    currentTableName: string | null;
  }>({
    datasets: new SvelteMap(),
    currentTableName: null
  });

  private _filters = $state<SvelteMap<string, DataTableFilter[]>>(
    new SvelteMap()
  );

  private filterIdCounter = 0;

  private metadataPrefetches = new SvelteMap<string, Promise<void>>();

  private _datasetsVersion = $state(0);

  private _suppressVersionBump = $state(false);

  get datasetsVersion(): number {
    return this._datasetsVersion;
  }

  get isBatchProcessing(): boolean {
    return this._suppressVersionBump;
  }

  bumpDatasetsVersion(): void {
    if (!this._suppressVersionBump) {
      this._datasetsVersion++;
    }
  }

  beginBatch(): void {
    this._suppressVersionBump = true;
  }

  endBatch(): void {
    this._suppressVersionBump = false;
    this._datasetsVersion++;
  }

  private touchDatasetsVersion(): void {
    void this._datasetsVersion;
  }

  private updateDatasets(
    updater: (datasets: SvelteMap<string, DuckDBDataset>) => void
  ): void {
    const next = new SvelteMap(this._state.datasets);
    updater(next);
    this._state.datasets = next;
  }

  private updateFilters(
    updater: (filters: SvelteMap<string, DataTableFilter[]>) => void
  ): void {
    const next = new SvelteMap(this._filters);
    updater(next);
    this._filters = next;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    const start = performance.now();
    logger.info(
      'Starting DuckDB orchestrator initialization',
      LogCategory.DUCKDB
    );

    this.initPromise = (async () => {
      try {
        await initDuckDB();
        this.initialized = true;
        logger.success('DuckDB orchestrator initialized', LogCategory.DUCKDB, {
          durationMs: (performance.now() - start).toFixed(2)
        });
      } catch (error) {
        this.initPromise = null;
        logger.error('Failed to initialize DuckDB', LogCategory.DUCKDB, error);
        showError('DuckDB initialization failed', 'Please refresh the page');
        throw error;
      }
    })();

    await this.initPromise;
  }

  async waitForInitialization(): Promise<void> {
    if (this.initialized) return;
    await this.initialize();
  }

  async registerExistingTable(
    tableName: string,
    sourceFileId: string,
    fileName: string,
    options?: { geoDetection?: GeoDetectionResult }
  ): Promise<DuckDBDataset | null> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      logger.info('Registering existing DuckDB table', LogCategory.DUCKDB, {
        tableName,
        sourceFileId
      });

      const escapedTableNameForCheck = escapeSqlString(tableName);
      const tableCheck = (await Duck.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedTableNameForCheck}'`,
        { format: 'array' }
      )) as Array<{ table_name: string }>;

      if (!tableCheck || tableCheck.length === 0) {
        logger.warn(
          'Table does not exist in DuckDB, needs re-processing',
          LogCategory.DUCKDB,
          { tableName, sourceFileId }
        );
        return null;
      }

      const columns = await Duck.analyse(tableName);
      const rowCount = await this.getRowCount(tableName);

      const dataset: DuckDBDataset = {
        id: crypto.randomUUID(),
        tableName,
        sourceFileId,
        name: fileName,
        columns,
        rowCount,
        metadata: {
          processedAt: new Date(),
          fileType: FileType.CSV
        },
        geoDetection: options?.geoDetection
      };

      this.updateDatasets((datasets) => {
        datasets.set(dataset.id, dataset);
      });

      await this.prefetchArrowMetadata(dataset);

      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;

      logger.success('DuckDB table registered', LogCategory.DUCKDB, {
        tableName,
        datasetId: dataset.id,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return dataset;
    } catch (error) {
      logger.error(
        'Failed to register existing table',
        LogCategory.DUCKDB,
        error
      );
      return null;
    }
  }

  async processFile(file: UploadedFile): Promise<DuckDBDataset | null> {
    const startTime = performance.now();
    logger.info('Processing file with DuckDB', LogCategory.DUCKDB, {
      fileId: file.id,
      fileName: file.name,
      fileType: file.fileType,
      status: file.status
    });

    if (!this.initialized) {
      await this.initialize();
    }

    if (!file.parsedData || file.status !== 'complete') {
      return null;
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      const tableName = fileProcessors.generateTableName(file.name);
      const callbacks = {
        getRowCount: (tn: string) => this.getRowCount(tn),
        createArrowTableWithMetadata: (tn: string) =>
          this.createArrowTableWithMetadata(tn)
      };

      let result: DuckDBDataset | null = null;

      if (file.fileType === FileType.CSV) {
        result = await fileProcessors.processCSV(
          file,
          tableName,
          Duck,
          callbacks
        );
      } else if (file.fileType === FileType.GEOJSON) {
        result = await fileProcessors.processGeoJSON(
          file,
          tableName,
          Duck,
          callbacks
        );
      } else if (file.fileType === FileType.GEOPACKAGE) {
        result = await fileProcessors.processGeoPackage(
          file,
          tableName,
          Duck,
          callbacks
        );
      } else if (file.fileType === FileType.GEOPARQUET) {
        result = await fileProcessors.processGeoParquet(
          file,
          tableName,
          Duck,
          callbacks
        );
      } else if (file.fileType === FileType.SHAPEFILE) {
        result = await fileProcessors.processShapefile(
          file,
          tableName,
          Duck,
          callbacks
        );
      } else {
        logger.warn(
          'Unsupported file type for DuckDB ingestion',
          LogCategory.DUCKDB,
          { fileId: file.id, fileType: file.fileType }
        );
      }

      if (result) {
        this.updateDatasets((datasets) => {
          datasets.set(result!.id, result!);
        });
        await this.prefetchArrowMetadata(result);
        this.bumpDatasetsVersion();
        this._state.currentTableName = result.tableName;

        this.restoreJoinState(result, file);
      }

      const totalDuration = performance.now() - startTime;
      if (result) {
        logger.success('File processed via DuckDB', LogCategory.DUCKDB, {
          fileId: file.id,
          datasetId: result.id,
          fileType: file.fileType,
          durationMs: totalDuration.toFixed(2)
        });
      }

      return result;
    } catch (error) {
      const errorDuration = performance.now() - startTime;
      logger.error(
        `[DuckDB:processFile] ERROR After ${errorDuration.toFixed(2)}ms`,
        LogCategory.DUCKDB,
        error
      );
      showError(
        'Failed to process file',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  private restoreJoinState(dataset: DuckDBDataset, file: UploadedFile): void {
    const updates = datasetState.restoreJoinStateFromFile(dataset, file);
    if (!updates) return;

    this.updateDatasets((datasets) => {
      const ds = datasets.get(dataset.id);
      if (ds) {
        Object.assign(ds, updates);
      }
    });
    this.bumpDatasetsVersion();
  }

  getBasemapAttributesId(basemap: BasemapMetadata): string {
    return joinOps.getBasemapAttributesId(basemap);
  }

  async computeJoinStats(
    datasetId: string,
    basemap: BasemapMetadata,
    geoColumn: string
  ): Promise<JoinQuality> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error('Dataset not found');

    return joinOps.computeJoinStats(dataset, basemap, geoColumn, Duck);
  }

  async applyJoinCorrections(
    datasetId: string,
    geoColumn: string,
    corrections: Record<string, string>
  ): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error('Dataset not found');

    await joinOps.applyJoinCorrections(dataset, geoColumn, corrections, Duck);

    const columns = await Duck.analyse(dataset.tableName);
    this.updateDatasets((d) => {
      const ds = d.get(dataset.id);
      if (ds) ds.columns = columns;
    });
    this.bumpDatasetsVersion();
  }

  async finalizeJoin(
    datasetId: string,
    basemap: BasemapMetadata,
    geoColumn: string
  ): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) throw new Error('Dataset not found');

    try {
      const result = await joinOps.finalizeJoin(
        dataset,
        basemap,
        geoColumn,
        Duck
      );

      this.updateDatasets((d) => {
        const ds = d.get(dataset.id);
        if (ds) {
          ds.joinedBasemap = result.joinedBasemap;
          if (result.geoColumn) ds.geoColumn = result.geoColumn;
          if (result.gpsMode) ds.gpsMode = result.gpsMode;
          if (result.gpsColumns) ds.gpsColumns = result.gpsColumns;
        }
      });
      this.bumpDatasetsVersion();
    } catch (error) {
      logger.error('Failed to finalize join', LogCategory.DATA, {
        datasetId,
        basemap: basemap.file,
        error
      });
      throw error;
    }
  }

  async getJoinedArrowTable(
    datasetTableName: string,
    basemapId: string
  ): Promise<Table> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    return joinOps.getJoinedArrowTable(
      datasetTableName,
      basemapId,
      Duck,
      (bid) => basemapService.loadGeometryIntoDuckDB(bid),
      (tn) => this.getArrowTableDirect(tn)
    );
  }

  async getGPSArrowTable(datasetId: string): Promise<{
    table: Table;
    latColumn: string;
    lonColumn: string;
  }> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    return gpsOps.getGPSArrowTable(dataset, Duck, (tn) =>
      this.getArrowTableDirect(tn)
    );
  }

  async getGPSBounds(datasetId: string): Promise<gpsOps.GPSBounds | null> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this.findDatasetByIdOrSourceFile(datasetId);
    if (!dataset) return null;

    return gpsOps.getGPSBounds(dataset, Duck);
  }

  async getTableData(
    tableName: string,
    options?: {
      offset?: number;
      limit?: number;
      orderBy?: string | null;
      order?: 'ASC' | 'DESC' | null;
    }
  ): Promise<ArrowTableLike> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      let query = `SELECT * FROM "${tableName}"`;
      const whereClause = buildFilterWhereClause(this._filters.get(tableName));
      if (whereClause) {
        query += ` WHERE ${whereClause}`;
      }

      if (options?.orderBy && options?.order) {
        query += ` ORDER BY "${options.orderBy}" ${options.order}`;
      }

      if (options?.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options?.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      return (await Duck.query(query)) as ArrowTableLike;
    } catch (error) {
      logger.error('Error getting table data', LogCategory.DUCKDB, error);
      return { numRows: 0, get: () => ({}), toArray: () => [] };
    }
  }

  async getRowCount(tableName: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      return await this.countRows(tableName, true);
    } catch (error) {
      logger.error('Error getting row count', LogCategory.DUCKDB, error);
      return 0;
    }
  }

  async getRowStats(tableName: string): Promise<FilterStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const [total, filtered] = await Promise.all([
      this.countRows(tableName, false),
      this.countRows(tableName, true)
    ]);

    return { total, filtered };
  }

  async analyzeTable(tableName: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const escapedTableNameForColumns = escapeSqlString(tableName);
    const result = (await Duck.query(`
      SELECT
        column_name as name,
        data_type as type
      FROM duckdb_columns()
      WHERE table_name = '${escapedTableNameForColumns}'
    `)) as ArrowTableLike;

    const columns = [];
    for (let i = 0; i < result.numRows; i++) {
      columns.push(result.get(i));
    }
    return columns;
  }

  async getBasicColumnInfo(tableName: string): Promise<AnalysisResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    return Duck.describeColumns(tableName);
  }

  async getFullAnalysis(
    tableName: string,
    force = false
  ): Promise<AnalysisResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    return Duck.analyse(tableName, { force });
  }

  async renameColumn(
    tableName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await columnOps.renameColumn(tableName, oldName, newName, Duck);
    this.bumpDatasetsVersion();
  }

  async changeColumnType(
    tableName: string,
    columnName: string,
    newType: string
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await columnOps.changeColumnType(tableName, columnName, newType, Duck);
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await columnOps.dropColumn(tableName, columnName, Duck);
  }

  async dropRows(tableName: string, rowIds: number[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await columnOps.dropRows(tableName, rowIds, Duck);
    this.bumpDatasetsVersion();
  }

  async refineColumn(
    tableName: string,
    columnName: string,
    operation: RefineOperation
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await columnOps.refineColumn(tableName, columnName, operation, Duck);
  }

  async replaceInColumn(
    tableName: string,
    columnName: string,
    searchValue: string,
    replaceValue: string
  ): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    return columnOps.replaceInColumn(
      tableName,
      columnName,
      searchValue,
      replaceValue,
      Duck
    );
  }

  async addCalculatedColumn(
    tableName: string,
    columnName: string,
    expression: string
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const updatedColumns = await columnOps.addCalculatedColumn(
      tableName,
      columnName,
      expression,
      Duck
    );

    const dataset = Array.from(this._state.datasets.values()).find(
      (d) => d.tableName === tableName
    );
    if (dataset) {
      dataset.columns = updatedColumns;
    }

    this.bumpDatasetsVersion();
  }

  async testExpression(
    tableName: string,
    expression: string
  ): Promise<unknown> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    return columnOps.testExpression(tableName, expression, Duck);
  }

  async runQuery(query: string): Promise<ArrowTableLike> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');
    return Duck.query(query) as Promise<ArrowTableLike>;
  }

  getFilters(tableName: string): DataTableFilter[] {
    return [...(this._filters.get(tableName) ?? [])];
  }

  async addFilter(
    tableName: string,
    input: DataTableFilterInput
  ): Promise<DataTableFilter[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const filterId = `${Date.now()}-${++this.filterIdCounter}`;
    const filter = createFilterRecord(tableName, input, filterId);
    const filters = [...(this._filters.get(tableName) ?? []), filter];
    this.updateFilters((filterMap) => {
      filterMap.set(tableName, filters);
    });

    logger.debug('DuckDB filter added', LogCategory.DUCKDB, {
      tableName,
      filterId: filter.id,
      operator: filter.operator
    });

    return this.getFilters(tableName);
  }

  async removeFilter(
    tableName: string,
    filterId: string
  ): Promise<DataTableFilter[]> {
    const filters = this._filters.get(tableName) ?? [];
    const updated = filters.filter((filter) => filter.id !== filterId);
    this.updateFilters((filterMap) => {
      filterMap.set(tableName, updated);
    });

    logger.debug('DuckDB filter removed', LogCategory.DUCKDB, {
      tableName,
      filterId
    });

    return this.getFilters(tableName);
  }

  clearFilters(tableName: string): void {
    if (this._filters.has(tableName)) {
      this.updateFilters((filterMap) => {
        filterMap.set(tableName, []);
      });
    }
  }

  async exportTableToGeoParquet(tableName: string): Promise<Uint8Array> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }
    return arrowOps.exportTableToGeoParquet(tableName, Duck);
  }

  private async createArrowTableWithMetadata(tableName: string): Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    return arrowOps.createArrowTableWithMetadata(tableName, Duck, (table) =>
      geoParquetReader.extractMetadata(table)
    );
  }

  async getArrowTableDirect(tableName: string): Promise<Table> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    for (const dataset of this._state.datasets.values()) {
      if (dataset.tableName === tableName && dataset.arrowTableWithMetadata) {
        logger.debug(
          'Using cached Arrow table with metadata',
          LogCategory.DUCKDB,
          { tableName }
        );
        return dataset.arrowTableWithMetadata;
      }
    }

    const baseTable = await arrowOps.fetchArrowTableWithGeometry(
      tableName,
      Duck
    );
    const tableWithMetadata = await arrowOps.addGeoArrowMetadataFromDuckDB(
      baseTable,
      tableName,
      Duck
    );

    for (const dataset of this._state.datasets.values()) {
      if (dataset.tableName === tableName) {
        dataset.arrowTableWithMetadata = tableWithMetadata;
        logger.info('Cached Arrow table with metadata', LogCategory.DUCKDB, {
          tableName
        });
        break;
      }
    }

    return tableWithMetadata;
  }

  async getArrowTable(tableName: string): Promise<Table> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName && dataset.arrowTableWithMetadata) {
          return dataset.arrowTableWithMetadata;
        }
      }

      const { arrowTableWithMetadata, geoArrowMetadata } =
        await this.createArrowTableWithMetadata(tableName);

      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName) {
          dataset.arrowTableWithMetadata = arrowTableWithMetadata;
          dataset.geoArrowMetadata = geoArrowMetadata || undefined;
          break;
        }
      }

      return arrowTableWithMetadata;
    } catch (error) {
      logger.error('Error getting Arrow table', LogCategory.DUCKDB, error);
      throw new DuckDBError(`Failed to get Arrow table for ${tableName}`);
    }
  }

  private prefetchArrowMetadata(
    dataset: DuckDBDataset
  ): Promise<void> | undefined {
    if (dataset.arrowTableWithMetadata) {
      return Promise.resolve();
    }

    const hasGeometryColumn = dataset.columns.some((column) => {
      const name = column.name.toLowerCase();
      return name === 'geom' || name === 'geometry';
    });

    if (!hasGeometryColumn) {
      return Promise.resolve();
    }

    const existing = this.metadataPrefetches.get(dataset.tableName);
    if (existing) {
      return existing;
    }

    const prefetchPromise = (async () => {
      try {
        logger.debug('Prefetching Arrow table metadata', LogCategory.DUCKDB, {
          tableName: dataset.tableName
        });

        const { arrowTableWithMetadata, geoArrowMetadata } =
          await this.createArrowTableWithMetadata(dataset.tableName);

        dataset.arrowTableWithMetadata = arrowTableWithMetadata;
        dataset.geoArrowMetadata = geoArrowMetadata || undefined;

        logger.info('Prefetched Arrow table metadata', LogCategory.DUCKDB, {
          tableName: dataset.tableName
        });
      } catch (error) {
        logger.error(
          'Failed to prefetch Arrow metadata',
          LogCategory.DUCKDB,
          error
        );
      } finally {
        this.metadataPrefetches.delete(dataset.tableName);
      }
    })();

    this.metadataPrefetches.set(dataset.tableName, prefetchPromise);
    return prefetchPromise;
  }

  getDataset(id: string): DuckDBDataset | undefined {
    this.touchDatasetsVersion();
    return this._state.datasets.get(id);
  }

  getDatasetByTable(tableName: string): DuckDBDataset | undefined {
    this.touchDatasetsVersion();
    for (const dataset of this._state.datasets.values()) {
      if (dataset.tableName === tableName) {
        return dataset;
      }
    }
    return undefined;
  }

  getDatasetBySourceFile(sourceFileId: string): DuckDBDataset | undefined {
    this.touchDatasetsVersion();
    for (const dataset of this._state.datasets.values()) {
      if (dataset.sourceFileId === sourceFileId) {
        return dataset;
      }
    }
    return undefined;
  }

  private findDatasetByIdOrSourceFile(
    idOrSourceFileId: string
  ): DuckDBDataset | undefined {
    const direct = this._state.datasets.get(idOrSourceFileId);
    if (direct) return direct;
    return this.getDatasetBySourceFile(idOrSourceFileId);
  }

  getAllDatasets(): DuckDBDataset[] {
    this.touchDatasetsVersion();
    return Array.from(this._state.datasets.values());
  }

  getCurrentTable(): string | null {
    return this._state.currentTableName;
  }

  setCurrentTable(tableName: string): void {
    this._state.currentTableName = tableName;
  }

  async dropTable(tableName: string): Promise<void> {
    const start = performance.now();
    if (!this.initialized) {
      return;
    }

    try {
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      await Duck.query(`DROP TABLE IF EXISTS "${tableName}"`);

      let idToDelete: string | undefined;
      for (const [id, dataset] of this._state.datasets.entries()) {
        if (dataset.tableName === tableName) {
          idToDelete = id;
          break;
        }
      }

      if (idToDelete) {
        this.updateDatasets((datasets) => {
          datasets.delete(idToDelete!);
        });
        this.bumpDatasetsVersion();
      }

      if (this._state.currentTableName === tableName) {
        this._state.currentTableName = null;
      }
      logger.info('Dropped DuckDB table', LogCategory.DUCKDB, {
        tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      logger.error(
        '[duckDBOrchestrator:dropTable] ERROR',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  async clear(): Promise<void> {
    const start = performance.now();
    for (const dataset of this._state.datasets.values()) {
      await this.dropTable(dataset.tableName);
    }

    this._state.datasets = new SvelteMap();
    this.bumpDatasetsVersion();
    this._state.currentTableName = null;

    logger.info('Cleared DuckDB orchestrator state', LogCategory.DUCKDB, {
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  async convertToProcessedDataset(
    duckDataset: DuckDBDataset
  ): Promise<ProcessedDataset> {
    const start = performance.now();
    logger.debug(
      'Converting DuckDB dataset to processed dataset',
      LogCategory.DUCKDB,
      {
        datasetId: duckDataset.id,
        tableName: duckDataset.tableName
      }
    );

    let data: Record<string, unknown>[] = [];
    try {
      const tableData = await this.getTableData(duckDataset.tableName);

      if (tableData && tableData.numRows > 0) {
        const limit = Math.min(1000, tableData.numRows);
        for (let i = 0; i < limit; i++) {
          const row = tableData.get(i);
          const cleanRow: Record<string, unknown> = {};
          for (const key in row) {
            if (!key.startsWith('__')) {
              cleanRow[key] = row[key];
            }
          }
          data.push(cleanRow);
        }
      }
    } catch (error) {
      logger.error('Error loading data', LogCategory.DUCKDB, error);
      data = [];
    }

    const userColumns = duckDataset.columns.filter(
      (col) => !col.name.startsWith('__')
    );

    const mappedGeoColumns = datasetState.mapGeoColumnsForAnalysis(
      duckDataset.geoDetection?.geoColumns
    );
    const mappedSuggestedGeoColumn = duckDataset.geoDetection
      ?.suggestedPrimaryGeoColumn
      ? datasetState.mapGeoColumnResult(
          duckDataset.geoDetection.suggestedPrimaryGeoColumn
        )
      : undefined;

    const processedDataset = {
      id: duckDataset.id,
      name: duckDataset.name,
      sourceFileId: duckDataset.sourceFileId,
      format: 'csv' as const,
      columns: userColumns.map((col) => ({
        name: col.name,
        type: datasetState.mapDuckDBType(
          String(col.type_simple || col.type || col.type_js)
        ),
        nullable: (Number(col.nulls) || 0) > 0,
        unique: Boolean(col.unique),
        min: col.min,
        max: col.max,
        uniqueValues: col.unique ? new Set() : undefined,
        sampleValues: []
      })),
      rowCount: duckDataset.rowCount,
      data: data,
      analysis: {
        columns: userColumns.map((col) => ({
          name: col.name,
          type: datasetState.mapDuckDBType(
            String(col.type_simple || col.type || col.type_js)
          ),
          nullable: (Number(col.nulls) || 0) > 0,
          unique: Boolean(col.unique),
          min: col.min,
          max: col.max,
          sampleValues: []
        })),
        geoColumns: mappedGeoColumns,
        hasGeoData: duckDataset.geoDetection?.hasGeoColumns ?? false,
        suggestedGeoColumn: mappedSuggestedGeoColumn,
        rowCount: duckDataset.rowCount,
        warnings: duckDataset.geoDetection?.warnings ?? []
      },
      createdAt: duckDataset.metadata.processedAt,
      fileSize: 0,
      metadata: {
        processedAt: duckDataset.metadata.processedAt,
        transformations: []
      },
      geoDetection: duckDataset.geoDetection
    };

    logger.info(
      'DuckDB dataset converted to processed dataset',
      LogCategory.DUCKDB,
      {
        datasetId: duckDataset.id,
        rowCount: duckDataset.rowCount,
        durationMs: (performance.now() - start).toFixed(2)
      }
    );

    return processedDataset;
  }

  async joinDataWithBasemap(
    dataTableName: string,
    dataColumnName: string,
    basemapTableName: string,
    basemapColumnName: string
  ): Promise<string> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      logger.info('Joining data with basemap in DuckDB', LogCategory.DUCKDB, {
        dataTableName,
        basemapTableName,
        dataColumnName,
        basemapColumnName
      });

      const joinedTableName = `joined_${Date.now().toString(36)}`;

      await Duck.query(`
        CREATE TABLE "${joinedTableName}" AS
        SELECT
          b.*,
          d.* EXCLUDE ("${dataColumnName}")
        FROM "${basemapTableName}" b
        INNER JOIN "${dataTableName}" d
        ON LOWER(TRIM(b."${basemapColumnName}")) = LOWER(TRIM(d."${dataColumnName}"))
      `);

      const countResult = (await Duck.query(`
        SELECT COUNT(*) as count FROM "${joinedTableName}"
      `)) as ArrowTableLike;

      const countRow = countResult.get(0) as Record<string, unknown>;
      const joinedCount = Number(countRow?.count) || 0;

      logger.success('DuckDB basemap join completed', LogCategory.DUCKDB, {
        joinedTableName,
        joinedCount,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return joinedTableName;
    } catch (error) {
      logger.error(
        'Failed to join data with basemap',
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }

  private async countRows(
    tableName: string,
    applyFilters: boolean
  ): Promise<number> {
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    let query = `SELECT COUNT(*) as count FROM "${tableName}"`;
    const whereClause = applyFilters
      ? buildFilterWhereClause(this._filters.get(tableName))
      : null;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    const result = (await Duck.query(query)) as ArrowTableLike;
    const row = result.get(0) as Record<string, unknown>;
    return Number(row?.count) || 0;
  }

  async searchInTable(
    tableName: string,
    query: string,
    options: { threshold?: number; column?: string } = {}
  ): Promise<SearchStats> {
    await this.waitForInitialization();

    const emptyResult: SearchStats = {
      exactCount: 0,
      partialCount: 0,
      results: []
    };

    if (!Duck) {
      logger.warn('DuckDB not initialized for search', LogCategory.DUCKDB);
      return emptyResult;
    }

    return Duck.searchInTable(tableName, query, options);
  }
}

export const duckDBOrchestrator = new DuckDBOrchestratorService();
