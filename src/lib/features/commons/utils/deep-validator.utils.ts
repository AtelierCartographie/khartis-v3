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

const PERFORMANCE_THRESHOLDS = {
  maxRows: 10_000,
  warningRows: 5_000,
  maxColumns: 100,
  warningColumns: 50,
  maxCellLength: 2_000,
  maxFileSize: 50 * 1024 * 1024
} as const;

const TYPE_DETECTION_SAMPLES = 100;

const PROCESSING_CHUNK_SIZES = {
  COLUMN_CHUNK: 10,
  VALUE_CHUNK: 1_000,
  ROW_CHUNK: 20
} as const;

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
    let nullCount = 0;
    const uniqueValues = new Set<unknown>();
    const valueOccurrences = new Map<unknown, number>();
    const sampleValues: unknown[] = [];

    const CHUNK_SIZE = PROCESSING_CHUNK_SIZES.VALUE_CHUNK;
    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

      const chunk = values.slice(i, i + CHUNK_SIZE);
      for (const value of chunk) {
        if (
          value == null ||
          value === '' ||
          value === 'null' ||
          value === 'NULL'
        ) {
          nullCount++;
          continue;
        }

        uniqueValues.add(value);
        valueOccurrences.set(value, (valueOccurrences.get(value) || 0) + 1);

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

    if (type === 'numeric' && nonNullValues.length > 0) {
      let numericCount = 0;
      let numericMin = Infinity;
      let numericMax = -Infinity;
      let numericMean = 0;
      let numericM2 = 0;
      const numericValues: number[] = [];

      for (let i = 0; i < nonNullValues.length; i += CHUNK_SIZE) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

        const chunk = nonNullValues.slice(i, i + CHUNK_SIZE);
        for (const value of chunk) {
          const numValue = parseFloat(String(value));
          if (!isNaN(numValue)) {
            numericValues.push(numValue);
            numericCount++;

            if (numValue < numericMin) numericMin = numValue;
            if (numValue > numericMax) numericMax = numValue;

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
        stats.standardDeviation =
          numericCount > 1 ? Math.sqrt(numericM2 / numericCount) : 0;
      }
    } else if (type === 'string' && nonNullValues.length > 0) {
      let stringMin: string | undefined;
      let stringMax: string | undefined;

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

    await new Promise((resolve) => setTimeout(resolve, 0));

    columns.forEach((column) => {
      if (column.nullPercentage > DATA_VALIDATION.NULL_PERCENTAGE_THRESHOLD) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: m.column_validation_missing_values({
            percentage: column.nullPercentage.toFixed(1)
          }),
          suggestion: m.column_validation_missing_values_hint()
        });
      }

      if (column.uniquePercentage === 100 && column.type === 'string') {
        issues.push({
          severity: 'info',
          column: column.name,
          message: m.column_validation_all_unique(),
          suggestion: m.column_validation_identifier_hint()
        });
      }

      if (column.uniqueCount === 0 || column.nullPercentage === 100) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: m.column_validation_empty(),
          suggestion: m.column_validation_empty_hint()
        });
      } else if (column.uniqueCount === 1) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: m.column_validation_single_value(),
          suggestion: m.column_validation_single_value_hint()
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
            message: m.column_validation_identical_numeric(),
            suggestion: m.column_validation_identical_hint()
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
              message: m.column_validation_long_cell({
                count: String(cell.length)
              }),
              affectedRows: [currentRow],
              suggestion: m.column_validation_long_cell_hint()
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
        m.data_quality_perf_row_limit_exceeded({
          maxRows: PERFORMANCE_THRESHOLDS.maxRows.toLocaleString(),
          rowCount: rowCount.toLocaleString()
        })
      );
    } else if (rowCount > PERFORMANCE_THRESHOLDS.warningRows) {
      warnings.push(
        m.data_quality_perf_large_dataset({
          rowCount: rowCount.toLocaleString(),
          warningRows: PERFORMANCE_THRESHOLDS.warningRows.toLocaleString()
        })
      );
    }

    if (columnCount > PERFORMANCE_THRESHOLDS.maxColumns) {
      warnings.push(
        m.data_quality_perf_column_limit_exceeded({
          maxColumns: String(PERFORMANCE_THRESHOLDS.maxColumns),
          columnCount: String(columnCount)
        })
      );
    } else if (columnCount > PERFORMANCE_THRESHOLDS.warningColumns) {
      warnings.push(
        m.data_quality_perf_many_columns({
          columnCount: String(columnCount),
          warningColumns: String(PERFORMANCE_THRESHOLDS.warningColumns)
        })
      );
    }

    const estimatedSize = rowCount * columnCount * 50;
    const maxFileSizeMB = PERFORMANCE_THRESHOLDS.maxFileSize / (1024 * 1024);
    if (estimatedSize > PERFORMANCE_THRESHOLDS.maxFileSize) {
      warnings.push(
        m.data_quality_perf_file_size_exceeded({
          maxFileSizeMB: String(maxFileSizeMB)
        })
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
      suggestions.push(m.data_quality_suggest_no_geo_column());
    } else if (geoDetection.suggestedPrimaryGeoColumn) {
      const geoCol = geoDetection.suggestedPrimaryGeoColumn;
      suggestions.push(
        m.data_quality_suggest_primary_geo_column({
          columnName: geoCol.columnName,
          type: geoCol.type,
          confidence: (geoCol.confidence * 100).toFixed(0)
        })
      );
    }

    const numericColumns = columns.filter((c) => c.type === 'numeric');
    if (numericColumns.length === 0) {
      suggestions.push(m.data_quality_suggest_no_numeric_column());
    }

    const highNullColumns = columns.filter((c) => c.nullPercentage > 30);
    if (highNullColumns.length > 0) {
      suggestions.push(
        m.data_quality_suggest_missing_values({
          count: String(highNullColumns.length)
        })
      );
    }

    if (performanceWarnings.length > 0) {
      suggestions.push(m.data_quality_suggest_performance_issues());
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
