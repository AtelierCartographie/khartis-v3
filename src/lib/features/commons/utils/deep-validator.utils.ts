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
  maxRows: 10000,
  warningRows: 5000,
  maxColumns: 100,
  warningColumns: 50,
  maxCellLength: 2000,
  maxFileSize: 50 * 1024 * 1024
} as const;

const TYPE_DETECTION_SAMPLES = 100;

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
    const COLUMN_CHUNK_SIZE = 10;

    // Process columns in chunks to avoid blocking
    for (let i = 0; i < headers.length; i += COLUMN_CHUNK_SIZE) {
      // Yield to event loop between chunks
      await new Promise((resolve) => setTimeout(resolve, 0));

      const endIndex = Math.min(i + COLUMN_CHUNK_SIZE, headers.length);

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
    const CHUNK_SIZE = 1000;
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

    const threshold = total * 0.8;

    if (types.date >= threshold) return 'date';
    if (types.numeric >= threshold) return 'numeric';
    if (types.boolean >= threshold) return 'boolean';
    if (types.string >= threshold) return 'string';

    return 'mixed';
  },

  isDateString(strValue: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}/.test(strValue) && !/^\d{2}\/\d{2}\/\d{4}/.test(strValue)) {
      return false;
    }
    const date = new Date(strValue);
    return !isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100;
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
      if (column.nullPercentage > 50) {
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

    // Check for long cells in chunks to avoid blocking
    const maxRowsToCheck = Math.min(data.length, 100);
    const ROW_CHUNK_SIZE = 20;

    for (
      let rowIndex = 0;
      rowIndex < maxRowsToCheck;
      rowIndex += ROW_CHUNK_SIZE
    ) {
      // Yield to event loop between chunks
      if (rowIndex > 0) await new Promise((resolve) => setTimeout(resolve, 0));

      const endIndex = Math.min(rowIndex + ROW_CHUNK_SIZE, maxRowsToCheck);
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
        `Large file: ${rowCount} rows. Processing will be limited to the first ${PERFORMANCE_THRESHOLDS.maxRows} rows.`
      );
    } else if (rowCount > PERFORMANCE_THRESHOLDS.warningRows) {
      warnings.push(
        `Important file: ${rowCount} rows. Processing may take some time.`
      );
    }

    if (columnCount > PERFORMANCE_THRESHOLDS.maxColumns) {
      warnings.push(
        `Too many columns: ${columnCount}. Maximum supported: ${PERFORMANCE_THRESHOLDS.maxColumns}.`
      );
    } else if (columnCount > PERFORMANCE_THRESHOLDS.warningColumns) {
      warnings.push(
        `Many columns: ${columnCount}. Consider selecting only necessary columns.`
      );
    }

    const estimatedSize = rowCount * columnCount * 50;
    if (estimatedSize > PERFORMANCE_THRESHOLDS.maxFileSize) {
      warnings.push(
        'Estimated file size very large. Consider splitting your data.'
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
        `${severeIssues.length} critical issue(s) detected. Fix them before continuing.`
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

    lines.push("=== RAPPORT D'ANALYSE DES DONNÉES ===\n");
    lines.push(
      `Lignes: ${analysis.rowCount} | Colonnes: ${analysis.columnCount}`
    );
    lines.push(
      `Temps de traitement estimé: ${analysis.estimatedProcessingTime}ms\n`
    );

    if (analysis.geoDetection.hasGeoColumns) {
      lines.push('COLONNES GÉOGRAPHIQUES DÉTECTÉES:');
      analysis.geoDetection.geoColumns.forEach((col) => {
        lines.push(
          `  - ${col.columnName}: ${col.type} (confiance: ${(col.confidence * 100).toFixed(0)}%)`
        );
      });
      lines.push('');
    }

    if (analysis.qualityIssues.length > 0) {
      lines.push('PROBLÈMES DE QUALITÉ:');
      analysis.qualityIssues.forEach((issue) => {
        const icon =
          issue.severity === 'error'
            ? '❌'
            : issue.severity === 'warning'
              ? '⚠️'
              : 'ℹ️';
        lines.push(`  ${icon} ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`     → ${issue.suggestion}`);
        }
      });
      lines.push('');
    }

    if (analysis.suggestions.length > 0) {
      lines.push('SUGGESTIONS:');
      analysis.suggestions.forEach((suggestion) => {
        lines.push(`  • ${suggestion}`);
      });
    }

    return lines.join('\n');
  }
} as const;
