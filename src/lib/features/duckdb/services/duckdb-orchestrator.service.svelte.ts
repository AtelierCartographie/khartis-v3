import type {
  GeoColumnResult,
  GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import type { ProcessedDataset } from '$lib/features/data';
import type { GeoArrowMetadata } from '$lib/features/data/models/geo-arrow-metadata';
import { geoParquetReader } from '$lib/features/data/adapters/readers/GeoParquetReader';
import type { GeoColumnInfo } from '$lib/features/data/types/AnalysisResult';
import { isGeoJSONFeatureCollection } from '$lib/types/data';
import type { Table } from 'apache-arrow/Arrow';
import { SvelteMap } from 'svelte/reactivity';
import {
  DuckDBError,
  ParseError
} from '$lib/features/commons/errors/pipeline.errors';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { FileType } from '$lib/features/commons/store/create-project.types';
import { convertGeoJSONToArrow } from '$lib/features/commons/utils/geojson-to-arrow.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { insertArrowTableIntoDuckDB } from './duckdb/arrow-converter';
import { Duck, initDuckDB } from './duckdb/duckdb';
import type { AnalysisResult, ArrowTableLike } from './duckdb/types';

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
  private metadataPrefetches = new Map<string, Promise<void>>();

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
      logger.debug(
        '[duckDBOrchestrator:registerExistingTable] Registering table',
        {
          tableName,
          sourceFileId,
          fileName
        }
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

      logger.info('[PERFORMANCE] Triggering Arrow metadata prefetch', LogCategory.DUCKDB, {
        tableName,
        datasetId: dataset.id,
        rowCount: dataset.rowCount,
        hasGeometryColumn: dataset.columns.some((col) => {
          const name = col.name.toLowerCase();
          return name === 'geom' || name === 'geometry';
        })
      });

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

      logger.debug(
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
    logger.debug(
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
      logger.debug(
        `⚙️  [${new Date().toISOString()}] [DuckDB:processFile] Initializing DuckDB...`
      );
      const initStart = performance.now();
      logger.info(
        'DuckDB not initialized, initializing...',
        LogCategory.DUCKDB
      );
      await this.initialize();
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:processFile] DuckDB initialized in ${(performance.now() - initStart).toFixed(2)}ms`
      );
    }

    if (!file.parsedData || file.status !== 'complete') {
      logger.debug(
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
      logger.debug(
        `📝 [${new Date().toISOString()}] [DuckDB:processFile] Generating table name...`
      );
      const tableName = this.generateTableName(file.name);
      logger.debug(
        `📝 [${new Date().toISOString()}] [DuckDB:processFile] Table name generated: "${tableName}"`
      );

      let result: DuckDBDataset | null = null;

      if (file.fileType === FileType.CSV) {
        logger.debug(
          `📊 [${new Date().toISOString()}] [DuckDB:processFile] Processing CSV file...`
        );
        const csvStart = performance.now();
        result = await this.processCSV(file, tableName);
        logger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] CSV processed in ${(performance.now() - csvStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOJSON) {
        logger.debug(
          `🗺️  [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoJSON file...`
        );
        const geojsonStart = performance.now();
        result = await this.processGeoJSON(file, tableName);
        logger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] GeoJSON processed in ${(performance.now() - geojsonStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOPACKAGE) {
        logger.debug(
          `🗂️  [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoPackage file...`
        );
        const gpkgStart = performance.now();
        result = await this.processGeoPackage(file, tableName);
        logger.debug(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] GeoPackage processed in ${(performance.now() - gpkgStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOPARQUET) {
        logger.debug(
          `🟪 [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoParquet file...`
        );
        const gpqStart = performance.now();
        result = await this.processGeoParquet(file, tableName);
        logger.debug(
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
      logger.debug(
        `🎉 [${new Date().toISOString()}] [DuckDB:processFile] ===== END ===== Total: ${totalDuration.toFixed(2)}ms`
      );

      return result;
    } catch (error) {
      const errorDuration = performance.now() - startTime;
      logger.error(
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

    logger.debug('[duckDBOrchestrator] Dataset added to reactive state', {
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
        logger.debug(
          `🚀 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Trying ST_Read approach...`
        );
        return await this.processGeoJSONWithSTRead(file, tableName);
      } catch (error) {
        logger.error(
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
        logger.debug(
          `🔷 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Trying Arrow approach...`
        );
        return await this.processGeoJSONWithArrow(file, tableName);
      } catch (error) {
        logger.error(
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

    logger.debug(
      `🐌 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Using legacy approach...`
    );
    return await this.processGeoJSONLegacy(file, tableName);
  }

  private async processGeoJSONWithSTRead(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const startTime = performance.now();
    logger.debug(
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
      logger.debug(
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
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] File object created in ${(performance.now() - fileStart).toFixed(2)}ms`
      );

      logger.debug(
        `📝 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 2: Registering file...`
      );
      const registerStart = performance.now();
      await Duck.register_files([geoFile]);
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] File registered in ${(performance.now() - registerStart).toFixed(2)}ms`
      );

      logger.debug(
        `🔍 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 3: Calling read_geofile...`
      );
      const readStart = performance.now();
      const resultTableName = await Duck.read_geofile(geoFile, {
        tablename: tableName
      });
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Table created in ${(performance.now() - readStart).toFixed(2)}ms`
      );

      const actualTableName =
        typeof resultTableName === 'string' ? resultTableName : tableName;

      logger.debug(
        `📊 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 4: Analyzing table...`
      );
      const analyzeStart = performance.now();
      const columns = await Duck.analyse(actualTableName);
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Analyzed in ${(performance.now() - analyzeStart).toFixed(2)}ms - ${columns.length} columns`
      );

      logger.debug(
        `🔢 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 5: Getting row count...`
      );
      const rowCountStart = performance.now();
      const rowCount = await this.getRowCount(actualTableName);
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Row count: ${rowCount} (${(performance.now() - rowCountStart).toFixed(2)}ms)`
      );

      logger.debug(
        `🔄 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 6: Converting to GeoParquet + Arrow...`
      );
      const geoParquetStart = performance.now();
      const { arrowTableWithMetadata, geoArrowMetadata } =
        await this.createArrowTableWithMetadata(actualTableName);
      const geoParquetDuration = performance.now() - geoParquetStart;

      logger.debug(
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

      logger.debug(
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

      logger.debug(
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
      logger.error(
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
      logger.debug(
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

      logger.debug(
        `[${new Date().toISOString()}] [DuckDB:processGeoJSON] Inserting Arrow table...`
      );
      const insertStart = performance.now();
      await insertArrowTableIntoDuckDB(arrowTable, tableName);
      const insertTime = performance.now() - insertStart;
      logger.debug('Arrow insertion complete', LogCategory.DUCKDB, {
        durationMs: insertTime.toFixed(2)
      });

      logger.debug(
        `🗺️  [${new Date().toISOString()}] [DuckDB:Arrow] STEP 3: Converting geometry column...`
      );
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      const geomStart = performance.now();
      logger.debug(
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
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Geometry converted in ${geomTime.toFixed(2)}ms`
      );
      logger.debug('Geometry conversion complete', LogCategory.DUCKDB, {
        durationMs: geomTime.toFixed(2)
      });

      logger.debug(
        `🔢 [${new Date().toISOString()}] [DuckDB:Arrow] STEP 4: Adding row IDs...`
      );
      const rowIdStart = performance.now();
      logger.debug(
        `🔍 [${new Date().toISOString()}] [DuckDB:Arrow] Executing: CREATE SEQUENCE + ALTER TABLE...`
      );
      await Duck.query(`
        CREATE OR REPLACE SEQUENCE id_${tableName} START 1;
        ALTER TABLE ${tableName} ADD COLUMN __id INTEGER DEFAULT nextval('id_${tableName}');
      `);
      const rowIdTime = performance.now() - rowIdStart;
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Row IDs added in ${rowIdTime.toFixed(2)}ms`
      );

      logger.debug(
        `📊 [${new Date().toISOString()}] [DuckDB:Arrow] STEP 5: Analyzing table...`
      );
      const analyzeStart = performance.now();
      const columns = await Duck.analyse(tableName);
      const analyzeTime = performance.now() - analyzeStart;
      logger.debug(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Analyzed in ${analyzeTime.toFixed(2)}ms - ${columns.length} columns`
      );

      logger.debug(
        `🔢 [${new Date().toISOString()}] [DuckDB:Arrow] Getting row count...`
      );
      const rowCountStart = performance.now();
      const rowCount = await this.getRowCount(tableName);
      const rowCountTime = performance.now() - rowCountStart;
      logger.debug(
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

      logger.debug(
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

    logger.debug('[duckDBOrchestrator:Legacy] Dataset added to reactive state', {
      datasetId: dataset.id,
      tableName,
      sourceFileId: dataset.sourceFileId,
      totalDatasetsCount: this._state.datasets.size
    });

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
  private async createArrowTableWithMetadata(tableName: string): Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    const overallStart = performance.now();

    logger.info('[PERFORMANCE] Starting GeoParquet conversion', LogCategory.DUCKDB, {
      tableName,
      operation: 'createArrowTableWithMetadata'
    });

    const exportStart = performance.now();
    const geoparquetBuffer = await Duck.copy_to_geoparquet_as_buffer(tableName);
    const exportDuration = performance.now() - exportStart;

    logger.info('[PERFORMANCE] DuckDB → GeoParquet serialization', LogCategory.DUCKDB, {
      tableName,
      bufferSize: geoparquetBuffer.byteLength,
      durationMs: exportDuration.toFixed(2),
      durationSec: (exportDuration / 1000).toFixed(2)
    });

    const readStart = performance.now();
    const arrowTableWithMetadata =
      await geoParquetReader.readGeoParquet(geoparquetBuffer);
    const readDuration = performance.now() - readStart;

    const geoArrowMetadata = geoParquetReader.extractMetadata(
      arrowTableWithMetadata
    );

    const totalDuration = performance.now() - overallStart;

    logger.info('[PERFORMANCE] GeoParquet → Arrow deserialization', LogCategory.DUCKDB, {
      tableName,
      durationMs: readDuration.toFixed(2),
      durationSec: (readDuration / 1000).toFixed(2),
      hasMetadata: !!geoArrowMetadata
    });

    logger.info('[PERFORMANCE] Total GeoParquet round-trip', LogCategory.DUCKDB, {
      tableName,
      totalDurationMs: totalDuration.toFixed(2),
      totalDurationSec: (totalDuration / 1000).toFixed(2),
      serializationMs: exportDuration.toFixed(2),
      deserializationMs: readDuration.toFixed(2),
      bufferSizeMB: (geoparquetBuffer.byteLength / 1024 / 1024).toFixed(2),
      rowCount: arrowTableWithMetadata.numRows,
      metadataKeys: arrowTableWithMetadata.schema?.metadata
        ? Array.from(arrowTableWithMetadata.schema.metadata.keys())
        : []
    });

    return { arrowTableWithMetadata, geoArrowMetadata };
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
          logger.info('[PERFORMANCE] Arrow table from CACHE (fast path)', LogCategory.DUCKDB, {
            tableName,
            numRows: dataset.arrowTableWithMetadata.numRows,
            hasMetadata: !!dataset.geoArrowMetadata,
            primaryColumn: dataset.geoArrowMetadata?.primary_column,
            durationMs: cacheDuration.toFixed(2)
          });
          return dataset.arrowTableWithMetadata;
        }
      }

      // Slow path: Materialize Arrow table with GeoParquet round-trip
      logger.warn('[PERFORMANCE] Cache miss - triggering GeoParquet conversion', LogCategory.DUCKDB, {
        tableName,
        warning: 'This is slow (~60-90 seconds for large datasets)'
      });

      const { arrowTableWithMetadata, geoArrowMetadata } =
        await this.createArrowTableWithMetadata(tableName);

      // Update cache
      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName) {
          dataset.arrowTableWithMetadata = arrowTableWithMetadata;
          dataset.geoArrowMetadata = geoArrowMetadata || undefined;
          const totalDuration = performance.now() - getArrowStart;
          logger.info('[PERFORMANCE] Cache updated after materialization', LogCategory.DUCKDB, {
            tableName,
            hasMetadata: !!geoArrowMetadata,
            totalDurationMs: totalDuration.toFixed(2),
            totalDurationSec: (totalDuration / 1000).toFixed(2)
          });
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
      logger.debug('[PERFORMANCE] Prefetch skipped - already cached', LogCategory.DUCKDB, {
        tableName: dataset.tableName
      });
      return Promise.resolve();
    }

    const hasGeometryColumn = dataset.columns.some((column) => {
      const name = column.name.toLowerCase();
      return name === 'geom' || name === 'geometry';
    });

    if (!hasGeometryColumn) {
      logger.debug('[PERFORMANCE] Prefetch skipped - no geometry', LogCategory.DUCKDB, {
        tableName: dataset.tableName
      });
      return Promise.resolve();
    }

    const existing = this.metadataPrefetches.get(dataset.tableName);
    if (existing) {
      logger.debug('[PERFORMANCE] Prefetch already in progress', LogCategory.DUCKDB, {
        tableName: dataset.tableName
      });
      return existing;
    }

    logger.info('[PERFORMANCE] SKIPPING Arrow metadata prefetch (deferred until map needs it)', LogCategory.DUCKDB, {
      tableName: dataset.tableName,
      sourceFileId: dataset.sourceFileId,
      rowCount: dataset.rowCount,
      reason: 'Lazy loading optimization - will materialize on-demand'
    });

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
    logger.debug('[duckDBOrchestrator:dropTable] START', {
      tableName,
      initialized: this.initialized,
      currentDatasetsCount: this._state.datasets.size,
      allTableNames: Array.from(this._state.datasets.values()).map(
        (d) => d.tableName
      )
    });

    if (!this.initialized) {
      logger.debug(
        '[duckDBOrchestrator:dropTable] Not initialized - EARLY RETURN'
      );
      return;
    }

    try {
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      logger.debug('[duckDBOrchestrator:dropTable] Executing DROP TABLE query');
      await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);
      logger.debug('[duckDBOrchestrator:dropTable] DROP TABLE query complete');

      let idToDelete: string | undefined;
      for (const [id, dataset] of this._state.datasets.entries()) {
        logger.debug('[duckDBOrchestrator:dropTable] Checking dataset', {
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

      logger.debug('[duckDBOrchestrator:dropTable] Search complete', {
        foundId: idToDelete,
        willDelete: !!idToDelete
      });

      if (idToDelete) {
        this.updateDatasets((datasets) => {
          datasets.delete(idToDelete!);
        });
        this.bumpDatasetsVersion();

        logger.debug(
          '[duckDBOrchestrator:dropTable] Dataset removed from reactive state',
          {
            datasetId: idToDelete,
            tableName,
            totalDatasetsCount: this._state.datasets.size
          }
        );
      } else {
        logger.warn(
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
      logger.error('[duckDBOrchestrator:dropTable] ERROR', error);
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

    logger.debug(
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
