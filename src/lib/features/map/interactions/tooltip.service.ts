import { formatValue } from '$lib/features/commons/utils/format.utils';
import { projectHtmlLikeText } from '$lib/features/commons/utils/html-like-text.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { PickingInfo } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { MAP_TIMING } from '../constants/timing.constants';
import type { TooltipEntry } from '../types';
import { mapTooltipStore } from '../stores/map-tooltip.store.svelte';

export function formatTooltipValue(value: unknown): string {
  if (typeof value === 'string') {
    return formatValue(projectHtmlLikeText(value));
  }

  return formatValue(value);
}

const JOIN_INTERNAL_COLUMNS = [
  'basemap_id',
  'basemap_label',
  'typo_match'
] as const;

function isReservedColumn(columnName: string): boolean {
  return (
    columnName === INTERNAL_COLUMN.GEOM ||
    columnName === INTERNAL_COLUMN.GEOMETRY ||
    columnName === INTERNAL_COLUMN.ID ||
    columnName === INTERNAL_COLUMN.FEATURE_ID ||
    (JOIN_INTERNAL_COLUMNS as readonly string[]).includes(columnName)
  );
}

function extractEntriesFromGeoJson(feature: {
  properties?: Record<string, unknown>;
}): TooltipEntry[] {
  const entries: TooltipEntry[] = [];
  if (feature.properties) {
    for (const key of Object.keys(feature.properties)) {
      if (isReservedColumn(key)) continue;
      const val = feature.properties[key];
      entries.push({
        key,
        value: formatTooltipValue(val)
      });
    }
  }
  return entries;
}

function extractEntriesFromArrowTable(
  table: ArrowTable,
  rowIndex: number
): TooltipEntry[] {
  const entries: TooltipEntry[] = [];
  if (rowIndex >= 0 && rowIndex < table.numRows) {
    for (const field of table.schema.fields) {
      const colName = field.name;
      if (isReservedColumn(colName)) continue;
      const column = table.getChild(colName);
      if (column) {
        const val = column.get(rowIndex);
        entries.push({
          key: colName,
          value: formatTooltipValue(val)
        });
      }
    }
  }
  return entries;
}

function isArrowTable(value: unknown): value is ArrowTable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    'numRows' in value &&
    'getChild' in value
  );
}

function resolveSourceTable(info: PickingInfo): ArrowTable | null {
  const layerData = info.layer?.props?.data;
  if (isArrowTable(layerData)) {
    return layerData;
  }

  if (typeof layerData === 'object' && layerData !== null) {
    const sourceTable = Reflect.get(layerData, 'khartisSourceTable');
    if (isArrowTable(sourceTable)) {
      return sourceTable;
    }
  }

  return null;
}

function resolveSplitDatasetRow(
  layerData: object,
  geometryRow: number,
  sourceTable: ArrowTable
): number | null {
  const splitMap = Reflect.get(layerData, 'khartisSplitDatasetRowByGeomRow');
  if (
    !splitMap ||
    typeof splitMap !== 'object' ||
    !('length' in splitMap) ||
    geometryRow < 0 ||
    geometryRow >= (splitMap as ArrayLike<number>).length
  ) {
    return null;
  }
  const datasetRow = Number((splitMap as ArrayLike<number>)[geometryRow]);
  if (
    !Number.isInteger(datasetRow) ||
    datasetRow < 0 ||
    datasetRow >= sourceTable.numRows
  ) {
    return null;
  }
  return datasetRow;
}

function resolveBinaryRowIndex(
  info: PickingInfo,
  sourceTable: ArrowTable
): number | null {
  const layerData = info.layer?.props?.data;
  if (typeof layerData !== 'object' || layerData === null) {
    return null;
  }

  const pickIndex = info.index;
  if (pickIndex === undefined || pickIndex < 0) {
    return null;
  }

  const hasSplitMap =
    Reflect.get(layerData, 'khartisSplitDatasetRowByGeomRow') !== undefined;

  const rawFeatureIds = Reflect.get(layerData, 'featureIds');
  if (
    typeof rawFeatureIds === 'object' &&
    rawFeatureIds !== null &&
    'length' in rawFeatureIds
  ) {
    const featureIds = rawFeatureIds as ArrayLike<unknown>;
    const directFeatureId = Number(featureIds[pickIndex]);
    if (Number.isInteger(directFeatureId) && directFeatureId >= 0) {
      if (hasSplitMap) {
        const datasetRow = resolveSplitDatasetRow(
          layerData,
          directFeatureId,
          sourceTable
        );
        if (datasetRow !== null) return datasetRow;
      } else if (directFeatureId < sourceTable.numRows) {
        return directFeatureId;
      }
    }
  }

  const rawStartIndices = Reflect.get(layerData, 'startIndices');
  if (
    typeof rawStartIndices !== 'object' ||
    rawStartIndices === null ||
    !('length' in rawStartIndices)
  ) {
    return null;
  }

  const startIndices = rawStartIndices as ArrayLike<unknown>;
  const objectCount = startIndices.length - 1;
  const rowCount = Math.min(sourceTable.numRows, objectCount);

  for (let objectIndex = 0; objectIndex < objectCount; objectIndex += 1) {
    const startIndex = Number(startIndices[objectIndex]);
    const nextStartIndex = Number(startIndices[objectIndex + 1]);

    if (!Number.isFinite(startIndex) || !Number.isFinite(nextStartIndex)) {
      continue;
    }

    if (pickIndex >= startIndex && pickIndex < nextStartIndex) {
      if (
        typeof rawFeatureIds === 'object' &&
        rawFeatureIds !== null &&
        'length' in rawFeatureIds
      ) {
        const featureIds = rawFeatureIds as ArrayLike<unknown>;
        const mappedFeatureId = Number(featureIds[objectIndex]);
        if (Number.isInteger(mappedFeatureId) && mappedFeatureId >= 0) {
          if (hasSplitMap) {
            const datasetRow = resolveSplitDatasetRow(
              layerData,
              mappedFeatureId,
              sourceTable
            );
            if (datasetRow !== null) return datasetRow;
          } else if (mappedFeatureId < sourceTable.numRows) {
            return mappedFeatureId;
          }
        }
      }

      return objectIndex < rowCount ? objectIndex : null;
    }
  }

  return null;
}

function resolvePickedRowIndex(info: PickingInfo): number | null {
  if (info.index === undefined || info.index < 0) {
    return null;
  }

  const sourceTable = resolveSourceTable(info);
  if (!sourceTable) {
    return info.index;
  }

  const binaryRowIndex = resolveBinaryRowIndex(info, sourceTable);
  if (binaryRowIndex !== null) {
    return binaryRowIndex;
  }

  if (info.index < sourceTable.numRows) {
    return info.index;
  }

  return null;
}

function getVizColumnNames(
  visualizations: VisualizationConfig[],
  layerId: string
): Set<string> {
  const columns = new Set<string>();
  for (const viz of visualizations) {
    if (!layerId.includes(viz.id) && !layerId.includes(viz.datasetId)) {
      continue;
    }
    const m = viz.mapping;
    if (m.valueColumn) columns.add(m.valueColumn);
    if (m.categoryColumn) columns.add(m.categoryColumn);
    if (m.sizeColumn) columns.add(m.sizeColumn);
    if (m.colorColumn) columns.add(m.colorColumn);
    if (m.labelColumn) columns.add(m.labelColumn);
  }
  return columns;
}

function sortEntriesByVizPriority(
  entries: TooltipEntry[],
  vizColumns: Set<string>
): TooltipEntry[] {
  if (vizColumns.size === 0) return entries;
  const priority: TooltipEntry[] = [];
  const rest: TooltipEntry[] = [];
  for (const entry of entries) {
    if (vizColumns.has(entry.key)) {
      priority.push(entry);
    } else {
      rest.push(entry);
    }
  }
  return [...priority, ...rest];
}

/**
 * Extract sorted tooltip entries from a Deck.gl pick event.
 * Returns an empty array when nothing is picked.
 */
export function extractTooltipEntries(
  info: PickingInfo,
  visualizations?: VisualizationConfig[]
): TooltipEntry[] {
  if (!info.picked || info.index === undefined || info.index === -1) {
    return [];
  }

  const rowIndex = resolvePickedRowIndex(info);
  if (rowIndex === null) {
    return [];
  }
  let entries: TooltipEntry[] = [];

  const isGeoJsonFeature =
    info.object &&
    typeof info.object === 'object' &&
    'properties' in (info.object as Record<string, unknown>);

  if (isGeoJsonFeature) {
    const feature = info.object as { properties?: Record<string, unknown> };
    entries = extractEntriesFromGeoJson(feature);
  } else {
    const sourceTable = resolveSourceTable(info);
    if (sourceTable) {
      entries = extractEntriesFromArrowTable(sourceTable, rowIndex);
    }
  }

  if (entries.length === 0) return [];

  if (visualizations && visualizations.length > 0 && info.layer?.id) {
    const vizColumns = getVizColumnNames(visualizations, info.layer.id);
    entries = sortEntriesByVizPriority(entries, vizColumns);
  }

  return entries;
}

interface PendingHoverTooltipPayload {
  x: number;
  y: number;
  entries: TooltipEntry[];
  layerId: string | null;
  rowIndex: number;
}

let hoverTooltipTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let pendingHoverTooltip: PendingHoverTooltipPayload | null = null;

function clearPendingHoverTooltip(): void {
  if (hoverTooltipTimer !== null) {
    globalThis.clearTimeout(hoverTooltipTimer);
    hoverTooltipTimer = null;
  }

  pendingHoverTooltip = null;
}

function scheduleHoverTooltip(payload: PendingHoverTooltipPayload): void {
  const isSamePendingTarget =
    pendingHoverTooltip?.layerId === payload.layerId &&
    pendingHoverTooltip?.rowIndex === payload.rowIndex;

  pendingHoverTooltip = payload;

  if (isSamePendingTarget && hoverTooltipTimer !== null) {
    return;
  }

  clearPendingHoverTooltip();
  pendingHoverTooltip = payload;

  hoverTooltipTimer = globalThis.setTimeout(() => {
    hoverTooltipTimer = null;
    const nextPayload = pendingHoverTooltip;
    pendingHoverTooltip = null;

    if (!nextPayload) {
      return;
    }

    mapTooltipStore.showAtHover(
      nextPayload.x,
      nextPayload.y,
      nextPayload.entries,
      nextPayload.layerId,
      nextPayload.rowIndex
    );
  }, MAP_TIMING.TOOLTIP_DELAY_MS);
}

/**
 * Creates an onHover handler that populates the tooltip store.
 */
export function createHoverHandler(
  getVisualizations?: () => VisualizationConfig[]
): (info: PickingInfo) => void {
  return (info: PickingInfo) => {
    if (mapTooltipStore.pinned) {
      clearPendingHoverTooltip();
      return;
    }

    const entries = extractTooltipEntries(info, getVisualizations?.());
    if (entries.length === 0) {
      clearPendingHoverTooltip();
      mapTooltipStore.hide();
      return;
    }

    const x = info.x ?? 0;
    const y = info.y ?? 0;
    const layerId = info.layer?.id ?? null;
    const rowIndex = resolvePickedRowIndex(info) ?? -1;
    const isSameVisibleTarget =
      mapTooltipStore.visible &&
      !mapTooltipStore.pinned &&
      mapTooltipStore.state.layerId === layerId &&
      mapTooltipStore.state.rowIndex === rowIndex;

    if (isSameVisibleTarget) {
      clearPendingHoverTooltip();
      mapTooltipStore.showAtHover(x, y, entries, layerId, rowIndex);
      return;
    }

    scheduleHoverTooltip({
      x,
      y,
      entries,
      layerId,
      rowIndex
    });
  };
}

/**
 * Creates an onClick handler that pins the tooltip until clicking away.
 */
export function createClickHandler(
  getVisualizations?: () => VisualizationConfig[]
): (info: PickingInfo) => void {
  return (info: PickingInfo) => {
    clearPendingHoverTooltip();

    // Click on empty space: unpin
    if (!info.picked || info.index === undefined || info.index === -1) {
      mapTooltipStore.unpin();
      return;
    }

    // Pin on the clicked object
    const entries = extractTooltipEntries(info, getVisualizations?.());
    if (entries.length === 0) {
      mapTooltipStore.unpin();
      return;
    }

    const x = info.x ?? 0;
    const y = info.y ?? 0;
    const rowIndex = resolvePickedRowIndex(info) ?? -1;
    mapTooltipStore.pinAt(x, y, entries, info.layer?.id ?? null, rowIndex);
  };
}
