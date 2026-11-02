import type { JoinTerritoryStatus } from '$lib/features/duckdb';
import { buildClassPatternSvgBackground } from '$lib/features/commons/components/palette-popover/palette.constants';
import { resolveClassPatterns } from '$lib/features/commons/services/pattern-palette.service';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import * as m from '$lib/paraglide/messages';

import {
  JOIN_CONTROL_FILL_COLORS,
  JOIN_CONTROL_PATTERNS
} from '../constants/join-control.constants';
import type { JoinControlPickData } from '../layers/join-control-layers';
import type { TooltipEntry } from '../types';

export function getJoinControlStatusLabel(status: JoinTerritoryStatus): string {
  switch (status) {
    case 'matched':
      return m.join_control_status_matched();
    case 'check':
      return m.join_control_status_check();
    case 'duplicate':
      return m.join_control_status_duplicate();
    case 'no_data':
      return m.join_control_status_no_data();
  }
}

const swatchBackgrounds = new Map<JoinTerritoryStatus, string>();

/** The status as the map draws it: its fill, under its motif when it has one. */
export function getJoinControlSwatchBackground(
  status: JoinTerritoryStatus
): string {
  const cached = swatchBackgrounds.get(status);
  if (cached) return cached;

  const fill = JOIN_CONTROL_FILL_COLORS[status];
  const config = JOIN_CONTROL_PATTERNS[status];
  const pattern = config
    ? resolveClassPatterns(1, config, 'sequential', config.contrast)[0]
    : undefined;
  const background = pattern
    ? `${buildClassPatternSvgBackground(pattern, fill)} center / cover, ${fill}`
    : fill;
  swatchBackgrounds.set(status, background);
  return background;
}

function joinValues(values: string[], total: number): string {
  const listed = values.map((value) => formatValue(value)).join(', ');
  return total > values.length ? `${listed}, …` : listed;
}

/**
 * The hovered territory, its status and the value that joined it; a territory
 * to verify shows the entered value beside the basemap name.
 */
export function buildJoinControlTooltipEntries(
  pickData: JoinControlPickData,
  geomRow: number
): TooltipEntry[] {
  const { rows, territories, geometry, featureIdColumn } = pickData;
  if (geomRow < 0 || geomRow >= geometry.numRows) return [];

  const rowIndex = territories.rowIndexByGeomRow[geomRow];
  const row = rowIndex >= 0 ? rows[rowIndex] : undefined;
  const status = territories.statusByGeomRow[geomRow] ?? 'no_data';
  const fallbackName = geometry.getChild(featureIdColumn)?.get(geomRow);
  const name = row?.territoryName ?? String(fallbackName ?? '');

  const entries: TooltipEntry[] = [
    { key: m.join_control_tooltip_territory(), value: formatValue(name) },
    {
      key: m.join_control_tooltip_status(),
      value: getJoinControlStatusLabel(status),
      swatch: getJoinControlSwatchBackground(status)
    }
  ];
  if (!row || status === 'no_data') return entries;

  if (status === 'check') {
    entries.push(
      {
        key: m.join_control_tooltip_entered_value(),
        value: formatValue(row.dataValues[0] ?? '')
      },
      {
        key: m.join_control_tooltip_basemap_name(),
        value: formatValue(row.matchedLabel ?? name)
      }
    );
  } else if (status === 'duplicate') {
    entries.push(
      {
        key: m.join_control_tooltip_rows(),
        value: formatValue(row.rowCount)
      },
      {
        key: m.join_control_tooltip_data_values(),
        value: joinValues(row.dataValues, row.valueCount)
      }
    );
  } else {
    entries.push({
      key: m.join_control_tooltip_data_value(),
      value: formatValue(row.dataValues[0] ?? '')
    });
  }
  return entries;
}
