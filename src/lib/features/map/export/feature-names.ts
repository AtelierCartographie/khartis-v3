import {
  visualizationStore,
  getTextPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
import { findById } from '$lib/features/commons/utils/array-helpers';
import { VISUALIZATION_PREFIX_LABELS, matchLongestPrefix } from './deck-layers';
import type { BinaryLayerDataLike, SvgArrowTableLike } from './types';

const NAME_COLUMN_PATTERN = /name|nom|label|libelle/i;
const CODE_COLUMN_PATTERN = /code|iso|id/i;

function resolveVisualizationLabelColumn(layerId: string): string | undefined {
  const vizMatch = matchLongestPrefix(layerId, VISUALIZATION_PREFIX_LABELS);
  if (!vizMatch) return undefined;

  const remainder = layerId.slice(vizMatch.prefix.length + 1);
  const visualization =
    findById(visualizationStore.visualizations, remainder) ??
    (remainder !== 'default'
      ? findById(
          visualizationStore.visualizations,
          remainder.match(/^(.+)-[a-zA-Z0-9]+$/)?.[1] ?? ''
        )
      : undefined);

  return getTextPrimitive(visualization)?.labelColumn;
}

function resolveFeatureNameColumn(
  table: SvgArrowTableLike,
  layerId: string
): string | null {
  const labelColumn = resolveVisualizationLabelColumn(layerId);
  const fieldNames = table.schema.fields.map((field) => field.name);

  if (labelColumn && fieldNames.includes(labelColumn)) {
    return labelColumn;
  }

  const nameColumn = fieldNames.find((name) => NAME_COLUMN_PATTERN.test(name));
  if (nameColumn) {
    return nameColumn;
  }

  const codeColumn = fieldNames.find((name) => CODE_COLUMN_PATTERN.test(name));
  return codeColumn ?? null;
}

function resolveFeatureTableRow(
  data: BinaryLayerDataLike,
  featureId: number
): number | null {
  const sourceTable = data.khartisSourceTable;
  if (!sourceTable) return null;

  const splitMap = data.khartisSplitDatasetRowByGeomRow;
  if (splitMap) {
    if (featureId < 0 || featureId >= splitMap.length) return null;
    const datasetRow = Math.floor(Number(splitMap[featureId]));
    return Number.isInteger(datasetRow) &&
      datasetRow >= 0 &&
      datasetRow < sourceTable.numRows
      ? datasetRow
      : null;
  }

  return featureId >= 0 && featureId < sourceTable.numRows ? featureId : null;
}

export function resolveFeatureName(
  data: BinaryLayerDataLike,
  layerId: string,
  featureId: number
): string | null {
  const sourceTable = data.khartisSourceTable;
  if (!sourceTable) return null;

  const row = resolveFeatureTableRow(data, featureId);
  if (row === null) return null;

  const nameColumn = resolveFeatureNameColumn(sourceTable, layerId);
  if (!nameColumn) return null;

  const value = sourceTable.getChild(nameColumn)?.get(row);
  return value === null || value === undefined ? null : String(value);
}
