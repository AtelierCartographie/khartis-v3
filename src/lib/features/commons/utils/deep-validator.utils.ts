import {
  GeoColumnDetector,
  type GeoDetectionResult
} from './geo-detector.utils';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

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

      if (
        strValue === 'true' ||
        strValue === 'false' ||
        strValue === '0' ||
        strValue === '1'
      ) {
        types.boolean++;
      } else if (
        !isNaN(parseFloat(strValue)) &&
        isFinite(parseFloat(strValue))
      ) {
        types.numeric++;
      } else if (!isNaN(Date.parse(strValue))) {
        const date = new Date(strValue);
        if (date.getFullYear() > 1900 && date.getFullYear() < 2100) {
          types.date++;
        } else {
          types.string++;
        }
      } else {
        types.string++;
      }
    }

    const total = Object.values(types).reduce((a, b) => a + b, 0);
    if (total === 0) return 'string';

    const threshold = total * 0.8;

    if (types.numeric >= threshold) return 'numeric';
    if (types.date >= threshold) return 'date';
    if (types.boolean >= threshold) return 'boolean';
    if (types.string >= threshold) return 'string';

    return 'mixed';
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
          message: `${column.nullPercentage.toFixed(1)}% de valeurs manquantes`,
          suggestion:
            'Vérifiez si cette colonne est nécessaire ou complétez les données manquantes'
        });
      }

      if (column.uniquePercentage === 100 && column.type === 'string') {
        issues.push({
          severity: 'info',
          column: column.name,
          message: 'Toutes les valeurs sont uniques',
          suggestion: 'Cette colonne pourrait être un identifiant'
        });
      }

      if (column.uniqueCount === 1) {
        issues.push({
          severity: 'warning',
          column: column.name,
          message: 'Une seule valeur unique dans toute la colonne',
          suggestion:
            "Cette colonne peut être supprimée car elle n'apporte pas d'information"
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
            message: 'Toutes les valeurs numériques sont identiques',
            suggestion: 'Vérifiez si cette colonne est correcte'
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
              message: `Cellule avec ${cell.length} caractères détectée`,
              affectedRows: [currentRow],
              suggestion:
                'Les cellules très longues peuvent affecter les performances'
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
        `Fichier volumineux: ${rowCount} lignes. Le traitement sera limité aux ${PERFORMANCE_THRESHOLDS.maxRows} premières lignes.`
      );
    } else if (rowCount > PERFORMANCE_THRESHOLDS.warningRows) {
      warnings.push(
        `Fichier important: ${rowCount} lignes. Le traitement pourrait prendre du temps.`
      );
    }

    if (columnCount > PERFORMANCE_THRESHOLDS.maxColumns) {
      warnings.push(
        `Trop de colonnes: ${columnCount}. Maximum supporté: ${PERFORMANCE_THRESHOLDS.maxColumns}.`
      );
    } else if (columnCount > PERFORMANCE_THRESHOLDS.warningColumns) {
      warnings.push(
        `Nombreuses colonnes: ${columnCount}. Considérez de sélectionner uniquement les colonnes nécessaires.`
      );
    }

    const estimatedSize = rowCount * columnCount * 50;
    if (estimatedSize > PERFORMANCE_THRESHOLDS.maxFileSize) {
      warnings.push(
        'Taille estimée du fichier très importante. Considérez de diviser vos données.'
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
        "Aucune colonne géographique détectée. Assurez-vous d'avoir une colonne avec des noms de lieux, codes ISO ou coordonnées."
      );
    } else if (geoDetection.suggestedPrimaryGeoColumn) {
      const geoCol = geoDetection.suggestedPrimaryGeoColumn;
      suggestions.push(
        `Colonne géographique principale suggérée: "${geoCol.columnName}" (${geoCol.type}, confiance: ${(geoCol.confidence * 100).toFixed(0)}%)`
      );
    }

    const numericColumns = columns.filter((c) => c.type === 'numeric');
    if (numericColumns.length === 0) {
      suggestions.push(
        'Aucune colonne numérique détectée. Les visualisations quantitatives nécessitent des données numériques.'
      );
    }

    const highNullColumns = columns.filter((c) => c.nullPercentage > 30);
    if (highNullColumns.length > 0) {
      suggestions.push(
        `${highNullColumns.length} colonne(s) avec beaucoup de valeurs manquantes. Considérez de les exclure ou compléter.`
      );
    }

    if (performanceWarnings.length > 0) {
      suggestions.push(
        'Des problèmes de performance potentiels ont été détectés. Considérez de filtrer ou échantillonner vos données.'
      );
    }

    const severeIssues = qualityIssues.filter((i) => i.severity === 'error');
    if (severeIssues.length > 0) {
      suggestions.push(
        `${severeIssues.length} problème(s) critique(s) détecté(s). Corrigez-les avant de continuer.`
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
