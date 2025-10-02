import { Duck, initDuckDB } from './duckdb/duckdb';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import type { ProcessedDataset } from '../utils/data-pipeline.utils';
import { showError } from '../utils/notification.utils.svelte';
import { logger, LogCategory } from '../utils/logger';

export interface DuckDBDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: any[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
}

class DuckDBOrchestratorService {
  private initialized = false;
  private datasets = new Map<string, DuckDBDataset>();
  private currentTableName: string | null = null;

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

  async processFile(file: UploadedFile): Promise<DuckDBDataset | null> {
    logger.debug('Processing file', LogCategory.DUCKDB, {
      name: file.name,
      status: file.status,
      hasParsedData: !!file.parsedData,
      parsedDataSample: file.parsedData?.[0]
    });

    if (!this.initialized) {
      logger.info(
        'DuckDB not initialized, initializing...',
        LogCategory.DUCKDB
      );
      await this.initialize();
    }

    if (!file.parsedData || file.status !== 'complete') {
      logger.debug('Returning null - file not ready', LogCategory.DUCKDB, {
        hasParsedData: !!file.parsedData,
        status: file.status
      });
      return null;
    }

    try {
      const tableName = this.generateTableName(file.name);

      if (file.fileType === FileType.CSV) {
        return await this.processCSV(file, tableName);
      } else if (file.fileType === FileType.GEOJSON) {
        return await this.processGeoJSON(file, tableName);
      }

      return null;
    } catch (error) {
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
    logger.debug('Processing CSV file', LogCategory.DUCKDB, {
      name: file.name,
      parsedDataLength: file.parsedData?.length,
      firstRow: file.parsedData?.[0]
    });

    const csvData = this.convertToCSV(file.parsedData);
    logger.debug('CSV data prepared', LogCategory.DUCKDB, {
      length: csvData.length,
      preview: csvData.substring(0, 200)
    });

    const blob = new Blob([csvData], { type: 'text/csv' });
    const duckFile = new File([blob], file.name, { type: 'text/csv' });

    if (!Duck) throw new Error('DuckDB not initialized');

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

    this.datasets.set(dataset.id, dataset);
    this.currentTableName = finalTableName;

    logger.info('Dataset created', LogCategory.DUCKDB, {
      tableName: finalTableName,
      columns: dataset.columns.length,
      rows: dataset.rowCount,
      columnNames: dataset.columns.map((c) => c.name)
    });

    return dataset;
  }

  private async processGeoJSON(
    file: UploadedFile,
    tableName: string
  ): Promise<DuckDBDataset> {
    logger.debug('Processing GeoJSON file', LogCategory.DUCKDB, {
      name: file.name
    });

    const geoJsonData = JSON.stringify(file.parsedData);

    const blob = new Blob([geoJsonData], { type: 'application/json' });
    const duckFile = new File([blob], file.name, { type: 'application/json' });

    if (!Duck) throw new Error('DuckDB not initialized');
    await Duck.register_files([duckFile]);
    await Duck.read_geofile(duckFile, { tablename: tableName });

    const columns = await Duck.analyse(tableName);
    const rowCount = await this.getRowCount(tableName);

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
      }
    };

    this.datasets.set(dataset.id, dataset);
    this.currentTableName = tableName;

    logger.info('GeoJSON dataset created', LogCategory.DUCKDB, {
      tableName,
      columns: dataset.columns.length,
      rows: dataset.rowCount
    });

    return dataset;
  }

  private convertToCSV(data: any[]): string {
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
  ): Promise<any> {
    logger.debug('Getting data for table', LogCategory.DUCKDB, { tableName });

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

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
        return await Duck.query(query);
      } else {
        const data = await Duck.get_data(tableName, { geometry: false });
        logger.debug('Data retrieved', LogCategory.DUCKDB, {
          tableName,
          hasData: !!data,
          numRows: data?.numRows
        });
        return data;
      }
    } catch (error) {
      logger.error('Error getting table data', LogCategory.DUCKDB, error);
      return { numRows: 0, get: () => ({}) };
    }
  }

  async getRowCount(tableName: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

    try {
      return await Duck.get_row_count(tableName);
    } catch (error) {
      logger.error('Error getting row count', LogCategory.DUCKDB, error);
      const result: any = await Duck.query(
        `SELECT COUNT(*) as count FROM ${tableName}`
      );
      if (result && result.get) {
        return result.get(0).count;
      } else if (result && result.numRows === 1) {
        return Number(result.toArray()[0].count);
      }
      return 0;
    }
  }

  async analyzeTable(tableName: string): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

    const result: any = await Duck.query(`
      SELECT
        column_name as name,
        data_type as type
      FROM duckdb_columns()
      WHERE table_name = '${tableName}'
    `);

    const columns = [];
    for (let i = 0; i < result.numRows; i++) {
      columns.push(result.get(i));
    }
    return columns;
  }

  async getFullAnalysis(tableName: string): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

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

    if (!Duck) throw new Error('DuckDB not initialized');

    await Duck.query(
      `ALTER TABLE ${tableName} RENAME COLUMN "${oldName}" TO "${newName}"`
    );
  }

  async changeColumnType(
    tableName: string,
    columnName: string,
    newType: string
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

    await Duck.query(
      `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" SET DATA TYPE ${newType}`
    );
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

    await Duck.query(`ALTER TABLE ${tableName} DROP COLUMN "${columnName}"`);
  }

  async runQuery(query: string): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');
    return Duck.query(query);
  }

  getDataset(id: string): DuckDBDataset | undefined {
    return this.datasets.get(id);
  }

  getDatasetByTable(tableName: string): DuckDBDataset | undefined {
    for (const dataset of this.datasets.values()) {
      if (dataset.tableName === tableName) {
        return dataset;
      }
    }
    return undefined;
  }

  getAllDatasets(): DuckDBDataset[] {
    return Array.from(this.datasets.values());
  }

  getCurrentTable(): string | null {
    return this.currentTableName;
  }

  setCurrentTable(tableName: string): void {
    this.currentTableName = tableName;
  }

  async dropTable(tableName: string): Promise<void> {
    if (!this.initialized) return;

    try {
      if (!Duck) throw new Error('DuckDB not initialized');
      await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);

      for (const [id, dataset] of this.datasets.entries()) {
        if (dataset.tableName === tableName) {
          this.datasets.delete(id);
          break;
        }
      }

      if (this.currentTableName === tableName) {
        this.currentTableName = null;
      }
    } catch (error) {}
  }

  async clear(): Promise<void> {
    for (const dataset of this.datasets.values()) {
      await this.dropTable(dataset.tableName);
    }

    this.datasets.clear();
    this.currentTableName = null;
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

    let data: any[] = [];
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
          const cleanRow: any = {};
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
      (col: any) => !col.name.startsWith('__')
    );

    const processedDataset = {
      id: duckDataset.id,
      name: duckDataset.name,
      sourceFileId: duckDataset.sourceFileId,
      columns: userColumns.map((col: any) => ({
        name: col.name,
        type: this.mapDuckDBType(col.type_simple || col.type || col.type_js),
        nullable: (col.nulls || 0) > 0,
        unique: col.unique || false,
        min: col.min,
        max: col.max,
        uniqueValues: col.unique ? new Set() : undefined,
        sampleValues: []
      })),
      rowCount: duckDataset.rowCount,
      data: data,
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

    const typeMap: Record<string, any> = {
      numeric: 'number',
      text: 'string',
      string: 'string',
      date: 'date',
      boolean: 'boolean',
      geometry: 'geometry'
    };
    return typeMap[duckType.toLowerCase()] || 'string';
  }
}

export const duckDBOrchestrator = new DuckDBOrchestratorService();
