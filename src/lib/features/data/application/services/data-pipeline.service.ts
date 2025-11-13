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
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

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
      parsedData?: any;
      fileType?: string;
    },
    originalFile?: File
  ): Promise<DatasetResult> {
    logger.info('Processing uploaded file', LogCategory.DATA, {
      fileName: uploadedFile.name,
      hasOriginalFile: !!originalFile,
      uploadedFileSize: uploadedFile.size,
      originalFileSize: originalFile?.size,
      contentType: typeof uploadedFile.content,
      hasParsedData: !!uploadedFile.parsedData,
      fileType: uploadedFile.fileType
    });

    // SPECIAL CASE: Shapefile already parsed to GeoJSON by processShapefileGroup
    if (uploadedFile.parsedData && uploadedFile.fileType === 'shapefile') {
      logger.info('Shapefile already parsed to GeoJSON, converting', LogCategory.FILE, {
        parsedDataType: typeof uploadedFile.parsedData,
        isString: typeof uploadedFile.parsedData === 'string'
      });

      // Parse GeoJSON if it's a string
      let geojsonData = typeof uploadedFile.parsedData === 'string'
        ? JSON.parse(uploadedFile.parsedData)
        : uploadedFile.parsedData;

      logger.debug('GeoJSON structure validated', LogCategory.DATA, {
        type: geojsonData?.type,
        hasFeatures: !!geojsonData?.features,
        isArray: Array.isArray(geojsonData),
        keys: Object.keys(geojsonData || {})
      });

      // Normalize GeoJSON structure - shpjs can return different formats
      // Ensure it's a FeatureCollection
      if (!geojsonData.type) {
        // If no type, assume it's an array of features or a single feature
        if (Array.isArray(geojsonData)) {
          geojsonData = {
            type: 'FeatureCollection',
            features: geojsonData
          };
        } else if (geojsonData.geometry) {
          // Single feature
          geojsonData = {
            type: 'FeatureCollection',
            features: [geojsonData]
          };
        } else {
          throw new Error('Invalid GeoJSON structure from shapefile');
        }
      } else if (geojsonData.type === 'Feature') {
        // Wrap single feature in FeatureCollection
        geojsonData = {
          type: 'FeatureCollection',
          features: [geojsonData]
        };
      } else if (geojsonData.type === 'GeometryCollection') {
        // Convert GeometryCollection to FeatureCollection
        geojsonData = {
          type: 'FeatureCollection',
          features: geojsonData.geometries.map((geom: any, idx: number) => ({
            type: 'Feature',
            properties: {},
            geometry: geom
          }))
        };
      }

      logger.debug('GeoJSON normalized', LogCategory.DATA, {
        type: geojsonData.type,
        featureCount: geojsonData.features?.length
      });

      const geojsonString = JSON.stringify(geojsonData);
      const geojsonFile = new File([geojsonString], uploadedFile.name.replace(/\.shp$/i, '.geojson'), {
        type: 'application/geo+json'
      });

      const dataset = await this.processFile(geojsonFile);
      dataset.sourceFileId = uploadedFile.id;
      dataset.name = uploadedFile.name; // Keep original shapefile name

      logger.success('Shapefile processed via GeoJSON parser', LogCategory.DATA, {
        fileName: uploadedFile.name,
        featureCount: geojsonData.features?.length
      });
      return dataset;
    }

    // If we have the original File, use it directly (avoids double-parsing)
    let file: File | undefined = originalFile;
    if (originalFile) {
      logger.debug('Using original File object', LogCategory.FILE, {
        fileName: originalFile.name
      });
    } else {
      logger.debug('Creating File from content', LogCategory.FILE, {
        fileName: uploadedFile.name
      });

      // SPECIAL CASE: If content is JSON (from old FileProcessor), skip dataPipeline
      // This happens when loading saved projects that were processed by the old system
      if (typeof uploadedFile.content === 'string') {
        try {
          const parsed = JSON.parse(uploadedFile.content);
          const keys = Object.keys(parsed);
          logger.debug('Content structure analysis', LogCategory.DATA, {
            hasData: !!parsed.data,
            hasColumns: !!parsed.columns,
            hasParsedData: !!parsed.parsedData,
            keysCount: keys.length,
            firstKey: keys[0],
            isArray: Array.isArray(parsed)
          });

          // CASE 1: JSON with data and columns properties
          if (parsed && typeof parsed === 'object' && parsed.data && parsed.columns) {
            logger.warn('Legacy format detected - converting to DatasetResult', LogCategory.DATA, {
              fileName: uploadedFile.name,
              rowCount: parsed.data?.length,
              columnCount: parsed.columns?.length
            });

            // Normalize data to ensure flat structure (no nested objects)
            const normalizedData = (parsed.data || []).map((row: any) => {
              // If row is not an object, wrap it
              if (!row || typeof row !== 'object') {
                return { value: row };
              }

              // Flatten nested objects to primitive values
              const flatRow: Record<string, unknown> = {};
              Object.entries(row).forEach(([key, value]) => {
                // Convert non-primitive values to strings
                if (value !== null && value !== undefined) {
                  if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                    // Complex object: stringify it
                    flatRow[key] = JSON.stringify(value);
                  } else if (Array.isArray(value)) {
                    // Array: join as string
                    flatRow[key] = value.join(', ');
                  } else {
                    // Primitive value: keep as-is
                    flatRow[key] = value;
                  }
                } else {
                  flatRow[key] = value;
                }
              });
              return flatRow;
            });

            // Return a minimal DatasetResult using the old processed data
            // This avoids re-parsing JSON as CSV which causes errors
            return {
              id: uploadedFile.id,
              name: uploadedFile.name,
              sourceFileId: uploadedFile.id,
              tableName: `table_${uploadedFile.id.replace(/-/g, '_')}`,
              columns: parsed.columns || [],
              rowCount: normalizedData.length,
              metadata: {
                processedAt: new Date(),
                fileType: 'csv',
                parserUsed: 'Legacy',
                processingDuration: 0,
                transformations: []
              },
              format: 'csv',
              data: normalizedData,
              analysis: parsed.analysis || {
                columns: parsed.columns || [],
                geoColumns: [],
                hasGeoData: false,
                rowCount: normalizedData.length,
                warnings: []
              },
              createdAt: new Date(),
              fileSize: uploadedFile.size,
              originalData: {
                columns: parsed.columns || [],
                data: normalizedData
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
            logger.warn('Legacy numeric keys detected - converting', LogCategory.DATA, {
              fileName: uploadedFile.name,
              keyCount: keys.length
            });

            // Convert numeric-keyed object to array of row objects
            const data = keys
              .map(Number)
              .sort((a, b) => a - b)
              .map((index) => parsed[String(index)]);

            // Extract column names from first row
            const columns = data.length > 0 ? Object.keys(data[0]) : [];

            logger.debug('Data conversion complete', LogCategory.DATA, {
              rowCount: data.length,
              columnCount: columns.length,
              columnSample: columns.slice(0, 5)
            });

            // Convert to CSV and re-process through pipeline
            const csvContent = this.convertJSONToCSV(data, columns);
            logger.debug('Generated CSV from legacy data', LogCategory.DATA, {
              size: csvContent.length,
              preview: csvContent.substring(0, 100)
            });

            file = new File([csvContent], uploadedFile.name, {
              type: 'text/csv'
            });

            logger.info('Proceeding with pipeline for converted CSV', LogCategory.DATA, {
              fileName: uploadedFile.name
            });
          }
        } catch (err) {
          // Not JSON or invalid JSON - proceed with normal processing
          logger.debug('Content is not JSON, proceeding with normal processing', LogCategory.DATA, {
            fileName: uploadedFile.name
          });
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
      logger.error('Failed to create File object', LogCategory.DATA, {
        fileName: uploadedFile.name
      });
      throw new Error('Failed to create File object from uploadedFile');
    }

    logger.debug('File ready for processing', LogCategory.FILE, {
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
    const endTiming = logger.startTiming(`Process file: ${file.name}`, LogCategory.DATA);

    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = performance.now();

    logger.info('Starting file processing', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    try {
      // STEP 1: Find parser
      const parser = this.parserRegistry.findParser(file);
      if (!parser) {
        logger.error('No parser found for file', LogCategory.DATA, {
          fileName: file.name,
          fileType: file.type
        });
        throw new ParserError(
          `No parser found for file: ${file.name}`,
          undefined,
          file.type
        );
      }

      logger.debug('Parser selected', LogCategory.DATA, {
        fileName: file.name,
        parser: parser.constructor.name
      });

      // STEP 2: Parse file (CPU-INTENSIVE - measure!)
      logger.info('Parsing file', LogCategory.FILE, {
        fileName: file.name,
        parser: parser.constructor.name
      });

      const parseStart = performance.now();
      const rawDataset = await parser.parse(file);
      const parseDuration = performance.now() - parseStart;

      logger.success('File parsed successfully', LogCategory.FILE, {
        fileName: file.name,
        rowCount: rawDataset.rows.length,
        columnCount: rawDataset.headers.length,
        duration: `${parseDuration.toFixed(2)}ms`
      });

      if (parseDuration > 2000) {
        logger.warn('Slow file parsing detected', LogCategory.FILE, {
          fileName: file.name,
          duration: `${parseDuration.toFixed(2)}ms`,
          rowCount: rawDataset.rows.length,
          recommendation: 'Consider chunking or streaming for large files'
        });
      }

      // STEP 3: Validate
      const validationResult = this.validationChain.validate(rawDataset);
      if (!validationResult.isValid) {
        logger.error('Validation failed', LogCategory.DATA, {
          fileName: file.name,
          errors: validationResult.errors
        });
        throw new Error(
          `Validation failed: ${validationResult.errors.join(', ')}`
        );
      }

      logger.debug('Validation passed', LogCategory.DATA, {
        fileName: file.name,
        warningCount: validationResult.warnings.length
      });

      // STEP 4: Infer types (CPU-INTENSIVE)
      logger.info('Inferring column types', LogCategory.DATA, {
        columnCount: rawDataset.columns.length,
        sampleSize: 100
      });

      const inferStart = performance.now();
      const inferredColumns = this.typeInferrer.inferColumnTypes(
        rawDataset.columns
      );
      const inferDuration = performance.now() - inferStart;

      logger.debug('Type inference complete', LogCategory.DATA, {
        fileName: file.name,
        types: inferredColumns.map(c => ({ name: c.name, type: c.type })),
        duration: `${inferDuration.toFixed(2)}ms`
      });

      // STEP 5: Create DuckDB table (SLOW - measure!)
      if (!Duck) {
        logger.error('DuckDB not initialized', LogCategory.DUCKDB);
        throw new Error('DuckDB not initialized');
      }

      const tableName = this.generateTableName(file.name);
      const isCSV = file.type.includes('csv') || file.name.endsWith('.csv');

      logger.debug('Preparing file for DuckDB', LogCategory.DUCKDB, {
        tableName,
        isCSV,
        fileType: file.type
      });

      const fileForDuckDB = isCSV
        ? file
        : await this.createCSVFile(rawDataset, tableName);

      logger.info('Creating DuckDB table', LogCategory.DUCKDB, {
        tableName,
        fileSize: fileForDuckDB.size,
        estimatedRows: rawDataset.rows.length
      });

      const duckStart = performance.now();
      await Duck.register_files([fileForDuckDB]);
      logger.debug('Files registered with DuckDB', LogCategory.DUCKDB);

      await Duck.read_tabular(fileForDuckDB, { tablename: tableName });
      const duckDuration = performance.now() - duckStart;

      // STEP 6: Analyze with DuckDB
      const duckdbColumns = await Duck.analyse(tableName);
      const rowCount = await Duck.get_row_count(tableName);

      logger.success('DuckDB table created', LogCategory.DUCKDB, {
        tableName,
        rowCount,
        duration: `${duckDuration.toFixed(2)}ms`
      });

      if (duckDuration > 3000) {
        logger.warn('Slow DuckDB table creation', LogCategory.DUCKDB, {
          tableName,
          duration: `${duckDuration.toFixed(2)}ms`,
          rowCount,
          recommendation: 'Large dataset detected, consider optimization'
        });
      }

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

      endTiming();

      logger.success('File processing complete', LogCategory.DATA, {
        fileName: file.name,
        tableName,
        rowCount,
        columnCount: enrichedColumns.length,
        totalDuration: `${processingDuration.toFixed(2)}ms`
      });

      return result;

    } catch (error) {
      logger.error('File processing failed', LogCategory.DATA, {
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
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
