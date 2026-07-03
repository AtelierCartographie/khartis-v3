import {
  simplifyGeometryType,
  vizSuggester,
  type GeometryType,
  type VizSuggestion
} from '$lib/features/commons/services/viz-suggester.service';

type ColumnAnalysis = Parameters<
  typeof vizSuggester.suggestVisualizations
>[0][number];
import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
import { isNumericType } from '$lib/features/commons/utils/format.utils';
import { UI_CONSTANTS } from '$lib/features/commons/constants/visualization.constants';
import { resolveDatasetGeometryType } from '../services/suggestion.service';

interface DatasetColumn {
  name: string;
  type?: string;
  stats?: {
    count?: number;
    nulls?: number;
    uniques?: number;
    min?: unknown;
    max?: unknown;
    mean?: unknown;
    share_integers?: number;
    share_floats?: number;
    share_rank_interval?: number;
    extent_magnitude?: number;
    skewness?: number;
  };
}

interface DatasetForSuggestions {
  id?: string;
  columns?: ReadonlyArray<DatasetColumn>;
  geometry?: { type?: string | null };
  sourceFileId?: string;
  joinedBasemap?: string;
  gpsMode?: boolean;
  geoDetection?: {
    geoColumns?: Array<{
      columnName: string;
      type?: string;
      confidence?: number;
    }>;
  };
}

export function computeVisualizationSuggestions(
  dataset: DatasetForSuggestions | null | undefined
): VizSuggestion[] {
  if (!dataset?.columns) return [];

  const geoColumnsByName = new Map(
    (dataset.geoDetection?.geoColumns ?? []).map((column) => [
      column.columnName,
      column
    ])
  );

  const columnAnalysis: ColumnAnalysis[] = dataset.columns.map((col) => {
    const geoColumn = geoColumnsByName.get(col.name);
    return {
      ...(geoColumn
        ? {
            geo_type: geoColumn.type as ColumnAnalysis['geo_type'],
            geo_confidence: geoColumn.confidence
          }
        : {}),
      name: col.name,
      type: col.type,
      stats: {
        count: col.stats?.count ?? 0,
        nulls: col.stats?.nulls ?? 0,
        uniques: col.stats?.uniques ?? 0,
        min: col.stats?.min,
        max: col.stats?.max,
        mean: col.stats?.mean,
        share_integers: col.stats?.share_integers,
        share_floats: col.stats?.share_floats,
        share_rank_interval: col.stats?.share_rank_interval,
        extent_magnitude: col.stats?.extent_magnitude,
        skewness: col.stats?.skewness
      }
    } as ColumnAnalysis;
  });

  const geometryType =
    resolveDatasetGeometryType(dataset) ||
    (dataset.geometry?.type as GeometryType | undefined) ||
    null;

  const dataGeometry = geometryType
    ? simplifyGeometryType(geometryType)
    : undefined;

  return vizSuggester
    .suggestVisualizations(columnAnalysis, geometryType, {
      maxSuggestions: UI_CONSTANTS.SUGGESTIONS_PER_PAGE
    })
    .map((suggestion) => ({ ...suggestion, dataGeometry }));
}

export function resolveColumnBadgeType(
  columns: ReadonlyArray<{ name: string; type?: string }>,
  columnName: string
): VariableBadgeType {
  const col = columns.find((c) => c.name === columnName);
  if (!col) return 'string';
  const type = String(col.type || '').toLowerCase();
  if (isNumericType(type)) return 'numeric';
  if (type === 'boolean') return 'boolean';
  if (type === 'date' || type === 'timestamp') return 'date';
  return 'string';
}
