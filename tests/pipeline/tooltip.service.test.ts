import { describe, expect, it } from 'vitest';
import type { PickingInfo } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { extractTooltipEntries } from '$lib/features/map/interactions/tooltip.service';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';

function createArrowTableMock(): ArrowTable {
  const columns = new Map<string, unknown>([
    ['__id', { get: () => 42 }],
    ['directive_ippc', { get: () => 'Soumis à la directive IPPC' }],
    ['nom_de_linstallation', { get: () => 'SIAAP' }],
    ['basemap_id', { get: () => 'ignored' }]
  ]);

  return {
    numRows: 1,
    schema: {
      fields: [
        { name: '__id' },
        { name: 'directive_ippc' },
        { name: 'nom_de_linstallation' },
        { name: 'basemap_id' }
      ]
    },
    getChild(name: string) {
      return columns.get(name) ?? null;
    }
  } as ArrowTable;
}

describe('extractTooltipEntries', () => {
  it('reads entries from the attached Arrow table for binary pick layers', () => {
    const sourceTable = createArrowTableMock();
    const visualization: VisualizationConfig = {
      id: 'viz-1',
      name: 'Visualization',
      datasetId: 'ds_dataset_1',
      type: 'categorical' as VisualizationConfig['type'],
      enabled: true,
      style: {},
      mapping: {
        categoryColumn: 'directive_ippc'
      }
    };
    const info = {
      picked: true,
      index: 0,
      object: null,
      layer: {
        id: 'point-layer-ds_dataset_1-mercator',
        props: {
          data: {
            attributes: {},
            khartisSourceTable: sourceTable
          }
        }
      }
    } as PickingInfo;

    const entries = extractTooltipEntries(info, [visualization]);

    expect(entries).toEqual([
      {
        key: 'directive_ippc',
        value: 'Soumis à la directive IPPC'
      },
      {
        key: 'nom_de_linstallation',
        value: 'SIAAP'
      }
    ]);
  });
});
