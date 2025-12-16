import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { ReservedColumnName } from '../constants';
import type { DeckTooltipInfo, TooltipEntry, TooltipResult, TooltipStyle } from '../types';

const DEFAULT_TOOLTIP_STYLE: TooltipStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  color: '#161616',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: 'IBM Plex Sans, sans-serif',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  border: '1px solid #8d8d8d',
  maxWidth: '300px'
};

const MAX_TOOLTIP_ENTRIES = 10;

export function formatTooltipValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'bigint') return Number(value).toLocaleString('fr-FR');
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString('fr-FR');
    return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }
  if (value instanceof Date) return value.toLocaleDateString('fr-FR');
  const str = String(value);
  return str.length > 50 ? str.slice(0, 47) + '...' : str;
}

function isReservedColumn(columnName: string): boolean {
  return (
    columnName === ReservedColumnName.GEOM ||
    columnName === ReservedColumnName.GEOMETRY ||
    columnName === ReservedColumnName.INTERNAL_ID
  );
}

function extractEntriesFromGeoJson(
  feature: { properties?: Record<string, unknown> }
): TooltipEntry[] {
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

function buildTooltipHtml(entries: TooltipEntry[]): string {
  const visibleEntries = entries.slice(0, MAX_TOOLTIP_ENTRIES);
  const hiddenCount = Math.max(0, entries.length - MAX_TOOLTIP_ENTRIES);

  let html = '<div style="display:flex;flex-direction:column;gap:4px;">';
  for (const entry of visibleEntries) {
    html += `<div style="display:flex;justify-content:space-between;gap:16px;"><span style="color:#525252;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${entry.key}</span><span style="font-weight:500;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${entry.value}</span></div>`;
  }
  if (hiddenCount > 0) {
    html += `<div style="color:#525252;font-style:italic;font-size:11px;margin-top:4px;">+${hiddenCount} more...</div>`;
  }
  html += '</div>';

  return html;
}

export function getTooltip(info: DeckTooltipInfo): TooltipResult | null {
  if (!info.picked || info.index === undefined || info.index === -1) {
    return null;
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

  if (entries.length === 0) return null;

  return {
    html: buildTooltipHtml(entries),
    style: DEFAULT_TOOLTIP_STYLE
  };
}

export function createTooltipHandler() {
  return (info: DeckTooltipInfo) => getTooltip(info);
}
