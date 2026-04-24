import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import { escapeIdentifier, escapeSqlString } from '../utils/sanitize.utils';
import { webglToHex } from '../utils/color-utils';
import {
  sequential,
  divergentSequential,
  resolvePalette
} from '@ateliercartographie/ok-palette';
import type { WebGLColor, ContrastMode } from '@ateliercartographie/ok-palette';
import type { Table } from '@uwdata/flechette';

const SEQUENTIAL_COLOR_START = '#f7fbff';
const SEQUENTIAL_COLOR_END = '#08519c';
const DIVERGING_COLOR_A = '#b2182b';
const DIVERGING_COLOR_B = '#2166ac';

export interface BreaksResult {
  breaks: number[];
  counts: number[];
  min: number;
  max: number;
}

export interface ClassificationOptions {
  datasetId: string;
  columnName: string;
  method: ClassificationMethod;
  numClasses: number;
}

export interface BreakCountOptions {
  datasetId: string;
  columnName: string;
  breaks: number[];
}

interface QueryContext {
  tableName: string;
  columnName: string;
  escapedTable: string;
  escapedColumn: string;
}

interface ColumnStats {
  distinctCount: number;
  min: number;
  max: number;
}

export type ClassificationMacro =
  | 'kmeans'
  | 'quantile'
  | 'equi_width'
  | 'nested_means'
  | 'q6'
  | 'headtail2';

export function mapMethodToMacro(
  method: ClassificationMethod | string
): ClassificationMacro | null {
  switch (method) {
    case ClassificationMethod.KMEANS:
    case 'jenks':
    case 'standard_deviation':
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
    logger.warn('No DuckDB table found for dataset', LogCategory.DATA, {
      datasetId
    });
    return null;
  }

  const tableName = duckDBDataset.tableName;

  return {
    tableName,
    columnName,
    escapedTable: escapeIdentifier(tableName),
    escapedColumn: escapeIdentifier(columnName)
  };
}

async function queryColumnStats(
  context: QueryContext
): Promise<ColumnStats | null> {
  const result = (await Duck.query(`
      SELECT
        COUNT(DISTINCT "${context.escapedColumn}") as distinct_count,
        MIN("${context.escapedColumn}") as min_val,
        MAX("${context.escapedColumn}") as max_val
      FROM "${context.escapedTable}"
      WHERE "${context.escapedColumn}" IS NOT NULL
    `)) as Table;

  if (result.numRows === 0) {
    return null;
  }

  const distinctCount = Number(
    result.getChild?.('distinct_count')?.get(0) ?? 0
  );
  const min = Number(result.getChild?.('min_val')?.get(0));
  const max = Number(result.getChild?.('max_val')?.get(0));

  if (
    !Number.isFinite(distinctCount) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return null;
  }

  return {
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
    const roundQuery = `SELECT round_thresholds(${breaksListLiteral}, '${escapeSqlString(context.tableName)}', '${escapeSqlString(context.columnName)}') as rounded`;
    const roundResult = (await Duck.query(roundQuery)) as Table;
    const rawRounded = roundResult.getChild?.('rounded')?.get(0);
    const rounded = toIterableValues(rawRounded);
    if (rounded && rounded.length > 0) {
      const sanitized = sanitizeBreaks(rounded, min, max);
      if (sanitized.length > 0) {
        return sanitized;
      }
    }
  } catch (roundError) {
    logger.warn(
      'round_thresholds failed, using unrounded breaks',
      LogCategory.DATA,
      {
        roundError
      }
    );
  }

  return breaks;
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
    return `COUNT(*) FILTER (WHERE "${context.escapedColumn}" >= ${lower} AND "${context.escapedColumn}" ${upperOp} ${upper}) as cnt_${index}`;
  });

  const countsQuery = `SELECT ${caseParts.join(', ')} FROM "${context.escapedTable}" WHERE "${context.escapedColumn}" IS NOT NULL`;
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

export async function calculateBreaks(
  options: ClassificationOptions
): Promise<BreaksResult | null> {
  const { datasetId, columnName, method } = options;
  let { numClasses } = options;

  const context = getQueryContext(datasetId, columnName);
  if (!context) {
    return null;
  }

  const currentVersion = duckDBOrchestrator.datasetsVersion;
  if (currentVersion !== breaksCacheVersion && breaksCacheVersion > 0) {
    breaksCache.clear();
  }
  breaksCacheVersion = currentVersion;

  const cacheKey = `${context.tableName}:${columnName}:${method}:${numClasses}`;
  const cached = breaksCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const stats = await queryColumnStats(context);
    if (!stats) {
      logger.warn('No valid data for classification', LogCategory.DATA, {
        tableName: context.tableName,
        columnName
      });
      return null;
    }

    if (stats.distinctCount <= 1) {
      return null;
    }

    if (numClasses >= stats.distinctCount) {
      numClasses = Math.max(2, stats.distinctCount - 1);
    }

    if (stats.min === stats.max) {
      logger.warn(
        'Insufficient data range for classification',
        LogCategory.DATA,
        {
          min: stats.min,
          max: stats.max
        }
      );
      return {
        breaks: [stats.min],
        counts: [0],
        min: stats.min,
        max: stats.max
      };
    }

    let breaks: number[] = [];

    const macroName = mapMethodToMacro(method);

    if (!macroName) {
      logger.warn(
        'No DuckDB macro configured for classification method',
        LogCategory.DATA,
        {
          method,
          numClasses
        }
      );
      return null;
    }

    const query = `SELECT ${macroName}('${escapeSqlString(context.tableName)}', '${escapeSqlString(columnName)}', ${numClasses}) as breaks`;

    try {
      const result = (await Duck.query(query)) as Table;
      const rawBreaks = result.getChild?.('breaks')?.get(0);
      const extracted = toIterableValues(rawBreaks);

      if (extracted) {
        breaks = sanitizeBreaks(extracted, stats.min, stats.max);
      }
    } catch (macroError) {
      logger.warn('DuckDB macro failed to calculate breaks', LogCategory.DATA, {
        macroName,
        numClasses,
        error: macroError
      });
      return null;
    }

    if (breaks.length === 0) {
      logger.warn('No breaks calculated by DuckDB macro', LogCategory.DATA, {
        method,
        numClasses
      });
      return null;
    }

    if (breaks.length > 0 && method !== ClassificationMethod.MANUAL) {
      breaks = await roundBreaks(context, breaks, stats.min, stats.max);
    }

    const allBreaks = [stats.min, ...breaks, stats.max];
    const counts = await queryBreakCounts(context, allBreaks);

    const result: BreaksResult = {
      breaks,
      counts,
      min: stats.min,
      max: stats.max
    };

    if (breaksCache.size >= BREAKS_CACHE_MAX) {
      const firstKey = breaksCache.keys().next().value;
      if (firstKey) breaksCache.delete(firstKey);
    }
    breaksCache.set(cacheKey, result);

    return result;
  } catch (error) {
    logger.error('Failed to calculate breaks', LogCategory.DATA, {
      datasetId,
      tableName: context.tableName,
      columnName,
      method,
      numClasses,
      error
    });
    return null;
  }
}

export async function calculateBreakCounts(
  options: BreakCountOptions
): Promise<BreaksResult | null> {
  const context = getQueryContext(options.datasetId, options.columnName);
  if (!context) {
    return null;
  }

  try {
    const stats = await queryColumnStats(context);
    if (!stats || stats.distinctCount <= 1) {
      return null;
    }

    const breaks = sanitizeBreaks(options.breaks, stats.min, stats.max);
    const counts = await queryBreakCounts(context, [
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
    logger.error('Failed to calculate manual break counts', LogCategory.DATA, {
      datasetId: options.datasetId,
      tableName: context.tableName,
      columnName: options.columnName,
      error
    });
    return null;
  }
}

export interface DivergingSplit {
  lowerCount: number;
  upperCount: number;
  hasCenterClass: boolean;
}

/**
 * Splits N classes around a breakpoint value for a diverging palette.
 * - `lowerCount`: classes whose upper bound <= breakpoint (cold/red side).
 * - `upperCount`: classes whose lower bound >= breakpoint (warm/blue side).
 * - `hasCenterClass`: true when the breakpoint falls strictly inside a class
 *   (that class becomes the neutral centre).
 *
 * `breaks` are the internal thresholds (N-1 values) between the N classes.
 * When breakpoint is null, falls back to symmetric split `[half, half]`.
 */
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
