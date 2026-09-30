import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';

import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import {
  SLIDER_LIMITS,
  VISUALIZATION_DEFAULTS
} from '$lib/features/commons/constants/visualization.constants';

import { GeometryType } from '../constants';
import type { GeometryInfo } from '../types';
import { pointPositions } from '../utils/geoarrow-stream-bridge.utils';
import { resolvePointParser } from './layer-geometry-parsers';

export interface TextLayerDatum {
  position: [number, number];
  primaryText: string | null;
  secondaryText: string | null;
  isMissingData: boolean;
  rowIndex: number;
}

export function keepTextDataInRowScope(
  data: TextLayerDatum[],
  attributeTable: ArrowTable,
  scopedRowIds: Set<number>
): TextLayerDatum[] {
  const rowIdVector = attributeTable.getChild(INTERNAL_COLUMN.ID);
  if (!rowIdVector) {
    return data;
  }

  return data.filter((datum) => {
    const rowId = rowIdVector.get(datum.rowIndex);
    return (
      rowId !== null && rowId !== undefined && scopedRowIds.has(Number(rowId))
    );
  });
}

export function resolveTextAnchor(
  align: 'left' | 'center' | 'right' | undefined
): 'start' | 'middle' | 'end' {
  switch (align) {
    case 'left':
      return 'start';
    case 'right':
      return 'end';
    default:
      return 'middle';
  }
}

export function resolveVerticalPadding(
  padding: readonly number[] | undefined
): number {
  return Array.isArray(padding) ? (padding[1] ?? 0) : 0;
}

function isTextDatumAccessor<T>(
  accessor: T | ((datum: TextLayerDatum) => T)
): accessor is (datum: TextLayerDatum) => T {
  return typeof accessor === 'function';
}

export function resolveAccessorValue<T>(
  accessor: T | ((datum: TextLayerDatum) => T),
  datum: TextLayerDatum
): T {
  return isTextDatumAccessor(accessor) ? accessor(datum) : accessor;
}

// The size slider scales the whole class ramp. Pinning the smallest class to the
// legibility floor would leave it alone while every other class grows, turning a
// size control into a contrast control. The ratio is the widest spread that floor
// allows at the default size, and it then holds at every size.
const CLASSED_TEXT_SIZE_RATIO =
  SLIDER_LIMITS.textSize.min / VISUALIZATION_DEFAULTS.textSize;

export function resolveVariableTextSizeBounds(baseSize: number): {
  minSize: number;
  maxSize: number;
} {
  const { min, max } = SLIDER_LIMITS.textSize;
  const maxSize = Math.min(Math.max(baseSize, min), max);

  return {
    minSize: maxSize * CLASSED_TEXT_SIZE_RATIO,
    maxSize
  };
}

export function toTextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function resolveMissingTextLabel(label: string | undefined): string {
  const normalizedLabel = label?.trim();
  return normalizedLabel && normalizedLabel.length > 0 ? normalizedLabel : '•';
}

export function resolveTextDatumText(
  datum: TextLayerDatum,
  missingTextLabel: string
): string {
  if (datum.isMissingData || !datum.primaryText) {
    return missingTextLabel;
  }

  return datum.secondaryText
    ? `${datum.primaryText}\n${datum.secondaryText}`
    : datum.primaryText;
}

function addTextGlyphs(glyphs: Set<string>, text: string | null): void {
  if (!text) return;
  for (const char of text) {
    glyphs.add(char);
  }
}

export function collectTextLayerGlyphs(
  data: readonly TextLayerDatum[],
  extraText: readonly string[] = []
): Set<string> {
  const glyphs = new Set<string>();
  for (const datum of data) {
    addTextGlyphs(glyphs, datum.primaryText);
    addTextGlyphs(glyphs, datum.secondaryText);
  }
  for (const text of extraText) {
    addTextGlyphs(glyphs, text);
  }
  return glyphs;
}

const textLabelCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike | null, Map<string, TextLayerDatum[]>>
>();

export function createTextLayerDataFromBinary(
  table: ArrowTable,
  geoInfo: GeometryInfo,
  primaryColumn: string,
  secondaryColumn?: string,
  customProjection?: ProjectionLike,
  attributeTable: ArrowTable = table,
  attributeRowByGeometryRow?: Int32Array
): TextLayerDatum[] {
  const canUseCache =
    attributeTable === table && attributeRowByGeometryRow === undefined;

  const projKey = customProjection ?? null;
  const labelCacheKey = `${geoInfo.type}:${primaryColumn}:${secondaryColumn ?? ''}`;
  if (canUseCache) {
    const tableMap = textLabelCache.get(table);
    if (tableMap) {
      const projMap = tableMap.get(projKey);
      if (projMap) {
        const cached = projMap.get(labelCacheKey);
        if (cached) return cached;
      }
    }
  }

  const geoType = geoInfo.type;
  if (geoType !== GeometryType.POINT && geoType !== GeometryType.MULTIPOINT) {
    return [];
  }

  const pointData = resolvePointParser(customProjection)(table);
  const centroids = pointPositions(pointData);
  const featureIds = pointData.featureIds;

  const primaryVector = attributeTable.getChild(primaryColumn);
  if (!primaryVector) return [];
  const secondaryVector = secondaryColumn
    ? attributeTable.getChild(secondaryColumn)
    : null;

  const output: TextLayerDatum[] = [];
  const numFeatures = centroids.length / 2;
  const seen = new Set<number>();

  for (let i = 0; i < numFeatures; i++) {
    const fid = featureIds[i];

    if (seen.has(fid)) continue;
    seen.add(fid);

    const rowIndex =
      attributeRowByGeometryRow?.[fid] !== undefined
        ? attributeRowByGeometryRow[fid]
        : fid;
    if (rowIndex === undefined || rowIndex < 0) {
      continue;
    }

    const primaryText = toTextValue(primaryVector.get(rowIndex));
    const x = centroids[i * 2];
    const y = centroids[i * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const isMissingData = primaryText === null;
    const secondaryText =
      !isMissingData && secondaryVector
        ? toTextValue(secondaryVector.get(rowIndex))
        : null;

    output.push({
      position: [x, y],
      primaryText,
      secondaryText,
      isMissingData,
      rowIndex
    });
  }

  if (canUseCache) {
    let tMap = textLabelCache.get(table);
    if (!tMap) {
      tMap = new Map();
      textLabelCache.set(table, tMap);
    }
    let pMap = tMap.get(projKey);
    if (!pMap) {
      pMap = new Map();
      tMap.set(projKey, pMap);
    }
    pMap.set(labelCacheKey, output);
  }

  return output;
}
