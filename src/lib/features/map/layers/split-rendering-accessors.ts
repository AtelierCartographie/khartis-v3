import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import type { LayerContext } from '../types';
import {
  rowAccessor,
  splitRowAccessor
} from '../utils/geoarrow-stream-bridge.utils';
import { isCustomBasemapJoinCandidateColumn } from '../services/custom-basemap-columns.service';

export type GeoJsonFeatureLike = {
  properties?: Record<string, unknown>;
};

export function hasSplitRenderingContext(
  ctx: LayerContext
): ctx is LayerContext & {
  splitDatasetTable: ArrowTable;
  splitFeatureIdColumn: string;
} {
  return Boolean(ctx.splitDatasetTable && ctx.splitFeatureIdColumn);
}

export function resolveSplitMappingFeatureIdColumn(
  table: ArrowTable,
  preferredFeatureIdColumn?: string
): string | undefined {
  const fields = table.schema.fields ?? [];

  if (
    preferredFeatureIdColumn &&
    fields.some((field) => field.name === preferredFeatureIdColumn)
  ) {
    return preferredFeatureIdColumn;
  }

  if (fields.some((field) => field.name === JOINED_BASEMAP_COLUMN.ID)) {
    return JOINED_BASEMAP_COLUMN.ID;
  }

  if (fields.some((field) => field.name === INTERNAL_COLUMN.FEATURE_ID)) {
    return INTERNAL_COLUMN.FEATURE_ID;
  }

  const idField = fields.find(
    (field) => field.name.toLowerCase() === CANONICAL_ID_COLUMN
  );
  return idField?.name;
}

export function createSplitAwareRowAccessor<T>(
  ctx: LayerContext,
  sourceTable: ArrowTable,
  accessor: (row: Record<string, unknown>) => T,
  geometryTable = sourceTable
): (featureId: number) => T {
  if (!hasSplitRenderingContext(ctx)) {
    return rowAccessor(sourceTable, accessor);
  }

  const featureIdColumn = resolveSplitMappingFeatureIdColumn(
    geometryTable,
    ctx.splitFeatureIdColumn
  );

  if (!featureIdColumn) {
    return rowAccessor(sourceTable, accessor);
  }

  return splitRowAccessor(
    geometryTable,
    ctx.splitDatasetTable,
    featureIdColumn,
    JOINED_BASEMAP_COLUMN.ID,
    (row) => accessor((row ?? {}) as Record<string, unknown>)
  );
}

export function createSplitAwareNullableRowAccessor<T>(
  ctx: LayerContext,
  sourceTable: ArrowTable,
  accessor: (row: Record<string, unknown> | null) => T,
  geometryTable = sourceTable
): (featureId: number) => T {
  if (!hasSplitRenderingContext(ctx)) {
    return rowAccessor(sourceTable, accessor);
  }

  const featureIdColumn = resolveSplitMappingFeatureIdColumn(
    geometryTable,
    ctx.splitFeatureIdColumn
  );

  if (!featureIdColumn) {
    return rowAccessor(sourceTable, accessor);
  }

  return splitRowAccessor(
    geometryTable,
    ctx.splitDatasetTable,
    featureIdColumn,
    JOINED_BASEMAP_COLUMN.ID,
    accessor
  );
}

export function createSplitGeoJsonFeatureAccessor<T>(
  ctx: LayerContext,
  geometryTable: ArrowTable,
  accessor: (row: Record<string, unknown>) => T
): ((feature: GeoJsonFeatureLike) => T) | null {
  if (!hasSplitRenderingContext(ctx)) {
    return null;
  }

  const featureIdColumn = resolveSplitMappingFeatureIdColumn(
    geometryTable,
    ctx.splitFeatureIdColumn
  );
  if (!featureIdColumn) {
    return null;
  }

  const datasetByFeatureId = buildSplitDatasetRowLookup(
    ctx.splitDatasetTable,
    JOINED_BASEMAP_COLUMN.ID
  );
  if (!datasetByFeatureId) {
    return null;
  }

  return (feature: GeoJsonFeatureLike): T => {
    const rawFeatureId = feature.properties?.[featureIdColumn];
    const row =
      rawFeatureId !== null && rawFeatureId !== undefined
        ? datasetByFeatureId.get(String(rawFeatureId))
        : undefined;
    return accessor((row ?? {}) as Record<string, unknown>);
  };
}

export function createSplitGeoJsonNullableFeatureAccessor<T>(
  ctx: LayerContext,
  geometryTable: ArrowTable,
  accessor: (row: Record<string, unknown> | null) => T
): ((feature: GeoJsonFeatureLike) => T) | null {
  if (!hasSplitRenderingContext(ctx)) {
    return null;
  }

  const featureIdColumn = resolveSplitMappingFeatureIdColumn(
    geometryTable,
    ctx.splitFeatureIdColumn
  );
  if (!featureIdColumn) {
    return null;
  }

  const datasetByFeatureId = buildSplitDatasetRowLookup(
    ctx.splitDatasetTable,
    JOINED_BASEMAP_COLUMN.ID
  );
  if (!datasetByFeatureId) {
    return null;
  }

  return (feature: GeoJsonFeatureLike): T => {
    const rawFeatureId = feature.properties?.[featureIdColumn];
    const row =
      rawFeatureId !== null && rawFeatureId !== undefined
        ? (datasetByFeatureId.get(String(rawFeatureId)) ?? null)
        : null;
    return accessor(row);
  };
}

export function buildSplitDatasetRowMapping(
  geometry: ArrowTable,
  dataset: ArrowTable,
  featureIdColumn: string,
  basemapIdColumn: string = JOINED_BASEMAP_COLUMN.ID
): Int32Array {
  const datasetIdVector = dataset.getChild(basemapIdColumn);
  const geomIdVector = geometry.getChild(featureIdColumn);
  const out = new Int32Array(geometry.numRows);
  out.fill(-1);
  if (!datasetIdVector || !geomIdVector) return out;

  const datasetRowByKey = new Map<string, number>();
  const datasetRowCount = dataset.numRows;
  for (let datasetRow = 0; datasetRow < datasetRowCount; datasetRow += 1) {
    const id = datasetIdVector.get(datasetRow);
    if (id === null || id === undefined) continue;
    datasetRowByKey.set(String(id), datasetRow);
  }

  const geomRowCount = geometry.numRows;
  for (let geomRow = 0; geomRow < geomRowCount; geomRow += 1) {
    const featureId = geomIdVector.get(geomRow);
    if (featureId === null || featureId === undefined) continue;
    const datasetRow = datasetRowByKey.get(String(featureId));
    if (datasetRow !== undefined) {
      out[geomRow] = datasetRow;
    }
  }
  return out;
}

function countSplitDatasetRowMatches(
  geometry: ArrowTable,
  dataset: ArrowTable,
  featureIdColumn: string,
  basemapIdColumn: string = JOINED_BASEMAP_COLUMN.ID
): number {
  const rowMapping = buildSplitDatasetRowMapping(
    geometry,
    dataset,
    featureIdColumn,
    basemapIdColumn
  );

  let count = 0;
  for (let rowIndex = 0; rowIndex < rowMapping.length; rowIndex += 1) {
    if (rowMapping[rowIndex] !== -1) {
      count += 1;
    }
  }
  return count;
}

export function resolveBestSplitFeatureIdColumn(
  geometry: ArrowTable,
  dataset: ArrowTable,
  preferredFeatureIdColumn?: string,
  basemapIdColumn: string = JOINED_BASEMAP_COLUMN.ID
): string | undefined {
  if (!dataset.getChild(basemapIdColumn)) {
    return undefined;
  }

  const fields = geometry.schema.fields ?? [];
  const candidates = [
    preferredFeatureIdColumn,
    JOINED_BASEMAP_COLUMN.ID,
    CANONICAL_ID_COLUMN,
    INTERNAL_COLUMN.FEATURE_ID,
    ...fields
      .map((field) => field.name)
      .filter((name) => isCustomBasemapJoinCandidateColumn(name))
  ].filter(
    (name, index, names): name is string =>
      Boolean(name && fields.some((field) => field.name === name)) &&
      names.indexOf(name) === index
  );

  let bestColumn: string | undefined;
  let bestMatchCount = 0;

  for (const candidate of candidates) {
    const matchCount = countSplitDatasetRowMatches(
      geometry,
      dataset,
      candidate,
      basemapIdColumn
    );
    if (matchCount > bestMatchCount) {
      bestColumn = candidate;
      bestMatchCount = matchCount;
    }
  }

  return bestColumn;
}

export function getSplitMatchedGeometryRowIndices(
  geometry: ArrowTable,
  dataset: ArrowTable,
  featureIdColumn: string,
  basemapIdColumn: string = JOINED_BASEMAP_COLUMN.ID
): number[] {
  const rowMapping = buildSplitDatasetRowMapping(
    geometry,
    dataset,
    featureIdColumn,
    basemapIdColumn
  );
  const indices: number[] = [];

  for (let rowIndex = 0; rowIndex < rowMapping.length; rowIndex += 1) {
    if (rowMapping[rowIndex] !== -1) {
      indices.push(rowIndex);
    }
  }

  return indices;
}

function buildSplitDatasetRowLookup(
  dataset: ArrowTable,
  basemapIdColumn: string
): Map<string, Record<string, unknown>> | null {
  const datasetBasemapIdVector = dataset.getChild(basemapIdColumn);
  if (!datasetBasemapIdVector) return null;

  const datasetByFeatureId = new Map<string, Record<string, unknown>>();
  for (let rowIndex = 0; rowIndex < dataset.numRows; rowIndex += 1) {
    const rawId = datasetBasemapIdVector.get(rowIndex);
    if (rawId === null || rawId === undefined) continue;
    const row = dataset.get(rowIndex);
    if (row) {
      datasetByFeatureId.set(
        String(rawId),
        row as unknown as Record<string, unknown>
      );
    }
  }
  return datasetByFeatureId;
}
