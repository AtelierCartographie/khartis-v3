import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import { GeometryType } from '../constants';
import { extractGeometryInfo } from '../io';
import type { GeometryInfo, LayerContext } from '../types';
import {
  buildSplitDatasetRowMapping,
  resolveSplitMappingFeatureIdColumn
} from './split-rendering-accessors';

export type BinaryLayerInteractionData = {
  khartisSourceTable?: ArrowTable;
  khartisSplitDatasetTable?: ArrowTable;

  khartisSplitDatasetRowByGeomRow?: Int32Array;
  featureIds?: Uint32Array;
};

export function attachBinaryPickingMetadata(
  target: BinaryLayerInteractionData,
  sourceTable: ArrowTable,
  sourceData: { readonly featureIds?: Uint32Array },
  ctx?: LayerContext
): void {
  if (ctx?.splitDatasetTable && ctx.splitFeatureIdColumn) {
    const featureIdColumn = resolveSplitMappingFeatureIdColumn(
      sourceTable,
      ctx.splitFeatureIdColumn
    );

    target.khartisSourceTable = ctx.splitDatasetTable;
    target.khartisSplitDatasetTable = ctx.splitDatasetTable;
    if (featureIdColumn) {
      target.khartisSplitDatasetRowByGeomRow = buildSplitDatasetRowMapping(
        sourceTable,
        ctx.splitDatasetTable,
        featureIdColumn
      );
    }
  } else {
    target.khartisSourceTable = sourceTable;
  }
  if (sourceData.featureIds instanceof Uint32Array) {
    target.featureIds = sourceData.featureIds;
  }
}

export function getRepresentativePointSource(
  ctx: LayerContext
): { table: ArrowTable; geometryInfo: GeometryInfo } | null {
  const representativePointTable = ctx.representativePointTable;
  if (!representativePointTable) {
    return null;
  }

  const geometryInfo =
    ctx.representativePointGeometryInfo ??
    extractGeometryInfo(representativePointTable);
  if (!geometryInfo) {
    return null;
  }

  if (
    geometryInfo.type !== GeometryType.POINT &&
    geometryInfo.type !== GeometryType.MULTIPOINT
  ) {
    return null;
  }

  return {
    table: representativePointTable,
    geometryInfo
  };
}

export function getTextRepresentativePointSource(
  ctx: LayerContext
): { table: ArrowTable; geometryInfo: GeometryInfo } | null {
  const representativePointTable =
    ctx.textRepresentativePointTable ?? ctx.representativePointTable;
  if (!representativePointTable) {
    return null;
  }

  const geometryInfo =
    (ctx.textRepresentativePointTable
      ? ctx.textRepresentativePointGeometryInfo
      : ctx.representativePointGeometryInfo) ??
    extractGeometryInfo(representativePointTable);
  if (!geometryInfo) {
    return null;
  }

  if (
    geometryInfo.type !== GeometryType.POINT &&
    geometryInfo.type !== GeometryType.MULTIPOINT
  ) {
    return null;
  }

  return {
    table: representativePointTable,
    geometryInfo
  };
}

export function requiresRepresentativePointSource(
  geometryType: GeometryInfo['type'] | GeometryType | undefined
): boolean {
  return (
    geometryType === GeometryType.POLYGON ||
    geometryType === GeometryType.MULTIPOLYGON ||
    geometryType === GeometryType.LINESTRING ||
    geometryType === GeometryType.MULTILINESTRING ||
    geometryType === GeometryType.MULTIPOINT
  );
}
