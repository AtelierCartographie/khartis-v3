import {
  DuckDBError,
  ParseError
} from '$lib/features/commons/errors/pipeline.errors';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { FileType } from '$lib/features/commons/store/create-project.types';
import type {
  GeoColumnResult,
  GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import { convertGeoJSONToArrow } from '$lib/features/commons/utils/geojson-to-arrow.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { geoParquetReader } from '$lib/features/data-pipeline/adapters/readers/GeoParquetReader';
import type { GeoArrowMetadata } from '$lib/features/data-pipeline/models/geo-arrow-metadata';
import type { GeoColumnInfo } from '$lib/features/data-pipeline/types/AnalysisResult';
import { isGeoJSONFeatureCollection } from '$lib/types/data';
import {
  Field,
  FixedSizeList,
  Float64,
  List,
  Table,
  Type,
  makeBuilder,
  tableFromIPC
} from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import { insertArrowTableIntoDuckDB } from './duckdb/arrow-converter';
import { Duck, initDuckDB } from './duckdb/duckdb';
import type { AnalysisResult, ArrowTableLike } from './duckdb/types';

const duckLogger = {
  debug: (message: string, data?: unknown) =>
    logger.debug(message, LogCategory.DUCKDB, data),
  info: (message: string, data?: unknown) =>
    logger.info(message, LogCategory.DUCKDB, data),
  warn: (message: string, data?: unknown) =>
    logger.warn(message, LogCategory.DUCKDB, data),
  error: (message: string, data?: unknown) =>
    logger.error(message, LogCategory.DUCKDB, data),
  success: (message: string, data?: unknown) =>
    logger.success(message, LogCategory.DUCKDB, data)
};

export enum RefineOperation {
  UPPERCASE = 'uppercase',
  LOWERCASE = 'lowercase',
  TITLECASE = 'titlecase',
  TRIM = 'trim',
  TRIM_ALL = 'trim_all'
}

export type FilterOperator =
  | 'gte'
  | 'lte'
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'between'
  | 'top_asc'
  | 'top_desc'
  | 'empty'
  | 'not_empty';

export interface DataTableFilterInput {
  column: string;
  operator: FilterOperator;
  value?: string | number;
  secondaryValue?: string | number;
  limit?: number;
}

export interface DataTableFilter extends DataTableFilterInput {
  id: string;
  label: string;
  sql: string;
}

export interface FilterStats {
  total: number;
  filtered: number;
}

export interface DuckDBDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: AnalysisResult[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
  geoDetection?: GeoDetectionResult;
  // Keep the GeoParquet-derived Arrow table so GeoArrow metadata stays intact.
  arrowTableWithMetadata?: Table;
  geoArrowMetadata?: GeoArrowMetadata;
}

class DuckDBOrchestratorService {
  private initialized = false;

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

  get datasetsVersion(): number {
    return this._datasetsVersion;
  }

  private bumpDatasetsVersion(): void {
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

    try {
      await initDuckDB();
      this.initialized = true;
      logger.success('DuckDB initialized successfully', LogCategory.DUCKDB);
    } catch (error) {
      logger.error('Failed to initialize DuckDB', LogCategory.DUCKDB, error);
      showError('DuckDB initialization failed', 'Please refresh the page');
      throw error;
    }
  }

  async waitForInitialization(): Promise<void> {
    if (this.initialized) return;

    // Wait for initialization to complete
    await this.initialize();
  }

  async registerExistingTable(
    tableName: string,
    sourceFileId: string,
    fileName: string,
    options?: {
      geoDetection?: GeoDetectionResult;
    }
  ): Promise<DuckDBDataset | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      duckLogger.debug(
        '[duckDBOrchestrator:registerExistingTable] Registering table',
        { tableName, sourceFileId, fileName }
      );

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

      logger.info(
        '[PERFORMANCE] Triggering Arrow metadata prefetch',
        LogCategory.DUCKDB,
        {
          tableName,
          datasetId: dataset.id,
          rowCount: dataset.rowCount,
          hasGeometryColumn: dataset.columns.some((col) => {
            const name = col.name.toLowerCase();
            return name === 'geom' || name === 'geometry';
          })
        }
      );

      void this.prefetchArrowMetadata(dataset);

      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;
      logger.info(
        'DuckDB dataset registered (Arrow pipeline)',
        LogCategory.DUCKDB,
        {
          datasetId: dataset.id,
          tableName,
          sourceFileId: dataset.sourceFileId,
          hasArrowTable: !!dataset.arrowTableWithMetadata
        }
      );

      duckLogger.debug(
        '[duckDBOrchestrator:registerExistingTable] Table registered',
        {
          datasetId: dataset.id,
          tableName,
          sourceFileId,
          totalDatasetsCount: this._state.datasets.size
        }
      );

      logger.info('Existing table registered', LogCategory.DUCKDB, {
        tableName,
        columns: columns.length,
        rows: rowCount
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
    duckLogger.debug(
      `🔵 [${new Date().toISOString()}] [DuckDB:processFile] ===== START =====`,
      {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.fileType,
        status: file.status
      }
    );
    logger.info('DuckDB processFile received file', LogCategory.DUCKDB, {
      fileName: file.name,
      fileType: file.fileType,
      fileSize: file.size,
      status: file.status,
      sourceFileId: file.id
    });

    const { getParsedDataSample } = await import('$lib/types/data');
    logger.debug('Processing file', LogCategory.DUCKDB, {
      name: file.name,
      status: file.status,
      hasParsedData: !!file.parsedData,
      parsedDataSample: getParsedDataSample(file.parsedData)
    });

    if (!this.initialized) {
      duckLogger.debug(
        `⚙️  [${new Date().toISOString()}] [DuckDB:processFile] Initializing DuckDB...`
      );
      const initStart = performance.now();
      logger.info(
        'DuckDB not initialized, initializing...',
        LogCategory.DUCKDB
      );
      await this.initialize();
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:processFile] DuckDB initialized in ${(performance.now() - initStart).toFixed(2)}ms`
      );
    }

    if (!file.parsedData || file.status !== 'complete') {
      duckLogger.debug(
        `⚠️  [${new Date().toISOString()}] [DuckDB:processFile] File not ready - returning null`,
        {
          hasParsedData: !!file.parsedData,
          status: file.status
        }
      );
      logger.debug('Returning null - file not ready', LogCategory.DUCKDB, {
        hasParsedData: !!file.parsedData,
        status: file.status
      });
      return null;
    }

    try {
      duckLogger.debug(
        `📝 [${new Date().toISOString()}] [DuckDB:processFile] Generating table name...`
      );
      const tableName = this.generateTableName(file.name);
      duckLogger.debug(
        `📝 [${new Date().toISOString()}] [DuckDB:processFile] Table name generated: "${tableName}"`
      );

      let result: DuckDBDataset | null = null;

      if (file.fileType === FileType.CSV) {
        duckLogger.debug(
          `📊 [${new Date().toISOString()}] [DuckDB:processFile] Processing CSV file...`
        );
        const csvStart = performance.now();
        result = await this.processCSV(file, tableName);
        duckLogger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] CSV processed in ${(performance.now() - csvStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOJSON) {
        duckLogger.debug(
          `🗺️  [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoJSON file...`
        );
        const geojsonStart = performance.now();
        result = await this.processGeoJSON(file, tableName);
        duckLogger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] GeoJSON processed in ${(performance.now() - geojsonStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOPACKAGE) {
        duckLogger.debug(
          `🗂️  [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoPackage file...`
        );
        const gpkgStart = performance.now();
        result = await this.processGeoPackage(file, tableName);
        duckLogger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] GeoPackage processed in ${(performance.now() - gpkgStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOPARQUET) {
        duckLogger.debug(
          `🟪 [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoParquet file...`
        );
        const gpqStart = performance.now();
        result = await this.processGeoParquet(file, tableName);
        duckLogger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] GeoParquet processed in ${(performance.now() - gpqStart).toFixed(2)}ms`
        );
      } else {
        logger.warn(
          'DuckDB processFile received unsupported fileType',
          LogCategory.DUCKDB,
          {
            fileName: file.name,
            fileType: file.fileType
          }
        );
      }

      const totalDuration = performance.now() - startTime;
      duckLogger.debug(
        `🎉 [${new Date().toISOString()}] [DuckDB:processFile] ===== END ===== Total: ${totalDuration.toFixed(2)}ms`
      );

      return result;
    } catch (error) {
      const errorDuration = performance.now() - startTime;
      duckLogger.error(
        `❌ [${new Date().toISOString()}] [DuckDB:processFile] ===== ERROR ===== After ${errorDuration.toFixed(2)}ms`,
        error
      );
      logger.error('Error processing file', LogCategory.DUCKDB, error);
      showError(
        'Failed to process file',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  private async processCSV(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const { getParsedDataLength, getParsedDataSample, isTabularData } =
      await import('$lib/types/data');
    logger.debug('Processing CSV file', LogCategory.DUCKDB, {
      name: file.name,
      parsedDataLength: getParsedDataLength(file.parsedData),
      firstRow: getParsedDataSample(file.parsedData)
    });

    if (!file.parsedData || !isTabularData(file.parsedData)) {
      throw new ParseError(
        'Invalid or missing parsed data for CSV file',
        FileType.CSV,
        { fileId: file.id, fileName: file.name }
      );
    }

    const csvData = this.convertToCSV(file.parsedData);
    logger.debug('CSV data prepared', LogCategory.DUCKDB, {
      length: csvData.length,
      preview: csvData.substring(0, 200)
    });

    const blob = new Blob([csvData], { type: 'text/csv' });
    const duckFile = new File([blob], file.name, { type: 'text/csv' });

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    logger.debug('Registering file with DuckDB', LogCategory.DUCKDB);
    await Duck.register_files([duckFile]);

    logger.debug('Reading tabular data into table', LogCategory.DUCKDB, {
      tableName
    });
    const actualTableName = await Duck.read_tabular(duckFile, {
      tablename: tableName
    });
    logger.debug('Table created', LogCategory.DUCKDB, { actualTableName });

    const finalTableName = actualTableName || tableName;

    logger.debug('Analyzing table', LogCategory.DUCKDB, { finalTableName });
    const columns = await Duck.analyse(finalTableName);
    logger.debug('Analysis complete', LogCategory.DUCKDB, {
      columnCount: columns.length,
      columnsSample: columns.slice(0, 2)
    });

    const rowCount = await this.getRowCount(finalTableName);
    logger.debug('Row count retrieved', LogCategory.DUCKDB, { rowCount });

    const dataset: DuckDBDataset = {
      id: crypto.randomUUID(),
      tableName: finalTableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection
    };

    this.updateDatasets((datasets) => {
      datasets.set(dataset.id, dataset);
    });
    void this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = finalTableName;

    duckLogger.debug('[duckDBOrchestrator] Dataset added to reactive state', {
      datasetId: dataset.id,
      tableName: finalTableName,
      sourceFileId: dataset.sourceFileId,
      totalDatasetsCount: this._state.datasets.size
    });

    logger.info('Dataset created', LogCategory.DUCKDB, {
      tableName: finalTableName,
      columns: dataset.columns.length,
      rows: dataset.rowCount,
      columnNames: dataset.columns.map((c) => c.name)
    });

    return dataset;
  }

  /**
   * Pick the fastest GeoJSON ingestion path based on feature flags.
   * ST_Read (native DuckDB) is preferred, then the Arrow pipeline, and finally the legacy JSON flow.
   */
  private async processGeoJSON(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const USE_ST_READ = import.meta.env.VITE_USE_ST_READ !== 'false';
    const USE_ARROW_PIPELINE =
      import.meta.env.VITE_USE_ARROW_GEOJSON === 'true';

    if (USE_ST_READ) {
      try {
        duckLogger.debug(
          `🚀 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Trying ST_Read approach...`
        );
        return await this.processGeoJSONWithSTRead(file, tableName);
      } catch (error) {
        duckLogger.error(
          `⚠️  [${new Date().toISOString()}] [DuckDB:processGeoJSON] ST_Read failed:`,
          error
        );
        logger.warn(
          'ST_Read failed, falling back to Arrow pipeline',
          LogCategory.DUCKDB,
          error
        );
      }
    }

    if (USE_ARROW_PIPELINE) {
      try {
        duckLogger.debug(
          `🔷 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Trying Arrow approach...`
        );
        return await this.processGeoJSONWithArrow(file, tableName);
      } catch (error) {
        duckLogger.error(
          `⚠️  [${new Date().toISOString()}] [DuckDB:processGeoJSON] Arrow failed:`,
          error
        );
        logger.warn(
          'Arrow pipeline failed, falling back to legacy path',
          LogCategory.DUCKDB,
          error
        );
      }
    }

    duckLogger.debug(
      `🐌 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Using legacy approach...`
    );
    return await this.processGeoJSONLegacy(file, tableName);
  }

  private async processGeoJSONWithSTRead(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const startTime = performance.now();
    duckLogger.debug(
      `🚀 [${new Date().toISOString()}] [DuckDB:ST_Read] ===== START =====`
    );

    logger.info(
      'Processing GeoJSON with ST_Read (native)',
      LogCategory.DUCKDB,
      {
        name: file.name,
        size: file.size
      }
    );

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      duckLogger.debug(
        `📄 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 1: Creating File object...`
      );
      const fileStart = performance.now();

      let geoFile: File;
      if (file.content) {
        const blob = new Blob([file.content], { type: 'application/json' });
        geoFile = new File([blob], file.name, { type: 'application/json' });
      } else {
        const geoJsonData = JSON.stringify(file.parsedData);
        const blob = new Blob([geoJsonData], { type: 'application/json' });
        geoFile = new File([blob], file.name, { type: 'application/json' });
      }
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] File object created in ${(performance.now() - fileStart).toFixed(2)}ms`
      );

      duckLogger.debug(
        `📝 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 2: Registering file...`
      );
      const registerStart = performance.now();
      await Duck.register_files([geoFile]);
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] File registered in ${(performance.now() - registerStart).toFixed(2)}ms`
      );

      duckLogger.debug(
        `🔍 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 3: Calling read_geofile...`
      );
      const readStart = performance.now();
      const resultTableName = await Duck.read_geofile(geoFile, {
        tablename: tableName
      });
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Table created in ${(performance.now() - readStart).toFixed(2)}ms`
      );

      const actualTableName =
        typeof resultTableName === 'string' ? resultTableName : tableName;

      duckLogger.debug(
        `📊 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 4: Analyzing table...`
      );
      const analyzeStart = performance.now();
      const columns = await Duck.analyse(actualTableName);
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Analyzed in ${(performance.now() - analyzeStart).toFixed(2)}ms - ${columns.length} columns`
      );

      duckLogger.debug(
        `🔢 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 5: Getting row count...`
      );
      const rowCountStart = performance.now();
      const rowCount = await this.getRowCount(actualTableName);
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Row count: ${rowCount} (${(performance.now() - rowCountStart).toFixed(2)}ms)`
      );

      duckLogger.debug(
        `🔄 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 6: Converting to GeoParquet + Arrow...`
      );
      const geoParquetStart = performance.now();
      const { arrowTableWithMetadata, geoArrowMetadata } =
        await this.createArrowTableWithMetadata(actualTableName);
      const geoParquetDuration = performance.now() - geoParquetStart;

      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] GeoParquet → Arrow completed in ${geoParquetDuration.toFixed(2)}ms`,
        {
          numRows: arrowTableWithMetadata.numRows,
          hasMetadata: !!geoArrowMetadata,
          metadataKeys: arrowTableWithMetadata.schema?.metadata
            ? Array.from(arrowTableWithMetadata.schema.metadata.keys())
            : []
        }
      );

      if (!geoArrowMetadata) {
        logger.warn(
          'GeoArrow metadata missing after GeoParquet round-trip',
          LogCategory.DUCKDB,
          {
            tableName: actualTableName
          }
        );
      } else {
        logger.success('GeoArrow metadata preserved', LogCategory.DUCKDB, {
          tableName: actualTableName,
          primaryColumn: geoArrowMetadata.primary_column,
          geometryTypes:
            geoArrowMetadata.columns[geoArrowMetadata.primary_column]
              ?.geometry_types
        });
      }

      const totalTime = performance.now() - startTime;
      const oldTime = 25700;
      const speedup = (oldTime / totalTime).toFixed(1);

      duckLogger.debug(
        `🎉 [${new Date().toISOString()}] [DuckDB:ST_Read] ===== COMPLETE =====`,
        {
          totalTime: `${totalTime.toFixed(2)}ms`,
          speedup: `${speedup}x faster`,
          rows: rowCount,
          columns: columns.length
        }
      );

      logger.success(
        'GeoJSON processing complete (ST_Read native)',
        LogCategory.DUCKDB,
        {
          tableName: actualTableName,
          totalDurationMs: totalTime.toFixed(2),
          columns: columns.length,
          rows: rowCount,
          speedup: `${speedup}x faster than legacy`
        }
      );

      const dataset: DuckDBDataset = {
        id: crypto.randomUUID(),
        tableName: actualTableName,
        sourceFileId: file.id,
        name: file.name,
        columns,
        rowCount,
        metadata: {
          processedAt: new Date(),
          fileType: file.fileType
        },
        geoDetection: file.deepAnalysis?.geoDetection,
        arrowTableWithMetadata,
        geoArrowMetadata: geoArrowMetadata ?? undefined
      };

      this.updateDatasets((datasets) => {
        datasets.set(dataset.id, dataset);
      });
      void this.prefetchArrowMetadata(dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = actualTableName;
      logger.info('DuckDB dataset registered (ST_Read)', LogCategory.DUCKDB, {
        datasetId: dataset.id,
        tableName: actualTableName,
        sourceFileId: dataset.sourceFileId,
        geometryMeta: dataset.geoArrowMetadata?.primary_column
      });

      duckLogger.debug(
        '[duckDBOrchestrator:ST_Read] Dataset added to reactive state',
        {
          datasetId: dataset.id,
          tableName: actualTableName,
          sourceFileId: dataset.sourceFileId,
          totalDatasetsCount: this._state.datasets.size
        }
      );

      return dataset;
    } catch (error) {
      const errorDuration = performance.now() - startTime;
      duckLogger.error(
        `❌ [${new Date().toISOString()}] [DuckDB:ST_Read] FAILED after ${errorDuration.toFixed(2)}ms`,
        error
      );
      logger.error(
        'Error in ST_Read GeoJSON processing',
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }

  private async processGeoPackage(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const gpkgFile = this.getFileForDuckDB(
      file,
      'application/geopackage+sqlite3'
    );

    await Duck.register_files([gpkgFile]);

    const resultTableName = await Duck.read_geofile(gpkgFile, {
      tablename: tableName
    });
    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : tableName;

    const columns = await Duck.analyse(actualTableName);
    const rowCount = await this.getRowCount(actualTableName);
    const { arrowTableWithMetadata, geoArrowMetadata } =
      await this.createArrowTableWithMetadata(actualTableName);

    const dataset: DuckDBDataset = {
      id: crypto.randomUUID(),
      tableName: actualTableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection,
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    this.updateDatasets((datasets) => {
      datasets.set(dataset.id, dataset);
    });
    void this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = actualTableName;

    logger.success('GeoPackage processing complete', LogCategory.DUCKDB, {
      tableName: actualTableName,
      columns: columns.length,
      rows: rowCount
    });

    return dataset;
  }

  private async processGeoParquet(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const buffer = await this.getArrayBufferFromUploadedFile(file);
    const arrowTable = await geoParquetReader.readGeoParquet(buffer);
    const geoMetadata = geoParquetReader.extractMetadata(arrowTable);

    await insertArrowTableIntoDuckDB(arrowTable, tableName);

    if (geoMetadata) {
      const geomColumn = geoMetadata.primary_column;
      try {
        await Duck.query(`
          CREATE OR REPLACE TABLE ${tableName} AS
          SELECT * REPLACE (
            ST_GeomFromWKB("${geomColumn}")::GEOMETRY AS "${geomColumn}"
          )
          FROM ${tableName}
        `);
      } catch (error) {
        logger.warn(
          'Failed to convert GeoParquet geometry column',
          LogCategory.DUCKDB,
          {
            tableName,
            geomColumn,
            error: error instanceof Error ? error.message : String(error)
          }
        );
      }
    }

    await Duck.query(`
      CREATE OR REPLACE SEQUENCE id_${tableName} START 1;
      ALTER TABLE ${tableName} ADD COLUMN __id INTEGER DEFAULT nextval('id_${tableName}');
    `);

    const columns = await Duck.analyse(tableName);
    const rowCount = await this.getRowCount(tableName);
    const { arrowTableWithMetadata, geoArrowMetadata } =
      await this.createArrowTableWithMetadata(tableName);

    const dataset: DuckDBDataset = {
      id: crypto.randomUUID(),
      tableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection,
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    this.updateDatasets((datasets) => {
      datasets.set(dataset.id, dataset);
    });
    void this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = tableName;

    logger.success('GeoParquet processing complete', LogCategory.DUCKDB, {
      tableName,
      columns: columns.length,
      rows: rowCount
    });

    return dataset;
  }

  private async processGeoJSONWithArrow(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const startTime = performance.now();
    logger.info('Processing GeoJSON with Arrow pipeline', LogCategory.DUCKDB, {
      name: file.name
    });

    if (!file.parsedData || !isGeoJSONFeatureCollection(file.parsedData)) {
      throw new ParseError(
        'Invalid or missing parsed GeoJSON data',
        FileType.GEOJSON,
        { fileId: file.id, fileName: file.name }
      );
    }

    try {
      duckLogger.debug(
        `[${new Date().toISOString()}] [DuckDB:processGeoJSON] Converting to Arrow...`
      );
      const conversionStart = performance.now();
      const arrowTable = convertGeoJSONToArrow(file.parsedData);
      const conversionTime = performance.now() - conversionStart;
      logger.debug('Arrow conversion complete', LogCategory.DUCKDB, {
        durationMs: conversionTime.toFixed(2),
        rows: arrowTable.numRows,
        columns: arrowTable.schema.fields.length
      });

      duckLogger.debug(
        `[${new Date().toISOString()}] [DuckDB:processGeoJSON] Inserting Arrow table...`
      );
      const insertStart = performance.now();
      await insertArrowTableIntoDuckDB(arrowTable, tableName);
      const insertTime = performance.now() - insertStart;
      logger.debug('Arrow insertion complete', LogCategory.DUCKDB, {
        durationMs: insertTime.toFixed(2)
      });

      duckLogger.debug(
        `🗺️  [${new Date().toISOString()}] [DuckDB:Arrow] STEP 3: Converting geometry column...`
      );
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      const geomStart = performance.now();
      duckLogger.debug(
        `🔍 [${new Date().toISOString()}] [DuckDB:Arrow] Executing: CREATE OR REPLACE TABLE with ST_GeomFromGeoJSON...`
      );
      await Duck.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT
          * EXCLUDE (geom),
          ST_GeomFromGeoJSON(geom) as geom
        FROM ${tableName}
      `);
      const geomTime = performance.now() - geomStart;
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Geometry converted in ${geomTime.toFixed(2)}ms`
      );
      logger.debug('Geometry conversion complete', LogCategory.DUCKDB, {
        durationMs: geomTime.toFixed(2)
      });

      duckLogger.debug(
        `🔢 [${new Date().toISOString()}] [DuckDB:Arrow] STEP 4: Adding row IDs...`
      );
      const rowIdStart = performance.now();
      duckLogger.debug(
        `🔍 [${new Date().toISOString()}] [DuckDB:Arrow] Executing: CREATE SEQUENCE + ALTER TABLE...`
      );
      await Duck.query(`
        CREATE OR REPLACE SEQUENCE id_${tableName} START 1;
        ALTER TABLE ${tableName} ADD COLUMN __id INTEGER DEFAULT nextval('id_${tableName}');
      `);
      const rowIdTime = performance.now() - rowIdStart;
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Row IDs added in ${rowIdTime.toFixed(2)}ms`
      );

      duckLogger.debug(
        `📊 [${new Date().toISOString()}] [DuckDB:Arrow] STEP 5: Analyzing table...`
      );
      const analyzeStart = performance.now();
      const columns = await Duck.analyse(tableName);
      const analyzeTime = performance.now() - analyzeStart;
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Analyzed in ${analyzeTime.toFixed(2)}ms - ${columns.length} columns`
      );

      duckLogger.debug(
        `🔢 [${new Date().toISOString()}] [DuckDB:Arrow] Getting row count...`
      );
      const rowCountStart = performance.now();
      const rowCount = await this.getRowCount(tableName);
      const rowCountTime = performance.now() - rowCountStart;
      duckLogger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Row count: ${rowCount} (${rowCountTime.toFixed(2)}ms)`
      );

      const arrowMaterializationStart = performance.now();
      const { arrowTableWithMetadata, geoArrowMetadata } =
        await this.createArrowTableWithMetadata(tableName);
      logger.debug(
        'GeoParquet materialization complete (Arrow pipeline)',
        LogCategory.DUCKDB,
        {
          tableName,
          durationMs: (performance.now() - arrowMaterializationStart).toFixed(
            2
          ),
          hasMetadata: !!geoArrowMetadata
        }
      );

      const totalTime = performance.now() - startTime;
      const oldTime = 25700;
      const speedup = (oldTime / totalTime).toFixed(1);

      logger.success(
        'GeoJSON processing complete (Arrow pipeline)',
        LogCategory.DUCKDB,
        {
          tableName,
          totalDurationMs: totalTime.toFixed(2),
          conversionMs: conversionTime.toFixed(2),
          insertionMs: insertTime.toFixed(2),
          geometryMs: geomTime.toFixed(2),
          columns: columns.length,
          rows: rowCount,
          speedup: `${speedup}x faster than legacy`
        }
      );

      const dataset: DuckDBDataset = {
        id: crypto.randomUUID(),
        tableName,
        sourceFileId: file.id,
        name: file.name,
        columns,
        rowCount,
        metadata: {
          processedAt: new Date(),
          fileType: file.fileType
        },
        arrowTableWithMetadata,
        geoArrowMetadata: geoArrowMetadata ?? undefined
      };

      this.updateDatasets((datasets) => {
        datasets.set(dataset.id, dataset);
      });
      void this.prefetchArrowMetadata(dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;

      duckLogger.debug(
        '[duckDBOrchestrator:Arrow] Dataset added to reactive state',
        {
          datasetId: dataset.id,
          tableName,
          sourceFileId: dataset.sourceFileId,
          totalDatasetsCount: this._state.datasets.size
        }
      );

      return dataset;
    } catch (error) {
      logger.error(
        'Error in Arrow GeoJSON processing',
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }

  private async processGeoJSONLegacy(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    logger.debug('Processing GeoJSON file (legacy path)', LogCategory.DUCKDB, {
      name: file.name
    });

    const geoJsonData = JSON.stringify(file.parsedData);

    const blob = new Blob([geoJsonData], { type: 'application/json' });
    const duckFile = new File([blob], file.name, { type: 'application/json' });

    if (!Duck) throw new DuckDBError('DuckDB not initialized');
    await Duck.register_files([duckFile]);
    await Duck.read_geofile(duckFile, { tablename: tableName });

    const columns = await Duck.analyse(tableName);
    const rowCount = await this.getRowCount(tableName);

    const legacyArrowStart = performance.now();
    const { arrowTableWithMetadata, geoArrowMetadata } =
      await this.createArrowTableWithMetadata(tableName);
    logger.debug(
      'GeoParquet materialization complete (legacy pipeline)',
      LogCategory.DUCKDB,
      {
        tableName,
        durationMs: (performance.now() - legacyArrowStart).toFixed(2),
        hasMetadata: !!geoArrowMetadata
      }
    );

    logger.info('GeoJSON columns after read_geofile', LogCategory.DUCKDB, {
      tableName,
      columns: columns.map((c) => c.name),
      types: columns.map((c) => c.type_simple)
    });

    const dataset: DuckDBDataset = {
      id: crypto.randomUUID(),
      tableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection,
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    this.updateDatasets((datasets) => {
      datasets.set(dataset.id, dataset);
    });
    void this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = tableName;
    logger.info(
      'DuckDB dataset registered (legacy pipeline)',
      LogCategory.DUCKDB,
      {
        datasetId: dataset.id,
        tableName,
        sourceFileId: dataset.sourceFileId,
        columnCount: columns.length
      }
    );

    duckLogger.debug(
      '[duckDBOrchestrator:Legacy] Dataset added to reactive state',
      {
        datasetId: dataset.id,
        tableName,
        sourceFileId: dataset.sourceFileId,
        totalDatasetsCount: this._state.datasets.size
      }
    );

    logger.info('GeoJSON dataset created', LogCategory.DUCKDB, {
      tableName,
      columns: dataset.columns.length,
      rows: dataset.rowCount
    });

    return dataset;
  }

  private convertToCSV(data: Record<string, unknown>[]): string {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [];

    csvRows.push(headers.join(','));

    for (const row of data) {
      const values = headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  private generateTableName(filename: string): string {
    let name = filename.replace(/\.[^/.]+$/, '');
    name = name.replace(/[^a-zA-Z0-9_]/g, '_');

    if (!/^[a-zA-Z]/.test(name)) {
      name = 't_' + name;
    }

    const timestamp = Date.now().toString(36);
    return `${name}_${timestamp}`;
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
    logger.debug('Getting data for table', LogCategory.DUCKDB, { tableName });

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      let query = `SELECT * FROM ${tableName}`;
      const whereClause = this.buildFilterWhereClause(tableName);
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

      logger.debug('Running query', LogCategory.DUCKDB, { query });
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

    return {
      total,
      filtered
    };
  }

  async analyzeTable(tableName: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const result = (await Duck.query(`
      SELECT
        column_name as name,
        data_type as type
      FROM duckdb_columns()
      WHERE table_name = '${tableName}'
    `)) as ArrowTableLike;

    const columns = [];
    for (let i = 0; i < result.numRows; i++) {
      columns.push(result.get(i));
    }
    return columns;
  }

  async getBasicColumnInfo(tableName: string): Promise<AnalysisResult[]> {
    logger.debug('getBasicColumnInfo START', LogCategory.DUCKDB, { tableName });
    if (!this.initialized) {
      logger.debug(
        'getBasicColumnInfo initializing DuckDB',
        LogCategory.DUCKDB
      );
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    logger.debug(
      'getBasicColumnInfo calling Duck.describeColumns',
      LogCategory.DUCKDB,
      {
        tableName
      }
    );
    const result = await Duck.describeColumns(tableName);
    logger.debug(
      'getBasicColumnInfo Duck.describeColumns returned',
      LogCategory.DUCKDB,
      {
        columnCount: result.length
      }
    );
    return result;
  }

  async getFullAnalysis(tableName: string): Promise<AnalysisResult[]> {
    logger.debug('getFullAnalysis START', LogCategory.DUCKDB, { tableName });
    if (!this.initialized) {
      logger.debug('getFullAnalysis initializing DuckDB', LogCategory.DUCKDB);
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    logger.debug('getFullAnalysis calling Duck.analyse', LogCategory.DUCKDB, {
      tableName
    });
    const result = await Duck.analyse(tableName);
    logger.debug('getFullAnalysis Duck.analyse returned', LogCategory.DUCKDB, {
      columnCount: result.length
    });
    return result;
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

    logger.debug('Renaming column in DuckDB', LogCategory.DUCKDB, {
      tableName,
      oldName,
      newName
    });

    await Duck.query(
      `ALTER TABLE ${tableName} RENAME COLUMN "${oldName}" TO "${newName}"`
    );

    await Duck.analyse(tableName, { force: true });

    logger.success('Column renamed and cache refreshed', LogCategory.DUCKDB, {
      tableName,
      newName
    });
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

    logger.debug('Changing column type in DuckDB', LogCategory.DUCKDB, {
      tableName,
      columnName,
      newType
    });

    await Duck.query(
      `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" SET DATA TYPE ${newType}`
    );

    await Duck.analyse(tableName, { force: true });

    logger.success(
      'Column type changed and cache refreshed',
      LogCategory.DUCKDB,
      {
        tableName,
        columnName,
        newType
      }
    );
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    logger.debug('Dropping column in DuckDB', LogCategory.DUCKDB, {
      tableName,
      columnName
    });

    await Duck.query(`ALTER TABLE ${tableName} DROP COLUMN "${columnName}"`);

    await Duck.analyse(tableName, { force: true });

    logger.success('Column dropped and cache refreshed', LogCategory.DUCKDB, {
      tableName,
      columnName
    });
  }

  async dropRows(tableName: string, rowIds: number[]): Promise<void> {
    if (!rowIds.length) return;

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    logger.debug('Dropping rows in DuckDB', LogCategory.DUCKDB, {
      tableName,
      count: rowIds.length
    });

    await Duck.drop_rows(tableName, rowIds);
    await Duck.analyse(tableName, { force: true });
    this.bumpDatasetsVersion();

    logger.success('Rows dropped and cache refreshed', LogCategory.DUCKDB, {
      tableName,
      count: rowIds.length
    });
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

    logger.debug('Refining column in DuckDB', LogCategory.DUCKDB, {
      tableName,
      columnName,
      operation
    });

    const operations: Record<RefineOperation, string> = {
      [RefineOperation.UPPERCASE]: `UPDATE ${tableName} SET "${columnName}" = UPPER("${columnName}")`,
      [RefineOperation.LOWERCASE]: `UPDATE ${tableName} SET "${columnName}" = LOWER("${columnName}")`,
      [RefineOperation.TITLECASE]: `UPDATE ${tableName} SET "${columnName}" = INITCAP("${columnName}")`,
      [RefineOperation.TRIM]: `UPDATE ${tableName} SET "${columnName}" = TRIM("${columnName}")`,
      [RefineOperation.TRIM_ALL]: `UPDATE ${tableName} SET "${columnName}" = REGEXP_REPLACE("${columnName}", '\\s+', ' ', 'g')`
    };

    await Duck.query(operations[operation]);

    await Duck.analyse(tableName, { force: true });

    logger.success('Column refined and cache refreshed', LogCategory.DUCKDB, {
      tableName,
      columnName,
      operation
    });
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

    logger.debug('Replacing in column', LogCategory.DUCKDB, {
      tableName,
      columnName,
      searchValue,
      replaceValue
    });

    const countResult = (await Duck.query(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE "${columnName}"::TEXT LIKE '%${searchValue}%'`
    )) as ArrowTableLike;

    const countRow = countResult.get(0) as Record<string, unknown>;
    const count = Number(countRow?.count) || 0;

    if (count > 0) {
      await Duck.query(
        `UPDATE ${tableName} SET "${columnName}" = REPLACE("${columnName}"::TEXT, '${searchValue}', '${replaceValue}')`
      );

      await Duck.analyse(tableName, { force: true });

      logger.success(
        'Values replaced and cache refreshed',
        LogCategory.DUCKDB,
        {
          tableName,
          columnName,
          count
        }
      );
    }

    return count;
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

    const sanitizedColumnName = columnName.trim();
    if (!sanitizedColumnName) {
      throw new DuckDBError('Invalid column name for calculator');
    }

    if (!expression.trim()) {
      throw new DuckDBError('Expression cannot be empty');
    }

    const columns = await Duck.analyse(tableName);
    if (columns.some((col) => col.name === sanitizedColumnName)) {
      throw new DuckDBError(
        `La colonne "${sanitizedColumnName}" existe déjà`,
        undefined,
        { tableName, columnName: sanitizedColumnName }
      );
    }

    logger.info('Adding calculated column', LogCategory.DUCKDB, {
      tableName,
      columnName: sanitizedColumnName,
      expression
    });

    await Duck.query(
      `CREATE OR REPLACE TABLE ${tableName} AS SELECT *, (${expression}) AS "${sanitizedColumnName}" FROM ${tableName}`
    );

    // Force refresh of column metadata
    const updatedColumns = await Duck.analyse(tableName, { force: true });

    // Update the dataset with new column metadata
    const dataset = Array.from(this._state.datasets.values()).find(
      (d) => d.tableName === tableName
    );
    if (dataset) {
      dataset.columns = updatedColumns;
      logger.debug('Dataset columns updated', LogCategory.DUCKDB, {
        tableName,
        columnCount: updatedColumns.length
      });
    }

    this.bumpDatasetsVersion();

    logger.success('Calculated column added', LogCategory.DUCKDB, {
      tableName,
      columnName: sanitizedColumnName
    });
  }

  async testExpression(
    tableName: string,
    expression: string
  ): Promise<unknown> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    logger.debug('Testing calculator expression', LogCategory.DUCKDB, {
      tableName,
      expression
    });

    const result = (await Duck.query(
      `SELECT (${expression}) as result FROM ${tableName} LIMIT 1`
    )) as ArrowTableLike;

    if (result.numRows === 0) {
      return null;
    }

    const row = result.get(0) as Record<string, unknown>;
    return row?.result ?? null;
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

    const filter = this.createFilterRecord(tableName, input);
    const filters = [...(this._filters.get(tableName) ?? []), filter];
    this.updateFilters((filterMap) => {
      filterMap.set(tableName, filters);
    });

    logger.info('Filter added', LogCategory.DUCKDB, {
      tableName,
      filter: filter.label
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

    logger.info('Filter removed', LogCategory.DUCKDB, {
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
      logger.info('Filters cleared', LogCategory.DUCKDB, { tableName });
    }
  }

  private getFileForDuckDB(file: UploadedFile, fallbackMime: string): File {
    if (file.originalFile) {
      return file.originalFile;
    }

    if (file.content instanceof ArrayBuffer) {
      return new File([file.content], file.name, { type: fallbackMime });
    }

    if (typeof file.content === 'string') {
      return new File([file.content], file.name, { type: fallbackMime });
    }

    throw new ParseError(
      'Missing original file content for DuckDB ingestion',
      file.fileType,
      {
        fileId: file.id,
        fileName: file.name
      }
    );
  }

  /**
   * Re-materialize a DuckDB table as GeoParquet and read it back to keep GeoArrow metadata intact.
   * DuckDB drops metadata when querying directly, hence the GeoParquet round trip.
   */
  private async addGeoArrowMetadataFromDuckDB(
    table: Table,
    tableName: string
  ): Promise<Table> {
    if (!Duck) {
      return table;
    }

    try {
      // Query DuckDB for geometry column info
      const tableInfo = await Duck.describe_table(tableName);
      const columns = tableInfo.name.map((name, index) => ({
        column_name: name,
        column_type: tableInfo.type[index]
      }));

      const geomColumn = columns.find((c) => c.column_type === 'GEOMETRY');

      if (!geomColumn) {
        logger.warn(
          'No geometry column found in DuckDB table',
          LogCategory.DUCKDB,
          { tableName }
        );
        return table;
      }

      // Get geometry type from first row
      const geomTypeResult = (await Duck.query(
        `SELECT ST_GeometryType(${geomColumn.column_name}) as geom_type FROM ${tableName} LIMIT 1`,
        { format: 'array' as never }
      )) as Array<{ geom_type: string }>;

      const geometryType = geomTypeResult[0]?.geom_type || 'GEOMETRY';
      const normalizedGeometry = geometryType
        .replace(/^ST_/i, '')
        .toLowerCase();
      const geoarrowExtension = `geoarrow.${normalizedGeometry || 'geometry'}`;

      // Create GeoArrow metadata
      const geoMetadata = {
        version: '1.0.0',
        primary_column: geomColumn.column_name,
        columns: {
          [geomColumn.column_name]: {
            encoding: geoarrowExtension,
            geometry_types: [geometryType.replace('ST_', '')],
            crs: {
              type: 'name',
              properties: {
                name: 'EPSG:4326'
              }
            },
            bbox: [-180, -90, 180, 90] // Default world bounds
          }
        }
      };

      const tableWithWkb = await this.ensureGeometryColumnIsWkb(
        table,
        tableName,
        geomColumn.column_name
      );

      const conversionResult = convertGeometryColumnToGeoArrow(
        tableWithWkb,
        geomColumn.column_name,
        geometryType
      );
      if (conversionResult.converted) {
        logger.debug('GeoArrow geometry conversion completed', LogCategory.DUCKDB, {
          tableName,
          geoColumn: geomColumn.column_name,
          geometryType,
          geoArrowType:
            conversionResult.geometryDataType?.toString() ?? 'unknown',
          rowCount: table.numRows
        });
      } else {
        logger.warn(
          'GeoArrow conversion skipped for geometry column',
          LogCategory.DUCKDB,
          {
            tableName,
            geoColumn: geomColumn.column_name,
            geometryType,
            reason: 'Column is not binary or builder unavailable'
          }
        );
      }
      const normalizedTable = conversionResult.table;
      const schema = normalizedTable.schema;
      const convertedField = schema.fields.find(
        (schemaField) => schemaField.name === geomColumn.column_name
      );
      if (!schema) {
        logger.warn(
          'Arrow table missing schema, cannot add GeoArrow metadata',
          LogCategory.DUCKDB,
          { tableName }
        );
        return normalizedTable;
      }

      const newMetadata = schema.metadata
        ? new SvelteMap(schema.metadata)
        : new SvelteMap<string, string>();
      newMetadata.set('geo', JSON.stringify(geoMetadata));

      const updatedFields = (schema.fields ?? []).map((field) => {
        if (field.name !== geomColumn.column_name) {
          return field;
        }
        const updatedMetadata = field.metadata
          ? new SvelteMap(field.metadata)
          : new SvelteMap<string, string>();
        updatedMetadata.set('ARROW:extension:name', geoarrowExtension);
        updatedMetadata.set(
          'ARROW:extension:metadata',
          JSON.stringify({
            geometry_type: geometryType.replace('ST_', ''),
            crs: 'EPSG:4326'
          })
        );
        return new Field(
          field.name,
          conversionResult.geometryDataType ?? field.type,
          field.nullable,
          updatedMetadata
        );
      });

      const metadataMap = new Map<string, string>(newMetadata);
      (schema as unknown as { metadata: Map<string, string> }).metadata =
        metadataMap;
      (schema as unknown as { fields: Field[] }).fields = updatedFields;

      logger.info('Added GeoArrow metadata from DuckDB', LogCategory.DUCKDB, {
        tableName,
        geoColumn: geomColumn.column_name,
        geometryType,
        geoarrowExtension,
        convertedToGeoArrow: conversionResult.converted,
        geoArrowType:
          conversionResult.geometryDataType?.toString() ??
          convertedField?.type?.toString()
      });

      return normalizedTable;
    } catch (error) {
      logger.error(
        'Failed to add GeoArrow metadata from DuckDB',
        LogCategory.DUCKDB,
        error
      );
      return table;
    }
  }

  private async createArrowTableWithMetadata(tableName: string): Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      logger.info(
        '[GeoArrow] Attempting GeoParquet round-trip for table',
        LogCategory.DUCKDB,
        { tableName }
      );
      const exportStart = performance.now();
      logger.info(
        '[PERFORMANCE] Exporting DuckDB table to GeoParquet buffer',
        LogCategory.DUCKDB,
        { tableName }
      );
      const buffer = await Duck.copy_to_geoparquet_as_buffer(tableName);
      const exportDuration = performance.now() - exportStart;
      logger.info(
        '[PERFORMANCE] DuckDB → GeoParquet export complete',
        LogCategory.DUCKDB,
        {
          tableName,
          durationMs: exportDuration.toFixed(2),
          bufferKB: (buffer.byteLength / 1024).toFixed(2)
        }
      );

      const arrowTableFromParquet =
        await geoParquetReader.readGeoParquet(buffer);
      const geoArrowMetadata = geoParquetReader.extractMetadata(
        arrowTableFromParquet
      );

      if (!geoArrowMetadata) {
        logger.warn(
          'GeoArrow metadata missing after GeoParquet round-trip',
          LogCategory.DUCKDB,
          { tableName }
        );
      } else {
        logger.info(
          'GeoArrow metadata restored from GeoParquet',
          LogCategory.DUCKDB,
          {
            tableName,
            primaryColumn: geoArrowMetadata.primary_column,
            geometryTypes:
              geoArrowMetadata.columns?.[geoArrowMetadata.primary_column]
                ?.geometry_types ?? []
          }
        );
      }

      return {
        arrowTableWithMetadata: arrowTableFromParquet,
        geoArrowMetadata
      };
    } catch (error) {
      logger.error(
        'GeoParquet round-trip failed, falling back to direct Arrow fetch',
        LogCategory.DUCKDB,
        error
      );

      const fetchStart = performance.now();
      logger.info(
        '[PERFORMANCE] Fetching Arrow data directly from DuckDB (fallback)',
        LogCategory.DUCKDB,
        { tableName }
      );

      const arrowTable = await this.fetchArrowTableWithGeometry(tableName);
      const fetchDuration = performance.now() - fetchStart;
      logger.info(
        '[PERFORMANCE] DuckDB → Arrow fallback complete',
        LogCategory.DUCKDB,
        {
          tableName,
          durationMs: fetchDuration.toFixed(2),
          rowCount: arrowTable.numRows,
          columnCount: arrowTable.schema.fields.length
        }
      );

      const arrowTableWithMetadata = await this.addGeoArrowMetadataFromDuckDB(
        arrowTable,
        tableName
      );
      const geoArrowMetadata = geoParquetReader.extractMetadata(
        arrowTableWithMetadata
      );

      if (!geoArrowMetadata) {
        logger.warn(
          'GeoArrow metadata still missing after fallback',
          LogCategory.DUCKDB,
          { tableName }
        );
      } else {
        logger.info(
          'GeoArrow metadata attached via fallback path',
          LogCategory.DUCKDB,
          {
            tableName,
            primaryColumn: geoArrowMetadata.primary_column,
            geometryTypes:
              geoArrowMetadata.columns?.[geoArrowMetadata.primary_column]
                ?.geometry_types ?? []
          }
        );
      }

      return { arrowTableWithMetadata, geoArrowMetadata };
    }
  }

  private async ensureGeometryColumnIsWkb(
    table: Table,
    tableName: string,
    geometryColumn: string
  ): Promise<Table> {
    const columnIndex = table.schema.fields.findIndex(
      (field) => field.name === geometryColumn
    );
    if (columnIndex === -1) {
      return table;
    }

    const vector = table.getChildAt(columnIndex);
    const sampleCount = Math.min(table.numRows, 5);
    for (let i = 0; i < sampleCount; i++) {
      const value = (vector?.get(i) as Uint8Array | null) ?? null;
      if (!value || value.length === 0) {
        continue;
      }
      const firstByte = value[0];
      if (firstByte === 0 || firstByte === 1) {
        return table;
      }
      logger.debug('Non-standard geometry encoding detected, forcing WKB conversion', LogCategory.DUCKDB, {
        tableName,
        geometryColumn,
        sampleRow: i,
        byteLength: value.length,
        firstByte
      });
      break;
    }

    logger.debug('Converting DuckDB geometry column to WKB', LogCategory.DUCKDB, {
      tableName,
      geometryColumn
    });
    return this.fetchTableWithGeometryAsWkb(tableName, geometryColumn);
  }

  private async fetchTableWithGeometryAsWkb(
    tableName: string,
    geometryColumn: string
  ): Promise<Table> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      const buffer = (await Duck.query(
        `SELECT * REPLACE (
          ST_AsWKB("${geometryColumn}") AS "${geometryColumn}"
        )
        FROM ${tableName}`,
        { format: 'arrow-ipc' as never }
      )) as ArrayBuffer | Uint8Array;

      const ipcBuffer =
        buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const wkbTable = tableFromIPC(ipcBuffer);
      logger.debug('Geometry column successfully converted to WKB', LogCategory.DUCKDB, {
        tableName,
        geometryColumn,
        rowCount: wkbTable.numRows
      });
      return wkbTable;
    } catch (error) {
      logger.error(
        'Failed to convert geometry column to WKB',
        LogCategory.DUCKDB,
        {
          tableName,
          geometryColumn,
          error
        }
      );
      throw error;
    }
  }

  async exportTableToGeoParquet(tableName: string): Promise<Uint8Array> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }
    return Duck.copy_to_geoparquet_as_buffer(tableName);
  }

  private async getArrayBufferFromUploadedFile(
    file: UploadedFile
  ): Promise<ArrayBuffer> {
    if (file.originalFile) {
      return file.originalFile.arrayBuffer();
    }

    if (file.content instanceof ArrayBuffer) {
      return file.content;
    }

    if (typeof file.content === 'string') {
      return new TextEncoder().encode(file.content).buffer;
    }

    throw new ParseError(
      'Missing file content for GeoParquet processing',
      file.fileType,
      {
        fileId: file.id,
        fileName: file.name
      }
    );
  }

  private async fetchArrowTableWithGeometry(tableName: string): Promise<Table> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    const buffer = await Duck.get_data(tableName, { geometry: true });
    const ipcBuffer =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    return tableFromIPC(ipcBuffer);
  }

  async getArrowTableDirect(tableName: string): Promise<Table> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info(
      'Fetching Arrow table directly from DuckDB',
      LogCategory.DUCKDB,
      {
        tableName
      }
    );

    const arrowTable = await this.fetchArrowTableWithGeometry(tableName);
    const tableWithMetadata = await this.addGeoArrowMetadataFromDuckDB(
      arrowTable,
      tableName
    );

    return tableWithMetadata;
  }

  async getArrowTable(tableName: string): Promise<Table> {
    const getArrowStart = performance.now();
    logger.info('[PERFORMANCE] getArrowTable called', LogCategory.DUCKDB, {
      tableName
    });

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      // Fast path: Check cache first
      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName && dataset.arrowTableWithMetadata) {
          const cacheDuration = performance.now() - getArrowStart;
          logger.info(
            '[PERFORMANCE] Arrow table from CACHE (fast path)',
            LogCategory.DUCKDB,
            {
              tableName,
              numRows: dataset.arrowTableWithMetadata.numRows,
              hasMetadata: !!dataset.geoArrowMetadata,
              primaryColumn: dataset.geoArrowMetadata?.primary_column,
              durationMs: cacheDuration.toFixed(2)
            }
          );
          return dataset.arrowTableWithMetadata;
        }
      }

      // Slow path: Fetch Arrow data directly from DuckDB
      logger.warn(
        '[PERFORMANCE] Cache miss - fetching Arrow data from DuckDB',
        LogCategory.DUCKDB,
        {
          tableName
        }
      );

      const { arrowTableWithMetadata, geoArrowMetadata } =
        await this.createArrowTableWithMetadata(tableName);

      // Update cache
      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName) {
          dataset.arrowTableWithMetadata = arrowTableWithMetadata;
          dataset.geoArrowMetadata = geoArrowMetadata || undefined;
          const totalDuration = performance.now() - getArrowStart;
          logger.info(
            '[PERFORMANCE] Cache updated after materialization',
            LogCategory.DUCKDB,
            {
              tableName,
              hasMetadata: !!geoArrowMetadata,
              totalDurationMs: totalDuration.toFixed(2),
              totalDurationSec: (totalDuration / 1000).toFixed(2)
            }
          );
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
      logger.debug(
        '[PERFORMANCE] Prefetch skipped - already cached',
        LogCategory.DUCKDB,
        {
          tableName: dataset.tableName
        }
      );
      return Promise.resolve();
    }

    const hasGeometryColumn = dataset.columns.some((column) => {
      const name = column.name.toLowerCase();
      return name === 'geom' || name === 'geometry';
    });

    if (!hasGeometryColumn) {
      logger.debug(
        '[PERFORMANCE] Prefetch skipped - no geometry',
        LogCategory.DUCKDB,
        {
          tableName: dataset.tableName
        }
      );
      return Promise.resolve();
    }

    const existing = this.metadataPrefetches.get(dataset.tableName);
    if (existing) {
      logger.debug(
        '[PERFORMANCE] Prefetch already in progress',
        LogCategory.DUCKDB,
        {
          tableName: dataset.tableName
        }
      );
      return existing;
    }

    logger.info(
      '[PERFORMANCE] SKIPPING Arrow metadata prefetch (deferred until map needs it)',
      LogCategory.DUCKDB,
      {
        tableName: dataset.tableName,
        sourceFileId: dataset.sourceFileId,
        rowCount: dataset.rowCount,
        reason: 'Lazy loading optimization - will materialize on-demand'
      }
    );

    return Promise.resolve();
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
    logger.debug('DuckDB dataset lookup by sourceFileId', LogCategory.DUCKDB, {
      sourceFileId,
      datasetCount: this._state.datasets.size
    });
    this.touchDatasetsVersion();
    for (const dataset of this._state.datasets.values()) {
      if (dataset.sourceFileId === sourceFileId) {
        logger.debug(
          'DuckDB dataset found for sourceFileId',
          LogCategory.DUCKDB,
          {
            sourceFileId,
            datasetId: dataset.id,
            tableName: dataset.tableName
          }
        );
        return dataset;
      }
    }
    logger.warn(
      'No DuckDB dataset found for sourceFileId',
      LogCategory.DUCKDB,
      {
        sourceFileId,
        knownSourceFileIds: Array.from(this._state.datasets.values()).map(
          (d) => d.sourceFileId
        )
      }
    );
    return undefined;
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
    duckLogger.debug('[duckDBOrchestrator:dropTable] START', {
      tableName,
      initialized: this.initialized,
      currentDatasetsCount: this._state.datasets.size,
      allTableNames: Array.from(this._state.datasets.values()).map(
        (d) => d.tableName
      )
    });

    if (!this.initialized) {
      duckLogger.debug(
        '[duckDBOrchestrator:dropTable] Not initialized - EARLY RETURN'
      );
      return;
    }

    try {
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      duckLogger.debug(
        '[duckDBOrchestrator:dropTable] Executing DROP TABLE query'
      );
      await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);
      duckLogger.debug(
        '[duckDBOrchestrator:dropTable] DROP TABLE query complete'
      );

      let idToDelete: string | undefined;
      for (const [id, dataset] of this._state.datasets.entries()) {
        duckLogger.debug('[duckDBOrchestrator:dropTable] Checking dataset', {
          id,
          datasetTableName: dataset.tableName,
          searchingFor: tableName,
          match: dataset.tableName === tableName
        });
        if (dataset.tableName === tableName) {
          idToDelete = id;
          break;
        }
      }

      duckLogger.debug('[duckDBOrchestrator:dropTable] Search complete', {
        foundId: idToDelete,
        willDelete: !!idToDelete
      });

      if (idToDelete) {
        this.updateDatasets((datasets) => {
          datasets.delete(idToDelete!);
        });
        this.bumpDatasetsVersion();

        duckLogger.debug(
          '[duckDBOrchestrator:dropTable] Dataset removed from reactive state',
          {
            datasetId: idToDelete,
            tableName,
            totalDatasetsCount: this._state.datasets.size
          }
        );
      } else {
        duckLogger.warn(
          '[duckDBOrchestrator:dropTable] No dataset found with tableName!',
          {
            tableName,
            allDatasets: Array.from(this._state.datasets.values()).map((d) => ({
              id: d.id,
              tableName: d.tableName,
              sourceFileId: d.sourceFileId
            }))
          }
        );
      }

      if (this._state.currentTableName === tableName) {
        this._state.currentTableName = null;
      }
    } catch (error) {
      duckLogger.error('[duckDBOrchestrator:dropTable] ERROR', error);
      logger.debug(
        `Failed to drop table ${tableName}`,
        LogCategory.DATA,
        error
      );
    }
  }

  async clear(): Promise<void> {
    for (const dataset of this._state.datasets.values()) {
      await this.dropTable(dataset.tableName);
    }

    this._state.datasets = new SvelteMap();
    this.bumpDatasetsVersion();
    this._state.currentTableName = null;

    duckLogger.debug(
      '[duckDBOrchestrator] All datasets cleared from reactive state'
    );
  }

  async convertToProcessedDataset(
    duckDataset: DuckDBDataset
  ): Promise<ProcessedDataset> {
    logger.debug('Converting to processed dataset', LogCategory.DUCKDB, {
      name: duckDataset.name,
      tableName: duckDataset.tableName,
      columnsCount: duckDataset.columns.length,
      sampleColumn: duckDataset.columns[0]
    });

    let data: Record<string, unknown>[] = [];
    try {
      const tableData = await this.getTableData(duckDataset.tableName);
      logger.debug('TableData received', LogCategory.DUCKDB, {
        hasData: !!tableData,
        numRows: tableData?.numRows
      });

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
        logger.debug('Loaded rows', LogCategory.DUCKDB, {
          count: data.length,
          firstRow: data[0]
        });
      }
    } catch (error) {
      logger.error('Error loading data', LogCategory.DUCKDB, error);
      data = [];
    }

    const userColumns = duckDataset.columns.filter(
      (col) => !col.name.startsWith('__')
    );

    const mappedGeoColumns = this.mapGeoColumnsForAnalysis(
      duckDataset.geoDetection?.geoColumns
    );
    const mappedSuggestedGeoColumn = duckDataset.geoDetection
      ?.suggestedPrimaryGeoColumn
      ? this.mapGeoColumnResult(
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
        type: this.mapDuckDBType(
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
          type: this.mapDuckDBType(
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

    logger.debug('Final dataset converted', LogCategory.DUCKDB, {
      name: processedDataset.name,
      columns: processedDataset.columns.length,
      columnNames: processedDataset.columns.map((c) => c.name),
      rows: processedDataset.rowCount,
      dataLength: processedDataset.data.length,
      firstRowKeys: processedDataset.data[0]
        ? Object.keys(processedDataset.data[0])
        : []
    });

    return processedDataset;
  }

  private mapGeoColumnsForAnalysis(
    geoColumns?: GeoColumnResult[]
  ): GeoColumnInfo[] {
    if (!geoColumns?.length) {
      return [];
    }

    return geoColumns
      .map((column) => this.mapGeoColumnResult(column))
      .filter((column): column is GeoColumnInfo => Boolean(column));
  }

  private mapGeoColumnResult(
    geoColumn?: GeoColumnResult
  ): GeoColumnInfo | undefined {
    if (!geoColumn) {
      return undefined;
    }

    return {
      index: geoColumn.index,
      columnName: geoColumn.columnName,
      type: this.mapGeoColumnType(geoColumn.type),
      confidence: geoColumn.confidence
    };
  }

  private mapGeoColumnType(
    type: GeoColumnResult['type']
  ): GeoColumnInfo['type'] {
    const GEO_TYPE_MAP: Record<GeoColumnResult['type'], GeoColumnInfo['type']> =
      {
        latitude: 'latitude',
        longitude: 'longitude',
        country_name: 'country_name',
        iso2: 'iso2',
        iso3: 'iso3',
        region: 'region',
        city: 'city',
        coordinates: 'coordinates',
        unknown: 'unknown'
      };

    return GEO_TYPE_MAP[type] ?? 'unknown';
  }

  private mapDuckDBType(
    duckType: string
  ): 'string' | 'number' | 'date' | 'boolean' | 'geometry' {
    if (!duckType) return 'string';

    const typeMap: Record<
      string,
      'string' | 'number' | 'date' | 'boolean' | 'geometry'
    > = {
      numeric: 'number',
      text: 'string',
      string: 'string',
      date: 'date',
      boolean: 'boolean',
      geometry: 'geometry'
    };
    return typeMap[duckType.toLowerCase()] || 'string';
  }

  async joinDataWithBasemap(
    dataTableName: string,
    dataColumnName: string,
    basemapTableName: string,
    basemapColumnName: string
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      logger.info('Performing data-basemap join', LogCategory.DUCKDB);

      const joinedTableName = `joined_${Date.now().toString(36)}`;

      await Duck.query(`
        CREATE TABLE ${joinedTableName} AS
        SELECT
          b.*,
          d.* EXCLUDE (${dataColumnName})
        FROM ${basemapTableName} b
        INNER JOIN ${dataTableName} d
        ON LOWER(TRIM(b.${basemapColumnName})) = LOWER(TRIM(d.${dataColumnName}))
      `);

      const countResult = (await Duck.query(`
        SELECT COUNT(*) as count FROM ${joinedTableName}
      `)) as ArrowTableLike;

      const countRow = countResult.get(0) as Record<string, unknown>;
      const joinedCount = Number(countRow?.count) || 0;

      logger.success(
        `Join completed: ${joinedCount} rows in ${joinedTableName}`,
        LogCategory.DUCKDB
      );

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

    let query = `SELECT COUNT(*) as count FROM ${tableName}`;
    const whereClause = applyFilters
      ? this.buildFilterWhereClause(tableName)
      : null;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    const result = (await Duck.query(query)) as ArrowTableLike;
    const row = result.get(0) as Record<string, unknown>;
    return Number(row?.count) || 0;
  }

  private createFilterRecord(
    tableName: string,
    input: DataTableFilterInput
  ): DataTableFilter {
    if (!input.column) {
      throw new DuckDBError('Column is required for filters');
    }

    const sql = this.buildFilterSQL(tableName, input);
    const label = this.describeFilter(input);
    const id = `${Date.now()}-${++this.filterIdCounter}`;

    return {
      ...input,
      id,
      label,
      sql
    };
  }

  private buildFilterSQL(
    tableName: string,
    filter: DataTableFilterInput
  ): string {
    const columnRef = `"${filter.column}"`;
    const value = this.formatFilterValue(filter.value);
    const secondValue = this.formatFilterValue(filter.secondaryValue);
    const buildTopFilter = (direction: 'ASC' | 'DESC'): string => {
      const limit = Number(filter.limit ?? filter.value);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new DuckDBError(
          'Veuillez préciser un nombre pour le filtre "top"'
        );
      }
      return `__id IN (SELECT __id FROM ${tableName} ORDER BY ${columnRef} ${direction} NULLS LAST LIMIT ${limit})`;
    };

    switch (filter.operator) {
      case 'gte':
        this.assertValue(filter.value, filter.operator);
        return `${columnRef} >= ${value}`;

      case 'lte':
        this.assertValue(filter.value, filter.operator);
        return `${columnRef} <= ${value}`;

      case 'contains':
        this.assertValue(filter.value, filter.operator);
        return `${columnRef}::TEXT ILIKE '%' || ${value} || '%'`;

      case 'equals':
        this.assertValue(filter.value, filter.operator);
        return `${columnRef} = ${value}`;

      case 'not_equals':
        this.assertValue(filter.value, filter.operator);
        return `${columnRef} <> ${value}`;

      case 'between':
        if (filter.value === undefined || filter.secondaryValue === undefined) {
          throw new DuckDBError(
            'Deux valeurs sont nécessaires pour un filtre "compris entre"'
          );
        }
        return `${columnRef} BETWEEN ${value} AND ${secondValue}`;

      case 'top_asc':
        return buildTopFilter('ASC');

      case 'top_desc':
        return buildTopFilter('DESC');

      case 'empty':
        return `(${columnRef} IS NULL OR TRIM(${columnRef}::TEXT) = '')`;

      case 'not_empty':
        return `(${columnRef} IS NOT NULL AND TRIM(${columnRef}::TEXT) <> '')`;

      default:
        throw new DuckDBError(
          `Unsupported filter operator: ${filter.operator}`
        );
    }
  }

  private describeFilter(filter: DataTableFilterInput): string {
    const column = filter.column;
    const value = filter.value ?? '';
    const valueLabel = typeof value === 'number' ? value : String(value).trim();
    const betweenLabel =
      filter.secondaryValue !== undefined
        ? `${valueLabel} et ${filter.secondaryValue}`
        : valueLabel;

    switch (filter.operator) {
      case 'gte':
        return `${column} ≥ ${valueLabel}`;

      case 'lte':
        return `${column} ≤ ${valueLabel}`;

      case 'contains':
        return `${column} contient "${valueLabel}"`;

      case 'equals':
        return `${column} = ${valueLabel}`;

      case 'not_equals':
        return `${column} ≠ ${valueLabel}`;

      case 'between':
        return `${column} entre ${betweenLabel}`;

      case 'top_asc':
        return `Top ${filter.limit ?? filter.value} valeurs les plus basses de ${column}`;

      case 'top_desc':
        return `Top ${filter.limit ?? filter.value} valeurs les plus hautes de ${column}`;

      case 'empty':
        return `${column} vide`;

      case 'not_empty':
        return `${column} non vide`;

      default:
        return `${column} (${filter.operator})`;
    }
  }

  private formatFilterValue(value: string | number | undefined): string {
    if (value === undefined || value === null) {
      return 'NULL';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    const trimmed = value.trim();
    if (trimmed === '') {
      return `''`;
    }

    const numericValue = Number(trimmed);
    if (!Number.isNaN(numericValue) && trimmed === String(numericValue)) {
      return trimmed;
    }

    return `'${trimmed.replace(/'/g, "''")}'`;
  }

  private assertValue(
    value: string | number | undefined,
    operator: FilterOperator
  ): void {
    if (value === undefined || value === null || `${value}`.trim() === '') {
      throw new DuckDBError(
        `Une valeur est nécessaire pour l'opérateur "${operator}"`
      );
    }
  }

  private buildFilterWhereClause(tableName: string): string | null {
    const filters = this._filters.get(tableName);
    if (!filters || filters.length === 0) {
      return null;
    }

    return filters.map((filter) => filter.sql).join(' AND ');
  }

  async applyJoinCorrections(
    dataTableName: string,
    dataColumnName: string,
    corrections: Map<string, string>
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      logger.info('Applying join corrections', LogCategory.DUCKDB);

      for (const [dataValue, correctedValue] of corrections.entries()) {
        await Duck.query(`
          UPDATE ${dataTableName}
          SET ${dataColumnName} = '${correctedValue}'
          WHERE ${dataColumnName} = '${dataValue}'
        `);
      }

      logger.success(
        `Applied ${corrections.size} corrections to ${dataTableName}`,
        LogCategory.DUCKDB
      );
    } catch (error) {
      logger.error('Failed to apply corrections', LogCategory.DUCKDB, error);
      throw error;
    }
  }
}

export const duckDBOrchestrator = new DuckDBOrchestratorService();

type NestedPoint = [number, number];
type LineStringCoords = NestedPoint[];
type PolygonCoords = LineStringCoords[];
type MultiPolygonCoords = PolygonCoords[];

type GeoArrowConversionResult = {
  table: Table;
  geometryDataType?: List | FixedSizeList;
  converted: boolean;
};

function convertGeometryColumnToGeoArrow(
  table: Table,
  columnName: string,
  geometryType: string
): GeoArrowConversionResult {
  const geometryIndex = table.schema.fields.findIndex(
    (field) => field.name === columnName
  );
  if (geometryIndex === -1) {
    return { table, converted: false };
  }

  const geometryColumn = table.getChildAt(geometryIndex);
  if (!geometryColumn) {
    return { table, converted: false };
  }

  const field = table.schema.fields[geometryIndex];
  const isBinaryColumn =
    field.typeId === Type.Binary || field.typeId === Type.FixedSizeBinary;

  if (!isBinaryColumn) {
    return {
      table,
      geometryDataType: field.type as List | FixedSizeList,
      converted: false
    };
  }

  const builderInfo = createGeoArrowBuilderForType(geometryType);
  if (!builderInfo) {
    logger.warn(
      'Unsupported geometry type for GeoArrow conversion',
      LogCategory.DUCKDB,
      {
        geometryType
      }
    );
    return { table, converted: false };
  }

  const { builder, dataType } = builderInfo;
  const rowCount = table.numRows;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const value = geometryColumn.get(rowIndex) as Uint8Array | null;
    if (!value) {
      builder.append(null);
      continue;
    }
    try {
      const parsedGeometry = parseWkbGeometry(value, geometryType);
      builder.append(parsedGeometry);
    } catch (error) {
      logger.error(
        'Failed to parse WKB geometry; inserting null',
        LogCategory.DUCKDB,
        {
          rowIndex,
          geometryType,
          error
        }
      );
      builder.append(null);
    }
  }

  const geoVector = builder.finish().toVector();
  const updatedTable = table.setChildAt(geometryIndex, geoVector);

  return {
    table: updatedTable,
    geometryDataType: geoVector.type as List | FixedSizeList,
    converted: true
  };
}

function createGeoArrowBuilderForType(geometryType: string): {
  dataType: List | FixedSizeList;
  builder: ReturnType<typeof makeBuilder>;
} | null {
  const upper = geometryType.replace(/^ST_/i, '').toUpperCase();
  const coordinateField = new Field('coords', new Float64(), false);
  const pointType = new FixedSizeList(2, coordinateField);

  const listOf = (name: string, child: List | FixedSizeList) =>
    new List(new Field(name, child, false));

  switch (upper) {
    case 'POINT': {
      const builder = makeBuilder({ type: pointType });
      return { dataType: pointType, builder };
    }
    case 'MULTIPOINT':
    case 'LINESTRING': {
      const lineType = listOf('points', pointType);
      const builder = makeBuilder({ type: lineType });
      return { dataType: lineType, builder };
    }
    case 'POLYGON':
    case 'MULTILINESTRING': {
      const structureType = listOf('parts', listOf('points', pointType));
      const builder = makeBuilder({ type: structureType });
      return { dataType: structureType, builder };
    }
    case 'MULTIPOLYGON': {
      const polygonType = listOf(
        'polygons',
        listOf('rings', listOf('points', pointType))
      );
      const builder = makeBuilder({ type: polygonType });
      return { dataType: polygonType, builder };
    }
    default:
      return null;
  }
}

function parseWkbGeometry(binary: Uint8Array, geometryType: string): unknown {
  const upper = geometryType.replace(/^ST_/i, '').toUpperCase();
  const view = new DataView(
    binary.buffer,
    binary.byteOffset,
    binary.byteLength
  );

  const header = readHeader(view, 0);
  const actualType = header.type;
  const actualTypeName =
    Object.entries(WKB_TYPE_IDS).find(([, id]) => id === actualType)?.[0] ??
    `TYPE_${actualType}`;
  const expectedTypeId = WKB_TYPE_IDS[upper] ?? actualType;

  if (actualType !== expectedTypeId) {
    const mismatchKey = `${upper}->${actualTypeName}`;
    if (!loggedGeometryTypeMismatches.has(mismatchKey)) {
      logger.warn(
        'Geometry type mismatch between metadata and WKB payload',
        LogCategory.DUCKDB,
        {
          expected: upper,
          actual: actualTypeName
        }
      );
      loggedGeometryTypeMismatches.add(mismatchKey);
    }
  }

  const parsedGeometry = parseGeometryByType(view, actualType);

  if (upper === 'MULTIPOLYGON' && actualType === WKB_TYPE_IDS.POLYGON) {
    return [parsedGeometry];
  }
  if (upper === 'MULTILINESTRING' && actualType === WKB_TYPE_IDS.LINESTRING) {
    return [parsedGeometry];
  }
  if (upper === 'MULTIPOINT' && actualType === WKB_TYPE_IDS.POINT) {
    return [parsedGeometry];
  }

  return parsedGeometry;
}

type ParseResult<T> = { geometry: T; offset: number };

function readCoordinatePair(
  view: DataView,
  offset: number,
  littleEndian: boolean,
  coordinateSize: number
): { point: NestedPoint; offset: number } {
  let cursor = offset;
  const x = view.getFloat64(cursor, littleEndian);
  cursor += 8;
  const y = view.getFloat64(cursor, littleEndian);
  cursor += 8;
  const extraDimensions = Math.max(0, coordinateSize - 2);
  if (extraDimensions > 0) {
    cursor += extraDimensions * 8;
  }
  return { point: [x, y], offset: cursor };
}

const EWKB_Z_FLAG = 0x80000000;
const EWKB_M_FLAG = 0x40000000;
const EWKB_SRID_FLAG = 0x20000000;
const EWKB_RESERVED_FLAG = 0x10000000;

const WKB_TYPE_IDS: Record<string, number> = {
  POINT: 1,
  LINESTRING: 2,
  POLYGON: 3,
  MULTIPOINT: 4,
  MULTILINESTRING: 5,
  MULTIPOLYGON: 6
};

const loggedGeometryTypeMismatches = new Set<string>();

function readHeader(
  view: DataView,
  offset: number
): {
  littleEndian: boolean;
  type: number;
  offset: number;
  coordinateSize: number;
} {
  const byteOrder = view.getUint8(offset);
  const littleEndian = byteOrder === 1;
  let typeWithFlags = view.getUint32(offset + 1, littleEndian) >>> 0;
  let cursor = offset + 5;

  let coordinateSize = 2;
  const hasZ = (typeWithFlags & EWKB_Z_FLAG) !== 0;
  const hasM = (typeWithFlags & EWKB_M_FLAG) !== 0;
  const hasSrid = (typeWithFlags & EWKB_SRID_FLAG) !== 0;

  if (hasZ || hasM) {
    coordinateSize = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
  }

  typeWithFlags &=
    ~EWKB_Z_FLAG & ~EWKB_M_FLAG & ~EWKB_SRID_FLAG & ~EWKB_RESERVED_FLAG;

  if (typeWithFlags >= 3000) {
    coordinateSize = Math.max(coordinateSize, 4);
    typeWithFlags -= 3000;
  } else if (typeWithFlags >= 2000) {
    coordinateSize = Math.max(coordinateSize, 3);
    typeWithFlags -= 2000;
  } else if (typeWithFlags >= 1000) {
    coordinateSize = Math.max(coordinateSize, 3);
    typeWithFlags -= 1000;
  }

  if (hasSrid) {
    cursor += 4;
  }

  return {
    littleEndian,
    type: typeWithFlags,
    offset: cursor,
    coordinateSize
  };
}

function parsePoint(view: DataView, offset: number): ParseResult<NestedPoint> {
  const { littleEndian, type, offset: cursor, coordinateSize } = readHeader(
    view,
    offset
  );
  if (type !== 1) {
    throw new Error(`Expected WKB Point but found type ${type}`);
  }
  const { point, offset: nextOffset } = readCoordinatePair(
    view,
    cursor,
    littleEndian,
    coordinateSize
  );
  return { geometry: point, offset: nextOffset };
}

function parseLineString(
  view: DataView,
  offset: number
): ParseResult<LineStringCoords> {
  const { littleEndian, type, offset: cursor, coordinateSize } = readHeader(
    view,
    offset
  );
  if (type !== 2) {
    throw new Error(`Expected WKB LineString but found type ${type}`);
  }
  let current = cursor;
  const numPoints = view.getUint32(current, littleEndian);
  current += 4;
  const points: LineStringCoords = [];
  for (let i = 0; i < numPoints; i++) {
    const { point, offset: nextOffset } = readCoordinatePair(
      view,
      current,
      littleEndian,
      coordinateSize
    );
    points.push(point);
    current = nextOffset;
  }
  return { geometry: points, offset: current };
}

function parsePolygon(
  view: DataView,
  offset: number
): ParseResult<PolygonCoords> {
  const { littleEndian, type, offset: cursor, coordinateSize } = readHeader(
    view,
    offset
  );
  if (type !== 3) {
    throw new Error(`Expected WKB Polygon but found type ${type}`);
  }
  let current = cursor;
  const numRings = view.getUint32(current, littleEndian);
  current += 4;
  const rings: PolygonCoords = [];
  for (let i = 0; i < numRings; i++) {
    const numPoints = view.getUint32(current, littleEndian);
    current += 4;
    const ring: LineStringCoords = [];
    for (let j = 0; j < numPoints; j++) {
      const { point, offset: nextOffset } = readCoordinatePair(
        view,
        current,
        littleEndian,
        coordinateSize
      );
      ring.push(point);
      current = nextOffset;
    }
    rings.push(ring);
  }
  return { geometry: rings, offset: current };
}

function parseMultiPoint(
  view: DataView,
  offset: number
): ParseResult<NestedPoint[]> {
  const { littleEndian, type, offset: cursor } = readHeader(view, offset);
  if (type !== 4) {
    throw new Error(`Expected WKB MultiPoint but found type ${type}`);
  }
  let current = cursor;
  const numPoints = view.getUint32(current, littleEndian);
  current += 4;
  const points: NestedPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const result = parsePoint(view, current);
    points.push(result.geometry);
    current = result.offset;
  }
  return { geometry: points, offset: current };
}

function parseMultiLineString(
  view: DataView,
  offset: number
): ParseResult<LineStringCoords[]> {
  const { littleEndian, type, offset: cursor } = readHeader(view, offset);
  if (type !== 5) {
    throw new Error(`Expected WKB MultiLineString but found type ${type}`);
  }
  let current = cursor;
  const numLines = view.getUint32(current, littleEndian);
  current += 4;
  const lines: LineStringCoords[] = [];
  for (let i = 0; i < numLines; i++) {
    const result = parseLineString(view, current);
    lines.push(result.geometry);
    current = result.offset;
  }
  return { geometry: lines, offset: current };
}

function parseMultiPolygon(
  view: DataView,
  offset: number
): ParseResult<MultiPolygonCoords> {
  const { littleEndian, type, offset: cursor } = readHeader(view, offset);
  if (type !== 6) {
    throw new Error(`Expected WKB MultiPolygon but found type ${type}`);
  }
  let current = cursor;
  const numPolygons = view.getUint32(current, littleEndian);
  current += 4;
  const polygons: MultiPolygonCoords = [];
  for (let i = 0; i < numPolygons; i++) {
    const result = parsePolygon(view, current);
    polygons.push(result.geometry);
    current = result.offset;
  }
  return { geometry: polygons, offset: current };
}

function parseGeometryByType(view: DataView, type: number): unknown {
  switch (type) {
    case 1:
      return parsePoint(view, 0).geometry;
    case 2:
      return parseLineString(view, 0).geometry;
    case 3:
      return parsePolygon(view, 0).geometry;
    case 4:
      return parseMultiPoint(view, 0).geometry;
    case 5:
      return parseMultiLineString(view, 0).geometry;
    case 6:
      return parseMultiPolygon(view, 0).geometry;
    default:
      throw new Error(`Unsupported WKB geometry type ${type}`);
  }
}
