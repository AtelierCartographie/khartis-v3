import { describe, expect, it } from 'vitest';
import type { PickingInfo } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { TooltipEntry } from '../types';
import { extractTooltipEntries } from './tooltip.service';
import type {
  VisualizationConfig,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';

function createArrowTable(rows: Array<Record<string, unknown>>): ArrowTable {
  const fieldNames = Object.keys(rows[0] ?? {});

  return {
    numRows: rows.length,
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    },
    getChild(name: string) {
      return {
        get(index: number) {
          return rows[index]?.[name];
        }
      };
    }
  } as unknown as ArrowTable;
}

function createVisualization(scope: {
  id: string;
  datasetId: string;
  valueColumn?: string;
}): VisualizationConfig {
  return {
    id: scope.id,
    name: 'Tooltip test',
    type: 'proportional' as VisualizationType,
    datasetId: scope.datasetId,
    enabled: true,
    style: {},
    mapping: {
      valueColumn: scope.valueColumn
    }
  };
}

function createPickingInfo(layerId: string, table: ArrowTable): PickingInfo {
  return {
    picked: true,
    index: 0,
    layer: {
      id: layerId,
      props: {
        data: table
      }
    }
  } as PickingInfo;
}

function keys(entries: TooltipEntry[]): string[] {
  return entries.map((entry) => entry.key);
}

describe('extractTooltipEntries', () => {
  const table = createArrowTable([
    {
      OGC_FID: 2,
      id: 'C',
      name: 'Gamma',
      value: 99
    }
  ]);
  const vizId = 'd30532b6-1ec1-4bc0-8208-9849930c420b';
  const datasetId = 'e973ad18-9e7e-4bad-9ba8-ee172dedde1e';

  it('prioritizes mapped columns when the thematic layer id is scoped by visualization id', () => {
    const entries = extractTooltipEntries(
      createPickingInfo(`point-layer-${vizId}-centroids`, table),
      [
        createVisualization({
          id: vizId,
          datasetId,
          valueColumn: 'value'
        })
      ]
    );

    expect(keys(entries)).toEqual(['value', 'OGC_FID', 'id', 'name']);
  });

  it('still prioritizes mapped columns when the thematic layer id is scoped by dataset id', () => {
    const entries = extractTooltipEntries(
      createPickingInfo(`point-layer-${datasetId}-main`, table),
      [
        createVisualization({
          id: vizId,
          datasetId,
          valueColumn: 'value'
        })
      ]
    );

    expect(keys(entries)).toEqual(['value', 'OGC_FID', 'id', 'name']);
  });
});
