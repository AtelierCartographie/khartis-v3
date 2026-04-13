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

function mapMethodToMacro(
  method: ClassificationMethod
): 'quantile' | 'equi_width' | 'kmeans' | 'nested_means' | 'q6' | 'headtail2' {
  switch (method) {
    case ClassificationMethod.QUANTILES:
      return 'quantile';
    case ClassificationMethod.EQUAL_INTERVAL:
      return 'equi_width';
    case ClassificationMethod.JENKS:
      return 'kmeans';
    case ClassificationMethod.STANDARD_DEVIATION:
      return 'nested_means';
    case ClassificationMethod.Q6:
      return 'q6';
    case ClassificationMethod.NESTED_MEANS:
      return 'nested_means';
    case ClassificationMethod.HEAD_TAIL:
      return 'headtail2';
    case ClassificationMethod.MANUAL:
      return 'quantile';
    default:
      return 'quantile';
  }
}

/** Memoization cache for breaks results — avoids redundant DuckDB queries on style-only changes */
const breaksCache = new Map<string, BreaksResult>();
const BREAKS_CACHE_MAX = 50;

export async function calculateBreaks(
  options: ClassificationOptions
): Promise<BreaksResult | null> {
  const { datasetId, columnName, method } = options;
  let { numClasses } = options;

  const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(datasetId);
  if (!duckDBDataset?.tableName) {
    logger.warn('No DuckDB table found for dataset', LogCategory.DATA, {
      datasetId
    });
    return null;
  }

  const tableName = duckDBDataset.tableName;

  // Check memoization cache
  const cacheKey = `${tableName}:${columnName}:${method}:${numClasses}`;
  const cached = breaksCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  try {
    // Clamp numClasses to distinct non-null values to avoid breaks errors on small datasets
    const distinctResult = (await Duck.query(`
      SELECT COUNT(DISTINCT "${escapedCol}") as cnt
      FROM "${escapedTable}"
      WHERE "${escapedCol}" IS NOT NULL
    `)) as Table;
    const distinctCountRaw = distinctResult.getChild?.('cnt')?.get(0);
    if (distinctCountRaw != null) {
      const distinctCount = Number(distinctCountRaw);
      if (distinctCount <= 1) {
        return null;
      }
      // DuckDB macros need more data points than classes; clamp conservatively
      if (numClasses >= distinctCount) {
        numClasses = Math.max(2, distinctCount - 1);
      }
    }

    const minMaxResult = (await Duck.query(`
      SELECT
        MIN("${escapedCol}") as min_val,
        MAX("${escapedCol}") as max_val
      FROM "${escapedTable}"
      WHERE "${escapedCol}" IS NOT NULL
    `)) as Table;

    if (minMaxResult.numRows === 0) {
      logger.warn('No valid data for classification', LogCategory.DATA, {
        tableName,
        columnName
      });
      return null;
    }

    const rawMin = minMaxResult.getChild?.('min_val')?.get(0);
    const rawMax = minMaxResult.getChild?.('max_val')?.get(0);
    const min = rawMin != null ? Number(rawMin) : null;
    const max = rawMax != null ? Number(rawMax) : null;

    if (
      min === max ||
      min === null ||
      max === null ||
      isNaN(min) ||
      isNaN(max)
    ) {
      logger.warn(
        'Insufficient data range for classification',
        LogCategory.DATA,
        {
          min,
          max
        }
      );
      return {
        breaks: [min ?? 0],
        counts: [0],
        min: min ?? 0,
        max: max ?? 0
      };
    }

    const macroName = mapMethodToMacro(method);
    let breaks: number[] = [];

    const query = `SELECT ${macroName}('${escapeSqlString(tableName)}', '${escapeSqlString(columnName)}', ${numClasses}) as breaks`;

    try {
      const result = (await Duck.query(query)) as Table;
      const rawBreaks = result.getChild?.('breaks')?.get(0);

      if (rawBreaks && Array.isArray(rawBreaks)) {
        breaks = rawBreaks
          .filter((b: unknown) => b !== null && b !== undefined)
          .map((b: unknown) => Number(b))
          .filter((b: number) => !isNaN(b));
      }
    } catch (macroError) {
      logger.warn(
        'DuckDB macro failed, falling back to equal interval',
        LogCategory.DATA,
        { macroName, numClasses, error: macroError }
      );
    }

    if (breaks.length === 0) {
      logger.warn(
        'No breaks calculated, using equal interval fallback',
        LogCategory.DATA
      );
      breaks = [];
      const step = (max - min) / numClasses;
      for (let i = 1; i < numClasses; i++) {
        breaks.push(min + step * i);
      }
    }

    if (breaks.length > 0 && method !== ClassificationMethod.MANUAL) {
      try {
        const breaksListLiteral = `[${breaks.join(', ')}]`;
        const roundQuery = `SELECT round_thresholds(${breaksListLiteral}, '${escapeSqlString(tableName)}', '${escapeSqlString(columnName)}') as rounded`;
        const roundResult = (await Duck.query(roundQuery)) as Table;
        const rawRounded = roundResult.getChild?.('rounded')?.get(0);
        if (rawRounded && Array.isArray(rawRounded)) {
          const rounded = rawRounded
            .filter((b: unknown) => b !== null && b !== undefined)
            .map((b: unknown) => Number(b))
            .filter((b: number) => !isNaN(b));
          if (rounded.length === breaks.length) {
            breaks = rounded;
          }
        }
      } catch (roundError) {
        logger.warn(
          'round_thresholds failed, using unrounded breaks',
          LogCategory.DATA,
          { roundError }
        );
      }
    }

    const allBreaks = [min, ...breaks, max];
    const counts: number[] = [];

    // Single query with CASE WHEN to count all classes at once (avoids N+1 pattern)
    const caseParts = allBreaks.slice(0, -1).map((_, i) => {
      const lower = allBreaks[i];
      const upper = allBreaks[i + 1];
      const upperOp = i === allBreaks.length - 2 ? '<=' : '<';
      return `COUNT(*) FILTER (WHERE "${escapedCol}" >= ${lower} AND "${escapedCol}" ${upperOp} ${upper}) as cnt_${i}`;
    });

    const countsQuery = `SELECT ${caseParts.join(', ')} FROM "${escapedTable}" WHERE "${escapedCol}" IS NOT NULL`;
    const countsResult = (await Duck.query(countsQuery)) as Table;

    if (countsResult.numRows > 0) {
      for (let i = 0; i < allBreaks.length - 1; i++) {
        const cnt = countsResult.getChild?.(`cnt_${i}`)?.get(0);
        counts.push(Number(cnt ?? 0));
      }
    }

    logger.debug('Breaks calculated successfully', LogCategory.DATA, {
      method,
      numClasses,
      breaks: breaks.length,
      min,
      max
    });

    const result: BreaksResult = { breaks, counts, min, max };

    // Store in cache (evict oldest if over limit)
    if (breaksCache.size >= BREAKS_CACHE_MAX) {
      const firstKey = breaksCache.keys().next().value;
      if (firstKey) breaksCache.delete(firstKey);
    }
    breaksCache.set(cacheKey, result);

    return result;
  } catch (error) {
    logger.error('Failed to calculate breaks', LogCategory.DATA, {
      datasetId,
      tableName,
      columnName,
      method,
      numClasses,
      error
    });
    return null;
  }
}

/**
 * Generates palette colors for classification breaks via ok-palette.
 * Uses Oklch perceptual color space for uniform luminosity across classes.
 * Supports any class count (no longer clamped to 3–9).
 */
export function generateColorsForBreaks(
  numClasses: number,
  palette: 'sequential' | 'diverging' = 'sequential',
  contrast?: ContrastMode
): string[] {
  const steps = Math.max(2, numClasses);

  let cssColors: string[];
  if (palette === 'diverging') {
    const hasCenterClass = steps % 2 === 1;
    const halfSteps = Math.floor(steps / 2);
    cssColors = divergentSequential({
      colorA: DIVERGING_COLOR_A,
      colorB: DIVERGING_COLOR_B,
      steps: [halfSteps, halfSteps],
      hasCenterClass,
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
