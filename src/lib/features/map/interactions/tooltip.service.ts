import { formatValue } from '$lib/features/commons/utils/format.utils';
import { projectHtmlLikeText } from '$lib/features/commons/utils/html-like-text.utils';
import { isYearValue } from '$lib/features/commons/utils/semio-detector.utils';
import {
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMNS
} from '$lib/features/commons/constants/data.constants';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { globalState } from '$lib/features/commons/stores/global.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';
import type { PickingInfo } from '@deck.gl/core';
import { Type, type Table as ArrowTable } from 'apache-arrow/Arrow';
import type { TooltipEntry } from '../types';
import { mapTooltipStore } from '../stores/map-tooltip.store.svelte';
import {
  mapHoverHighlightStore,
  type HoveredRow
} from '../stores/map-hover-highlight.store.svelte';

export function formatTooltipValue(value: unknown, columnName = ''): string {
  if (typeof value === 'string') {
    return formatValue(projectHtmlLikeText(value));
  }

  return formatValue(value, {
    useGrouping: !isYearValue(columnName, value)
  });
}

function isReservedColumn(columnName: string): boolean {
  return (
    columnName === INTERNAL_COLUMN.GEOM ||
    columnName === INTERNAL_COLUMN.GEOMETRY ||
    columnName === INTERNAL_COLUMN.ID ||
    columnName === INTERNAL_COLUMN.FEATURE_ID ||
    JOINED_BASEMAP_COLUMNS.includes(columnName)
  );
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
          value:
            (field.type.typeId === Type.Date ||
              field.type.typeId === Type.Timestamp) &&
            (typeof val === 'number' || typeof val === 'bigint')
              ? formatTooltipValue(new Date(Number(val)))
              : formatTooltipValue(val, colName)
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

  // Object layers (labels) are sorted for drawing, so their datum carries the
  // attribute row instead of its index.
  const objectRowIndex = (info.object as { rowIndex?: unknown } | undefined)
    ?.rowIndex;
  if (typeof objectRowIndex === 'number' && objectRowIndex >= 0) {
    return objectRowIndex;
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
      priority.push({ ...entry, isVizColumn: true });
    } else {
      rest.push(entry);
    }
  }
  return [...priority, ...rest];
}

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
  const sourceTable = resolveSourceTable(info);
  let entries = sourceTable
    ? extractEntriesFromArrowTable(sourceTable, rowIndex)
    : [];

  if (entries.length === 0) return [];

  if (visualizations && visualizations.length > 0 && info.layer?.id) {
    const vizColumns = getVizColumnNames(visualizations, info.layer.id);
    entries = sortEntriesByVizPriority(entries, vizColumns);
  }

  return entries;
}

// Legends of every visualization drawn from the hovered dataset read the
// same row, so a collection marks the place in each of its maps' legends.
function resolveHoveredRow(
  info: PickingInfo,
  visualizations: VisualizationConfig[] | undefined
): HoveredRow | null {
  const layerId = info.layer?.id;
  // A collection map's id extends its source visualization's: the longest
  // match names the map actually hovered.
  const viz = layerId
    ? visualizations
        ?.filter((candidate) => layerId.includes(candidate.id))
        .sort((a, b) => b.id.length - a.id.length)[0]
    : undefined;
  const table = resolveSourceTable(info);
  const rowIndex = resolvePickedRowIndex(info);
  if (!viz?.datasetId || !table || rowIndex === null) {
    return null;
  }
  return {
    datasetId: viz.datasetId,
    vizId: viz.id,
    // An absent column reads as undefined, a missing value as null.
    readValue: (column) => {
      const child = table.getChild(column);
      return child ? child.get(rowIndex) : undefined;
    }
  };
}

interface PointerLike {
  srcEvent?: { clientX?: unknown; clientY?: unknown };
}

// The tooltip is fixed-positioned, so it needs viewport coordinates; deck's
// info.x/y are relative to its canvas, which is not where the page is.
function resolveClientPoint(
  info: PickingInfo,
  event: unknown
): { x: number; y: number } {
  const srcEvent = (event as PointerLike | undefined)?.srcEvent;
  if (
    typeof srcEvent?.clientX === 'number' &&
    typeof srcEvent.clientY === 'number'
  ) {
    return { x: srcEvent.clientX, y: srcEvent.clientY };
  }
  return { x: info.x ?? 0, y: info.y ?? 0 };
}

function clearHover(): void {
  mapHoverHighlightStore.clear();
  mapTooltipStore.hide();
}

export function createHoverHandler(
  getVisualizations?: () => VisualizationConfig[]
): (info: PickingInfo, event?: unknown) => void {
  return (info: PickingInfo, event?: unknown) => {
    if (globalState.selectedStep === ToolbarStep.Styling) {
      mapHoverHighlightStore.clear();
      mapTooltipStore.unpin();
      return;
    }

    if (globalState.isMobileView) {
      clearHover();
      return;
    }

    if (mapTooltipStore.pinned) {
      return;
    }

    const layerId = info.layer?.id ?? null;
    const rowIndex = resolvePickedRowIndex(info) ?? -1;
    const { x, y } = resolveClientPoint(info, event);
    const isSameTarget =
      mapTooltipStore.visible &&
      mapTooltipStore.state.layerId === layerId &&
      mapTooltipStore.state.rowIndex === rowIndex;

    if (isSameTarget && info.picked) {
      mapTooltipStore.showAtHover(
        x,
        y,
        mapTooltipStore.state.entries,
        layerId,
        rowIndex
      );
      return;
    }

    const visualizations = getVisualizations?.();
    const entries = extractTooltipEntries(info, visualizations);
    if (entries.length === 0) {
      clearHover();
      return;
    }

    mapHoverHighlightStore.setFromPick(
      info,
      resolveHoveredRow(info, visualizations)
    );
    mapTooltipStore.showAtHover(x, y, entries, layerId, rowIndex);
  };
}

export function createClickHandler(
  getVisualizations?: () => VisualizationConfig[]
): (info: PickingInfo, event?: unknown) => void {
  return (info: PickingInfo, event?: unknown) => {
    if (globalState.selectedStep === ToolbarStep.Styling) {
      mapTooltipStore.unpin();
      return;
    }

    if (!info.picked || info.index === undefined || info.index === -1) {
      mapTooltipStore.unpin();
      return;
    }

    const visualizations = getVisualizations?.();
    const entries = extractTooltipEntries(info, visualizations);
    if (entries.length === 0) {
      mapTooltipStore.unpin();
      return;
    }

    const { x, y } = resolveClientPoint(info, event);
    const rowIndex = resolvePickedRowIndex(info) ?? -1;
    mapHoverHighlightStore.setFromPick(
      info,
      resolveHoveredRow(info, visualizations)
    );
    mapTooltipStore.pinAt(x, y, entries, info.layer?.id ?? null, rowIndex);
  };
}
