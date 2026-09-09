import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  FACET_SLOT,
  SCALE_MODE,
  type FacetSlotPath,
  type ScaleMode
} from '$lib/features/commons/constants/facets.constants';

export interface NumericFacetStats {
  min: number;
  max: number;
}

export interface SharedFacetScaleStats {
  statistics?: NumericFacetStats;
  pointStatistics?: NumericFacetStats;
  lineStatistics?: NumericFacetStats;
  textStatistics?: NumericFacetStats;
}

export type FacetColumnStatsGetter = (
  datasetId: string,
  columnName: string
) => unknown;

type SharedScaleTarget = 'point' | 'line' | 'text';

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNumericFacetStats(stats: unknown): NumericFacetStats | null {
  if (!stats || typeof stats !== 'object') {
    return null;
  }

  const record = stats as Record<string, unknown>;
  const min = toFiniteNumber(record.min);
  const max = toFiniteNumber(record.max);

  if (min === null || max === null) {
    return null;
  }

  return { min, max };
}

function cloneStats(stats: NumericFacetStats): NumericFacetStats {
  return { min: stats.min, max: stats.max };
}

function combineStats(stats: NumericFacetStats[]): NumericFacetStats | null {
  if (stats.length < 2) {
    return null;
  }

  const min = Math.min(...stats.map((item) => item.min));
  const max = Math.max(...stats.map((item) => item.max));

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return { min, max };
}

function resolveSharedScaleTarget(
  slotPath: FacetSlotPath | null
): SharedScaleTarget | null {
  switch (slotPath) {
    case FACET_SLOT.SYMBOL_SIZE:
      return 'point';
    case FACET_SLOT.LINE_SIZE:
      return 'line';
    case FACET_SLOT.TEXT_VALUE:
      return 'text';
    default:
      return null;
  }
}

function resolveSharedScaleColumn(
  visualization: VisualizationConfig,
  slotPath: FacetSlotPath
): string | undefined {
  switch (slotPath) {
    case FACET_SLOT.SYMBOL_SIZE:
      return (
        visualization.symbol?.sizeColumn ?? visualization.mapping.sizeColumn
      );
    case FACET_SLOT.LINE_SIZE:
      return visualization.line?.sizeColumn ?? visualization.mapping.sizeColumn;
    case FACET_SLOT.TEXT_VALUE:
      return (
        visualization.text?.valueColumn ?? visualization.mapping.valueColumn
      );
    default:
      return undefined;
  }
}

function toSharedScaleStats(
  target: SharedScaleTarget,
  stats: NumericFacetStats
): SharedFacetScaleStats {
  switch (target) {
    case 'point':
      return {
        statistics: cloneStats(stats),
        pointStatistics: cloneStats(stats)
      };
    case 'line':
      return {
        lineStatistics: cloneStats(stats)
      };
    case 'text':
      return {
        statistics: cloneStats(stats),
        textStatistics: cloneStats(stats)
      };
  }
}

export interface SharedFacetScaleColumn {
  visualizationId: string;
  datasetId: string;
  columnName: string;
}

/**
 * The facet columns a shared scale merges. Empty unless `columnName` is the
 * very column the shared slot varies across at least two facets, so callers
 * can fall back to their own single-column domain.
 */
export function resolveSharedFacetScaleColumns({
  visualizations,
  scaleMode,
  primarySlotPath,
  visualizationId,
  columnName
}: {
  visualizations: VisualizationConfig[];
  scaleMode: ScaleMode;
  primarySlotPath: FacetSlotPath | null;
  visualizationId: string;
  columnName: string;
}): SharedFacetScaleColumn[] {
  if (scaleMode !== SCALE_MODE.SHARED || !primarySlotPath) {
    return [];
  }

  if (!resolveSharedScaleTarget(primarySlotPath)) {
    return [];
  }

  const source = visualizations.find(
    (visualization) => visualization.id === visualizationId
  );
  if (
    !source ||
    resolveSharedScaleColumn(source, primarySlotPath) !== columnName
  ) {
    return [];
  }

  const columns = visualizations.flatMap((visualization) => {
    const column = resolveSharedScaleColumn(visualization, primarySlotPath);
    return visualization.datasetId && column
      ? [
          {
            visualizationId: visualization.id,
            datasetId: visualization.datasetId,
            columnName: column
          }
        ]
      : [];
  });

  return columns.length > 1 ? columns : [];
}

export function resolveSharedFacetScaleStats({
  visualizations,
  scaleMode,
  primarySlotPath,
  getColumnStatistics
}: {
  visualizations: VisualizationConfig[];
  scaleMode: ScaleMode;
  primarySlotPath: FacetSlotPath | null;
  getColumnStatistics: FacetColumnStatsGetter;
}): SharedFacetScaleStats | null {
  if (scaleMode !== SCALE_MODE.SHARED || !primarySlotPath) {
    return null;
  }

  const target = resolveSharedScaleTarget(primarySlotPath);
  if (!target) {
    return null;
  }

  const stats = visualizations
    .map((visualization) => {
      if (!visualization.datasetId) {
        return null;
      }

      const columnName = resolveSharedScaleColumn(
        visualization,
        primarySlotPath
      );
      if (!columnName) {
        return null;
      }

      return toNumericFacetStats(
        getColumnStatistics(visualization.datasetId, columnName)
      );
    })
    .filter((value): value is NumericFacetStats => value !== null);
  const combinedStats = combineStats(stats);

  return combinedStats ? toSharedScaleStats(target, combinedStats) : null;
}
