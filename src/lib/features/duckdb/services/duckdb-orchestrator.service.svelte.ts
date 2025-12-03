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
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { geoParquetReader } from '$lib/features/data-pipeline/adapters/readers/GeoParquetReader';
import type { GeoArrowMetadata } from '$lib/features/data-pipeline/models/geo-arrow-metadata';
import type { GeoColumnInfo } from '$lib/features/data-pipeline/types/AnalysisResult';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import { isGeoJSONFeatureCollection } from '$lib/types/data';
import {
  Field,
  Schema,
  Table,
  Type,
  Utf8,
  tableFromIPC
} from 'apache-arrow/Arrow';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
  convertTabularDataToArrow,
  insertArrowTableIntoDuckDB
} from './duckdb/arrow-converter';
import { Duck, initDuckDB } from './duckdb/duckdb';
import { join_macros } from './duckdb/join';
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
  arrowTableWithMetadata?: Table;
  geoArrowMetadata?: GeoArrowMetadata;
}

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
  private _suppressVersionBump = false;

  get datasetsVersion(): number {
    return this._datasetsVersion;
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

  private logDatasetReady(
    source: string,
    dataset: DuckDBDataset,
    startTime: number
  ): void {
    logger.success(`${source} dataset ready`, LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - startTime).toFixed(2)
    });
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
    options?: {
      geoDetection?: GeoDetectionResult;
    }
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
          {
            tableName,
            sourceFileId
          }
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

    try {
      const tableName = this.generateTableName(file.name);

      let result: DuckDBDataset | null = null;

      if (file.fileType === FileType.CSV) {
        result = await this.processCSV(file, tableName);
      } else if (file.fileType === FileType.GEOJSON) {
        result = await this.processGeoJSON(file, tableName);
      } else if (file.fileType === FileType.GEOPACKAGE) {
        result = await this.processGeoPackage(file, tableName);
      } else if (file.fileType === FileType.GEOPARQUET) {
        result = await this.processGeoParquet(file, tableName);
      } else if (file.fileType === FileType.SHAPEFILE) {
        result = await this.processShapefile(file, tableName);
      } else {
        logger.warn(
          'Unsupported file type for DuckDB ingestion',
          LogCategory.DUCKDB,
          {
            fileId: file.id,
            fileType: file.fileType
          }
        );
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
    const start = performance.now();
    logger.debug('Processing CSV file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });
    const { isTabularData } = await import('$lib/types/data');

    if (!file.parsedData || !isTabularData(file.parsedData)) {
      throw new ParseError(
        'Invalid or missing parsed data for CSV file',
        FileType.CSV,
        { fileId: file.id, fileName: file.name }
      );
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      const arrowTable = convertTabularDataToArrow(file.parsedData, {
        addRowId: true
      });
      await insertArrowTableIntoDuckDB(arrowTable, tableName);

      const columns = await Duck.analyse(tableName);
      const rowCount = await this.getRowCount(tableName);

      const dataset: DuckDBDataset = {
        id: crypto.randomUUID(),
        tableName: tableName,
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
      await this.prefetchArrowMetadata(dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;

      this.logDatasetReady('CSV (Arrow)', dataset, start);
      return dataset;
    } catch (error) {
      logger.warn(
        'Arrow ingestion failed, falling back to legacy CSV string',
        LogCategory.DUCKDB,
        error
      );
    }

    const csvData = this.convertToCSV(file.parsedData);

    const blob = new Blob([csvData], { type: 'text/csv' });
    const duckFile = new File([blob], file.name, { type: 'text/csv' });

    await Duck.register_files([duckFile]);

    const actualTableName = await Duck.read_tabular(duckFile, {
      tablename: tableName
    });

    const finalTableName = actualTableName || tableName;

    const columns = await Duck.analyse(finalTableName);

    const rowCount = await this.getRowCount(finalTableName);

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
    await this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = finalTableName;

    this.logDatasetReady('CSV', dataset, start);
    return dataset;
  }

  private async processGeoJSON(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const USE_ST_READ = import.meta.env.VITE_USE_ST_READ !== 'false';
    const USE_ARROW_PIPELINE =
      import.meta.env.VITE_USE_ARROW_GEOJSON === 'true';

    if (USE_ST_READ) {
      try {
        return await this.processGeoJSONWithSTRead(file, tableName);
      } catch (error) {
        logger.warn(
          'DuckDB ST_Read pipeline failed, falling back',
          LogCategory.DUCKDB,
          {
            fileId: file.id,
            error
          }
        );
      }
    }

    if (USE_ARROW_PIPELINE) {
      try {
        return await this.processGeoJSONWithArrow(file, tableName);
      } catch (error) {
        logger.warn(
          'Arrow pipeline failed, falling back to legacy GeoJSON loader',
          LogCategory.DUCKDB,
          {
            fileId: file.id,
            error
          }
        );
      }
    }

    return await this.processGeoJSONLegacy(file, tableName);
  }

  private async processGeoJSONWithSTRead(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const startTime = performance.now();
    logger.debug('Processing GeoJSON via ST_Read', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      let geoFile: File;
      if (file.content) {
        const blob = new Blob([file.content], { type: 'application/json' });
        geoFile = new File([blob], file.name, { type: 'application/json' });
      } else {
        const geoJsonData = JSON.stringify(file.parsedData);
        const blob = new Blob([geoJsonData], { type: 'application/json' });
        geoFile = new File([blob], file.name, { type: 'application/json' });
      }

      await Duck.register_files([geoFile]);

      const resultTableName = await Duck.read_geofile(geoFile, {
        tablename: tableName
      });

      const actualTableName =
        typeof resultTableName === 'string' ? resultTableName : tableName;

      const [columns, rowCount] = await Promise.all([
        Duck.analyse(actualTableName),
        this.getRowCount(actualTableName)
      ]);

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
        geoDetection: file.deepAnalysis?.geoDetection
      };

      this.updateDatasets((datasets) => {
        datasets.set(dataset.id, dataset);
      });

      await this.prefetchArrowMetadata(dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = actualTableName;

      this.logDatasetReady('GeoJSON ST_Read', dataset, startTime);
      return dataset;
    } catch (error) {
      const errorDuration = performance.now() - startTime;
      logger.error(
        `[DuckDB:ST_Read] FAILED after ${errorDuration.toFixed(2)}ms`,
        LogCategory.DUCKDB,
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
    const start = performance.now();
    logger.debug('Processing GeoPackage file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });
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
    await this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = actualTableName;

    this.logDatasetReady('GeoPackage', dataset, start);
    return dataset;
  }

  private async processGeoParquet(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const start = performance.now();
    logger.debug('Processing GeoParquet file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const buffer = await this.getArrayBufferFromUploadedFile(file);
    const arrowTable = await geoParquetReader.readGeoParquet(buffer);
    const geoMetadata = geoParquetReader.extractMetadata(arrowTable);

    await insertArrowTableIntoDuckDB(arrowTable, tableName);

    if (geoMetadata) {
      const geomColumn = geoMetadata.primary_column;
      try {
        await Duck.query(`
            CREATE OR REPLACE TABLE "${tableName}" AS
          SELECT * REPLACE (
            ST_GeomFromWKB("${geomColumn}")::GEOMETRY AS "${geomColumn}"
          )
            FROM "${tableName}"
          `);
      } catch (error) {
        logger.warn(
          'Failed to convert GeoParquet geometry column',
          LogCategory.DUCKDB,
          error
        );
      }
    }

    const safeSeqName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    await Duck.query(`
      CREATE OR REPLACE SEQUENCE "id_${safeSeqName}" START 1;
      ALTER TABLE "${tableName}" ADD COLUMN __id INTEGER DEFAULT nextval('id_${safeSeqName}');
    `);

    const [columns, rowCount] = await Promise.all([
      Duck.analyse(tableName),
      this.getRowCount(tableName)
    ]);

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
      geoArrowMetadata: geoMetadata ?? undefined
    };

    this.updateDatasets((datasets) => {
      datasets.set(dataset.id, dataset);
    });

    await this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = tableName;

    this.logDatasetReady('GeoParquet', dataset, start);
    return dataset;
  }

  private async processGeoJSONWithArrow(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const startTime = performance.now();
    logger.debug('Processing GeoJSON via Arrow pipeline', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });

    if (!file.parsedData || !isGeoJSONFeatureCollection(file.parsedData)) {
      throw new ParseError(
        'Invalid or missing parsed GeoJSON data',
        FileType.GEOJSON,
        { fileId: file.id, fileName: file.name }
      );
    }

    try {
      const arrowTable = convertGeoJSONToArrow(file.parsedData);

      await insertArrowTableIntoDuckDB(arrowTable, tableName);

      if (!Duck) throw new DuckDBError('DuckDB not initialized');

      await Duck.query(`
        CREATE OR REPLACE TABLE "${tableName}" AS
        SELECT
          * EXCLUDE (geom),
          ST_GeomFromGeoJSON(geom) as geom
        FROM "${tableName}"
      `);
      const safeSeqNameGeo = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
      await Duck.query(`
        CREATE OR REPLACE SEQUENCE "id_${safeSeqNameGeo}" START 1;
        ALTER TABLE "${tableName}" ADD COLUMN __id INTEGER DEFAULT nextval('id_${safeSeqNameGeo}');
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
        arrowTableWithMetadata,
        geoArrowMetadata: geoArrowMetadata ?? undefined
      };

      this.updateDatasets((datasets) => {
        datasets.set(dataset.id, dataset);
      });
      await this.prefetchArrowMetadata(dataset);
      this.bumpDatasetsVersion();
      this._state.currentTableName = tableName;

      this.logDatasetReady('GeoJSON Arrow', dataset, startTime);
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
    const start = performance.now();
    logger.debug('Processing GeoJSON via legacy pipeline', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });

    const geoJsonData = JSON.stringify(file.parsedData);

    const blob = new Blob([geoJsonData], { type: 'application/json' });
    const duckFile = new File([blob], file.name, { type: 'application/json' });

    if (!Duck) throw new DuckDBError('DuckDB not initialized');
    await Duck.register_files([duckFile]);
    await Duck.read_geofile(duckFile, { tablename: tableName });

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
    await this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = tableName;

    this.logDatasetReady('GeoJSON Legacy', dataset, start);
    return dataset;
  }

  getBasemapAttributesId(basemap: BasemapMetadata): string {
    return basemap.file.replace(/\.(parquet|geojson)$/i, '');
  }

  async computeJoinStats(
    datasetId: string,
    basemap: BasemapMetadata,
    geoColumn: string
  ): Promise<JoinQuality> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this._state.datasets.get(datasetId);
    if (!dataset) throw new Error('Dataset not found');

    await Duck.query(join_macros);

    const basemapId = this.getBasemapAttributesId(basemap);

    const tableCheck = (await Duck.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'basemap_attributes'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    if (!tableCheck || tableCheck.length === 0) {
      throw new Error(
        'basemap_attributes table not loaded. Ensure basemapService.loadAttributes() was called.'
      );
    }

    const joinTableView = `basemap_join_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const escapedBasemapId = escapeSqlString(basemapId);
    await Duck.query(`
      CREATE OR REPLACE VIEW "${joinTableView}" AS
      SELECT raw, id, variant, normalized, basemap, basemap_count
      FROM basemap_attributes
      WHERE basemap = '${escapedBasemapId}'
    `);

    const escapedTableName = escapeSqlString(dataset.tableName);
    const escapedGeoColumn = escapeSqlString(geoColumn);
    const result = (await Duck.query(
      `SELECT * FROM analyze_join_quality('${escapedTableName}', '${escapedGeoColumn}', '${joinTableView}')`,
      { format: 'array' }
    )) as Array<{
      original_name: string;
      status: 'matched' | 'check' | 'ambiguous' | 'not_found';
      candidates: { id: string; name: string; score: number; type: string }[];
      best_score: number;
    }>;

    const entities = result.map((r) => ({
      dataValue: r.original_name,
      status: (r.status === 'ambiguous'
        ? 'to_verify'
        : r.status === 'check'
          ? 'to_verify'
          : r.status === 'not_found'
            ? 'unrecognized'
            : 'joined') as
        | 'joined'
        | 'to_verify'
        | 'duplicate'
        | 'unrecognized',
      matches: r.candidates?.map((c) => c.name) || [],
      matchCount: r.candidates?.length || 0,
      basemapValue: r.status === 'matched' ? r.candidates[0].name : undefined
    }));

    return {
      joinedCount: entities.filter((e) => e.status === 'joined').length,
      toVerifyCount: entities.filter((e) => e.status === 'to_verify').length,
      duplicateCount: entities.filter((e) => e.status === 'duplicate').length,
      unrecognizedCount: entities.filter((e) => e.status === 'unrecognized')
        .length,
      entities,
      totalEntities: entities.length
    };
  }

  async applyJoinCorrections(
    datasetId: string,
    geoColumn: string,
    corrections: Record<string, string>
  ): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const dataset = this._state.datasets.get(datasetId);
    if (!dataset) throw new Error('Dataset not found');

    const correctionsTable = `corrections_${crypto.randomUUID().replace(/-/g, '_')}`;

    const correctionEntries = Object.entries(corrections).map(
      ([original, corrected]) => ({
        original,
        corrected
      })
    );

    if (correctionEntries.length === 0) return;

    const json = JSON.stringify(correctionEntries);
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], 'corrections.json', {
      type: 'application/json'
    });

    await Duck.register_files([file]);
    await Duck.query(
      `CREATE TABLE "${correctionsTable}" AS SELECT * FROM read_json_auto('corrections.json')`
    );

    await Duck.query(`
      UPDATE "${dataset.tableName}"
      SET "${geoColumn}" = c.corrected
      FROM "${correctionsTable}" c
      WHERE "${geoColumn}" = c.original
    `);

    await Duck.query(`DROP TABLE "${correctionsTable}"`);

    const columns = await Duck.analyse(dataset.tableName);
    this.updateDatasets((d) => {
      const ds = d.get(datasetId);
      if (ds) ds.columns = columns;
    });
    this.bumpDatasetsVersion();
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
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    try {
      let query = `SELECT * FROM "${tableName}"`;
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

    const result = await Duck.describeColumns(tableName);
    return result;
  }

  async getFullAnalysis(
    tableName: string,
    force = false
  ): Promise<AnalysisResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const result = await Duck.analyse(tableName, { force });
    return result;
  }

  async renameColumn(
    tableName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await Duck.query(
      `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`
    );

    await Duck.analyse(tableName, { force: true });

    this.bumpDatasetsVersion();

    logger.info('Renamed DuckDB column', LogCategory.DUCKDB, {
      tableName,
      oldName,
      newName,
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  async changeColumnType(
    tableName: string,
    columnName: string,
    newType: string
  ): Promise<void> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await Duck.query(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DATA TYPE ${newType}`
    );

    await Duck.analyse(tableName, { force: true });

    logger.info('Changed DuckDB column type', LogCategory.DUCKDB, {
      tableName,
      columnName,
      newType,
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await Duck.query(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);

    await Duck.analyse(tableName, { force: true });

    logger.info('Dropped DuckDB column', LogCategory.DUCKDB, {
      tableName,
      columnName,
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  async dropRows(tableName: string, rowIds: number[]): Promise<void> {
    if (!rowIds.length) return;

    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    await Duck.drop_rows(tableName, rowIds);
    await Duck.analyse(tableName, { force: true });
    this.bumpDatasetsVersion();

    logger.info('Dropped rows from DuckDB table', LogCategory.DUCKDB, {
      tableName,
      rowCount: rowIds.length,
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  async refineColumn(
    tableName: string,
    columnName: string,
    operation: RefineOperation
  ): Promise<void> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const operations: Record<RefineOperation, string> = {
      [RefineOperation.UPPERCASE]: `UPDATE "${tableName}" SET "${columnName}" = UPPER("${columnName}")`,
      [RefineOperation.LOWERCASE]: `UPDATE "${tableName}" SET "${columnName}" = LOWER("${columnName}")`,
      [RefineOperation.TITLECASE]: `UPDATE "${tableName}" SET "${columnName}" = INITCAP("${columnName}")`,
      [RefineOperation.TRIM]: `UPDATE "${tableName}" SET "${columnName}" = TRIM("${columnName}")`,
      [RefineOperation.TRIM_ALL]: `UPDATE "${tableName}" SET "${columnName}" = REGEXP_REPLACE("${columnName}", '\\s+', ' ', 'g')`
    };

    await Duck.query(operations[operation]);

    await Duck.analyse(tableName, { force: true });

    logger.info('Refined DuckDB column', LogCategory.DUCKDB, {
      tableName,
      columnName,
      operation,
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  async replaceInColumn(
    tableName: string,
    columnName: string,
    searchValue: string,
    replaceValue: string
  ): Promise<number> {
    const start = performance.now();
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const escapedSearchValue = escapeSqlString(searchValue);
    const escapedReplaceValue = escapeSqlString(replaceValue);

    const countResult = (await Duck.query(
      `SELECT COUNT(*) as count FROM "${tableName}" WHERE "${columnName}"::TEXT LIKE '%${escapedSearchValue}%'`
    )) as ArrowTableLike;

    const countRow = countResult.get(0) as Record<string, unknown>;
    const count = Number(countRow?.count) || 0;

    if (count > 0) {
      logger.info('Replacing values in DuckDB column', LogCategory.DUCKDB, {
        tableName,
        columnName,
        count,
        searchValue,
        replaceValue
      });
      await Duck.query(
        `UPDATE "${tableName}" SET "${columnName}" = REPLACE("${columnName}"::TEXT, '${escapedSearchValue}', '${escapedReplaceValue}')`
      );

      await Duck.analyse(tableName, { force: true });
      logger.success('Column values replaced', LogCategory.DUCKDB, {
        tableName,
        columnName,
        count,
        durationMs: (performance.now() - start).toFixed(2)
      });
    }

    return count;
  }

  async addCalculatedColumn(
    tableName: string,
    columnName: string,
    expression: string
  ): Promise<void> {
    const start = performance.now();
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
    if (
      columns.some((col: AnalysisResult) => col.name === sanitizedColumnName)
    ) {
      throw new DuckDBError(
        `La colonne "${sanitizedColumnName}" existe déjà`,
        undefined,
        { tableName, columnName: sanitizedColumnName }
      );
    }

    await Duck.query(
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT *, (${expression}) AS "${sanitizedColumnName}" FROM "${tableName}"`
    );

    const updatedColumns = await Duck.analyse(tableName, { force: true });

    const dataset = Array.from(this._state.datasets.values()).find(
      (d) => d.tableName === tableName
    );
    if (dataset) {
      dataset.columns = updatedColumns;
    }

    this.bumpDatasetsVersion();
    logger.success('Calculated column added to DuckDB', LogCategory.DUCKDB, {
      tableName,
      columnName: sanitizedColumnName,
      durationMs: (performance.now() - start).toFixed(2)
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

    const result = (await Duck.query(
      `SELECT (${expression}) as result FROM "${tableName}" LIMIT 1`
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

  private async ensureFileObject(
    file: UploadedFile,
    fallbackMime: string
  ): Promise<File> {
    if (file.originalFile) {
      return file.originalFile;
    }

    if (file.content instanceof ArrayBuffer) {
      return new File([file.content], file.name, { type: fallbackMime });
    }

    if (typeof file.content === 'string') {
      return new File([file.content], file.name, { type: fallbackMime });
    }

    throw new ParseError('Missing original file content', file.fileType, {
      fileId: file.id,
      fileName: file.name
    });
  }

  private async addGeoArrowMetadataFromDuckDB(
    table: Table,
    tableName: string
  ): Promise<Table> {
    if (!Duck) {
      return table;
    }

    try {
      const dataset = Array.from(this._state.datasets.values()).find(
        (d) => d.tableName === tableName
      );

      let geomColumn: { column_name: string; column_type: string } | undefined;
      let geometryType: string;

      if (dataset?.geoArrowMetadata) {
        const primaryColumn = dataset.geoArrowMetadata.primary_column;
        geomColumn = { column_name: primaryColumn, column_type: 'GEOMETRY' };
        const columnMeta = dataset.geoArrowMetadata.columns[primaryColumn];
        geometryType = columnMeta?.geometry_types?.[0] || 'GEOMETRY';
        if (!geometryType.startsWith('ST_')) {
          geometryType = 'ST_' + geometryType;
        }

        logger.debug('Using cached geometry metadata', LogCategory.DUCKDB, {
          tableName,
          geometryType
        });
      } else {
        const tableInfo = await Duck.describe_table(tableName);
        const columns = tableInfo.name.map((name: string, index: number) => ({
          column_name: name,
          column_type: tableInfo.type[index]
        }));

        geomColumn = columns.find(
          (c: { column_type: string }) => c.column_type === 'GEOMETRY'
        );

        if (!geomColumn) {
          logger.warn(
            'No geometry column found in DuckDB table',
            LogCategory.DUCKDB,
            { tableName }
          );
          return table;
        }

        const geomTypeResult = (await Duck.query(
          `SELECT DISTINCT ST_GeometryType("${geomColumn.column_name}") as geom_type
           FROM "${tableName}"
           WHERE "${geomColumn.column_name}" IS NOT NULL`,
          { format: 'array' as never }
        )) as Array<{ geom_type: string }>;

        const types = geomTypeResult.map((r) => r.geom_type);

        if (types.length === 0) {
          geometryType = 'GEOMETRY';
        } else if (types.length === 1) {
          geometryType = types[0];
        } else {
          const hasPoint = types.some((t) => t === 'ST_Point' || t === 'POINT');
          const hasMultiPoint = types.some(
            (t) => t === 'ST_MultiPoint' || t === 'MULTIPOINT'
          );
          const hasLineString = types.some(
            (t) => t === 'ST_LineString' || t === 'LINESTRING'
          );
          const hasMultiLineString = types.some(
            (t) => t === 'ST_MultiLineString' || t === 'MULTILINESTRING'
          );
          const hasPolygon = types.some(
            (t) => t === 'ST_Polygon' || t === 'POLYGON'
          );
          const hasMultiPolygon = types.some(
            (t) => t === 'ST_MultiPolygon' || t === 'MULTIPOLYGON'
          );

          if (hasPolygon || hasMultiPolygon) {
            geometryType = 'MULTIPOLYGON';
          } else if (hasLineString || hasMultiLineString) {
            geometryType = 'MULTILINESTRING';
          } else if (hasPoint || hasMultiPoint) {
            geometryType = 'MULTIPOINT';
          } else {
            geometryType = 'GEOMETRY';
          }

          logger.info(
            'Mixed geometry types detected, normalized to Multi* variant',
            LogCategory.DUCKDB,
            { tableName, detectedTypes: types, normalizedType: geometryType }
          );
        }
      }

      const geomColumnIndex = table.schema.fields.findIndex(
        (f) => f.name === geomColumn.column_name
      );
      const isGeoJsonString =
        geomColumnIndex !== -1 &&
        table.schema.fields[geomColumnIndex].typeId === Type.Utf8;

      const encoding = isGeoJsonString ? 'geojson' : 'ogc.wkb';

      const geoMetadata = {
        version: '1.0.0',
        primary_column: geomColumn.column_name,
        columns: {
          [geomColumn.column_name]: {
            encoding,
            geometry_types: [geometryType.replace('ST_', '')],
            crs: {
              type: 'name',
              properties: {
                name: 'EPSG:4326'
              }
            },
            bbox: [-180, -90, 180, 90]
          }
        }
      };

      let normalizedTable: Table;

      if (isGeoJsonString) {
        normalizedTable = table;
        logger.debug(
          'Geometry column is GeoJSON string, skipping WKB/GeoArrow conversion',
          LogCategory.DUCKDB,
          { tableName, columnName: geomColumn.column_name }
        );
      } else {
        normalizedTable = await this.ensureGeometryColumnIsWkb(
          table,
          tableName,
          geomColumn.column_name
        );
        logger.debug(
          'Geometry column is WKB binary, keeping as ogc.wkb encoding',
          LogCategory.DUCKDB,
          { tableName, columnName: geomColumn.column_name }
        );
      }

      const schema = normalizedTable.schema;
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
        updatedMetadata.set('ARROW:extension:name', encoding);
        updatedMetadata.set(
          'ARROW:extension:metadata',
          JSON.stringify({
            geometry_type: geometryType.replace('ST_', ''),
            crs: 'EPSG:4326'
          })
        );
        const fieldMetadataMap = new Map<string, string>(updatedMetadata);
        return new Field(
          field.name,
          field.type,
          field.nullable,
          fieldMetadataMap
        );
      });

      const metadataMap = new Map<string, string>(newMetadata);

      const newSchema = new Schema(updatedFields, metadataMap);

      const tableWithMetadata = new Table(newSchema, normalizedTable.batches);

      logger.debug(
        'Added GeoArrow metadata to Arrow table',
        LogCategory.DUCKDB,
        {
          tableName,
          geometryType,
          encoding,
          hasSchemaMetadata: !!tableWithMetadata.schema.metadata,
          geoFieldMetadata: updatedFields.find(
            (f) => f.name === geomColumn.column_name
          )?.metadata
        }
      );

      return tableWithMetadata;
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

    const arrowTable = await this.fetchArrowTableWithGeometry(tableName);
    const arrowTableWithMetadata = await this.addGeoArrowMetadataFromDuckDB(
      arrowTable,
      tableName
    );
    const geoArrowMetadata = geoParquetReader.extractMetadata(
      arrowTableWithMetadata
    );
    if (!geoArrowMetadata) {
      logger.warn(
        'GeoArrow metadata missing after conversion',
        LogCategory.DUCKDB,
        {
          tableName
        }
      );
    }
    return { arrowTableWithMetadata, geoArrowMetadata };
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
      break;
    }

    return this.fetchTableWithGeometryAsWkb(tableName, geometryColumn);
  }

  private async fetchTableWithGeometryAsWkb(
    tableName: string,
    geometryColumn: string
  ): Promise<Table> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    const buffer = (await Duck.query(
      `SELECT * REPLACE (
          ST_AsWKB("${geometryColumn}") AS "${geometryColumn}"
        )
        FROM "${tableName}"`,
      { format: 'arrow-ipc' as never }
    )) as ArrayBuffer | Uint8Array;

    const ipcBuffer =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return tableFromIPC(ipcBuffer);
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

    const tableInfo = await Duck.describe_table(tableName);
    const columns = tableInfo.name.map((name: string, index: number) => ({
      column_name: name,
      column_type: tableInfo.type[index]
    }));

    const geomColumn = columns.find(
      (c: { column_type: string }) => c.column_type === 'GEOMETRY'
    );

    let query: string;
    if (geomColumn) {
      query = `SELECT * EXCLUDE ("${geomColumn.column_name}"), ST_AsWKB("${geomColumn.column_name}") AS "${geomColumn.column_name}" FROM "${tableName}"`;
    } else {
      query = `SELECT * FROM "${tableName}"`;
    }

    const buffer = (await Duck.query(query, {
      format: 'arrow-ipc' as never
    })) as ArrayBuffer | Uint8Array;

    const ipcBuffer =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    return tableFromIPC(ipcBuffer);
  }

  async getArrowTableDirect(tableName: string): Promise<Table> {
    if (!this.initialized) {
      await this.initialize();
    }

    for (const dataset of this._state.datasets.values()) {
      if (dataset.tableName === tableName && dataset.arrowTableWithMetadata) {
        logger.debug(
          'Using cached Arrow table with metadata',
          LogCategory.DUCKDB,
          {
            tableName
          }
        );
        return dataset.arrowTableWithMetadata;
      }
    }

    const baseTable = await this.fetchArrowTableWithGeometry(tableName);
    const tableWithMetadata = await this.addGeoArrowMetadataFromDuckDB(
      baseTable,
      tableName
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
      return `__id IN (SELECT __id FROM "${tableName}" ORDER BY ${columnRef} ${direction} NULLS LAST LIMIT ${limit})`;
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

    return `'${escapeSqlString(trimmed)}'`;
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

  private async processShapefile(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    const start = performance.now();
    logger.debug('Processing Shapefile', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName
    });

    if (!Duck) throw new DuckDBError('DuckDB not initialized');

    const shpFile = await this.ensureFileObject(
      file,
      'application/x-shapefile'
    );

    const companionFiles =
      file.relatedFileObjects?.filter(
        (f) => f.name.toLowerCase() !== shpFile.name.toLowerCase()
      ) ?? [];

    logger.debug('Shapefile registration details', LogCategory.DUCKDB, {
      shpFileName: shpFile.name,
      shpFileSize: shpFile.size,
      relatedFiles: companionFiles.map((f) => ({
        name: f.name,
        size: f.size
      }))
    });

    const shapefileComponents = [shpFile, ...companionFiles];

    await Duck.register_files(shapefileComponents, { shapefile: true });

    if (companionFiles.length === 0) {
      logger.warn(
        'No companion files found for Shapefile - ingestion may fail',
        LogCategory.DUCKDB
      );
    } else {
      logger.debug(
        `Registered ${companionFiles.length} companion files for Shapefile`,
        LogCategory.DUCKDB
      );
    }

    const resultTableName = await Duck.read_geofile(shpFile, {
      tablename: tableName,
      shapefile: true
    });

    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : tableName;

    const [columns, rowCount] = await Promise.all([
      Duck.analyse(actualTableName),
      this.getRowCount(actualTableName)
    ]);

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
      geoDetection: file.deepAnalysis?.geoDetection
    };

    this.updateDatasets((datasets) => {
      datasets.set(dataset.id, dataset);
    });

    await this.prefetchArrowMetadata(dataset);
    this.bumpDatasetsVersion();
    this._state.currentTableName = actualTableName;

    this.logDatasetReady('Shapefile', dataset, start);
    return dataset;
  }

  async searchInTable(
    tableName: string,
    query: string,
    options: { threshold?: number; column?: string } = {}
  ): Promise<number[]> {
    await this.waitForInitialization();

    if (!Duck) {
      logger.warn('DuckDB not initialized for search', LogCategory.DUCKDB);
      return [];
    }

    return Duck.searchInTable(tableName, query, options);
  }
}

export const duckDBOrchestrator = new DuckDBOrchestratorService();
