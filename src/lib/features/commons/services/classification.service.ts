import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import { DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX } from '../utils/discretization.utils';
import { webglToHex } from '../utils/color-utils';
import { DEFAULT_VISUALIZATION_COLOR } from '../constants/colors.constants';
import {
  sequential,
  divergentSequential,
  resolvePalette
} from '@ateliercartographie/ok-palette';
import type { WebGLColor, ContrastMode } from '@ateliercartographie/ok-palette';
import type { Table } from '@uwdata/flechette';
import {
  addCalendarStep,
  buildCalendarBreaks,
  buildEvenCalendarBreaks,
  chooseCalendarStep,
  countCalendarClasses,
  floorToCalendarStep,
  inferCalendarGranularity,
  type CalendarStep
} from '../utils/calendar-breaks.utils';
import {
  sqlIdentifier,
  sqlString,
  sqlTempName
} from '$lib/features/commons/utils/sql.utils';

const SEQUENTIAL_COLOR_START = '#3cc8a0';
const SEQUENTIAL_COLOR_END = DEFAULT_VISUALIZATION_COLOR;
const DIVERGING_COLOR_A = '#b2182b';
const DIVERGING_COLOR_B = '#2166ac';

export interface BreaksResult {
  breaks: number[];
  counts: number[];
  min: number;
  max: number;
  /** Display bounds of the scale: rounded min and max, never used to assign classes. */
  roundedMin?: number;
  roundedMax?: number;
  breakpointLowerClassCount?: number;
  /** Classes the method determines on its own, independent of the request. */
  naturalClassCount?: number;
  /** Step of a calendar classification; breaks, bounds and min/max are then epoch milliseconds. */
  calendarStep?: CalendarStep;
}

export interface ClassificationOptions {
  datasetId: string;
  columnName: string;
  method: ClassificationMethod;
  numClasses: number;
  valueFilter?: ClassificationValueFilter;
  rowScopeClause?: string | null;
  /** Classify the values of all these columns together, e.g. a map collection's common scale. */
  pooledColumnNames?: string[];
  /** Calendar step to keep while it fits the series; otherwise one is chosen from `numClasses`. */
  calendarStep?: CalendarStep;
}

export interface BreakCountOptions {
  datasetId: string;
  columnName: string;
  breaks: number[];
  rowScopeClause?: string | null;
  pooledColumnNames?: string[];
}

export interface ClassificationValueFilter {
  operator: '<' | '>=';
  value: number;
}

export interface DivergingClassificationOptions {
  datasetId: string;
  columnName: string;
  method: ClassificationMethod;
  breakpointValue: number;
  lowerClassCount: number;
  upperClassCount: number;
  rowScopeClause?: string | null;
  pooledColumnNames?: string[];
}

interface QueryContext {
  tableName: string;
  columnName: string;
}

interface ColumnStats {
  rowCount: number;
  distinctCount: number;
  min: number;
  max: number;
}

const ADAPTIVE_HEAD_TAIL_SKEWNESS = 3;
const ADAPTIVE_QUANTILES_SKEWNESS = 1.5;
const ADAPTIVE_MIN_CLASSES = 2;
const ADAPTIVE_ROWS_PER_CLASS = 3;

export interface ClassificationDefaultsInput {
  method: ClassificationMethod;
  classes: number;
  skewness?: number;
  rowCount?: number;
}

export function suggestClassificationDefaults(
  input: ClassificationDefaultsInput
): { method: ClassificationMethod; classes: number } {
  let method = input.method;
  if (
    input.method !== ClassificationMethod.MANUAL &&
    input.skewness !== undefined &&
    Number.isFinite(input.skewness)
  ) {
    if (input.skewness >= ADAPTIVE_HEAD_TAIL_SKEWNESS) {
      method = ClassificationMethod.HEAD_TAIL;
    } else if (Math.abs(input.skewness) >= ADAPTIVE_QUANTILES_SKEWNESS) {
      method = ClassificationMethod.QUANTILES;
    }
  }

  let classes = input.classes;
  if (input.rowCount !== undefined && input.rowCount > 0) {
    classes = Math.min(
      classes,
      Math.max(
        ADAPTIVE_MIN_CLASSES,
        Math.floor(input.rowCount / ADAPTIVE_ROWS_PER_CLASS)
      )
    );
  }

  return { method, classes };
}

export type ClassificationMacro =
  'kmeans' | 'quantile' | 'equi_width' | 'nested_means' | 'q6' | 'headtail2';

export function mapMethodToMacro(
  method: ClassificationMethod | string
): ClassificationMacro | null {
  switch (method) {
    case ClassificationMethod.KMEANS:
    case 'jenks':
      return 'kmeans';
    case ClassificationMethod.QUANTILES:
      return 'quantile';
    case ClassificationMethod.EQUAL_INTERVAL:
      return 'equi_width';
    case ClassificationMethod.Q6:
      return 'q6';
    case ClassificationMethod.NESTED_MEANS:
      return 'nested_means';
    case ClassificationMethod.HEAD_TAIL:
      return 'headtail2';
    case ClassificationMethod.MANUAL:
    case ClassificationMethod.CALENDAR:
      return null;
    default:
      return 'quantile';
  }
}

function getQueryContext(
  datasetId: string,
  columnName: string
): QueryContext | null {
  const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(datasetId);
  if (!duckDBDataset?.tableName) {
    return null;
  }

  const tableName = duckDBDataset.tableName;

  return {
    tableName,
    columnName
  };
}

async function queryColumnStats(
  context: QueryContext
): Promise<ColumnStats | null> {
  const result = (await Duck.query(`
      SELECT
        COUNT(*) as row_count,
        COUNT(DISTINCT ${sqlIdentifier(context.columnName)}) as distinct_count,
        MIN(${sqlIdentifier(context.columnName)}) as min_val,
        MAX(${sqlIdentifier(context.columnName)}) as max_val
      FROM ${sqlIdentifier(context.tableName)}
      WHERE ${sqlIdentifier(context.columnName)} IS NOT NULL
    `)) as Table;

  if (result.numRows === 0) {
    return null;
  }

  const rawMin = result.getChild?.('min_val')?.get(0);
  const rawMax = result.getChild?.('max_val')?.get(0);
  if (rawMin == null || rawMax == null) {
    return null;
  }

  const rowCount = Number(
    result.getChild?.('row_count')?.get(0) ??
      result.getChild?.('distinct_count')?.get(0) ??
      0
  );
  const distinctCount = Number(
    result.getChild?.('distinct_count')?.get(0) ?? 0
  );
  const min = Number(rawMin);
  const max = Number(rawMax);

  if (
    !Number.isFinite(rowCount) ||
    !Number.isFinite(distinctCount) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return null;
  }

  return {
    rowCount,
    distinctCount,
    min,
    max
  };
}

export function sanitizeBreaks(
  breaks: number[],
  min: number,
  max: number
): number[] {
  return breaks
    .filter((value) => Number.isFinite(value) && value > min && value < max)
    .sort((a, b) => a - b)
    .filter(
      (value, index, values) => index === 0 || value !== values[index - 1]
    );
}

function toIterableValues(raw: unknown): number[] | null {
  if (raw == null) return null;
  const isArrayLike =
    Array.isArray(raw) ||
    typeof (raw as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
      'function';
  if (!isArrayLike) return null;
  return Array.from(raw as Iterable<unknown>)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value));
}

async function roundBreaks(
  context: QueryContext,
  breaks: number[],
  min: number,
  max: number
): Promise<number[]> {
  if (breaks.length === 0) {
    return breaks;
  }

  try {
    const breaksListLiteral = `[${breaks.join(', ')}]`;
    const roundQuery = `SELECT round_thresholds(${breaksListLiteral}, ${sqlString(context.tableName)}, ${sqlString(context.columnName)}) as rounded`;
    const roundResult = (await Duck.query(roundQuery)) as Table;
    const rawRounded = roundResult.getChild?.('rounded')?.get(0);
    const rounded = toIterableValues(rawRounded);
    if (rounded) {
      const sanitized = sanitizeBreaks(rounded, min, max);
      // Rounding is a visual simplification: it must never merge or drop a class.
      if (sanitized.length === breaks.length) {
        return sanitized;
      }
      logger.warn(
        'Discarded rounded classification breaks that would change the class count',
        LogCategory.DATA,
        {
          flow: 'classification_breaks',
          extra: {
            tableName: context.tableName,
            columnName: context.columnName,
            breakCount: breaks.length,
            roundedCount: sanitized.length
          }
        }
      );
    }
  } catch (error) {
    logger.warn(
      'Failed to round classification breaks; using unrounded breaks',
      LogCategory.DATA,
      {
        error,
        flow: 'classification_breaks',
        extra: {
          tableName: context.tableName,
          columnName: context.columnName,
          breakCount: breaks.length
        }
      }
    );
    return breaks;
  }

  return breaks;
}

async function roundBounds(
  context: QueryContext,
  min: number,
  max: number,
  breaks: number[]
): Promise<{ roundedMin: number; roundedMax: number }> {
  try {
    const boundsQuery = `SELECT round_bounds(${min}, ${max}, ${sqlString(context.tableName)}, ${sqlString(context.columnName)}) as bounds`;
    const boundsResult = (await Duck.query(boundsQuery)) as Table;
    const bounds = toIterableValues(boundsResult.getChild?.('bounds')?.get(0));

    if (bounds?.length === 2) {
      const [low, high] = bounds;
      const lowerThreshold = breaks[0] ?? max;
      const upperThreshold = breaks[breaks.length - 1] ?? min;

      return {
        roundedMin: low < lowerThreshold ? low : min,
        roundedMax: high > upperThreshold ? high : max
      };
    }
  } catch (error) {
    logger.warn(
      'Failed to round classification bounds; using unrounded bounds',
      LogCategory.DATA,
      {
        error,
        flow: 'classification_breaks',
        extra: {
          tableName: context.tableName,
          columnName: context.columnName
        }
      }
    );
  }

  return { roundedMin: min, roundedMax: max };
}

async function queryBreakCounts(
  context: QueryContext,
  allBreaks: number[]
): Promise<number[]> {
  const counts: number[] = [];
  const caseParts = allBreaks.slice(0, -1).map((_, index) => {
    const lower = allBreaks[index];
    const upper = allBreaks[index + 1];
    const upperOp = index === allBreaks.length - 2 ? '<=' : '<';
    return `COUNT(*) FILTER (WHERE ${sqlIdentifier(context.columnName)} >= ${lower} AND ${sqlIdentifier(context.columnName)} ${upperOp} ${upper}) as cnt_${index}`;
  });

  const countsQuery = `SELECT ${caseParts.join(', ')} FROM ${sqlIdentifier(context.tableName)} WHERE ${sqlIdentifier(context.columnName)} IS NOT NULL`;
  const countsResult = (await Duck.query(countsQuery)) as Table;

  if (countsResult.numRows > 0) {
    for (let index = 0; index < allBreaks.length - 1; index++) {
      const count = countsResult.getChild?.(`cnt_${index}`)?.get(0);
      counts.push(Number(count ?? 0));
    }
  }

  return counts;
}

const breaksCache = new Map<string, BreaksResult>();
const BREAKS_CACHE_MAX = 50;
let breaksCacheVersion = 0;

function getValueFilterKey(
  filter: ClassificationValueFilter | undefined
): string {
  return filter ? `${filter.operator}:${filter.value}` : 'all';
}

function resolvePooledColumnNames(
  pooledColumnNames: string[] | undefined
): string[] | null {
  return pooledColumnNames && pooledColumnNames.length > 1
    ? pooledColumnNames
    : null;
}

function buildPooledValuesSource(
  context: QueryContext,
  pooledColumnNames: string[],
  rowScopeClause: string | null | undefined
): string {
  const scope = rowScopeClause ? ` WHERE ${rowScopeClause}` : '';
  const selects = pooledColumnNames.map(
    (columnName) =>
      `SELECT CAST(${sqlIdentifier(columnName)} AS DOUBLE) AS ${sqlIdentifier(context.columnName)} FROM ${sqlIdentifier(context.tableName)}${scope}`
  );
  return `(${selects.join(' UNION ALL ')})`;
}

async function prepareClassificationContext(
  context: QueryContext,
  filter: ClassificationValueFilter | undefined,
  rowScopeClause: string | null | undefined,
  pooledColumnNames: string[] | null
): Promise<{ context: QueryContext; cleanup: () => Promise<void> }> {
  const conditions: string[] = [];

  if (rowScopeClause && !pooledColumnNames) {
    conditions.push(rowScopeClause);
  }

  if (filter) {
    const filterValue = Number(filter.value);
    if (Number.isFinite(filterValue)) {
      conditions.push(
        `${sqlIdentifier(context.columnName)} ${filter.operator} ${filterValue}`
      );
    }
  }

  if (conditions.length === 0 && !pooledColumnNames) {
    return {
      context,
      cleanup: async () => {}
    };
  }

  const tableName = sqlTempName('kh_classification');
  const source = pooledColumnNames
    ? buildPooledValuesSource(context, pooledColumnNames, rowScopeClause)
    : sqlIdentifier(context.tableName);
  const whereClause = [
    `${sqlIdentifier(context.columnName)} IS NOT NULL`,
    ...conditions
  ].join(' AND ');

  await Duck.query(`
    CREATE TEMP TABLE ${sqlIdentifier(tableName)} AS
    SELECT ${sqlIdentifier(context.columnName)} AS ${sqlIdentifier(context.columnName)}
    FROM ${source}
    WHERE ${whereClause}
  `);

  return {
    context: {
      ...context,
      tableName
    },
    cleanup: async () => {
      await Duck.query(`DROP TABLE IF EXISTS ${sqlIdentifier(tableName)}`);
    }
  };
}

export async function calculateBreaks(
  options: ClassificationOptions
): Promise<BreaksResult | null> {
  const { datasetId, columnName, method } = options;
  let { numClasses } = options;

  if (method === ClassificationMethod.CALENDAR) {
    return calculateCalendarBreaks({
      datasetId,
      columnName,
      maxClasses: numClasses,
      step: options.calendarStep,
      rowScopeClause: options.rowScopeClause,
      pooledColumnNames: options.pooledColumnNames
    });
  }

  const context = getQueryContext(datasetId, columnName);
  if (!context) {
    return null;
  }

  const currentVersion = duckDBOrchestrator.datasetsVersion;
  if (currentVersion !== breaksCacheVersion && breaksCacheVersion > 0) {
    breaksCache.clear();
  }
  breaksCacheVersion = currentVersion;

  const pooledColumnNames = resolvePooledColumnNames(options.pooledColumnNames);
  const columnKey = pooledColumnNames
    ? `pool(${pooledColumnNames.join('|')})`
    : columnName;
  const cacheKey = `${context.tableName}:${columnKey}:${method}:${numClasses}:${getValueFilterKey(options.valueFilter)}:${options.rowScopeClause ?? 'all'}`;
  const cached = breaksCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const prepared = await prepareClassificationContext(
    context,
    options.valueFilter,
    options.rowScopeClause,
    pooledColumnNames
  );

  try {
    const stats = await queryColumnStats(prepared.context);
    if (!stats) {
      return null;
    }

    // A single value (a constant column, or one left by a filter) has nothing
    // to discretize: one class, without running a break macro. Returning null
    // here would read as a failure and be retried.
    if (numClasses <= 1 || stats.distinctCount <= 1) {
      return {
        breaks: [],
        counts: [stats.rowCount],
        min: stats.min,
        max: stats.max,
        roundedMin: stats.min,
        roundedMax: stats.max
      };
    }

    if (numClasses >= stats.distinctCount) {
      numClasses = Math.max(2, stats.distinctCount - 1);
      if (method === ClassificationMethod.NESTED_MEANS) {
        numClasses = 2 ** Math.floor(Math.log2(numClasses));
      }
    }

    let breaks: number[] = [];

    const macroName = mapMethodToMacro(method);

    if (!macroName) {
      return null;
    }

    // Head/Tail's ladder must be requested whole, then sliced, or its natural class count stops being observable.
    const isHeadTail = method === ClassificationMethod.HEAD_TAIL;
    const macroClassCount = isHeadTail
      ? Math.max(numClasses, DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX)
      : numClasses;

    const query = `SELECT ${macroName}(${sqlString(prepared.context.tableName)}, ${sqlString(columnName)}, ${macroClassCount}) as breaks`;

    try {
      const result = (await Duck.query(query)) as Table;
      const rawBreaks = result.getChild?.('breaks')?.get(0);
      const extracted = toIterableValues(rawBreaks);

      if (extracted) {
        breaks = sanitizeBreaks(extracted, stats.min, stats.max);
      }
    } catch (macroError) {
      logger.error(
        'Failed to compute classification breaks',
        LogCategory.DUCKDB,
        macroError
      );
      return null;
    }

    if (breaks.length === 0) {
      return null;
    }

    if (breaks.length > 0 && method !== ClassificationMethod.MANUAL) {
      breaks = await roundBreaks(
        prepared.context,
        breaks,
        stats.min,
        stats.max
      );
    }

    let naturalClassCount: number | undefined;
    if (isHeadTail) {
      naturalClassCount = breaks.length + 1;
      breaks = breaks.slice(0, Math.max(1, numClasses - 1));
    }

    const allBreaks = [stats.min, ...breaks, stats.max];
    const counts = await queryBreakCounts(prepared.context, allBreaks);
    const { roundedMin, roundedMax } = await roundBounds(
      prepared.context,
      stats.min,
      stats.max,
      breaks
    );

    const result: BreaksResult = {
      breaks,
      counts,
      min: stats.min,
      max: stats.max,
      roundedMin,
      roundedMax,
      naturalClassCount
    };

    if (breaksCache.size >= BREAKS_CACHE_MAX) {
      const firstKey = breaksCache.keys().next().value;
      if (firstKey) breaksCache.delete(firstKey);
    }
    breaksCache.set(cacheKey, result);

    return result;
  } catch (error) {
    logger.error(
      'Failed to calculate breaks',
      LogCategory.DATA,
      {
        datasetId,
        tableName: prepared.context.tableName,
        columnName,
        method,
        numClasses,
        error
      },
      {
        feature: 'visualization',
        flow: 'classification_calculate_breaks',
        extra: { method, numClasses }
      }
    );
    return null;
  } finally {
    await prepared.cleanup();
  }
}

export async function calculateDivergingBreaks(
  options: DivergingClassificationOptions
): Promise<BreaksResult | null> {
  if (!Number.isFinite(options.breakpointValue)) {
    return null;
  }

  const lowerClassCount = Math.max(1, Math.floor(options.lowerClassCount));
  const upperClassCount = Math.max(1, Math.floor(options.upperClassCount));
  const lowerResult = await calculateBreaks({
    datasetId: options.datasetId,
    columnName: options.columnName,
    method: options.method,
    numClasses: lowerClassCount,
    rowScopeClause: options.rowScopeClause,
    pooledColumnNames: options.pooledColumnNames,
    valueFilter: {
      operator: '<',
      value: options.breakpointValue
    }
  });

  if (!lowerResult) {
    return null;
  }

  const upperResult = await calculateBreaks({
    datasetId: options.datasetId,
    columnName: options.columnName,
    method: options.method,
    numClasses: upperClassCount,
    rowScopeClause: options.rowScopeClause,
    pooledColumnNames: options.pooledColumnNames,
    valueFilter: {
      operator: '>=',
      value: options.breakpointValue
    }
  });

  if (!upperResult) {
    return null;
  }

  return {
    breaks: [
      ...lowerResult.breaks,
      options.breakpointValue,
      ...upperResult.breaks
    ],
    counts: [...lowerResult.counts, ...upperResult.counts],
    min: lowerResult.min,
    max: upperResult.max,
    roundedMin: lowerResult.roundedMin,
    roundedMax: upperResult.roundedMax,
    breakpointLowerClassCount: lowerResult.counts.length,
    naturalClassCount:
      lowerResult.naturalClassCount != null &&
      upperResult.naturalClassCount != null
        ? lowerResult.naturalClassCount + upperResult.naturalClassCount
        : undefined
  };
}

/** Return zero as the diverging pivot only when a numeric column crosses zero. */
export async function detectDivergingBreakpoint(options: {
  datasetId: string;
  columnName: string;
  pooledColumnNames?: string[];
}): Promise<number | null> {
  const context = getQueryContext(options.datasetId, options.columnName);
  if (!context) {
    return null;
  }

  let cleanup = async () => {};
  try {
    const prepared = await prepareClassificationContext(
      context,
      undefined,
      null,
      resolvePooledColumnNames(options.pooledColumnNames)
    );
    cleanup = prepared.cleanup;
    const stats = await queryColumnStats(prepared.context);
    if (!stats) {
      return null;
    }
    return stats.min < 0 && stats.max > 0 ? 0 : null;
  } catch (error) {
    logger.warn(
      'Failed to detect diverging classification breakpoint',
      LogCategory.DATA,
      {
        error,
        flow: 'classification_breakpoint_detection',
        extra: {
          datasetId: options.datasetId,
          columnName: options.columnName
        }
      }
    );
    return null;
  } finally {
    await cleanup();
  }
}

export async function calculateBreakCounts(
  options: BreakCountOptions
): Promise<BreaksResult | null> {
  const context = getQueryContext(options.datasetId, options.columnName);
  if (!context) {
    return null;
  }

  const prepared = await prepareClassificationContext(
    context,
    undefined,
    options.rowScopeClause,
    resolvePooledColumnNames(options.pooledColumnNames)
  );

  try {
    const stats = await queryColumnStats(prepared.context);
    if (!stats || stats.distinctCount <= 1) {
      return null;
    }

    const breaks = sanitizeBreaks(options.breaks, stats.min, stats.max);
    const counts = await queryBreakCounts(prepared.context, [
      stats.min,
      ...breaks,
      stats.max
    ]);

    return {
      breaks,
      counts,
      min: stats.min,
      max: stats.max
    };
  } catch (error) {
    logger.error(
      'Failed to calculate manual break counts',
      LogCategory.DATA,
      {
        datasetId: options.datasetId,
        tableName: prepared.context.tableName,
        columnName: options.columnName,
        error
      },
      { feature: 'visualization', flow: 'classification_manual_counts' }
    );
    return null;
  } finally {
    await prepared.cleanup();
  }
}

export interface CalendarClassificationOptions {
  datasetId: string;
  columnName: string;
  /** Class count a step is chosen for: the finest step that stays within it. */
  maxClasses: number;
  /** Current step, kept while it gives 2 to `stepClassLimit` classes. */
  step?: CalendarStep;
  stepClassLimit?: number;
  rowScopeClause?: string | null;
  pooledColumnNames?: string[];
}

function buildEpochValuesSource(
  context: QueryContext,
  columnNames: string[],
  rowScopeClause: string | null | undefined
): string {
  const scope = rowScopeClause ? ` WHERE ${rowScopeClause}` : '';
  const selects = columnNames.map(
    (columnName) =>
      `SELECT epoch_ms(${sqlIdentifier(columnName)}) AS v FROM ${sqlIdentifier(context.tableName)}${scope}`
  );
  return `(${selects.join(' UNION ALL ')})`;
}

const TEMPORAL_COLUMN_TYPE = /^(DATE|TIMESTAMP)\b/;

/** Whether the column is a DATE or TIMESTAMP in DuckDB: it is then classed on calendar steps. */
export async function isTemporalColumn(
  datasetId: string,
  columnName: string
): Promise<boolean> {
  const context = getQueryContext(datasetId, columnName);
  if (!context) {
    return false;
  }

  try {
    const result = (await Duck.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = ${sqlString(context.tableName)} AND column_name = ${sqlString(columnName)}`
    )) as Table;
    const dataType = result.getChild?.('data_type')?.get(0);
    return typeof dataType === 'string' && TEMPORAL_COLUMN_TYPE.test(dataType);
  } catch (error) {
    logger.warn('Failed to read the classified column type', LogCategory.DATA, {
      error,
      flow: 'classification_column_type',
      extra: { tableName: context.tableName, columnName }
    });
    return false;
  }
}

interface EpochStats {
  min: number;
  max: number;
}

async function queryEpochStats(source: string): Promise<EpochStats | null> {
  const statsResult = (await Duck.query(
    `SELECT COUNT(v) AS row_count, MIN(v) AS min_val, MAX(v) AS max_val FROM ${source} AS s WHERE v IS NOT NULL`
  )) as Table;
  const rowCount = Number(statsResult.getChild?.('row_count')?.get(0) ?? 0);
  const rawMin = statsResult.getChild?.('min_val')?.get(0);
  const rawMax = statsResult.getChild?.('max_val')?.get(0);
  if (!rowCount || rawMin == null || rawMax == null) {
    return null;
  }
  const min = Number(rawMin);
  const max = Number(rawMax);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/** Values per class `[bounds[i], bounds[i + 1][`; the bounds enclose the series. */
async function queryEpochCounts(
  source: string,
  bounds: readonly number[]
): Promise<number[]> {
  const countColumns = bounds
    .slice(0, -1)
    .map(
      (start, index) =>
        `COUNT(*) FILTER (WHERE v >= ${start} AND v < ${bounds[index + 1]}) AS cnt_${index}`
    );
  const countsResult = (await Duck.query(
    `SELECT ${countColumns.join(', ')} FROM ${source} AS s WHERE v IS NOT NULL`
  )) as Table;
  return countColumns.map((_, index) =>
    Number(countsResult.getChild?.(`cnt_${index}`)?.get(0) ?? 0)
  );
}

function logCalendarFailure(
  message: string,
  flow: string,
  context: QueryContext,
  datasetId: string,
  error: unknown
): void {
  logger.error(
    message,
    LogCategory.DATA,
    {
      datasetId,
      tableName: context.tableName,
      columnName: context.columnName,
      error
    },
    { feature: 'visualization', flow }
  );
}

/** Calendar-aligned breaks on a DATE or TIMESTAMP column, in epoch milliseconds. */
export async function calculateCalendarBreaks(
  options: CalendarClassificationOptions
): Promise<BreaksResult | null> {
  const context = getQueryContext(options.datasetId, options.columnName);
  if (!context) {
    return null;
  }

  const source = buildEpochValuesSource(
    context,
    resolvePooledColumnNames(options.pooledColumnNames) ?? [options.columnName],
    options.rowScopeClause
  );

  try {
    const stats = await queryEpochStats(source);
    if (!stats) {
      return null;
    }
    const { min, max } = stats;

    const stepClassLimit = Math.max(
      2,
      options.stepClassLimit ?? DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
    );
    const currentClassCount = options.step
      ? countCalendarClasses(min, max, options.step, stepClassLimit)
      : 0;
    const step =
      options.step &&
      currentClassCount >= 2 &&
      currentClassCount <= stepClassLimit
        ? options.step
        : chooseCalendarStep(min, max, Math.max(2, options.maxClasses));
    const { breaks, lower, upper } = buildCalendarBreaks(min, max, step);
    const counts = await queryEpochCounts(source, [lower, ...breaks, upper]);

    return {
      breaks,
      counts,
      min,
      max,
      roundedMin: lower,
      roundedMax: upper,
      calendarStep: step
    };
  } catch (error) {
    logCalendarFailure(
      'Failed to calculate calendar breaks',
      'classification_calendar_breaks',
      context,
      options.datasetId,
      error
    );
    return null;
  }
}

/**
 * Counts for manual date bounds (epoch milliseconds). The outer bounds and the
 * labels follow the coarsest unit the thresholds share: all on 1 January reads
 * in years, all on the 1st in months, otherwise in days.
 */
export async function calculateCalendarBreakCounts(
  options: BreakCountOptions & {
    /** When the bounds do not make this many classes, even ones replace them. */
    classCount?: number;
  }
): Promise<BreaksResult | null> {
  const context = getQueryContext(options.datasetId, options.columnName);
  if (!context) {
    return null;
  }

  const source = buildEpochValuesSource(
    context,
    resolvePooledColumnNames(options.pooledColumnNames) ?? [options.columnName],
    options.rowScopeClause
  );

  try {
    const stats = await queryEpochStats(source);
    if (!stats) {
      return null;
    }
    const { min, max } = stats;
    const requested =
      options.classCount && options.breaks.length !== options.classCount - 1
        ? buildEvenCalendarBreaks(min, max, options.classCount)
        : options.breaks;
    const breaks = requested
      .filter((value) => Number.isFinite(value) && value > min && value <= max)
      .sort((a, b) => a - b)
      .filter(
        (value, index, values) => index === 0 || value !== values[index - 1]
      );
    const granularity = inferCalendarGranularity(breaks);
    const lower = floorToCalendarStep(min, granularity);
    const upper = addCalendarStep(
      floorToCalendarStep(max, granularity),
      granularity
    );
    const counts = await queryEpochCounts(source, [lower, ...breaks, upper]);

    return {
      breaks,
      counts,
      min,
      max,
      roundedMin: lower,
      roundedMax: upper,
      calendarStep: granularity
    };
  } catch (error) {
    logCalendarFailure(
      'Failed to count manual calendar classes',
      'classification_calendar_manual_counts',
      context,
      options.datasetId,
      error
    );
    return null;
  }
}

export interface DivergingSplit {
  lowerCount: number;
  upperCount: number;
  hasCenterClass: boolean;
}

export function computeDivergingSplit(
  numClasses: number,
  breaks: readonly number[],
  breakpointValue: number | null | undefined
): DivergingSplit {
  const steps = Math.max(2, Math.floor(numClasses));

  if (
    breakpointValue == null ||
    !Number.isFinite(breakpointValue) ||
    breaks.length !== steps - 1
  ) {
    const hasCenterClass = steps % 2 === 1;
    const half = Math.floor(steps / 2);
    return { lowerCount: half, upperCount: half, hasCenterClass };
  }

  let lowerCount = 0;
  let straddlesClass = false;
  let resolvedStraddle = false;
  for (let index = 0; index < breaks.length; index++) {
    const upperBoundary = breaks[index];
    if (upperBoundary <= breakpointValue) {
      lowerCount += 1;
      continue;
    }
    const lowerBoundary = index === 0 ? -Infinity : breaks[index - 1];
    if (lowerBoundary < breakpointValue && breakpointValue < upperBoundary) {
      straddlesClass = true;
    }
    resolvedStraddle = true;
    break;
  }

  if (!resolvedStraddle) {
    const lastLowerBoundary = breaks[breaks.length - 1];
    if (lastLowerBoundary < breakpointValue) {
      straddlesClass = true;
    }
  }

  if (straddlesClass) {
    const upperCount = steps - lowerCount - 1;
    return {
      lowerCount: Math.max(0, lowerCount),
      upperCount: Math.max(0, upperCount),
      hasCenterClass: true
    };
  }

  const upperCount = steps - lowerCount;
  return {
    lowerCount: Math.max(0, lowerCount),
    upperCount: Math.max(0, upperCount),
    hasCenterClass: false
  };
}

export function generateColorsForBreaks(
  numClasses: number,
  palette: 'sequential' | 'diverging' = 'sequential',
  contrast?: ContrastMode,
  divergingSplit?: DivergingSplit
): string[] {
  const steps = Math.max(2, numClasses);

  let cssColors: string[];
  if (palette === 'diverging') {
    const split = divergingSplit ?? {
      lowerCount: Math.floor(steps / 2),
      upperCount: Math.floor(steps / 2),
      hasCenterClass: steps % 2 === 1
    };
    cssColors = divergentSequential({
      colorA: DIVERGING_COLOR_A,
      colorB: DIVERGING_COLOR_B,
      steps: [split.lowerCount, split.upperCount],
      hasCenterClass: split.hasCenterClass,
      contrast
    });
  } else {
    cssColors = sequential({
      colorStart: SEQUENTIAL_COLOR_START,
      colorEnd: SEQUENTIAL_COLOR_END,
      steps,
      contrast
    });
  }

  return (resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]).map(
    webglToHex
  );
}

export function applyPaletteInversion(
  colors: string[],
  inverted = false
): string[] {
  return inverted ? [...colors].reverse() : colors;
}
