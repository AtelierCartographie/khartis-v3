import { Duck, initDuckDB } from './duckdb/duckdb';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import type { ProcessedDataset } from '$lib/features/data';
import { showError } from '../utils/notification.utils.svelte';
import { logger, LogCategory } from '../utils/logger';
import type { AnalysisResult, ArrowTableLike } from './duckdb/types';
import { DuckDBError, ParseError } from '../errors/pipeline.errors';
import { convertGeoJSONToArrow } from '../utils/geojson-to-arrow.utils';
import { insertArrowTableIntoDuckDB } from './duckdb/arrow-converter';
import { isGeoJSONFeatureCollection } from '$lib/types/data';
import { geoParquetReader } from '$lib/features/data/infrastructure/readers/GeoParquetReader';
import type { GeoArrowMetadata } from '$lib/features/data/domain/entities/GeoArrowMetadata';
import type { Table } from 'apache-arrow/Arrow';

export enum RefineOperation {
  UPPERCASE = 'uppercase',
  LOWERCASE = 'lowercase',
  TITLECASE = 'titlecase',
  TRIM = 'trim',
  TRIM_ALL = 'trim_all'
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
  // CRITICAL: Store Arrow table WITH GeoArrow metadata
  // This table comes from GeoParquetReader and has schema.metadata.get('geo')
  // DO NOT store tables from Duck.query() - they lose metadata!
  arrowTableWithMetadata?: Table;
  // Parsed GeoArrow metadata for quick access
  geoArrowMetadata?: GeoArrowMetadata;
}

class DuckDBOrchestratorService {
  private initialized = false;

  private _state = $state<{
    datasets: Map<string, DuckDBDataset>;
    currentTableName: string | null;
  }>({
    datasets: new Map(),
    currentTableName: null
  });

  private _datasetsVersion = $state(0);

  get datasetsVersion(): number {
    return this._datasetsVersion;
  }

  private bumpDatasetsVersion(): void {
    this._datasetsVersion++;
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

  /**
   * Register an existing DuckDB table that was created by dataPipeline
   * This avoids creating duplicate tables
   */
  async registerExistingTable(
    tableName: string,
    sourceFileId: string,
    fileName: string
  ): Promise<DuckDBDataset | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    try {
      console.log('[duckDBOrchestrator:registerExistingTable] Registering table', {
        tableName,
        sourceFileId,
        fileName
      });

      // Analyze the existing table
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
          fileType: FileType.CSV // We'll assume CSV for now
        }
      };

      // Force reactivity by creating new Map reference
      this._state.datasets = new Map(this._state.datasets).set(dataset.id, dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;
      logger.info('DuckDB dataset registered (Arrow pipeline)', LogCategory.DUCKDB, {
        datasetId: dataset.id,
        tableName,
        sourceFileId: dataset.sourceFileId,
        hasArrowTable: !!dataset.arrowTableWithMetadata
      });

      console.log('[duckDBOrchestrator:registerExistingTable] Table registered', {
        datasetId: dataset.id,
        tableName,
        sourceFileId,
        totalDatasetsCount: this._state.datasets.size
      });

      logger.info('Existing table registered', LogCategory.DUCKDB, {
        tableName,
        columns: columns.length,
        rows: rowCount
      });

      return dataset;
    } catch (error) {
      logger.error('Failed to register existing table', LogCategory.DUCKDB, error);
      return null;
    }
  }

  async processFile(file: UploadedFile): Promise<DuckDBDataset | null> {
    const startTime = performance.now();
    console.log(
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
      console.log(
        `⚙️  [${new Date().toISOString()}] [DuckDB:processFile] Initializing DuckDB...`
      );
      const initStart = performance.now();
      logger.info(
        'DuckDB not initialized, initializing...',
        LogCategory.DUCKDB
      );
      await this.initialize();
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:processFile] DuckDB initialized in ${(performance.now() - initStart).toFixed(2)}ms`
      );
    }

    if (!file.parsedData || file.status !== 'complete') {
      console.log(
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
      console.log(
        `📝 [${new Date().toISOString()}] [DuckDB:processFile] Generating table name...`
      );
      const tableName = this.generateTableName(file.name);
      console.log(
        `📝 [${new Date().toISOString()}] [DuckDB:processFile] Table name generated: "${tableName}"`
      );

      let result: DuckDBDataset | null = null;

      if (file.fileType === FileType.CSV) {
        console.log(
          `📊 [${new Date().toISOString()}] [DuckDB:processFile] Processing CSV file...`
        );
        const csvStart = performance.now();
        result = await this.processCSV(file, tableName);
        console.log(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] CSV processed in ${(performance.now() - csvStart).toFixed(2)}ms`
        );
      } else if (file.fileType === FileType.GEOJSON) {
        console.log(
          `🗺️  [${new Date().toISOString()}] [DuckDB:processFile] Processing GeoJSON file...`
        );
        const geojsonStart = performance.now();
        result = await this.processGeoJSON(file, tableName);
        console.log(
          `✅ [${new Date().toISOString()}] [DuckDB:processFile] GeoJSON processed in ${(performance.now() - geojsonStart).toFixed(2)}ms`
        );
      } else {
        logger.warn('DuckDB processFile received unsupported fileType', LogCategory.DUCKDB, {
          fileName: file.name,
          fileType: file.fileType
        });
      }

      const totalDuration = performance.now() - startTime;
      console.log(
        `🎉 [${new Date().toISOString()}] [DuckDB:processFile] ===== END ===== Total: ${totalDuration.toFixed(2)}ms`
      );

      return result;
    } catch (_error) {
      const errorDuration = performance.now() - startTime;
      console.error(
        `❌ [${new Date().toISOString()}] [DuckDB:processFile] ===== ERROR ===== After ${errorDuration.toFixed(2)}ms`,
        _error
      );
      logger.error('Error processing file', LogCategory.DUCKDB, _error);
      showError(
        'Failed to process file',
        _error instanceof Error ? _error.message : 'Unknown error'
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
      }
    };

    // Force reactivity by creating new Map reference
    this._state.datasets = new Map(this._state.datasets).set(dataset.id, dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = finalTableName;

    console.log('[duckDBOrchestrator] Dataset added to reactive state', {
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
   * Process GeoJSON file - tries ST_Read first (fastest), then Arrow, then legacy
   * ST_Read: DuckDB native spatial extension (~1-2s for 715KB file)
   * Arrow: JavaScript conversion (~3s for 715KB file)
   * Legacy: JSON.stringify bottleneck (~25s for 715KB file)
   */
  private async processGeoJSON(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const USE_ST_READ = import.meta.env.VITE_USE_ST_READ !== 'false'; // default true
    const USE_ARROW_PIPELINE =
      import.meta.env.VITE_USE_ARROW_GEOJSON === 'true'; // default false

    // Priority 1: ST_Read (fastest - DuckDB native)
    if (USE_ST_READ) {
      try {
        console.log(
          `🚀 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Trying ST_Read approach...`
        );
        return await this.processGeoJSONWithSTRead(file, tableName);
      } catch (error) {
        console.error(
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

    // Priority 2: Arrow pipeline (fast - JavaScript conversion)
    if (USE_ARROW_PIPELINE) {
      try {
        console.log(
          `🔷 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Trying Arrow approach...`
        );
        return await this.processGeoJSONWithArrow(file, tableName);
      } catch (error) {
        console.error(
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

    // Priority 3: Legacy (slow but reliable)
    console.log(
      `🐌 [${new Date().toISOString()}] [DuckDB:processGeoJSON] Using legacy approach...`
    );
    return await this.processGeoJSONLegacy(file, tableName);
  }

  /**
   * FASTEST: Process GeoJSON using DuckDB's native ST_Read
   * This bypasses ALL JavaScript processing - DuckDB reads the file directly
   * Expected: 1-2 seconds for 715KB file (vs 25s legacy, 3s Arrow)
   */
  private async processGeoJSONWithSTRead(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const startTime = performance.now();
    console.log(
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
      // STEP 1: Create File object from parsed data
      console.log(
        `📄 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 1: Creating File object...`
      );
      const fileStart = performance.now();

      // We need the original file content, not the parsed data
      // If we have the original file, use it; otherwise recreate from parsedData
      let geoFile: File;
      if (file.content) {
        const blob = new Blob([file.content], { type: 'application/json' });
        geoFile = new File([blob], file.name, { type: 'application/json' });
      } else {
        // Fallback: stringify parsed data (still faster than full legacy path)
        const geoJsonData = JSON.stringify(file.parsedData);
        const blob = new Blob([geoJsonData], { type: 'application/json' });
        geoFile = new File([blob], file.name, { type: 'application/json' });
      }
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] File object created in ${(performance.now() - fileStart).toFixed(2)}ms`
      );

      // STEP 2: Register file with DuckDB
      console.log(
        `📝 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 2: Registering file...`
      );
      const registerStart = performance.now();
      await Duck.register_files([geoFile]);
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] File registered in ${(performance.now() - registerStart).toFixed(2)}ms`
      );

      // STEP 3: Read GeoJSON with ST_Read (DuckDB does all the work!)
      console.log(
        `🔍 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 3: Calling read_geofile...`
      );
      const readStart = performance.now();
      const resultTableName = await Duck.read_geofile(geoFile, {
        tablename: tableName
      });
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Table created in ${(performance.now() - readStart).toFixed(2)}ms`
      );

      const actualTableName =
        typeof resultTableName === 'string' ? resultTableName : tableName;

      // STEP 4: Analyze table
      console.log(
        `📊 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 4: Analyzing table...`
      );
      const analyzeStart = performance.now();
      const columns = await Duck.analyse(actualTableName);
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Analyzed in ${(performance.now() - analyzeStart).toFixed(2)}ms - ${columns.length} columns`
      );

      // STEP 5: Get row count
      console.log(
        `🔢 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 5: Getting row count...`
      );
      const rowCountStart = performance.now();
      const rowCount = await this.getRowCount(actualTableName);
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:ST_Read] Row count: ${rowCount} (${(performance.now() - rowCountStart).toFixed(2)}ms)`
      );

      // STEP 6: Convert table to GeoParquet → Apache Arrow (preserves GeoArrow metadata)
      console.log(
        `🔄 [${new Date().toISOString()}] [DuckDB:ST_Read] STEP 6: Converting to GeoParquet + Arrow...`
      );
      const geoParquetStart = performance.now();
      const {
        arrowTableWithMetadata,
        geoArrowMetadata
      } = await this.createArrowTableWithMetadata(actualTableName);
      const geoParquetDuration = performance.now() - geoParquetStart;

      console.log(
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
        logger.warn('GeoArrow metadata missing after GeoParquet round-trip', LogCategory.DUCKDB, {
          tableName: actualTableName
        });
      } else {
        logger.success('GeoArrow metadata preserved', LogCategory.DUCKDB, {
          tableName: actualTableName,
          primaryColumn: geoArrowMetadata.primary_column,
          geometryTypes: geoArrowMetadata.columns[geoArrowMetadata.primary_column]?.geometry_types
        });
      }

      const totalTime = performance.now() - startTime;
      const oldTime = 25700; // Baseline from logs
      const speedup = (oldTime / totalTime).toFixed(1);

      console.log(
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
        arrowTableWithMetadata, // Store ArrowTable WITH GeoArrow metadata
        geoArrowMetadata: geoArrowMetadata ?? undefined          // Store parsed metadata for quick access
      };

      // Force reactivity by creating new Map reference
      this._state.datasets = new Map(this._state.datasets).set(dataset.id, dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = actualTableName;
      logger.info('DuckDB dataset registered (ST_Read)', LogCategory.DUCKDB, {
        datasetId: dataset.id,
        tableName: actualTableName,
        sourceFileId: dataset.sourceFileId,
        geometryMeta: dataset.geoArrowMetadata?.primary_column
      });

      console.log('[duckDBOrchestrator:ST_Read] Dataset added to reactive state', {
        datasetId: dataset.id,
        tableName: actualTableName,
        sourceFileId: dataset.sourceFileId,
        totalDatasetsCount: this._state.datasets.size
      });

      return dataset;
    } catch (error) {
      const errorDuration = performance.now() - startTime;
      console.error(
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

  /**
   * NEW: Optimized Arrow-based GeoJSON processing
   * Converts GeoJSON directly to Arrow table, bypassing JSON serialization
   */
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
      // STEP 1: Convert GeoJSON to Arrow table (eliminates JSON.stringify bottleneck)
      console.log(
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

      // STEP 2: Insert Arrow table directly into DuckDB (zero-copy)
      console.log(
        `[${new Date().toISOString()}] [DuckDB:processGeoJSON] Inserting Arrow table...`
      );
      const insertStart = performance.now();
      await insertArrowTableIntoDuckDB(arrowTable, tableName);
      const insertTime = performance.now() - insertStart;
      logger.debug('Arrow insertion complete', LogCategory.DUCKDB, {
        durationMs: insertTime.toFixed(2)
      });

      // STEP 3: Convert geometry column from JSON string to GEOMETRY type
      console.log(
        `🗺️  [${new Date().toISOString()}] [DuckDB:Arrow] STEP 3: Converting geometry column...`
      );
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      const geomStart = performance.now();
      console.log(
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
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Geometry converted in ${geomTime.toFixed(2)}ms`
      );
      logger.debug('Geometry conversion complete', LogCategory.DUCKDB, {
        durationMs: geomTime.toFixed(2)
      });

      // STEP 4: Add row ID sequence
      console.log(
        `🔢 [${new Date().toISOString()}] [DuckDB:Arrow] STEP 4: Adding row IDs...`
      );
      const rowIdStart = performance.now();
      console.log(
        `🔍 [${new Date().toISOString()}] [DuckDB:Arrow] Executing: CREATE SEQUENCE + ALTER TABLE...`
      );
      await Duck.query(`
        CREATE OR REPLACE SEQUENCE id_${tableName} START 1;
        ALTER TABLE ${tableName} ADD COLUMN __id INTEGER DEFAULT nextval('id_${tableName}');
      `);
      const rowIdTime = performance.now() - rowIdStart;
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Row IDs added in ${rowIdTime.toFixed(2)}ms`
      );

      // STEP 5: Analyze and create dataset
      console.log(
        `📊 [${new Date().toISOString()}] [DuckDB:Arrow] STEP 5: Analyzing table...`
      );
      const analyzeStart = performance.now();
      const columns = await Duck.analyse(tableName);
      const analyzeTime = performance.now() - analyzeStart;
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Analyzed in ${analyzeTime.toFixed(2)}ms - ${columns.length} columns`
      );

      console.log(
        `🔢 [${new Date().toISOString()}] [DuckDB:Arrow] Getting row count...`
      );
      const rowCountStart = performance.now();
      const rowCount = await this.getRowCount(tableName);
      const rowCountTime = performance.now() - rowCountStart;
      console.log(
        `✅ [${new Date().toISOString()}] [DuckDB:Arrow] Row count: ${rowCount} (${rowCountTime.toFixed(2)}ms)`
      );

      const arrowMaterializationStart = performance.now();
      const {
        arrowTableWithMetadata,
        geoArrowMetadata
      } = await this.createArrowTableWithMetadata(tableName);
      logger.debug('GeoParquet materialization complete (Arrow pipeline)', LogCategory.DUCKDB, {
        tableName,
        durationMs: (performance.now() - arrowMaterializationStart).toFixed(2),
        hasMetadata: !!geoArrowMetadata
      });

      const totalTime = performance.now() - startTime;
      const oldTime = 25700; // Baseline from logs
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

      // Force reactivity by creating new Map reference
      this._state.datasets = new Map(this._state.datasets).set(dataset.id, dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;

      console.log('[duckDBOrchestrator:Arrow] Dataset added to reactive state', {
        datasetId: dataset.id,
        tableName,
        sourceFileId: dataset.sourceFileId,
        totalDatasetsCount: this._state.datasets.size
      });

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

  /**
   * LEGACY: Original JSON-based GeoJSON processing (kept as fallback)
   * Uses JSON.stringify which is slow for large files
   */
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
    const {
      arrowTableWithMetadata,
      geoArrowMetadata
    } = await this.createArrowTableWithMetadata(tableName);
    logger.debug('GeoParquet materialization complete (legacy pipeline)', LogCategory.DUCKDB, {
      tableName,
      durationMs: (performance.now() - legacyArrowStart).toFixed(2),
      hasMetadata: !!geoArrowMetadata
    });

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
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    // Force reactivity by creating new Map reference
    this._state.datasets = new Map(this._state.datasets).set(dataset.id, dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = tableName;
    logger.info('DuckDB dataset registered (legacy pipeline)', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName,
      sourceFileId: dataset.sourceFileId,
      columnCount: columns.length
    });

    console.log('[duckDBOrchestrator:Legacy] Dataset added to reactive state', {
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
      if (options?.orderBy || options?.limit || options?.offset) {
        let query = `SELECT * FROM ${tableName}`;

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
      } else {
        const data = await Duck.get_data(tableName, { geometry: false });
        logger.debug('Data retrieved', LogCategory.DUCKDB, {
          tableName,
          hasData: !!data,
          numRows: data?.numRows
        });
        return data;
      }
    } catch (_error) {
      logger.error('Error getting table data', LogCategory.DUCKDB, _error);
      return { numRows: 0, get: () => ({}), toArray: () => [] };
    }
  }

  async getRowCount(tableName: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      return await Duck.get_row_count(tableName);
    } catch (_error) {
      logger.error('Error getting row count', LogCategory.DUCKDB, _error);
      const result = (await Duck.query(
        `SELECT COUNT(*) as count FROM ${tableName}`
      )) as ArrowTableLike;
      if (result && result.get) {
        const row = result.get(0) as Record<string, unknown>;
        return Number(row.count);
      } else if (result && result.numRows === 1) {
        const row = result.toArray()[0] as Record<string, unknown>;
        return Number(row.count);
      }
      return 0;
    }
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

  async getFullAnalysis(tableName: string): Promise<AnalysisResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    return await Duck.analyse(tableName);
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

  async runQuery(query: string): Promise<ArrowTableLike> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');
    return Duck.query(query) as Promise<ArrowTableLike>;
  }

  /**
   * Convert a DuckDB table into an Arrow table that preserves GeoArrow metadata.
   * Uses the GeoParquet export + @geoarrow/geoparquet-wasm round-trip.
   */
  private async createArrowTableWithMetadata(
    tableName: string
  ): Promise<{ arrowTableWithMetadata: Table; geoArrowMetadata: GeoArrowMetadata | null }> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    const exportStart = performance.now();
    const geoparquetBuffer = await Duck.copy_to_geoparquet_as_buffer(tableName);
    logger.debug('GeoParquet buffer ready', LogCategory.DUCKDB, {
      tableName,
      bufferSize: geoparquetBuffer.byteLength
    });

    const arrowTableWithMetadata = await geoParquetReader.readGeoParquet(geoparquetBuffer);
    const geoArrowMetadata = geoParquetReader.extractMetadata(arrowTableWithMetadata);

    logger.debug('GeoParquet converted to Arrow with metadata', LogCategory.DUCKDB, {
      tableName,
      durationMs: (performance.now() - exportStart).toFixed(2),
      hasMetadata: !!geoArrowMetadata,
      metadataKeys: arrowTableWithMetadata.schema?.metadata
        ? Array.from(arrowTableWithMetadata.schema.metadata.keys())
        : []
    });

    return { arrowTableWithMetadata, geoArrowMetadata };
  }

  /**
   * Get Arrow table with GeoArrow metadata
   * CRITICAL: Returns cached table WITH metadata, not DuckDB query result
   */
  async getArrowTable(tableName: string): Promise<Table> {
    logger.debug('Getting Arrow table with metadata', LogCategory.DUCKDB, { tableName });

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      // CRITICAL: Return cached ArrowTable WITH metadata
      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName && dataset.arrowTableWithMetadata) {
          logger.debug('Arrow table WITH metadata retrieved from cache', LogCategory.DUCKDB, {
            tableName,
            numRows: dataset.arrowTableWithMetadata.numRows,
            hasMetadata: !!dataset.geoArrowMetadata,
            primaryColumn: dataset.geoArrowMetadata?.primary_column,
            metadataKeys: dataset.arrowTableWithMetadata.schema?.metadata
              ? Array.from(dataset.arrowTableWithMetadata.schema.metadata.keys())
              : []
          });
          return dataset.arrowTableWithMetadata;
        }
      }

      // Fallback: If not in cache, query table directly
      logger.warn('ArrowTable not in cache, materializing via GeoParquet...', LogCategory.DUCKDB, {
        tableName
      });

      const {
        arrowTableWithMetadata,
        geoArrowMetadata
      } = await this.createArrowTableWithMetadata(tableName);

      // Update cache with metadata-preserving table
      for (const dataset of this._state.datasets.values()) {
        if (dataset.tableName === tableName) {
          dataset.arrowTableWithMetadata = arrowTableWithMetadata;
          dataset.geoArrowMetadata = geoArrowMetadata || undefined;
          logger.success('Cache updated with metadata-preserving Arrow table', LogCategory.DUCKDB, {
            tableName,
            hasMetadata: !!geoArrowMetadata
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

  getDataset(id: string): DuckDBDataset | undefined {
    this._datasetsVersion;
    return this._state.datasets.get(id);
  }

  getDatasetByTable(tableName: string): DuckDBDataset | undefined {
    this._datasetsVersion;
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
    this._datasetsVersion;
    for (const dataset of this._state.datasets.values()) {
      if (dataset.sourceFileId === sourceFileId) {
        logger.debug('DuckDB dataset found for sourceFileId', LogCategory.DUCKDB, {
          sourceFileId,
          datasetId: dataset.id,
          tableName: dataset.tableName
        });
        return dataset;
      }
    }
    logger.warn('No DuckDB dataset found for sourceFileId', LogCategory.DUCKDB, {
      sourceFileId,
      knownSourceFileIds: Array.from(this._state.datasets.values()).map(
        (d) => d.sourceFileId
      )
    });
    return undefined;
  }

  getAllDatasets(): DuckDBDataset[] {
    this._datasetsVersion;
    return Array.from(this._state.datasets.values());
  }

  getCurrentTable(): string | null {
    return this._state.currentTableName;
  }

  setCurrentTable(tableName: string): void {
    this._state.currentTableName = tableName;
  }

  async dropTable(tableName: string): Promise<void> {
    console.log('[duckDBOrchestrator:dropTable] START', {
      tableName,
      initialized: this.initialized,
      currentDatasetsCount: this._state.datasets.size,
      allTableNames: Array.from(this._state.datasets.values()).map(d => d.tableName)
    });

    if (!this.initialized) {
      console.log('[duckDBOrchestrator:dropTable] Not initialized - EARLY RETURN');
      return;
    }

    try {
      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      console.log('[duckDBOrchestrator:dropTable] Executing DROP TABLE query');
      await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);
      console.log('[duckDBOrchestrator:dropTable] DROP TABLE query complete');

      // Find and remove dataset, ensuring reactivity
      let idToDelete: string | undefined;
      for (const [id, dataset] of this._state.datasets.entries()) {
        console.log('[duckDBOrchestrator:dropTable] Checking dataset', {
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

      console.log('[duckDBOrchestrator:dropTable] Search complete', {
        foundId: idToDelete,
        willDelete: !!idToDelete
      });

      if (idToDelete) {
        const newMap = new Map(this._state.datasets);
        newMap.delete(idToDelete);
        this._state.datasets = newMap;
        this.bumpDatasetsVersion();

        console.log('[duckDBOrchestrator:dropTable] Dataset removed from reactive state', {
          datasetId: idToDelete,
          tableName,
          totalDatasetsCount: this._state.datasets.size
        });
      } else {
        console.warn('[duckDBOrchestrator:dropTable] No dataset found with tableName!', {
          tableName,
          allDatasets: Array.from(this._state.datasets.values()).map(d => ({
            id: d.id,
            tableName: d.tableName,
            sourceFileId: d.sourceFileId
          }))
        });
      }

      if (this._state.currentTableName === tableName) {
        this._state.currentTableName = null;
      }
    } catch (error) {
      console.error('[duckDBOrchestrator:dropTable] ERROR', error);
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

    // Force reactivity by creating new Map
    this._state.datasets = new Map();
    this.bumpDatasetsVersion();
    this._state.currentTableName = null;

    console.log('[duckDBOrchestrator] All datasets cleared from reactive state');
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
    } catch (_error) {
      logger.error('Error loading data', LogCategory.DUCKDB, _error);
      data = [];
    }

    const userColumns = duckDataset.columns.filter(
      (col) => !col.name.startsWith('__')
    );

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
        geoColumns: [],
        hasGeoData: false,
        rowCount: duckDataset.rowCount,
        warnings: []
      },
      createdAt: duckDataset.metadata.processedAt,
      fileSize: 0,
      metadata: {
        processedAt: duckDataset.metadata.processedAt,
        transformations: []
      }
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
    } catch (_error) {
      logger.error(
        'Failed to join data with basemap',
        LogCategory.DUCKDB,
        _error
      );
      throw _error;
    }
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
    } catch (_error) {
      logger.error('Failed to apply corrections', LogCategory.DUCKDB, _error);
      throw _error;
    }
  }
}

export const duckDBOrchestrator = new DuckDBOrchestratorService();
