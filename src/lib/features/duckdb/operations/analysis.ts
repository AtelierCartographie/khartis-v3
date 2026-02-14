import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { getTableMetadata } from '../cache/cache-manager';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import { getRowCount } from './table-ops';
import type {
  AnalyseOptions,
  AnalysisResult,
  AnalysisResults,
  ArrowTableLike,
  DuckDBContext
} from '../types';

export async function describeColumns(
  ctx: DuckDBContext,
  table: string
): Promise<AnalysisResults> {
  const escapedTable = escapeSqlString(table);
  const describe_full = (await executeQuery(
    ctx.connection,
    `FROM describe_full('${escapedTable}')`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY, useProxy: false }
  )) as Record<string, unknown>[];

  return describe_full as AnalysisResults;
}

/**
 * Analyzes the specified table and returns an array of indicators with summaries and histograms.
 *
 * For large tables (>50k rows), uses a sample for analysis.
 * Processes columns in parallel batches by type (numeric, date, string).
 *
 * @param ctx - The DuckDB context.
 * @param table - The name of the table to analyze.
 * @param options.force - If true, forces a re-analysis bypassing the cache.
 * @returns An array of indicator objects, each containing:
 *   - name: The name of the column.
 *   - type_simple: The simplified type ('numeric', 'date', 'string').
 *   - summary_general: General summary statistics.
 *   - summary_numeric/summary_date: Type-specific summary statistics.
 *   - histogram: Histogram data for summary plots.
 */
export async function analyse(
  ctx: DuckDBContext,
  table: string,
  options: AnalyseOptions = {}
): Promise<AnalysisResults> {
  const { force = false } = options;
  const table_metadata = getTableMetadata(ctx, table);
  const { analysis } = table_metadata;

  if (!force && analysis) return analysis;
  if (force && analysis) delete table_metadata.analysis;

  const escapedTable = escapeSqlString(table);

  const describe_full = (await executeQuery(
    ctx.connection,
    `FROM describe_full('${escapedTable}')`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY, useProxy: false }
  )) as Record<string, unknown>[];

  const numericColumns = describe_full.filter(
    (d) => d.type_simple === 'numeric'
  );
  const dateColumns = describe_full.filter((d) => d.type_simple === 'date');
  const stringColumns = describe_full.filter((d) => d.type_simple === 'string');
  const otherColumns = describe_full.filter(
    (d) =>
      d.type_simple !== 'numeric' &&
      d.type_simple !== 'date' &&
      d.type_simple !== 'string'
  );

  const rowCount = await getRowCount(ctx, table);
  const SAMPLE_THRESHOLD = 50000;
  let analysisTable = table;
  const sampleViewName = `${table}_sample_${Date.now()}`;

  if (rowCount > SAMPLE_THRESHOLD) {
    try {
      const escapedTableForSample = escapeIdentifier(table);
      await executeQuery(
        ctx.connection,
        `CREATE TEMP TABLE "${sampleViewName}" AS SELECT * FROM "${escapedTableForSample}" USING SAMPLE ${SAMPLE_THRESHOLD} ROWS`
      );
      analysisTable = sampleViewName;
      logger.debug('Using sampled view for analysis', LogCategory.DUCKDB, {
        table,
        sampleViewName,
        rowCount,
        sampleSize: SAMPLE_THRESHOLD
      });
    } catch (error) {
      logger.warn(
        'Failed to create sample view, falling back to full table',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  const processColumnBatch = async (
    columns: Record<string, unknown>[],
    type: string
  ): Promise<AnalysisResult[]> => {
    if (columns.length === 0) return [];

    const BATCH_SIZE = 5;
    const results: AnalysisResult[] = [];

    for (let i = 0; i < columns.length; i += BATCH_SIZE) {
      const batch = columns.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (d) => {
          let summary_general: ArrowTableLike | null = null;
          let summary_numeric: ArrowTableLike | null = null;
          let summary_date: ArrowTableLike | null = null;
          let histogram = null;

          const escapedColName = escapeIdentifier(d.name as string);
          const escapedAnalysisTable = escapeSqlString(analysisTable);

          const generalPromise = executeQuery(
            ctx.connection,
            `FROM summary_general('${escapedAnalysisTable}', "${escapedColName}")`,
            { useProxy: false }
          )
            .then((r) => r as ArrowTableLike)
            .catch((e) => {
              logger.warn(
                `Failed summary_general for ${d.name}`,
                LogCategory.DUCKDB,
                e
              );
              return null;
            });

          switch (type) {
            case 'numeric': {
              const [general, numeric, hist] = await Promise.all([
                generalPromise,
                executeQuery(
                  ctx.connection,
                  `FROM summary_numeric('${escapedAnalysisTable}', "${escapedColName}")`,
                  { useProxy: false }
                )
                  .then((r) => r as ArrowTableLike)
                  .catch((e) => {
                    logger.warn(
                      `Failed summary_numeric for ${d.name}`,
                      LogCategory.DUCKDB,
                      e
                    );
                    return null;
                  }),
                executeQuery(
                  ctx.connection,
                  `FROM histogram_numeric('${escapedAnalysisTable}', "${escapedColName}")`
                ).catch((e) => {
                  logger.warn(
                    `Failed histogram_numeric for ${d.name}`,
                    LogCategory.DUCKDB,
                    e
                  );
                  return null;
                })
              ]);
              summary_general = general;
              summary_numeric = numeric;
              histogram = hist;
              break;
            }

            case 'date': {
              const [general, dateSum, histDate] = await Promise.all([
                generalPromise,
                executeQuery(
                  ctx.connection,
                  `FROM summary_date('${escapedAnalysisTable}', "${escapedColName}")`,
                  { useProxy: false }
                )
                  .then((r) => r as ArrowTableLike)
                  .catch((e) => {
                    logger.warn(
                      `Failed summary_date for ${d.name}`,
                      LogCategory.DUCKDB,
                      e
                    );
                    return null;
                  }),
                executeQuery(
                  ctx.connection,
                  `FROM histogram_date('${escapedAnalysisTable}', "${escapedColName}")`
                ).catch((e) => {
                  logger.warn(
                    `Failed histogram_date for ${d.name}`,
                    LogCategory.DUCKDB,
                    e
                  );
                  return null;
                })
              ]);
              summary_general = general;
              summary_date = dateSum;
              histogram = histDate;
              break;
            }

            case 'string': {
              const [general, histStr] = await Promise.all([
                generalPromise,
                executeQuery(
                  ctx.connection,
                  `FROM histogram_categorical('${escapedAnalysisTable}', "${escapedColName}")`
                )
              ]);
              summary_general = general;
              histogram = histStr;
              break;
            }
          }

          return {
            ...d,
            ...(summary_general?.get(0) ?? {}),
            ...(summary_numeric?.get(0) ?? {}),
            ...(summary_date?.get(0) ?? {}),
            histogram
          } as AnalysisResult;
        })
      );
      results.push(...batchResults);
    }

    return results;
  };

  try {
    const [numericResults, dateResults, stringResults, otherResults] =
      await Promise.all([
        processColumnBatch(numericColumns, 'numeric'),
        processColumnBatch(dateColumns, 'date'),
        processColumnBatch(stringColumns, 'string'),
        Promise.resolve(otherColumns.map((d) => ({ ...d }) as AnalysisResult))
      ]);

    const analysis_result = describe_full.map((col) => {
      const allResults = [
        ...numericResults,
        ...dateResults,
        ...stringResults,
        ...otherResults
      ];
      return (
        allResults.find((r) => r.name === col.name) || (col as AnalysisResult)
      );
    });

    table_metadata.analysis = analysis_result;

    return analysis_result;
  } finally {
    try {
      await executeQuery(
        ctx.connection,
        `DROP TABLE IF EXISTS "${sampleViewName}"`
      );
    } catch {
      /* ignore cleanup errors */
    }
  }
}
