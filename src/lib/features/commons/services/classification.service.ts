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

type BreaksRow = { breaks: number[] };

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

export async function calculateBreaks(
  options: ClassificationOptions
): Promise<BreaksResult | null> {
  const { datasetId, columnName, method, numClasses } = options;

  const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(datasetId);
  if (!duckDBDataset?.tableName) {
    logger.warn('No DuckDB table found for dataset', LogCategory.DATA, {
      datasetId
    });
    return null;
  }

  const tableName = duckDBDataset.tableName;
  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  try {
    const minMaxResult = (await Duck.query(`
      SELECT
        MIN("${escapedCol}") as min_val,
        MAX("${escapedCol}") as max_val
      FROM "${escapedTable}"
      WHERE "${escapedCol}" IS NOT NULL
    `)) as Table;

    const minMaxRows = minMaxResult.toArray() as Array<{
      min_val: number;
      max_val: number;
    }>;
    if (!minMaxRows.length) {
      logger.warn('No valid data for classification', LogCategory.DATA, {
        tableName,
        columnName
      });
      return null;
    }

    const rawMin = minMaxRows[0].min_val;
    const rawMax = minMaxRows[0].max_val;
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

    const result = (await Duck.query(query)) as Table;
    const rows = result.toArray() as BreaksRow[];

    if (rows.length > 0 && rows[0].breaks) {
      breaks = rows[0].breaks
        .filter((b) => b !== null && b !== undefined)
        .map((b) => Number(b))
        .filter((b) => !isNaN(b));
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
        const roundRows = roundResult.toArray() as Array<{
          rounded: number[];
        }>;
        if (roundRows.length > 0 && roundRows[0].rounded) {
          const rounded = roundRows[0].rounded
            .filter((b) => b !== null && b !== undefined)
            .map((b) => Number(b))
            .filter((b) => !isNaN(b));
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
    const countsRows = countsResult.toArray() as Array<
      Record<string, bigint | number>
    >;

    if (countsRows.length > 0) {
      for (let i = 0; i < allBreaks.length - 1; i++) {
        counts.push(Number(countsRows[0][`cnt_${i}`] ?? 0));
      }
    }

    logger.debug('Breaks calculated successfully', LogCategory.DATA, {
      method,
      numClasses,
      breaks: breaks.length,
      min,
      max
    });

    return {
      breaks,
      counts,
      min,
      max
    };
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
