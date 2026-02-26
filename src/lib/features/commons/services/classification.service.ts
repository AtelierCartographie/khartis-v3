import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import { escapeIdentifier, escapeSqlString } from '../utils/sanitize.utils';
import type { Table } from '@uwdata/flechette';

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
): 'quantile' | 'equi_width' | 'kmeans' | 'nested_means' {
  switch (method) {
    case ClassificationMethod.QUANTILES:
      return 'quantile';
    case ClassificationMethod.EQUAL_INTERVAL:
      return 'equi_width';
    case ClassificationMethod.JENKS:
      return 'kmeans';
    case ClassificationMethod.STANDARD_DEVIATION:
      return 'nested_means';
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

    const query =
      macroName === 'quantile'
        ? `SELECT quantile_disc("${escapedCol}", list_transform(range(1, ${numClasses}), c -> c::DOUBLE / ${numClasses})) as breaks
           FROM "${escapedTable}"
           WHERE "${escapedCol}" IS NOT NULL`
        : macroName === 'equi_width'
          ? `SELECT equi_width_bins(MIN("${escapedCol}"), MAX("${escapedCol}"), ${Math.max(numClasses - 1, 1)}, false) as breaks
             FROM "${escapedTable}"
             WHERE "${escapedCol}" IS NOT NULL`
          : `SELECT ${macroName}('${escapeSqlString(tableName)}', '${escapeSqlString(columnName)}', ${numClasses}) as breaks`;
    logger.debug('Executing breaks query', LogCategory.DATA, { query });

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

    logger.success('Breaks calculated successfully', LogCategory.DATA, {
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

export function generateColorsForBreaks(
  numClasses: number,
  palette: 'sequential' | 'diverging' = 'sequential'
): string[] {
  const sequentialPalettes: Record<number, string[]> = {
    3: ['#deebf7', '#9ecae1', '#3182bd'],
    4: ['#eff3ff', '#bdd7e7', '#6baed6', '#2171b5'],
    5: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
    6: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
    7: [
      '#eff3ff',
      '#c6dbef',
      '#9ecae1',
      '#6baed6',
      '#4292c6',
      '#2171b5',
      '#084594'
    ],
    8: [
      '#f7fbff',
      '#deebf7',
      '#c6dbef',
      '#9ecae1',
      '#6baed6',
      '#4292c6',
      '#2171b5',
      '#084594'
    ],
    9: [
      '#f7fbff',
      '#deebf7',
      '#c6dbef',
      '#9ecae1',
      '#6baed6',
      '#4292c6',
      '#2171b5',
      '#08519c',
      '#08306b'
    ]
  };

  const divergingPalettes: Record<number, string[]> = {
    3: ['#ef8a62', '#f7f7f7', '#67a9cf'],
    4: ['#ca0020', '#f4a582', '#92c5de', '#0571b0'],
    5: ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0'],
    6: ['#b2182b', '#ef8a62', '#fddbc7', '#d1e5f0', '#67a9cf', '#2166ac'],
    7: [
      '#b2182b',
      '#ef8a62',
      '#fddbc7',
      '#f7f7f7',
      '#d1e5f0',
      '#67a9cf',
      '#2166ac'
    ],
    8: [
      '#b2182b',
      '#d6604d',
      '#f4a582',
      '#fddbc7',
      '#d1e5f0',
      '#92c5de',
      '#4393c3',
      '#2166ac'
    ],
    9: [
      '#b2182b',
      '#d6604d',
      '#f4a582',
      '#fddbc7',
      '#f7f7f7',
      '#d1e5f0',
      '#92c5de',
      '#4393c3',
      '#2166ac'
    ]
  };

  const palettes =
    palette === 'diverging' ? divergingPalettes : sequentialPalettes;
  const clampedClasses = Math.max(3, Math.min(9, numClasses));

  return palettes[clampedClasses] || palettes[5];
}
