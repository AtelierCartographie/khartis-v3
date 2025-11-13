import { Duck, initDuckDB } from '$lib/features/commons/services/duckdb/duckdb';
import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection
} from 'geojson';
import type {
  DatasetResult,
  EnrichedColumn
} from '../../domain/entities/dataset-result.entity';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import { ParserError } from '../../domain/interfaces/parser.interface';
import { fromDuckDBType } from '../../domain/value-objects/column-type.vo';
import type { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import { ParserRegistry } from '../../infrastructure/parsers/parser.registry';
import { HeuristicTypeInferrer } from '../../infrastructure/type-inference/heuristic-inferrer';
import { ValidationChain } from '../../infrastructure/validators/validation.chain';

type LegacyDatasetFormat = {
  data?: unknown[];
  columns?: EnrichedColumn[];
  analysis?: {
    columns?: EnrichedColumn[];
    geoColumns?: unknown[];
    hasGeoData?: boolean;
    rowCount?: number;
    warnings?: string[];
  };
  [key: string]: unknown;
};

type GeoJSONLike =
  | FeatureCollection
  | Feature
  | GeometryCollection
  | Geometry
  | Feature[];

const GEOMETRY_TYPES: Geometry['type'][] = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  );
}

function isFeature(value: unknown): value is Feature {
  return isRecord(value) && value.type === 'Feature' && 'geometry' in value;
}

function isFeatureArray(value: unknown): value is Feature[] {
  return Array.isArray(value) && value.every(isFeature);
}

function isGeometryCollection(value: unknown): value is GeometryCollection {
  return (
    isRecord(value) &&
    value.type === 'GeometryCollection' &&
    Array.isArray(value.geometries)
  );
}

function isGeometry(value: unknown): value is Geometry {
  if (!isRecord(value)) return false;
  const type = value.type;
  return (
    typeof type === 'string' &&
    GEOMETRY_TYPES.includes(type as Geometry['type']) &&
    'coordinates' in value
  );
}

function normalizeGeojsonInput(data: GeoJSONLike | unknown): FeatureCollection {
  if (isFeatureCollection(data)) {
    return data;
  }

  if (isFeatureArray(data)) {
    return {
      type: 'FeatureCollection',
      features: data
    };
  }

  if (isFeature(data)) {
    return {
      type: 'FeatureCollection',
      features: [data]
    };
  }

  if (isGeometryCollection(data)) {
    return {
      type: 'FeatureCollection',
      features: data.geometries.map((geom) => ({
        type: 'Feature',
        properties: {},
        geometry: geom
      }))
    };
  }

  if (isGeometry(data)) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: data
        }
      ]
    };
  }

  throw new Error('Invalid GeoJSON structure from shapefile');
}

function describeGeojsonStructure(data: unknown): {
  type?: string;
  hasFeatures: boolean;
  isArray: boolean;
  keys: string[];
} {
  const record = isRecord(data) ? data : {};
  const typeValue = record.type;
  return {
    type: typeof typeValue === 'string' ? typeValue : undefined,
    hasFeatures: Array.isArray((record as { features?: unknown }).features),
    isArray: Array.isArray(data),
    keys: Object.keys(record)
  };
}

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
      parsedData?: unknown;
      fileType?: string;
      deepAnalysis?: DataAnalysisResult;
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
      logger.info(
        'Shapefile already parsed to GeoJSON, converting',
        LogCategory.FILE,
        {
          parsedDataType: typeof uploadedFile.parsedData,
          isString: typeof uploadedFile.parsedData === 'string'
        }
      );

      // Parse GeoJSON if it's a string
      const parsedGeojson = (
        typeof uploadedFile.parsedData === 'string'
          ? JSON.parse(uploadedFile.parsedData)
          : uploadedFile.parsedData
      ) as GeoJSONLike | unknown;

      const structureInfo = describeGeojsonStructure(parsedGeojson);

      logger.debug('GeoJSON structure validated', LogCategory.DATA, structureInfo);

      const normalizedGeojson = normalizeGeojsonInput(parsedGeojson);

      logger.debug('GeoJSON normalized', LogCategory.DATA, {
        type: normalizedGeojson.type,
        featureCount: normalizedGeojson.features.length
      });

      const geojsonString = JSON.stringify(normalizedGeojson);
      const geojsonFile = new File(
        [geojsonString],
        uploadedFile.name.replace(/\.shp$/i, '.geojson'),
        {
          type: 'application/geo+json'
        }
      );

      const dataset = await this.processFile(geojsonFile);
      dataset.sourceFileId = uploadedFile.id;
      dataset.name = uploadedFile.name; // Keep original shapefile name

      logger.success(
        'Shapefile processed via GeoJSON parser',
        LogCategory.DATA,
        {
          fileName: uploadedFile.name,
          featureCount: normalizedGeojson.features.length
        }
      );
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

      if (typeof uploadedFile.content === 'string') {
        try {
          const parsedJson = JSON.parse(uploadedFile.content) as unknown;
          const parsed =
            parsedJson && typeof parsedJson === 'object'
              ? (parsedJson as LegacyDatasetFormat)
              : {};
          const keys = Object.keys(parsed as Record<string, unknown>);
          logger.debug('Content structure analysis', LogCategory.DATA, {
            hasData: !!parsed.data,
            hasColumns: !!parsed.columns,
            hasParsedData: !!parsed.parsedData,
            keysCount: keys.length,
            firstKey: keys[0],
            isArray: Array.isArray(parsed)
          });

          if (parsed.data && parsed.columns) {
            logger.warn(
              'Legacy format detected - converting to DatasetResult',
              LogCategory.DATA,
              {
                fileName: uploadedFile.name,
                rowCount: parsed.data?.length,
                columnCount: parsed.columns?.length
              }
            );

            const legacyRows = Array.isArray(parsed.data) ? parsed.data : [];
            const normalizedData = legacyRows.map((row) => {
              if (!row || typeof row !== 'object') {
                return { value: row };
              }

              const flatRow: Record<string, unknown> = {};
              Object.entries(row as Record<string, unknown>).forEach(
                ([key, value]) => {
                  if (value !== null && value !== undefined) {
                    if (
                      typeof value === 'object' &&
                      !Array.isArray(value) &&
                      !(value instanceof Date)
                    ) {
                      flatRow[key] = JSON.stringify(value);
                    } else if (Array.isArray(value)) {
                      flatRow[key] = value.join(', ');
                    } else {
                      flatRow[key] = value;
                    }
                  } else {
                    flatRow[key] = value;
                  }
                }
              );
              return flatRow;
            });

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
                data: normalizedData,
                rowCount: normalizedData.length
              }
            } as DatasetResult;
          }

          if (
            keys.length > 0 &&
            !isNaN(Number(keys[0])) &&
            typeof parsed[keys[0] as keyof LegacyDatasetFormat] === 'object'
          ) {
            logger.warn(
              'Legacy numeric keys detected - converting',
              LogCategory.DATA,
              {
                fileName: uploadedFile.name,
                keyCount: keys.length
              }
            );

            const data = keys
              .map(Number)
              .sort((a, b) => a - b)
              .map(
                (index) => parsed[String(index) as keyof LegacyDatasetFormat]
              );

            const columns =
              data.length > 0 && data[0] && typeof data[0] === 'object'
                ? Object.keys(data[0] as Record<string, unknown>)
                : [];

            logger.debug('Data conversion complete', LogCategory.DATA, {
              rowCount: data.length,
              columnCount: columns.length,
              columns
            });

            const csvContent = [
              columns.join(','),
              ...data.map((row) =>
                columns
                  .map((col) =>
                    row && typeof row === 'object'
                      ? JSON.stringify(
                          (row as Record<string, unknown>)[col] ?? ''
                        )
                      : ''
                  )
                  .join(',')
              )
            ].join('\n');

            const legacyFile = new File([csvContent], uploadedFile.name, {
              type: 'text/csv'
            });
            return this.processFile(legacyFile);
          }
        } catch (error) {
          logger.debug('Legacy content parsing failed', LogCategory.DATA, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (!file) {
        let blob: Blob;
        if (uploadedFile.content instanceof ArrayBuffer) {
          blob = new Blob([uploadedFile.content], { type: uploadedFile.type });
        } else if (typeof uploadedFile.content === 'string') {
          blob = new Blob([uploadedFile.content], { type: uploadedFile.type });
        } else {
          throw new Error(
            'UploadedFile must have content property or originalFile must be provided'
          );
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
    this.applyGeoDetectionMetadata(
      dataset,
      uploadedFile.deepAnalysis?.geoDetection
    );

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
    const endTiming = logger.startTiming(
      `Process file: ${file.name}`,
      LogCategory.DATA
    );

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
        types: inferredColumns.map((c) => ({ name: c.name, type: c.type })),
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
        geometry: rawDataset.geometry,
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

  private applyGeoDetectionMetadata(
    dataset: DatasetResult,
    geoDetection?: GeoDetectionResult
  ): void {
    if (!geoDetection) {
      return;
    }

    dataset.geoDetection = geoDetection;

    const baseAnalysis =
      dataset.analysis ??
      ({
        columns: dataset.columns,
        geoColumns: [],
        hasGeoData: false,
        rowCount: dataset.rowCount,
        warnings: []
      } satisfies DatasetResult['analysis']);

    dataset.analysis = {
      ...baseAnalysis,
      geoColumns: geoDetection.geoColumns,
      hasGeoData:
        geoDetection.hasGeoColumns || baseAnalysis?.hasGeoData || false,
      suggestedGeoColumn:
        geoDetection.suggestedPrimaryGeoColumn?.columnName ??
        baseAnalysis?.suggestedGeoColumn,
      warnings: [...(baseAnalysis?.warnings ?? []), ...geoDetection.warnings]
    };
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
  private convertJSONToCSV(
    data: Record<string, unknown>[],
    columns: string[]
  ): string {
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
