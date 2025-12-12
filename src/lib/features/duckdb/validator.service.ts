import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import {
  DeepDataValidator,
  type DataAnalysisResult
} from '$lib/features/commons/utils/deep-validator.utils';
import {
  GeoMatcher,
  type MatchResult
} from '$lib/features/commons/utils/geo-matcher.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from './duck';

interface DuckDBAnalysisColumn {
  name: string;
  type_simple?: string;
  id_words?: boolean;
  lat_words?: boolean;
  lon_words?: boolean;
  [key: string]: unknown;
}

export interface ValidationResult {
  dataAnalysis: DataAnalysisResult;
  duckdbAnalysis?: {
    columns: DuckDBAnalysisColumn[];
    summaries: Record<string, unknown>[];
    histograms: Array<{
      column: string;
      type: string;
      data: unknown;
    }>;
  };
  geoMatchResult?: MatchResult;
  suggestedCatalogue?: {
    catalogueId: string;
    confidence: number;
  };
  isValid: boolean;
  criticalErrors: string[];
}

export const DuckDBValidatorService = {
  async validateWithDuckDB(
    tableName: string,
    headers: string[],
    data: unknown[][],
    options: {
      skipGeoDetection?: boolean;
      catalogueId?: string;
      performanceCheck?: boolean;
    } = {}
  ): Promise<ValidationResult> {
    try {
      await DuckDBValidatorService.installAnalysisMacros();

      const dataAnalysis = await DeepDataValidator.analyzeDataContent(
        headers,
        data,
        { skipGeoDetection: options.skipGeoDetection }
      );

      const duckdbAnalysis = await DuckDBValidatorService.runDuckDBAnalysis(
        tableName,
        headers
      );

      let geoMatchResult: MatchResult | undefined;
      let suggestedCatalogue:
        | { catalogueId: string; confidence: number }
        | undefined;

      if (
        dataAnalysis.geoDetection.hasGeoColumns &&
        dataAnalysis.geoDetection.suggestedPrimaryGeoColumn
      ) {
        const geoColumn = dataAnalysis.geoDetection.suggestedPrimaryGeoColumn;
        const columnIndex = geoColumn.index;
        const geoValues = data
          .slice(0, Math.min(1000, data.length))
          .map((row) => row[columnIndex])
          .filter((v) => v != null && v !== '')
          .map((v) => String(v));

        if (options.catalogueId) {
          geoMatchResult = await GeoMatcher.validateAgainstCatalogue(
            geoValues,
            options.catalogueId
          );
        } else {
          suggestedCatalogue =
            (await GeoMatcher.suggestCatalogue(geoValues.slice(0, 100))) ||
            undefined;

          if (suggestedCatalogue) {
            geoMatchResult = await GeoMatcher.validateAgainstCatalogue(
              geoValues,
              suggestedCatalogue.catalogueId
            );
          }
        }
      }

      const criticalErrors = DuckDBValidatorService.detectCriticalErrors(
        dataAnalysis,
        geoMatchResult
      );

      return {
        dataAnalysis,
        duckdbAnalysis,
        geoMatchResult,
        suggestedCatalogue,
        isValid: criticalErrors.length === 0,
        criticalErrors
      };
    } catch (error) {
      logger.error('Validation error', LogCategory.DUCKDB, error);
      throw error;
    }
  },

  async installAnalysisMacros(): Promise<void> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    logger.debug(
      'DuckDB analysis macros are bundled and ready',
      LogCategory.DUCKDB
    );
  },

  async runDuckDBAnalysis(
    tableName: string,
    headers: string[]
  ): Promise<{
    columns: DuckDBAnalysisColumn[];
    summaries: Record<string, unknown>[];
    histograms: Array<{
      column: string;
      type: string;
      data: unknown;
    }>;
  }> {
    if (!Duck) {
      throw new DuckDBError('DuckDB not initialized');
    }

    const columns: DuckDBAnalysisColumn[] = [];
    const summaries: Record<string, unknown>[] = [];
    const histograms: Array<{ column: string; type: string; data: unknown }> =
      [];

    const escapedTableName = escapeSqlString(tableName);

    try {
      const describeResult = (await Duck.query(
        `SELECT * FROM describe_full('${escapedTableName}')`
      )) as Record<string, unknown>;
      const resultData = (describeResult?.data || []) as DuckDBAnalysisColumn[];
      columns.push(...resultData);

      for (const header of headers) {
        const escapedHeader = escapeSqlString(header);

        try {
          const summaryResult = (await Duck.query(
            `SELECT * FROM summary_general('${escapedTableName}', '${escapedHeader}')`
          )) as Record<string, unknown>;
          const summaryData = summaryResult?.data as Record<string, unknown>[];
          if (summaryData && summaryData.length > 0) {
            summaries.push(summaryData[0]);
          }

          const columnInfo = columns.find((c) => c.name === header);
          if (columnInfo) {
            if (columnInfo.type_simple === 'numeric') {
              const numericSummary = (await Duck.query(
                `SELECT * FROM summary_numeric('${escapedTableName}', '${escapedHeader}')`
              )) as Record<string, unknown>;
              const numericData = numericSummary?.data as Record<
                string,
                unknown
              >[];
              if (numericData && numericData.length > 0) {
                summaries.push({
                  ...summaries[summaries.length - 1],
                  ...numericData[0]
                });
              }

              const histogram = (await Duck.query(
                `SELECT * FROM histogram_numeric('${escapedTableName}', '${escapedHeader}')`
              )) as Record<string, unknown>;
              if (histogram?.data) {
                histograms.push({
                  column: header,
                  type: 'numeric',
                  data: histogram.data
                });
              }
            } else if (columnInfo.type_simple === 'string') {
              const histogram = (await Duck.query(
                `SELECT * FROM histogram_categorical('${escapedTableName}', '${escapedHeader}')`
              )) as Record<string, unknown>;
              if (histogram?.data) {
                histograms.push({
                  column: header,
                  type: 'categorical',
                  data: histogram.data
                });
              }
            }
          }
        } catch (error) {
          logger.warn(
            'Failed to compute DuckDB column summary',
            LogCategory.DUCKDB,
            { header, error }
          );
        }
      }

      return { columns, summaries, histograms };
    } catch (error) {
      logger.error('DuckDB analysis failed', LogCategory.DUCKDB, error);
      return { columns: [], summaries: [], histograms: [] };
    }
  },

  detectCriticalErrors(
    dataAnalysis: DataAnalysisResult,
    geoMatchResult?: MatchResult
  ): string[] {
    const errors: string[] = [];

    if (!dataAnalysis.geoDetection.hasGeoColumns) {
      errors.push(
        'Aucune colonne géographique détectée. Impossible de créer une carte sans données géographiques.'
      );
    }

    if (dataAnalysis.rowCount === 0) {
      errors.push('Le fichier ne contient aucune donnée.');
    }

    if (dataAnalysis.columnCount === 0) {
      errors.push('Le fichier ne contient aucune colonne.');
    }

    if (geoMatchResult && geoMatchResult.matchRate < 0.1) {
      errors.push(
        `Seulement ${(geoMatchResult.matchRate * 100).toFixed(0)}% des valeurs correspondent au fond de carte. Vérifiez vos données.`
      );
    }

    const criticalQualityIssues = dataAnalysis.qualityIssues.filter(
      (issue) => issue.severity === 'error'
    );
    criticalQualityIssues.forEach((issue) => {
      errors.push(issue.message);
    });

    if (dataAnalysis.rowCount > 10000) {
      errors.push(
        `Le fichier contient ${dataAnalysis.rowCount} lignes. Maximum supporté: 10000 lignes.`
      );
    }

    return errors;
  },

  formatValidationReport(validation: ValidationResult): string {
    const lines: string[] = [];

    lines.push('=== RAPPORT DE VALIDATION COMPLET ===\n');

    if (validation.criticalErrors.length > 0) {
      lines.push('❌ ERREURS CRITIQUES:');
      validation.criticalErrors.forEach((error) => {
        lines.push(`  • ${error}`);
      });
      lines.push('');
    }

    lines.push(DeepDataValidator.formatQualityReport(validation.dataAnalysis));

    if (validation.geoMatchResult) {
      lines.push(
        '\n' + GeoMatcher.formatMatchReport(validation.geoMatchResult)
      );
    }

    if (validation.suggestedCatalogue) {
      lines.push(
        `\n💡 Catalogue suggéré: ${validation.suggestedCatalogue.catalogueId} ` +
          `(confiance: ${(validation.suggestedCatalogue.confidence * 100).toFixed(0)}%)`
      );
    }

    if (validation.duckdbAnalysis) {
      lines.push('\n=== ANALYSE DUCKDB ===');
      lines.push(
        `Colonnes analysées: ${validation.duckdbAnalysis.columns.length}`
      );
      lines.push(
        `Résumés statistiques: ${validation.duckdbAnalysis.summaries.length}`
      );
      lines.push(
        `Histogrammes générés: ${validation.duckdbAnalysis.histograms.length}`
      );

      const geoColumns = validation.duckdbAnalysis.columns.filter(
        (c) => c.id_words || c.lat_words || c.lon_words
      );
      if (geoColumns.length > 0) {
        lines.push('\nColonnes géographiques détectées par DuckDB:');
        geoColumns.forEach((col) => {
          const types = [];
          if (col.id_words) types.push('identifiant');
          if (col.lat_words) types.push('latitude');
          if (col.lon_words) types.push('longitude');
          lines.push(`  • ${col.name}: ${types.join(', ')}`);
        });
      }
    }

    lines.push(
      '\n' +
        (validation.isValid ? '✅ Validation réussie' : '❌ Validation échouée')
    );

    return lines.join('\n');
  }
} as const;
