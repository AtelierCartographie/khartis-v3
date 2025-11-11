import type {
  DatasetResult,
  EnrichedColumn
} from '../../domain/entities/dataset-result.entity';
import type { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import { ParserRegistry } from '../../infrastructure/parsers/parser.registry';
import { ValidationChain } from '../../infrastructure/validators/validation.chain';
import { HeuristicTypeInferrer } from '../../infrastructure/type-inference/heuristic-inferrer';
import { Duck, initDuckDB } from '$lib/features/commons/services/duckdb/duckdb';
import { ParserError } from '../../domain/interfaces/parser.interface';
import {
  fromDuckDBType,
  ColumnType
} from '../../domain/value-objects/column-type.vo';
import type { ColumnInfo } from '../../types/AnalysisResult';

/**
 * Data Pipeline Service - SINGLE ENTRY POINT for data processing
 *
 * This is a Facade that coordinates:
 * - File parsing (ParserRegistry)
 * - Validation (ValidationChain)
 * - Type inference (HeuristicTypeInferrer)
 * - Analytics (DuckDB)
 *
 * @example
 * ```typescript
 * import { dataPipeline } from '$lib/features/data';
 *
 * // Initialize once
 * await dataPipeline.initialize();
 *
 * // Process file
 * const result = await dataPipeline.processFile(file);
 * console.log(result.tableName); // DuckDB table
 * console.log(result.columns);   // Enriched columns
 * ```
 */
export class DataPipelineService {
  private parserRegistry: ParserRegistry;

  private validationChain: ValidationChain;

  private typeInferrer: HeuristicTypeInferrer;

  private initialized = false;

  constructor() {
    this.parserRegistry = new ParserRegistry();
    this.validationChain = new ValidationChain();
    this.typeInferrer = new HeuristicTypeInferrer();
  }

  /**
   * Initialize pipeline (loads DuckDB)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initDuckDB();
    this.initialized = true;
  }

  /**
   * Process UploadedFile (bridge for compatibility with existing code)
   *
   * @param uploadedFile - UploadedFile from old system
   * @param originalFile - Optional original File object to avoid re-parsing
   * @returns DatasetResult
   */
  async processUploadedFile(
    uploadedFile: {
      id: string;
      name: string;
      size: number;
      type: string;
      content?: string | ArrayBuffer;
    },
    originalFile?: File
  ): Promise<DatasetResult> {
    console.log('[DataPipeline:processUploadedFile] START', {
      hasOriginalFile: !!originalFile,
      uploadedFileSize: uploadedFile.size,
      originalFileSize: originalFile?.size,
      contentType: typeof uploadedFile.content
    });

    // If we have the original File, use it directly (avoids double-parsing)
    let file: File | undefined = originalFile;
    if (originalFile) {
      console.log('[DataPipeline:processUploadedFile] Using original File object');
    } else {
      console.log('[DataPipeline:processUploadedFile] Creating File from content');

      // SPECIAL CASE: If content is JSON (from old FileProcessor), skip dataPipeline
      // This happens when loading saved projects that were processed by the old system
      if (typeof uploadedFile.content === 'string') {
        try {
          const parsed = JSON.parse(uploadedFile.content);
          const keys = Object.keys(parsed);
          console.log('[DataPipeline:processUploadedFile] Parsed JSON:', {
            hasData: !!parsed.data,
            hasColumns: !!parsed.columns,
            hasParsedData: !!parsed.parsedData,
            keysCount: keys.length,
            firstKey: keys[0],
            firstKeyValue: keys[0] ? parsed[keys[0]] : undefined,
            isArray: Array.isArray(parsed)
          });

          // CASE 1: JSON with data and columns properties
          if (parsed && typeof parsed === 'object' && parsed.data && parsed.columns) {
            console.warn('[DataPipeline:processUploadedFile] Content is already processed JSON from old system. Converting to DatasetResult...');

            // Return a minimal DatasetResult using the old processed data
            // This avoids re-parsing JSON as CSV which causes errors
            return {
              id: uploadedFile.id,
              name: uploadedFile.name,
              sourceFileId: uploadedFile.id,
              tableName: `table_${uploadedFile.id.replace(/-/g, '_')}`,
              columns: parsed.columns || [],
              rowCount: parsed.data?.length || 0,
              metadata: {
                processedAt: new Date(),
                fileType: 'csv',
                parserUsed: 'Legacy',
                processingDuration: 0,
                transformations: []
              },
              format: 'csv',
              data: parsed.data || [],
              analysis: parsed.analysis || {
                columns: parsed.columns || [],
                geoColumns: [],
                hasGeoData: false,
                rowCount: parsed.data?.length || 0,
                warnings: []
              },
              createdAt: new Date(),
              fileSize: uploadedFile.size,
              originalData: {
                columns: parsed.columns || [],
                data: parsed.data || []
              }
            } as any;
          }

          // CASE 2: JSON with numeric keys (rows stored as "0": {...}, "1": {...})
          // This happens when old FileProcessor stored rows as object properties
          else if (
            keys.length > 0 &&
            !isNaN(Number(keys[0])) &&
            typeof parsed[keys[0]] === 'object'
          ) {
            console.warn('[DataPipeline:processUploadedFile] Detected JSON with numeric keys (rows as properties). Converting...');

            // Convert numeric-keyed object to array of row objects
            const data = keys
              .map(Number)
              .sort((a, b) => a - b)
              .map((index) => parsed[String(index)]);

            // Extract column names from first row
            const columns = data.length > 0 ? Object.keys(data[0]) : [];

            console.log('[DataPipeline:processUploadedFile] Converted structure:', {
              rowCount: data.length,
              columnCount: columns.length,
              columns: columns.slice(0, 5)
            });

            // Convert to CSV and re-process through pipeline
            const csvContent = this.convertJSONToCSV(data, columns);
            console.log('[DataPipeline:processUploadedFile] Generated CSV:', {
              size: csvContent.length,
              preview: csvContent.substring(0, 200)
            });

            file = new File([csvContent], uploadedFile.name, {
              type: 'text/csv'
            });

            console.log('[DataPipeline:processUploadedFile] Proceeding with normal pipeline for converted CSV');
          }
        } catch (err) {
          // Not JSON or invalid JSON - proceed with normal processing
          console.log('[DataPipeline:processUploadedFile] Content is not JSON, proceeding with normal processing');
        }
      }

      // Only convert to File if we haven't already created one from JSON
      if (!file) {
        // Convert UploadedFile to File object
        let blob: Blob;
        if (uploadedFile.content instanceof ArrayBuffer) {
          blob = new Blob([uploadedFile.content], { type: uploadedFile.type });
        } else if (typeof uploadedFile.content === 'string') {
          blob = new Blob([uploadedFile.content], { type: uploadedFile.type });
        } else {
          throw new Error('UploadedFile must have content property or originalFile must be provided');
        }

        file = new File([blob], uploadedFile.name, {
          type: uploadedFile.type
        });
      }
    }

    if (!file) {
      throw new Error('Failed to create File object from uploadedFile');
    }

    console.log('[DataPipeline:processUploadedFile] Final file ready:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    const dataset = await this.processFile(file);

    // Add sourceFileId for backwards compatibility
    dataset.sourceFileId = uploadedFile.id;

    return dataset;
  }

  /**
   * Process file - MAIN METHOD
   *
   * @param file - File to process
   * @returns DatasetResult with table name and enriched columns
   * @throws ParserError if no parser found or parsing fails
   * @throws Error if validation fails
   */
  async processFile(file: File): Promise<DatasetResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = performance.now();

    // STEP 1: Find parser
    const parser = this.parserRegistry.findParser(file);
    if (!parser) {
      throw new ParserError(
        `No parser found for file: ${file.name}`,
        undefined,
        file.type
      );
    }

    // STEP 2: Parse file
    console.log('[DataPipeline] About to parse file:', file.name, 'with parser:', parser.constructor.name);
    const rawDataset = await parser.parse(file);

    // DEBUG: Log parsed headers
    console.log('[DataPipeline] Parsed headers:', rawDataset.headers);
    console.log('[DataPipeline] Row count:', rawDataset.rows.length);

    // STEP 3: Validate
    const validationResult = this.validationChain.validate(rawDataset);
    if (!validationResult.isValid) {
      throw new Error(
        `Validation failed: ${validationResult.errors.join(', ')}`
      );
    }

    // STEP 4: Infer types
    const inferredColumns = this.typeInferrer.inferColumnTypes(
      rawDataset.columns
    );

    // STEP 5: Create DuckDB table
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const tableName = this.generateTableName(file.name);

    // Use original file for CSV instead of re-converting
    // This avoids double-parsing issues with quotes and special characters
    const isCSV = file.type.includes('csv') || file.name.endsWith('.csv');
    console.log('[DataPipeline] Is CSV?', isCSV, 'file.type:', file.type, 'file.name:', file.name);

    const fileForDuckDB = isCSV
      ? file
      : await this.createCSVFile(rawDataset, tableName);

    console.log('[DataPipeline] File for DuckDB:', fileForDuckDB.name, 'size:', fileForDuckDB.size);

    await Duck.register_files([fileForDuckDB]);
    console.log('[DataPipeline] Files registered, reading tabular data...');

    await Duck.read_tabular(fileForDuckDB, { tablename: tableName });
    console.log('[DataPipeline] Tabular data loaded into table:', tableName);

    // STEP 6: Analyze with DuckDB
    const duckdbColumns = await Duck.analyse(tableName);
    const rowCount = await Duck.get_row_count(tableName);

    // STEP 7: Build enriched result
    const enrichedColumns = inferredColumns.map((col, index) => {
      const duckCol =
        duckdbColumns.find((dc) => dc.name === col.name) ||
        duckdbColumns[index];

      return {
        ...col,
        stats: {
          name: col.name,
          type: fromDuckDBType(String(duckCol?.type_simple || 'text')),
          count: Number(duckCol?.count || 0),
          nulls: Number(duckCol?.nulls || 0),
          uniques: Number(duckCol?.uniques || 0),
          min: duckCol?.min,
          max: duckCol?.max,
          mean: duckCol?.mean ? Number(duckCol.mean) : undefined,
          median: duckCol?.median ? Number(duckCol.median) : undefined,
          stdDev: duckCol?.stddev ? Number(duckCol.stddev) : undefined
        }
      };
    });

    const processingDuration = performance.now() - startTime;

    // Convert rows to record format for backwards compatibility
    const data: Record<string, unknown>[] = rawDataset.rows.map((row) => {
      const record: Record<string, unknown> = {};
      rawDataset.headers.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    });

    // Columns are already EnrichedColumn[] from enrichedColumns
    const columns: EnrichedColumn[] = enrichedColumns;

    const fileType = this.detectFileType(file);

    const result: DatasetResult = {
      id: crypto.randomUUID(),
      name: file.name,
      sourceFileId: file.name,
      tableName,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType,
        parserUsed: 'DataPipeline',
        processingDuration,
        transformations: []
      },
      // Backwards compatibility fields
      format: fileType as 'csv' | 'geojson' | 'shapefile',
      data,
      analysis: {
        columns,
        geoColumns: [],
        hasGeoData: !!rawDataset.geometry,
        suggestedGeoColumn: undefined,
        rowCount,
        warnings: validationResult.warnings
      },
      geometry: rawDataset.geometry?.type as any,
      bounds: rawDataset.geometry?.bounds
        ? {
            minLat: rawDataset.geometry.bounds[1],
            maxLat: rawDataset.geometry.bounds[3],
            minLon: rawDataset.geometry.bounds[0],
            maxLon: rawDataset.geometry.bounds[2]
          }
        : undefined,
      createdAt: new Date(),
      fileSize: file.size,
      originalData: {
        columns: structuredClone(columns),
        data: structuredClone(data),
        rowCount
      }
    };

    return result;
  }

  /**
   * Validate file without processing
   *
   * @param file - File to validate
   * @returns ValidationResult
   */
  async validateFile(file: File): Promise<ValidationResult> {
    const parser = this.parserRegistry.findParser(file);
    if (!parser) {
      return {
        isValid: false,
        errors: [`No parser found for file: ${file.name}`],
        warnings: []
      };
    }

    try {
      const rawDataset = await parser.parse(file);
      return this.validationChain.validate(rawDataset);
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      };
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // DuckDB cleanup happens at application level
    this.initialized = false;
  }

  /**
   * Generate unique table name
   */
  private generateTableName(filename: string): string {
    let name = filename.replace(/\.[^/.]+$/, '');
    name = name.replace(/[^a-zA-Z0-9_]/g, '_');

    if (!/^[a-zA-Z]/.test(name)) {
      name = 't_' + name;
    }

    const timestamp = Date.now().toString(36);
    return `${name}_${timestamp}`;
  }

  /**
   * Detect file type from extension
   */
  private detectFileType(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ext || 'unknown';
  }

  /**
   * Map ColumnType enum to ColumnInfo type string
   */
  private mapColumnType(
    type: ColumnType
  ): 'number' | 'string' | 'date' | 'boolean' | 'geometry' {
    switch (type) {
      case ColumnType.NUMBER:
        return 'number';

      case ColumnType.DATE:
        return 'date';

      case ColumnType.BOOLEAN:
        return 'boolean';

      case ColumnType.GEOMETRY:
        return 'geometry';

      case ColumnType.TEXT:

      default:
        return 'string';
    }
  }

  /**
   * Create a CSV File from RawDataset for DuckDB
   */
  private async createCSVFile(
    dataset: RawDataset,
    tableName: string
  ): Promise<File> {
    const csvData = this.convertToCSV(dataset);
    const blob = new Blob([csvData], { type: 'text/csv' });
    return new File([blob], `${tableName}.csv`, { type: 'text/csv' });
  }

  /**
   * Convert RawDataset to CSV string for DuckDB
   */
  private convertToCSV(dataset: RawDataset): string {
    // Escape CSV values (including headers)
    const escapeCSVValue = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Always quote if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Escape headers too
    const headerRow = dataset.headers.map(escapeCSVValue).join(',');
    const rows = [headerRow];

    for (const row of dataset.rows) {
      const csvRow = row.map(escapeCSVValue);
      rows.push(csvRow.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Convert JSON array to CSV string
   * Used for converting saved project data back to CSV format
   */
  private convertJSONToCSV(data: Record<string, unknown>[], columns: string[]): string {
    const escapeCSVValue = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Create header row
    const headerRow = columns.map(escapeCSVValue).join(',');
    const rows = [headerRow];

    // Create data rows
    for (const row of data) {
      const csvRow = columns.map((col) => escapeCSVValue(row[col]));
      rows.push(csvRow.join(','));
    }

    return rows.join('\n');
  }
}

/**
 * Singleton instance - use this!
 */
export const dataPipeline = new DataPipelineService();
