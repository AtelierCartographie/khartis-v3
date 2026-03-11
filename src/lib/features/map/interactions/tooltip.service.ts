import { formatValue } from '$lib/features/commons/utils/format.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { PickingInfo } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { TooltipEntry } from '../types';
import { mapTooltipStore } from '../stores/map-tooltip.store.svelte';
import { mapHighlightStore } from '../stores/map-highlight.store.svelte';

export function formatTooltipValue(value: unknown): string {
  return formatValue(value);
}

const JOIN_INTERNAL_COLUMNS = ['basemap_id', 'typo_match'] as const;

function isReservedColumn(columnName: string): boolean {
  return (
    columnName === INTERNAL_COLUMN.GEOM ||
    columnName === INTERNAL_COLUMN.GEOMETRY ||
    columnName === INTERNAL_COLUMN.ID ||
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

function extractDatasetIdFromLayerId(layerId: string): string | null {
  const parts = layerId.split('-');
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith('ds_')) {
      return parts[i];
    }
  }
  return parts.length >= 2 ? parts[1] : null;
}

function getVizColumnNames(
  visualizations: VisualizationConfig[],
  datasetId: string
): Set<string> {
  const columns = new Set<string>();
  for (const viz of visualizations) {
    if (viz.datasetId !== datasetId) continue;
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

  const rowIndex = info.index;
  let entries: TooltipEntry[] = [];

  const isGeoJsonFeature =
    info.object &&
    typeof info.object === 'object' &&
    'properties' in (info.object as Record<string, unknown>);

  if (isGeoJsonFeature) {
    const feature = info.object as { properties?: Record<string, unknown> };
    entries = extractEntriesFromGeoJson(feature);
  } else {
    const layerData = info.layer?.props?.data as ArrowTable | null;
    if (layerData && 'schema' in layerData) {
      entries = extractEntriesFromArrowTable(layerData, rowIndex);
    }
  }

  if (entries.length === 0) return [];

  if (visualizations && visualizations.length > 0 && info.layer?.id) {
    const datasetId = extractDatasetIdFromLayerId(info.layer.id);
    if (datasetId) {
      const vizColumns = getVizColumnNames(visualizations, datasetId);
      entries = sortEntriesByVizPriority(entries, vizColumns);
    }
  }

  return entries;
}

/**
 * Creates an onHover handler that populates the tooltip store.
 */
export function createHoverHandler(
  getVisualizations?: () => VisualizationConfig[]
): (info: PickingInfo) => void {
  return (info: PickingInfo) => {
    const entries = extractTooltipEntries(info, getVisualizations?.());
    if (entries.length === 0) {
      mapTooltipStore.hide();
      mapHighlightStore.clearHighlights();
      return;
    }

    const x = info.x ?? 0;
    const y = info.y ?? 0;
    mapTooltipStore.showAtHover(
      x,
      y,
      entries,
      info.layer?.id ?? null,
      info.index ?? -1
    );

    if (info.index !== undefined && info.index >= 0) {
      mapHighlightStore.setHighlightedRows([info.index]);
    }
  };
}

/**
 * Creates an onClick handler that pins/unpins the tooltip.
 */
export function createClickHandler(
  getVisualizations?: () => VisualizationConfig[]
): (info: PickingInfo) => void {
  return (info: PickingInfo) => {
    // Click on empty space: unpin
    if (!info.picked || info.index === undefined || info.index === -1) {
      mapTooltipStore.unpin();
      mapHighlightStore.clearHighlights();
      return;
    }

    // If already pinned on the same object, unpin
    if (
      mapTooltipStore.pinned &&
      mapTooltipStore.state.layerId === (info.layer?.id ?? null) &&
      mapTooltipStore.state.rowIndex === info.index
    ) {
      mapTooltipStore.unpin();
      mapHighlightStore.clearHighlights();
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
    mapTooltipStore.pinAt(
      x,
      y,
      entries,
      info.layer?.id ?? null,
      info.index ?? -1
    );
  };
}
