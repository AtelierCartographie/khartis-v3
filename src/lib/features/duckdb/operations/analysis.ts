import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import { getTableMetadata } from '../cache/cache-manager';
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
  let isSampled = false;
  const sampleViewName = `${table}_sample_${Date.now()}`;

  if (rowCount > SAMPLE_THRESHOLD) {
    try {
      await executeQuery(
        ctx.connection,
        `CREATE VIEW "${sampleViewName}" AS SELECT * FROM "${table}" USING SAMPLE ${SAMPLE_THRESHOLD} ROWS`
      );
      analysisTable = sampleViewName;
      isSampled = true;
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

          try {
            summary_general = (await executeQuery(
              ctx.connection,
              `FROM summary_general(${table}, "${d.name}")`,
              { useProxy: false }
            )) as ArrowTableLike;
          } catch (e) {
            logger.warn(
              `Failed summary_general for ${d.name}`,
              LogCategory.DUCKDB,
              e
            );
          }

          switch (type) {
            case 'numeric': {
              const [numeric, hist] = await Promise.all([
                executeQuery(
                  ctx.connection,
                  `FROM summary_numeric(${analysisTable}, "${d.name}")`,
                  { useProxy: false }
                ) as Promise<ArrowTableLike>,
                executeQuery(
                  ctx.connection,
                  `FROM histogram_numeric(${analysisTable}, "${d.name}")`
                )
              ]);
              summary_numeric = numeric;
              histogram = hist;
              break;
            }

            case 'date': {
              const [dateSum, histDate] = await Promise.all([
                executeQuery(
                  ctx.connection,
                  `FROM summary_date(${analysisTable}, "${d.name}")`,
                  { useProxy: false }
                ) as Promise<ArrowTableLike>,
                executeQuery(
                  ctx.connection,
                  `FROM histogram_numeric(${analysisTable}, "${d.name}")`
                )
              ]);
              summary_date = dateSum;
              histogram = histDate;
              break;
            }

            case 'string': {
              const [histStr] = await Promise.all([
                executeQuery(
                  ctx.connection,
                  `FROM histogram_categorical(${analysisTable}, "${d.name}")`
                )
              ]);
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
    if (isSampled) {
      try {
        await executeQuery(
          ctx.connection,
          `DROP VIEW IF EXISTS "${sampleViewName}"`
        );
      } catch (_e) {
        // ignore
      }
    }
  }
}

export async function getRowCount(
  ctx: DuckDBContext,
  table: string
): Promise<number> {
  const cached = ctx.rowCountCache.get(table);
  if (cached !== undefined) return cached;

  try {
    const result = (await executeQuery(
      ctx.connection,
      `SELECT CAST(COUNT(*) AS DOUBLE) as num_rows FROM "${table}"`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ num_rows: number }>;

    const count = Number(result[0]?.num_rows ?? 0);
    ctx.rowCountCache.set(table, count);
    return count;
  } catch (error) {
    logger.error('Failed to get row count', LogCategory.DUCKDB, {
      table,
      error
    });
    throw error;
  }
}
