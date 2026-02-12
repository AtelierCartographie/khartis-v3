import * as m from '$lib/paraglide/messages';
import { DATA_VALIDATION } from '../constants/detection.constants';
import {
  GeoColumnDetector,
  type GeoDetectionResult
} from './geo-detector.utils';

export interface ColumnStatistics {
  name: string;
  type: 'numeric' | 'string' | 'date' | 'boolean' | 'mixed';
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  uniquePercentage: number;
  duplicateCount: number;
  min?: number | string | Date;
  max?: number | string | Date;
  mean?: number;
  median?: number;
  standardDeviation?: number;
  sampleValues: unknown[];
}

export interface DataQualityIssue {
  severity: 'error' | 'warning' | 'info';
  column?: string;
  message: string;
  affectedRows?: number[];
  suggestion?: string;
}

export interface DataAnalysisResult {
  rowCount: number;
  columnCount: number;
  columns: ColumnStatistics[];
  geoDetection: GeoDetectionResult;
  qualityIssues: DataQualityIssue[];
  performanceWarnings: string[];
  suggestions: string[];
  estimatedProcessingTime?: number;
}

/**
 * Performance thresholds for data validation.
 *
 * These values balance usability with browser performance limits:
 * - maxRows: 10k rows is the practical limit for smooth DOM/Canvas rendering
 * - warningRows: 5k rows triggers performance advisories
 * - maxColumns: 100 columns prevents layout and memory issues
 * - warningColumns: 50 columns suggests considering column reduction
 * - maxCellLength: 2000 chars prevents rendering issues with long text
 * - maxFileSize: 50MB is the practical limit for client-side processing
 */
const PERFORMANCE_THRESHOLDS = {
  /** Maximum rows before data is truncated (10,000 rows) */
  maxRows: 10_000,
  /** Row count that triggers a performance warning (5,000 rows) */
  warningRows: 5_000,
  /** Maximum columns supported (100 columns) */
  maxColumns: 100,
  /** Column count that triggers a warning (50 columns) */
  warningColumns: 50,
  /** Maximum characters per cell before warning (2,000 chars) */
  maxCellLength: 2_000,
  /** Maximum estimated file size in bytes (50 MB) */
  maxFileSize: 50 * 1024 * 1024
} as const;

/**
 * Number of rows to sample for type detection.
 * 100 samples provides 95% confidence for type inference
 * while keeping detection fast for large datasets.
 */
const TYPE_DETECTION_SAMPLES = 100;

/**
 * Chunk sizes for async processing to avoid blocking the main thread.
 * These values are tuned to yield to the event loop every ~16ms (one frame).
 */
const PROCESSING_CHUNK_SIZES = {
  /** Columns to process per chunk in analyzeColumns() */
  COLUMN_CHUNK: 10,
  /** Values to process per chunk in analyzeColumn() */
  VALUE_CHUNK: 1_000,
  /** Rows to check per chunk in detectQualityIssues() */
  ROW_CHUNK: 20
} as const;

/**
 * Deep Data Validator
 * Provides comprehensive data analysis including statistics, type detection, and quality checks
 */
export const DeepDataValidator = {
  async analyzeDataContent(
    headers: string[],
    data: unknown[][],
    options: {
      skipGeoDetection?: boolean;
      sampleSize?: number;
    } = {}
  ): Promise<DataAnalysisResult> {
    const rowCount = data.length;
    const columnCount = headers.length;

    // Yield before heavy analysis
    await new Promise((resolve) => setTimeout(resolve, 0));

    const columns = await DeepDataValidator.analyzeColumns(headers, data);

    const geoDetection = options.skipGeoDetection
      ? { hasGeoColumns: false, geoColumns: [], warnings: [] }
      : await GeoColumnDetector.detectGeoColumns(headers, data);

    const qualityIssues = await DeepDataValidator.detectQualityIssues(
      columns,
      data
    );

    const performanceWarnings = DeepDataValidator.checkPerformance(
      rowCount,
      columnCount,
      data
    );

    const suggestions = DeepDataValidator.generateSuggestions(
      columns,
      geoDetection,
      qualityIssues,
      performanceWarnings
    );

    const estimatedProcessingTime = DeepDataValidator.estimateProcessingTime(
      rowCount,
      columnCount
    );

    return {
      rowCount,
      columnCount,
      columns,
      geoDetection,
      qualityIssues,
      performanceWarnings,
      suggestions,
      estimatedProcessingTime
    };
  },

  async analyzeColumns(
    headers: string[],
    data: unknown[][]
  ): Promise<ColumnStatistics[]> {
    const columns: ColumnStatistics[] = [];

    for (
      let i = 0;
      i < headers.length;
      i += PROCESSING_CHUNK_SIZES.COLUMN_CHUNK
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));

      const endIndex = Math.min(
        i + PROCESSING_CHUNK_SIZES.COLUMN_CHUNK,
        headers.length
      );

      for (let colIndex = i; colIndex < endIndex; colIndex++) {
        const header = headers[colIndex];
        const columnValues = data.map((row) => row[colIndex]);
        const columnStats = await DeepDataValidator.analyzeColumn(
          header,
          columnValues
        );
        columns.push(columnStats);
      }
    }

    return columns;
  },

  async analyzeColumn(
    name: string,
    values: unknown[]
  ): Promise<ColumnStatistics> {
    // Single-pass algorithm for statistics computation with chunking
    // Uses Welford's algorithm for mean and variance

    let nullCount = 0;
    const uniqueValues = new Set<unknown>();
    const valueOccurrences = new Map<unknown, number>();
    const sampleValues: unknown[] = [];

    // Process values in chunks to avoid blocking
    const CHUNK_SIZE = PROCESSING_CHUNK_SIZES.VALUE_CHUNK;
    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
      // Yield to event loop between chunks
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

      const chunk = values.slice(i, i + CHUNK_SIZE);
      for (const value of chunk) {
        // Check for null
        if (
          value == null ||
          value === '' ||
          value === 'null' ||
          value === 'NULL'
        ) {
          nullCount++;
          continue;
        }

        // Track unique values and occurrences
        uniqueValues.add(value);
        valueOccurrences.set(value, (valueOccurrences.get(value) || 0) + 1);

        // Collect sample values
        if (sampleValues.length < 5) {
          sampleValues.push(value);
        }
      }
    }

    const nonNullValues = values.filter(
      (v) => v != null && v !== '' && v !== 'null' && v !== 'NULL'
    );

    const uniqueCount = uniqueValues.size;
    const duplicateCount = Array.from(valueOccurrences.values()).filter(
      (count) => count > 1
    ).length;

    const type = DeepDataValidator.detectColumnType(nonNullValues);

    const stats: Partial<ColumnStatistics> = {
      name,
      type,
      nullCount,
      nullPercentage: (nullCount / values.length) * 100,
      uniqueCount,
      uniquePercentage: (uniqueCount / values.length) * 100,
      duplicateCount,
      sampleValues
    };

    // Type-specific statistics with Welford's algorithm for numeric data
    if (type === 'numeric' && nonNullValues.length > 0) {
      let numericCount = 0;
      let numericMin = Infinity;
      let numericMax = -Infinity;
      let numericMean = 0;
      let numericM2 = 0; // Sum of squared differences from mean
      const numericValues: number[] = []; // For median calculation

      // Process numeric values in chunks
      for (let i = 0; i < nonNullValues.length; i += CHUNK_SIZE) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

        const chunk = nonNullValues.slice(i, i + CHUNK_SIZE);
        for (const value of chunk) {
          const numValue = parseFloat(String(value));
          if (!isNaN(numValue)) {
            numericValues.push(numValue);
            numericCount++;

            // Update min/max
            if (numValue < numericMin) numericMin = numValue;
            if (numValue > numericMax) numericMax = numValue;

            // Welford's algorithm for online mean and variance
            const delta = numValue - numericMean;
            numericMean += delta / numericCount;
            const delta2 = numValue - numericMean;
            numericM2 += delta * delta2;
          }
        }
      }

      if (numericCount > 0) {
        stats.min = numericMin;
        stats.max = numericMax;
        stats.mean = numericMean;
        stats.median = this.calculateMedian(numericValues);
        // Standard deviation from Welford's algorithm
        stats.standardDeviation =
          numericCount > 1 ? Math.sqrt(numericM2 / numericCount) : 0;
      }
    } else if (type === 'string' && nonNullValues.length > 0) {
      let stringMin: string | undefined;
      let stringMax: string | undefined;

      // Process string values in chunks
      for (let i = 0; i < nonNullValues.length; i += CHUNK_SIZE) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

        const chunk = nonNullValues.slice(i, i + CHUNK_SIZE);
        for (const value of chunk) {
          const strValue = String(value);
          if (stringMin === undefined || strValue < stringMin)
            stringMin = strValue;
          if (stringMax === undefined || strValue > stringMax)
            stringMax = strValue;
        }
      }

      stats.min = stringMin;
      stats.max = stringMax;
    } else if (type === 'date' && nonNullValues.length > 0) {
      let dateMin: number = Infinity;
      let dateMax: number = -Infinity;

      // Process date values in chunks
      for (let i = 0; i < nonNullValues.length; i += CHUNK_SIZE) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

        const chunk = nonNullValues.slice(i, i + CHUNK_SIZE);
        for (const value of chunk) {
          const dateValue = new Date(value as string | number | Date);
          if (!isNaN(dateValue.getTime())) {
            const timestamp = dateValue.getTime();
            if (timestamp < dateMin) dateMin = timestamp;
            if (timestamp > dateMax) dateMax = timestamp;
          }
        }
      }

      if (dateMin !== Infinity) {
        stats.min = new Date(dateMin);
        stats.max = new Date(dateMax);
      }
    }

    return stats as ColumnStatistics;
  },

  detectColumnType(values: unknown[]): ColumnStatistics['type'] {
    if (values.length === 0) return 'string';

    const sample = values.slice(0, TYPE_DETECTION_SAMPLES);

    const types = {
      numeric: 0,
      date: 0,
      boolean: 0,
      string: 0
    };

    for (const value of sample) {
      if (value == null) continue;

      const strValue = String(value).trim();

      if (strValue === 'true' || strValue === 'false') {
        types.boolean++;
      } else if (this.isDateString(strValue)) {
        types.date++;
      } else if (
        !isNaN(parseFloat(strValue)) &&
        isFinite(parseFloat(strValue))
      ) {
        types.numeric++;
      } else {
        types.string++;
      }
    }

    const total = Object.values(types).reduce((a, b) => a + b, 0);
    if (total === 0) return 'string';

    const threshold = total * DATA_VALIDATION.ANOMALY_MULTIPLIER;

    if (types.date >= threshold) return 'date';
    if (types.numeric >= threshold) return 'numeric';
    if (types.boolean >= threshold) return 'boolean';
    if (types.string >= threshold) return 'string';

    return 'mixed';
  },

  isDateString(strValue: string): boolean {
    if (
      !/^\d{4}-\d{2}-\d{2}/.test(strValue) &&
      !/^\d{2}\/\d{2}\/\d{4}/.test(strValue)
    ) {
      return false;
    }
    const date = new Date(strValue);
    return (
      !isNaN(date.getTime()) &&
      date.getFullYear() > DATA_VALIDATION.MIN_YEAR &&
      date.getFullYear() < DATA_VALIDATION.MAX_YEAR
    );
  },

  calculateMedian(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  },

  async detectQualityIssues(
    columns: ColumnStatistics[],
    data: unknown[][]
  ): Promise<DataQualityIssue[]> {
    const issues: DataQualityIssue[] = [];

    // Yield before processing
    await new Promise((resolve) => setTimeout(resolve, 0));

    columns.forEach((column) => {
      if (column.nullPercentage > DATA_VALIDATION.NULL_PERCENTAGE_THRESHOLD) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: `${column.nullPercentage.toFixed(1)}% missing values`,
          suggestion:
            'Check if this column is needed or fill in the missing data'
        });
      }

      if (column.uniquePercentage === 100 && column.type === 'string') {
        issues.push({
          severity: 'info',
          column: column.name,
          message: 'All values are unique',
          suggestion: 'This column could be an identifier'
        });
      }

      if (column.uniqueCount === 0 || column.nullPercentage === 100) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: 'Column is empty - no unique value found',
          suggestion: 'This column can be removed as it provides no information'
        });
      } else if (column.uniqueCount === 1) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: 'Only one unique value in the entire column',
          suggestion: 'This column can be removed as it provides no information'
        });
      }

      if (
        column.type === 'numeric' &&
        column.min !== undefined &&
        column.max !== undefined
      ) {
        const range = (column.max as number) - (column.min as number);
        if (range === 0) {
          issues.push({
            severity: 'warning',
            column: column.name,
            message: 'All numeric values are identical',
            suggestion: 'Check if this column is correct'
          });
        }
      }
    });

    const maxRowsToCheck = Math.min(data.length, 100);

    for (
      let rowIndex = 0;
      rowIndex < maxRowsToCheck;
      rowIndex += PROCESSING_CHUNK_SIZES.ROW_CHUNK
    ) {
      if (rowIndex > 0) await new Promise((resolve) => setTimeout(resolve, 0));

      const endIndex = Math.min(
        rowIndex + PROCESSING_CHUNK_SIZES.ROW_CHUNK,
        maxRowsToCheck
      );
      for (let currentRow = rowIndex; currentRow < endIndex; currentRow++) {
        const row = data[currentRow];
        for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
          const cell = row[cellIndex];
          if (
            typeof cell === 'string' &&
            cell.length > PERFORMANCE_THRESHOLDS.maxCellLength
          ) {
            issues.push({
              severity: 'warning',
              column: columns[cellIndex]?.name,
              message: `Cell with ${cell.length} characters detected`,
              affectedRows: [currentRow],
              suggestion: 'Very long cells may affect performance'
            });
            break;
          }
        }
      }
    }

    return issues;
  },

  checkPerformance(
    rowCount: number,
    columnCount: number,
    _data: unknown[][]
  ): string[] {
    const warnings: string[] = [];

    if (rowCount > PERFORMANCE_THRESHOLDS.maxRows) {
      warnings.push(
        `Dataset exceeds ${PERFORMANCE_THRESHOLDS.maxRows.toLocaleString()} row limit: ${rowCount.toLocaleString()} rows detected. Processing will be limited to the first ${PERFORMANCE_THRESHOLDS.maxRows.toLocaleString()} rows.`
      );
    } else if (rowCount > PERFORMANCE_THRESHOLDS.warningRows) {
      warnings.push(
        `Large dataset: ${rowCount.toLocaleString()} rows (warning threshold: ${PERFORMANCE_THRESHOLDS.warningRows.toLocaleString()}). Processing may take some time.`
      );
    }

    if (columnCount > PERFORMANCE_THRESHOLDS.maxColumns) {
      warnings.push(
        `Dataset exceeds ${PERFORMANCE_THRESHOLDS.maxColumns} column limit: ${columnCount} columns detected. Maximum supported: ${PERFORMANCE_THRESHOLDS.maxColumns}.`
      );
    } else if (columnCount > PERFORMANCE_THRESHOLDS.warningColumns) {
      warnings.push(
        `Many columns: ${columnCount} (warning threshold: ${PERFORMANCE_THRESHOLDS.warningColumns}). Consider selecting only necessary columns.`
      );
    }

    const estimatedSize = rowCount * columnCount * 50;
    const maxFileSizeMB = PERFORMANCE_THRESHOLDS.maxFileSize / (1024 * 1024);
    if (estimatedSize > PERFORMANCE_THRESHOLDS.maxFileSize) {
      warnings.push(
        `Estimated data size exceeds ${maxFileSizeMB}MB limit. Consider splitting your data.`
      );
    }

    return warnings;
  },

  generateSuggestions(
    columns: ColumnStatistics[],
    geoDetection: GeoDetectionResult,
    qualityIssues: DataQualityIssue[],
    performanceWarnings: string[]
  ): string[] {
    const suggestions: string[] = [];

    if (!geoDetection.hasGeoColumns) {
      suggestions.push(
        'No geographic column detected. Make sure you have a column with place names, ISO codes, or coordinates.'
      );
    } else if (geoDetection.suggestedPrimaryGeoColumn) {
      const geoCol = geoDetection.suggestedPrimaryGeoColumn;
      suggestions.push(
        `Suggested primary geographic column: "${geoCol.columnName}" (${geoCol.type}, confidence: ${(geoCol.confidence * 100).toFixed(0)}%)`
      );
    }

    const numericColumns = columns.filter((c) => c.type === 'numeric');
    if (numericColumns.length === 0) {
      suggestions.push(
        'No numeric column detected. Quantitative visualizations require numeric data.'
      );
    }

    const highNullColumns = columns.filter((c) => c.nullPercentage > 30);
    if (highNullColumns.length > 0) {
      suggestions.push(
        `${highNullColumns.length} column(s) with many missing values. Consider excluding or completing them.`
      );
    }

    if (performanceWarnings.length > 0) {
      suggestions.push(
        'Potential performance issues detected. Consider filtering or sampling your data.'
      );
    }

    const severeIssues = qualityIssues.filter((i) => i.severity === 'error');
    if (severeIssues.length > 0) {
      suggestions.push(
        m.data_quality_critical_issues({ count: severeIssues.length })
      );
    }

    return suggestions;
  },

  estimateProcessingTime(rowCount: number, columnCount: number): number {
    const baseTime = 100;
    const rowFactor = rowCount * 0.5;
    const columnFactor = columnCount * 10;
    const complexityFactor = Math.log10(rowCount * columnCount) * 100;

    return Math.round(baseTime + rowFactor + columnFactor + complexityFactor);
  },

  formatQualityReport(analysis: DataAnalysisResult): string {
    const lines: string[] = [];

    lines.push(m.data_quality_report_title());
    lines.push(
      m.data_quality_report_counts({
        rows: analysis.rowCount,
        columns: analysis.columnCount
      })
    );
    lines.push(
      m.data_quality_report_estimated_time({
        ms: analysis.estimatedProcessingTime ?? 0
      })
    );

    if (analysis.geoDetection.hasGeoColumns) {
      lines.push(m.data_quality_report_geo_columns_title());
      analysis.geoDetection.geoColumns.forEach((col) => {
        lines.push(
          m.data_quality_report_geo_column_item({
            column: col.columnName,
            type: col.type,
            confidence: (col.confidence * 100).toFixed(0)
          })
        );
      });
      lines.push('');
    }

    if (analysis.qualityIssues.length > 0) {
      lines.push(m.data_quality_report_quality_issues_title());
      analysis.qualityIssues.forEach((issue) => {
        const icon =
          issue.severity === 'error'
            ? '❌'
            : issue.severity === 'warning'
              ? '⚠️'
              : 'ℹ️';
        lines.push(
          m.data_quality_report_issue_item({ icon, message: issue.message })
        );
        if (issue.suggestion) {
          lines.push(
            m.data_quality_report_issue_suggestion({
              suggestion: issue.suggestion
            })
          );
        }
      });
      lines.push('');
    }

    if (analysis.suggestions.length > 0) {
      lines.push(m.data_quality_report_suggestions_title());
      analysis.suggestions.forEach((suggestion) => {
        lines.push(m.data_quality_report_suggestion_item({ suggestion }));
      });
    }

    return lines.join('\n');
  }
} as const;
