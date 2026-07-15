import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  PERF_PHASE,
  perfMark,
  perfMeasure
} from '$lib/features/commons/utils/perf-marks.utils';
import {
  getTableMetadata,
  registerTableMutationCallback
} from '../cache/cache-manager';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import { getRowCount } from './table-ops';
import { DuckDBSimplifiedType } from '../types';
import type {
  AnalyseOptions,
  AnalysisResult,
  AnalysisResults,
  ArrowTableLike,
  DuckDBContext
} from '../types';

registerTableMutationCallback((table, ctx) => {
  const table_metadata = ctx.table_metadata.get(table);
  if (table_metadata?.analysis) {
    delete table_metadata.analysis;
  }
});

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

const ANALYSIS_COLUMN_BATCH_SIZE = 20;

const SUMMARY_GENERAL_FIELDS = [
  'name',
  'length',
  'count',
  'uniques',
  'share_uniques',
  'nulls',
  'share_nulls',
  'duplicates',
  'share_duplicates'
] as const;

const SUMMARY_NUMERIC_FIELDS = [
  'min',
  'max',
  'extent',
  'sign',
  'min_mag',
  'max_mag',
  'extent_magnitude',
  'share_integers',
  'share_floats',
  'mean',
  'median',
  'stddev',
  'skewness',
  'share_rank_interval'
] as const;

const SUMMARY_DATE_FIELDS = ['min', 'max'] as const;

type SummaryStatistic = 'summary_general' | 'summary_numeric' | 'summary_date';

type HistogramMacro =
  'histogram_numeric' | 'histogram_date' | 'histogram_categorical';

interface HistogramSpec {
  column: string;
  macro: HistogramMacro;
}

const HISTOGRAM_STRUCT_FIELDS: Record<HistogramMacro, readonly string[]> = {
  histogram_numeric: ['bin', 'count'],
  histogram_date: ['bin', 'count'],
  histogram_categorical: ['category', 'count', 'percent']
};

function columnBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function columnKey(index: number): string {
  return `__c${index}`;
}

function isArrowTableLike(value: unknown): value is ArrowTableLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    typeof value.get === 'function'
  );
}

function readSingleRow(result: unknown): Record<string, unknown> {
  if (!isArrowTableLike(result)) {
    throw new Error('Unexpected multi-column analysis result shape');
  }
  const row = result.get(0);
  if (row == null) {
    throw new Error('Empty multi-column analysis result');
  }
  return row;
}

function unpackSummaryRow(
  row: Record<string, unknown>,
  key: string,
  fields: readonly string[]
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const field of fields) {
    summary[field] = row[`${key}_${field}`];
  }
  return summary;
}

function toHistogramRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      typeof row === 'object' && row !== null
  );
}

function createHistogramTable(rows: Record<string, unknown>[]): ArrowTableLike {
  return {
    numRows: rows.length,
    get: (index: number) => rows[index],
    toArray: () => rows
  };
}

function summaryGeneralSelect(column: string, key: string): string {
  const c = `"${escapeIdentifier(column)}"`;
  return [
    `first(alias(${c})) AS "${key}_name"`,
    `count(*) AS "${key}_length"`,
    `count(${c}) AS "${key}_count"`,
    `count(DISTINCT ${c}) AS "${key}_uniques"`,
    `"${key}_uniques" / "${key}_length" AS "${key}_share_uniques"`,
    `"${key}_length" - count(${c}) AS "${key}_nulls"`,
    `"${key}_nulls" / "${key}_length" AS "${key}_share_nulls"`,
    `"${key}_count" - "${key}_uniques" AS "${key}_duplicates"`,
    `"${key}_duplicates" / "${key}_length" AS "${key}_share_duplicates"`
  ].join(', ');
}

function summaryNumericSelect(column: string, key: string): string {
  const c = `"${escapeIdentifier(column)}"`;
  const min = `"${key}_min"`;
  const max = `"${key}_max"`;
  const minMag = `"${key}_min_mag"`;
  const maxMag = `"${key}_max_mag"`;
  return [
    `min(${c}) AS ${min}`,
    `max(${c}) AS ${max}`,
    `${max} - ${min} AS "${key}_extent"`,
    `CASE WHEN ${min} >= 0 AND ${max} > 0 THEN 'positive' WHEN ${min} < 0 AND ${max} <= 0 THEN 'negative' WHEN ${min} < 0 AND ${max} > 0 THEN 'cross_zero' END AS "${key}_sign"`,
    `CASE WHEN ${min} = 0 THEN 0 ELSE ((${min}).abs().log10().floor() + 1) * sign(${min}) END AS ${minMag}`,
    `CASE WHEN ${max} = 0 THEN 0 ELSE ((${max}).abs().log10().floor() + 1) * sign(${max}) END AS ${maxMag}`,
    `${maxMag} - ${minMag} AS "${key}_extent_magnitude"`,
    `SUM(CASE WHEN MOD(${c}, 1) = 0 THEN 1 ELSE 0 END) * 1.0 / count(*) AS "${key}_share_integers"`,
    `SUM(CASE WHEN MOD(${c}, 1) <> 0 THEN 1 ELSE 0 END) * 1.0 / count(*) AS "${key}_share_floats"`,
    `avg(${c}) AS "${key}_mean"`,
    `median(${c}) AS "${key}_median"`,
    `stddev(${c}) AS "${key}_stddev"`,
    `skewness(${c}) AS "${key}_skewness"`
  ].join(', ');
}

function shareRankIntervalSelect(
  column: string,
  key: string,
  escapedTable: string
): string {
  return `share_rank_interval('${escapedTable}', "${escapeIdentifier(column)}") AS "${key}_share_rank_interval"`;
}

function summaryDateSelect(column: string, key: string): string {
  const c = `"${escapeIdentifier(column)}"`;
  return `min(${c}) AS "${key}_min", max(${c}) AS "${key}_max"`;
}

function histogramSelect(
  spec: HistogramSpec,
  key: string,
  escapedTable: string
): string {
  const c = `"${escapeIdentifier(spec.column)}"`;
  const struct = HISTOGRAM_STRUCT_FIELDS[spec.macro]
    .map((field) => `'${field}': "${field}"`)
    .join(', ');
  return `(SELECT list(h ORDER BY rn) FROM (SELECT {${struct}} AS h, row_number() OVER () AS rn FROM ${spec.macro}('${escapedTable}', ${c}))) AS "${key}"`;
}

function buildGeneralQuery(batch: string[], tableIdentifier: string): string {
  const parts = batch.map((column, index) =>
    summaryGeneralSelect(column, columnKey(index))
  );
  return `SELECT ${parts.join(', ')} FROM ${tableIdentifier}`;
}

function buildNumericQuery(
  batch: string[],
  tableIdentifier: string,
  escapedTable: string
): string {
  const aggregates = batch.map((column, index) =>
    summaryNumericSelect(column, columnKey(index))
  );
  const ranks = batch.map((column, index) =>
    shareRankIntervalSelect(column, columnKey(index), escapedTable)
  );
  return `WITH t1 AS (SELECT ${aggregates.join(', ')} FROM ${tableIdentifier}) FROM t1 POSITIONAL JOIN (SELECT ${ranks.join(', ')})`;
}

function buildDateQuery(batch: string[], tableIdentifier: string): string {
  const parts = batch.map((column, index) =>
    summaryDateSelect(column, columnKey(index))
  );
  return `SELECT ${parts.join(', ')} FROM ${tableIdentifier}`;
}

function buildHistogramQuery(
  batch: HistogramSpec[],
  escapedTable: string
): string {
  const parts = batch.map((spec, index) =>
    histogramSelect(spec, columnKey(index), escapedTable)
  );
  return `SELECT ${parts.join(', ')}`;
}

/**
 * Analyzes the specified table and returns an array of indicators with summaries and histograms.
 *
 * For large tables (>50k rows), uses a sample for analysis.
 * Statistics are computed through multi-column queries grouped by type family
 * (general summary, numeric summary, date summary, histograms), with a
 * per-column fallback when a merged query fails.
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

  perfMark(PERF_PHASE.COLUMN_ANALYSIS);

  const escapedTable = escapeSqlString(table);

  const describe_full = (await executeQuery(
    ctx.connection,
    `FROM describe_full('${escapedTable}')`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY, useProxy: false }
  )) as Record<string, unknown>[];

  const numericColumns = describe_full.filter(
    (d) => d.type_simple === DuckDBSimplifiedType.NUMERIC
  );
  const dateColumns = describe_full.filter(
    (d) => d.type_simple === DuckDBSimplifiedType.DATE
  );
  const stringColumns = describe_full.filter(
    (d) => d.type_simple === DuckDBSimplifiedType.STRING
  );
  const otherColumns = describe_full.filter(
    (d) =>
      d.type_simple !== DuckDBSimplifiedType.NUMERIC &&
      d.type_simple !== DuckDBSimplifiedType.DATE &&
      d.type_simple !== DuckDBSimplifiedType.STRING
  );

  const rowCount = await getRowCount(ctx, table);
  const SAMPLE_THRESHOLD = 50000;
  let analysisTable = table;
  const sampleViewName = `${table}_sample_${Date.now()}`;
  const escapedSampleViewName = escapeIdentifier(sampleViewName);

  if (rowCount > SAMPLE_THRESHOLD) {
    try {
      const escapedTableForSample = escapeIdentifier(table);
      await executeQuery(
        ctx.connection,
        `CREATE TEMP TABLE "${escapedSampleViewName}" AS SELECT * FROM "${escapedTableForSample}" USING SAMPLE ${SAMPLE_THRESHOLD} ROWS`
      );
      analysisTable = sampleViewName;
    } catch (error) {
      logger.error(
        'Failed to create DuckDB analysis sample table',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  const escapedAnalysisTable = escapeSqlString(analysisTable);
  const analysisTableIdentifier = `"${escapeIdentifier(analysisTable)}"`;

  const logAnalysisStatisticFailure = (
    error: unknown,
    columnName: string,
    statistic: string
  ): null => {
    logger.warn(
      'Failed to compute DuckDB analysis statistic',
      LogCategory.DUCKDB,
      {
        error,
        flow: 'duckdb_analysis',
        extra: {
          tableName: table,
          analysisTable,
          columnName,
          statistic
        }
      }
    );
    return null;
  };

  const logAnalysisBatchFailure = (
    error: unknown,
    columnNames: string[],
    statistic: string
  ): void => {
    logger.warn(
      'Failed to compute DuckDB multi-column analysis batch, falling back to per-column queries',
      LogCategory.DUCKDB,
      {
        error,
        flow: 'duckdb_analysis',
        extra: {
          tableName: table,
          analysisTable,
          columnNames,
          statistic
        }
      }
    );
  };

  const fetchColumnSummary = (
    columnName: string,
    statistic: SummaryStatistic
  ): Promise<Record<string, unknown> | null> =>
    executeQuery(
      ctx.connection,
      `FROM ${statistic}('${escapedAnalysisTable}', "${escapeIdentifier(columnName)}")`,
      { useProxy: false }
    )
      .then((result) =>
        isArrowTableLike(result) ? (result.get(0) ?? null) : null
      )
      .catch((error: unknown) =>
        logAnalysisStatisticFailure(error, columnName, statistic)
      );

  const fetchSummaries = async (
    columns: string[],
    statistic: SummaryStatistic,
    buildQuery: (batch: string[]) => string,
    fields: readonly string[]
  ): Promise<Map<string, Record<string, unknown> | null>> => {
    const byColumn = new Map<string, Record<string, unknown> | null>();
    for (const batch of columnBatches(columns, ANALYSIS_COLUMN_BATCH_SIZE)) {
      try {
        const result = await executeQuery(ctx.connection, buildQuery(batch), {
          useProxy: false
        });
        const row = readSingleRow(result);
        batch.forEach((columnName, index) => {
          byColumn.set(
            columnName,
            unpackSummaryRow(row, columnKey(index), fields)
          );
        });
      } catch (error) {
        logAnalysisBatchFailure(error, batch, statistic);
        for (const columnName of batch) {
          byColumn.set(
            columnName,
            await fetchColumnSummary(columnName, statistic)
          );
        }
      }
    }
    return byColumn;
  };

  const fetchHistograms = async (
    specs: HistogramSpec[]
  ): Promise<Map<string, unknown>> => {
    const byColumn = new Map<string, unknown>();
    for (const batch of columnBatches(specs, ANALYSIS_COLUMN_BATCH_SIZE)) {
      try {
        const result = await executeQuery(
          ctx.connection,
          buildHistogramQuery(batch, escapedAnalysisTable),
          { useProxy: false }
        );
        const row = readSingleRow(result);
        batch.forEach((spec, index) => {
          byColumn.set(
            spec.column,
            createHistogramTable(toHistogramRows(row[columnKey(index)]))
          );
        });
      } catch (error) {
        logAnalysisBatchFailure(
          error,
          batch.map((spec) => spec.column),
          'histogram'
        );
        for (const spec of batch) {
          const columnQuery = `FROM ${spec.macro}('${escapedAnalysisTable}', "${escapeIdentifier(spec.column)}")`;
          if (spec.macro === 'histogram_categorical') {
            byColumn.set(
              spec.column,
              await executeQuery(ctx.connection, columnQuery)
            );
          } else {
            byColumn.set(
              spec.column,
              await executeQuery(ctx.connection, columnQuery).catch(
                (error: unknown) =>
                  logAnalysisStatisticFailure(error, spec.column, spec.macro)
              )
            );
          }
        }
      }
    }
    return byColumn;
  };

  try {
    const columnNames = (columns: Record<string, unknown>[]): string[] =>
      columns.map((d) => String(d.name));
    const histogramSpecs: HistogramSpec[] = [
      ...columnNames(numericColumns).map((column): HistogramSpec => ({
        column,
        macro: 'histogram_numeric'
      })),
      ...columnNames(dateColumns).map((column): HistogramSpec => ({
        column,
        macro: 'histogram_date'
      })),
      ...columnNames(stringColumns).map((column): HistogramSpec => ({
        column,
        macro: 'histogram_categorical'
      }))
    ];

    const [generalByColumn, numericByColumn, dateByColumn, histogramByColumn] =
      await Promise.all([
        fetchSummaries(
          columnNames([...numericColumns, ...dateColumns, ...stringColumns]),
          'summary_general',
          (batch) => buildGeneralQuery(batch, analysisTableIdentifier),
          SUMMARY_GENERAL_FIELDS
        ),
        fetchSummaries(
          columnNames(numericColumns),
          'summary_numeric',
          (batch) =>
            buildNumericQuery(
              batch,
              analysisTableIdentifier,
              escapedAnalysisTable
            ),
          SUMMARY_NUMERIC_FIELDS
        ),
        fetchSummaries(
          columnNames(dateColumns),
          'summary_date',
          (batch) => buildDateQuery(batch, analysisTableIdentifier),
          SUMMARY_DATE_FIELDS
        ),
        fetchHistograms(histogramSpecs)
      ]);

    const buildResults = (
      columns: Record<string, unknown>[],
      specificByColumn: Map<string, Record<string, unknown> | null> | null
    ): AnalysisResult[] =>
      columns.map((d) => {
        const columnName = String(d.name);
        return {
          ...d,
          ...(generalByColumn.get(columnName) ?? {}),
          ...(specificByColumn?.get(columnName) ?? {}),
          histogram: histogramByColumn.get(columnName) ?? null
        } as AnalysisResult;
      });

    const numericResults = buildResults(numericColumns, numericByColumn);
    const dateResults = buildResults(dateColumns, dateByColumn);
    const stringResults = buildResults(stringColumns, null);
    const otherResults = otherColumns.map((d) => ({ ...d }) as AnalysisResult);

    const allResults = [
      ...numericResults,
      ...dateResults,
      ...stringResults,
      ...otherResults
    ];
    const analysis_result = describe_full.map(
      (col) =>
        allResults.find((r) => r.name === col.name) || (col as AnalysisResult)
    );

    table_metadata.analysis = analysis_result;

    return analysis_result;
  } finally {
    perfMeasure(PERF_PHASE.COLUMN_ANALYSIS);
    try {
      await executeQuery(
        ctx.connection,
        `DROP TABLE IF EXISTS "${escapedSampleViewName}"`
      );
    } catch {
      /* ignore cleanup errors */
    }
  }
}
