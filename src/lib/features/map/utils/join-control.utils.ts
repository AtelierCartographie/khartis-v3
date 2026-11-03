import type { JoinTerritoryStatus } from '$lib/features/duckdb';
import { buildClassPatternSvgBackground } from '$lib/features/commons/components/palette-popover/palette.constants';
import { resolveClassPatterns } from '$lib/features/commons/services/pattern-palette.service';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

import {
  JOIN_CONTROL_FILL_COLORS,
  JOIN_CONTROL_PATTERNS
} from '../constants/join-control.constants';
import type { JoinControlPickData } from '../layers/join-control-layers';
import type { TooltipEntry } from '../types';

function capitalize(label: string): string {
  return label.charAt(0).toLocaleUpperCase(getLocale()) + label.slice(1);
}

/** The join panel's own wording for one territory. */
export function getJoinControlStatusLabel(status: JoinTerritoryStatus): string {
  switch (status) {
    case 'matched':
      return capitalize(m.join_entities_joined_one());
    case 'check':
      return capitalize(m.join_entities_to_verify_one());
    case 'duplicate':
      return capitalize(m.join_entities_duplicate_one());
    case 'no_data':
      return capitalize(m.join_entities_no_data_one());
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
 * The hovered territory's join status, the variable that joined it, its name
 * on the basemap and the value that joined it. The pinned inspector adds the
 * row's other variables.
 */
export function buildJoinControlTooltipEntries(
  pickData: JoinControlPickData,
  geomRow: number,
  otherVariables: TooltipEntry[]
): TooltipEntry[] {
  const { rows, territories, geometry, featureIdColumn } = pickData;
  if (geomRow < 0 || geomRow >= geometry.numRows) return [];

  const rowIndex = territories.rowIndexByGeomRow[geomRow];
  const row = rowIndex >= 0 ? rows[rowIndex] : undefined;
  const status = territories.statusByGeomRow[geomRow] ?? 'no_data';
  const fallbackName = geometry.getChild(featureIdColumn)?.get(geomRow);

  const entries: TooltipEntry[] = [
    {
      key: m.join_control_tooltip_status(),
      value: getJoinControlStatusLabel(status),
      swatch: getJoinControlSwatchBackground(status),
      role: 'heading'
    },
    {
      key: m.join_control_tooltip_geo_reference(),
      value: pickData.geoColumn,
      role: 'subtitle'
    },
    {
      key: m.join_control_tooltip_basemap(),
      value: formatValue(row?.territoryName ?? String(fallbackName ?? ''))
    }
  ];

  if (row && status !== 'no_data') {
    if (status === 'duplicate') {
      entries.push({
        key: m.join_control_tooltip_rows(),
        value: formatValue(row.rowCount)
      });
    }
    entries.push({
      key: pickData.sourceIsFile
        ? m.join_control_tooltip_file()
        : m.join_control_tooltip_table(),
      value: joinValues(row.dataValues, row.valueCount)
    });
  }

  if (otherVariables.length > 0) {
    entries.push(
      { key: 'divider', value: '', role: 'divider', pinnedOnly: true },
      {
        key: m.join_control_tooltip_other_variables(),
        value: '',
        role: 'subtitle',
        pinnedOnly: true
      },
      ...otherVariables.map((entry) => ({ ...entry, pinnedOnly: true }))
    );
  }
  return entries;
}
