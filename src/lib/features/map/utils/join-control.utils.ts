import type { JoinTerritoryStatus } from '$lib/features/duckdb';
import type { JoinMapping } from '$lib/features/commons/types/data-tab.types';
import type { JoinCategoryTone } from '$lib/features/commons/types/data-tab.types';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

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

function joinValues(values: string[], total: number): string {
  const listed = values.map((value) => formatValue(value)).join(', ');
  return total > values.length ? `${listed}, …` : listed;
}

const STATUS_TONES: Record<JoinTerritoryStatus, JoinCategoryTone> = {
  matched: 'success',
  check: 'warning',
  duplicate: 'error',
  no_data: 'missing'
};

/**
 * The hovered territory's join status, then the value that joined it beside
 * its name on the basemap. The pinned inspector adds the row's other
 * variables.
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
  const hasData = row !== undefined && status !== 'no_data';

  const entries: TooltipEntry[] = [
    {
      key: m.join_control_tooltip_status(),
      value: getJoinControlStatusLabel(status),
      tone: STATUS_TONES[status],
      role: 'heading'
    },
    { key: 'heading-divider', value: '', role: 'divider' },
    {
      key: 'join',
      value: '',
      role: 'columns',
      columns: [
        {
          label: pickData.sourceIsFile
            ? m.join_control_tooltip_file()
            : m.join_data_column(),
          value: hasData ? joinValues(row.dataValues, row.valueCount) : '—'
        },
        {
          label: m.join_basemap_column(),
          value: formatValue(row?.territoryName ?? String(fallbackName ?? ''))
        }
      ]
    }
  ];

  if (hasData && status === 'duplicate') {
    entries.push({
      key: m.join_control_tooltip_rows(),
      value: formatValue(row.rowCount)
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

/**
 * What the join panel shows and the finalized join does not hold yet: a
 * suggestion replaced by another entity, or a joined value whose entity was
 * cleared (empty).
 */
export function buildPendingJoinMappings(
  joinMappings: readonly JoinMapping[],
  clearedValues: ReadonlySet<string>
): Record<string, string> {
  const pending: Record<string, string> = {};
  for (const mapping of joinMappings) {
    const suggested = mapping.candidates?.[0]?.name;
    if (suggested !== undefined && mapping.selectedMapping !== suggested) {
      pending[mapping.dataValue] = mapping.selectedMapping;
    }
  }
  for (const value of clearedValues) pending[value] = '';
  return pending;
}
