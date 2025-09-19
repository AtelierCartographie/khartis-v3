import { Duck, initDuckDB } from './duckdb/duckdb';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import type { ProcessedDataset } from '../utils/data-pipeline.utils';
import { showError, showInfo } from '../utils/notification.utils.svelte';

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
      console.log('[DuckDBOrchestrator] DuckDB initialized successfully');
    } catch (error) {
      console.error('Failed to initialize DuckDB:', error);
      showError('DuckDB initialization failed', 'Please refresh the page');
      throw error;
    }
  }

  async processFile(file: UploadedFile): Promise<DuckDBDataset | null> {
    console.log('[DuckDBOrchestrator.processFile] Starting with file:', file.name);
    console.log('[DuckDBOrchestrator.processFile] File status:', file.status);
    console.log('[DuckDBOrchestrator.processFile] Has parsedData?', !!file.parsedData);
    console.log('[DuckDBOrchestrator.processFile] ParsedData sample:', file.parsedData?.[0]);

    if (!this.initialized) {
      console.log('[DuckDBOrchestrator.processFile] Not initialized, initializing...');
      await this.initialize();
    }

    if (!file.parsedData || file.status !== 'complete') {
      console.log('[DuckDBOrchestrator.processFile] Returning null - parsedData:', !!file.parsedData, 'status:', file.status);
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
      console.error('[DuckDBOrchestrator.processFile] Error:', error);
      showError('Failed to process file', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  private async processCSV(file: UploadedFile, tableName: string): Promise<DuckDBDataset> {
    console.log('[DuckDBOrchestrator.processCSV] Processing CSV file:', file.name);
    console.log('[DuckDBOrchestrator.processCSV] ParsedData length:', file.parsedData?.length);
    console.log('[DuckDBOrchestrator.processCSV] First row:', file.parsedData?.[0]);

    // Convert parsed data to CSV string for DuckDB
    const csvData = this.convertToCSV(file.parsedData);
    console.log('[DuckDBOrchestrator.processCSV] CSV data length:', csvData.length);
    console.log('[DuckDBOrchestrator.processCSV] CSV preview:', csvData.substring(0, 200));

    // Create a file object for DuckDB
    const blob = new Blob([csvData], { type: 'text/csv' });
    const duckFile = new File([blob], file.name, { type: 'text/csv' });

    // Register and read the file in DuckDB
    if (!Duck) throw new Error('DuckDB not initialized');

    console.log('[DuckDBOrchestrator.processCSV] Registering file with DuckDB');
    await Duck.register_files([duckFile]);

    console.log('[DuckDBOrchestrator.processCSV] Reading tabular data into table:', tableName);
    const actualTableName = await Duck.read_tabular(duckFile, { tablename: tableName });
    console.log('[DuckDBOrchestrator.processCSV] Table created with name:', actualTableName);

    // Use the actual table name returned by DuckDB
    const finalTableName = actualTableName || tableName;

    // Analyze the table
    console.log('[DuckDBOrchestrator.processCSV] Analyzing table:', finalTableName);
    const columns = await Duck.analyse(finalTableName);
    console.log('[DuckDBOrchestrator.processCSV] Analysis complete, columns:', columns.length);
    console.log('[DuckDBOrchestrator.processCSV] Columns sample:', columns.slice(0, 2));

    const rowCount = await Duck.get_row_count(finalTableName);
    console.log('[DuckDBOrchestrator.processCSV] Row count:', rowCount);

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

    console.log('[DuckDBOrchestrator.processCSV] Dataset created:', {
      tableName: finalTableName,
      columns: dataset.columns.length,
      rows: dataset.rowCount,
      columnNames: dataset.columns.map(c => c.name)
    });

    return dataset;
  }

  private async processGeoJSON(file: UploadedFile, tableName: string): Promise<DuckDBDataset> {
    console.log('[DuckDBOrchestrator.processGeoJSON] Processing GeoJSON file:', file.name);

    // Convert to GeoJSON string
    const geoJsonData = JSON.stringify(file.parsedData);

    // Create a file object for DuckDB
    const blob = new Blob([geoJsonData], { type: 'application/json' });
    const duckFile = new File([blob], file.name, { type: 'application/json' });

    // Register and read the file in DuckDB
    if (!Duck) throw new Error('DuckDB not initialized');
    await Duck.register_files([duckFile]);
    await Duck.read_geofile(duckFile, { tablename: tableName });

    // Analyze the table
    const columns = await Duck.analyse(tableName);
    const rowCount = await Duck.get_row_count(tableName);

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

    console.log('[DuckDBOrchestrator.processGeoJSON] Dataset created:', {
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

    // Add headers
    csvRows.push(headers.join(','));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
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
    // Remove extension and special characters
    let name = filename.replace(/\.[^/.]+$/, '');
    name = name.replace(/[^a-zA-Z0-9_]/g, '_');

    // Ensure it starts with a letter
    if (!/^[a-zA-Z]/.test(name)) {
      name = 't_' + name;
    }

    // Add timestamp to ensure uniqueness
    const timestamp = Date.now().toString(36);
    return `${name}_${timestamp}`;
  }

  async getTableData(tableName: string, options?: { limit?: number }): Promise<any> {
    console.log('[DuckDBOrchestrator.getTableData] Getting data for table:', tableName);

    if (!this.initialized) {
      await this.initialize();
    }

    if (!Duck) throw new Error('DuckDB not initialized');

    try {
      const data = await Duck.get_data(tableName, { geometry: false });
      console.log('[DuckDBOrchestrator.getTableData] Data retrieved:', {
        tableName,
        hasData: !!data,
        numRows: data?.numRows
      });
      return data;
    } catch (error) {
      console.error('[DuckDBOrchestrator.getTableData] Error:', error);
      // Return empty data if table doesn't exist yet
      return { numRows: 0, get: () => ({}) };
    }
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

      // Remove from datasets
      for (const [id, dataset] of this.datasets.entries()) {
        if (dataset.tableName === tableName) {
          this.datasets.delete(id);
          break;
        }
      }

      if (this.currentTableName === tableName) {
        this.currentTableName = null;
      }
    } catch (error) {
    }
  }

  async clear(): Promise<void> {
    // Drop all tables
    for (const dataset of this.datasets.values()) {
      await this.dropTable(dataset.tableName);
    }

    this.datasets.clear();
    this.currentTableName = null;
  }

  // Integration with existing ProcessedDataset format
  async convertToProcessedDataset(duckDataset: DuckDBDataset): Promise<ProcessedDataset> {
    console.log('[DuckDBOrchestrator.convertToProcessedDataset] Converting dataset:', duckDataset.name);
    console.log('[DuckDBOrchestrator.convertToProcessedDataset] Table name:', duckDataset.tableName);
    console.log('[DuckDBOrchestrator.convertToProcessedDataset] Duck columns:', duckDataset.columns.length);
    console.log('[DuckDBOrchestrator.convertToProcessedDataset] Sample column:', duckDataset.columns[0]);

    // Fetch actual data from DuckDB
    let data: any[] = [];
    try {
      const tableData = await this.getTableData(duckDataset.tableName);
      console.log('[DuckDBOrchestrator.convertToProcessedDataset] TableData received:', {
        hasData: !!tableData,
        numRows: tableData?.numRows
      });

      if (tableData && tableData.numRows > 0) {
        // Convert to array format for compatibility
        const limit = Math.min(1000, tableData.numRows); // Limit to prevent memory issues
        for (let i = 0; i < limit; i++) {
          const row = tableData.get(i);
          // Filter out system columns
          const cleanRow: any = {};
          for (const key in row) {
            if (!key.startsWith('__')) {
              cleanRow[key] = row[key];
            }
          }
          data.push(cleanRow);
        }
        console.log('[DuckDBOrchestrator.convertToProcessedDataset] Loaded rows:', data.length);
        console.log('[DuckDBOrchestrator.convertToProcessedDataset] First row:', data[0]);
      }
    } catch (error) {
      console.error('[DuckDBOrchestrator.convertToProcessedDataset] Error loading data:', error);
      // If we can't get data, use empty array
      data = [];
    }

    // Filter out system columns from DuckDB analysis
    const userColumns = duckDataset.columns.filter((col: any) => !col.name.startsWith('__'));

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

    console.log('[DuckDBOrchestrator.convertToProcessedDataset] Final dataset:', {
      name: processedDataset.name,
      columns: processedDataset.columns.length,
      columnNames: processedDataset.columns.map(c => c.name),
      rows: processedDataset.rowCount,
      dataLength: processedDataset.data.length,
      firstRowKeys: processedDataset.data[0] ? Object.keys(processedDataset.data[0]) : []
    });

    return processedDataset;
  }

  private mapDuckDBType(duckType: string): 'string' | 'number' | 'date' | 'boolean' | 'geometry' {
    if (!duckType) return 'string';

    const typeMap: Record<string, any> = {
      'numeric': 'number',
      'text': 'string',
      'string': 'string',
      'date': 'date',
      'boolean': 'boolean',
      'geometry': 'geometry'
    };
    return typeMap[duckType.toLowerCase()] || 'string';
  }
}

export const duckDBOrchestrator = new DuckDBOrchestratorService();