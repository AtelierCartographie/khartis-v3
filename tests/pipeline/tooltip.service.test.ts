import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickingInfo } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createClickHandler,
  createHoverHandler,
  extractTooltipEntries
} from '$lib/features/map/interactions/tooltip.service';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { MAP_TIMING } from '$lib/features/map/constants/timing.constants';
import { mapTooltipStore } from '$lib/features/map/stores/map-tooltip.store.svelte';

type ArrowRowMock = {
  __id: number;
  directive_ippc: string;
  nom_de_linstallation: string;
  basemap_id?: string;
};

function createArrowTableMock(
  rows: ArrowRowMock[] = [
    {
      __id: 42,
      directive_ippc: 'Soumis à la directive IPPC',
      nom_de_linstallation: 'SIAAP',
      basemap_id: 'ignored'
    }
  ]
): ArrowTable {
  const fields = Object.keys(
    rows[0] ?? {
      __id: true,
      directive_ippc: true,
      nom_de_linstallation: true,
      basemap_id: true
    }
  );
  const columns = new Map<string, unknown>(
    fields.map((field) => [
      field,
      {
        get: (index: number) =>
          rows[index]?.[field as keyof ArrowRowMock] ?? null
      }
    ])
  );

  return {
    numRows: rows.length,
    schema: {
      fields: fields.map((name) => ({ name }))
    },
    getChild(name: string) {
      return columns.get(name) ?? null;
    }
  } as ArrowTable;
}

describe('extractTooltipEntries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllTimers();
    mapTooltipStore.unpin();
  });

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

  it('resolves binary polygon pick indices back to the source row', () => {
    const sourceTable = createArrowTableMock([
      {
        __id: 11,
        directive_ippc: 'Premiere installation',
        nom_de_linstallation: 'Alpha'
      },
      {
        __id: 23,
        directive_ippc: 'Deuxieme installation',
        nom_de_linstallation: 'Beta'
      }
    ]);
    const visualization: VisualizationConfig = {
      id: 'viz-1',
      name: 'Visualization',
      datasetId: 'ds_dataset_1',
      type: 'choropleth' as VisualizationConfig['type'],
      enabled: true,
      style: {},
      mapping: {
        valueColumn: 'directive_ippc'
      }
    };
    const info = {
      picked: true,
      index: 5,
      x: 120,
      y: 180,
      object: null,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator',
        props: {
          data: {
            startIndices: Uint32Array.from([0, 4, 8]),
            attributes: {},
            khartisSourceTable: sourceTable
          }
        }
      }
    } as PickingInfo;

    expect(extractTooltipEntries(info, [visualization])).toEqual([
      {
        key: 'directive_ippc',
        value: 'Deuxieme installation'
      },
      {
        key: 'nom_de_linstallation',
        value: 'Beta'
      }
    ]);

    createClickHandler(() => [visualization])(info);

    expect(mapTooltipStore.state.pinned).toBe(true);
    expect(mapTooltipStore.state.rowIndex).toBe(1);
  });

  it('uses binary featureIds for multipart polygon picks', () => {
    const sourceTable = createArrowTableMock([
      {
        __id: 11,
        directive_ippc: 'Premiere installation',
        nom_de_linstallation: 'Alpha'
      },
      {
        __id: 23,
        directive_ippc: 'Deuxieme installation',
        nom_de_linstallation: 'Beta'
      }
    ]);
    const visualization: VisualizationConfig = {
      id: 'viz-1',
      name: 'Visualization',
      datasetId: 'ds_dataset_1',
      type: 'choropleth' as VisualizationConfig['type'],
      enabled: true,
      style: {},
      mapping: {
        valueColumn: 'directive_ippc'
      }
    };
    const info = {
      picked: true,
      index: 3,
      x: 120,
      y: 180,
      object: null,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator',
        props: {
          data: {
            featureIds: Uint32Array.from([0, 0, 1, 1]),
            startIndices: Uint32Array.from([0, 4, 8, 12, 16]),
            attributes: {},
            khartisSourceTable: sourceTable
          }
        }
      }
    } as PickingInfo;

    expect(extractTooltipEntries(info, [visualization])).toEqual([
      {
        key: 'directive_ippc',
        value: 'Deuxieme installation'
      },
      {
        key: 'nom_de_linstallation',
        value: 'Beta'
      }
    ]);

    createHoverHandler(() => [visualization])(info);
    vi.advanceTimersByTime(MAP_TIMING.TOOLTIP_DELAY_MS);

    expect(mapTooltipStore.visible).toBe(true);
    expect(mapTooltipStore.state.rowIndex).toBe(1);
    expect(mapTooltipStore.state.entries).toEqual([
      {
        key: 'directive_ippc',
        value: 'Deuxieme installation'
      },
      {
        key: 'nom_de_linstallation',
        value: 'Beta'
      }
    ]);
  });

  it('prefers binary featureIds even when pick index is below source row count', () => {
    const rows = Array.from({ length: 240 }, (_, index) => ({
      __id: index,
      directive_ippc: `Installation ${index}`,
      nom_de_linstallation: `Row ${index}`
    }));
    rows[117] = {
      __id: 117,
      directive_ippc: 'Region francaise',
      nom_de_linstallation: 'Ile-de-France'
    };
    rows[237] = {
      __id: 237,
      directive_ippc: 'Region etrangere',
      nom_de_linstallation: 'Zapadne Slovensko'
    };

    const sourceTable = createArrowTableMock(rows);
    const featureIds = Uint32Array.from({ length: 240 }, (_, index) => index);

    const visualization: VisualizationConfig = {
      id: 'viz-1',
      name: 'Visualization',
      datasetId: 'ds_dataset_1',
      type: 'choropleth' as VisualizationConfig['type'],
      enabled: true,
      style: {},
      mapping: {
        valueColumn: 'directive_ippc'
      }
    };
    const info = {
      picked: true,
      index: 237,
      x: 392,
      y: 144,
      object: null,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator',
        props: {
          data: {
            featureIds,
            startIndices: Uint32Array.from(
              { length: 241 },
              (_, index) => index
            ),
            attributes: {},
            khartisSourceTable: sourceTable
          }
        }
      }
    } as PickingInfo;

    featureIds[237] = 117;

    expect(extractTooltipEntries(info, [visualization])).toEqual([
      {
        key: 'directive_ippc',
        value: 'Region francaise'
      },
      {
        key: 'nom_de_linstallation',
        value: 'Ile-de-France'
      }
    ]);

    createHoverHandler(() => [visualization])(info);
    vi.advanceTimersByTime(MAP_TIMING.TOOLTIP_DELAY_MS);

    expect(mapTooltipStore.visible).toBe(true);
    expect(mapTooltipStore.state.rowIndex).toBe(117);
    expect(mapTooltipStore.state.entries).toEqual([
      {
        key: 'directive_ippc',
        value: 'Region francaise'
      },
      {
        key: 'nom_de_linstallation',
        value: 'Ile-de-France'
      }
    ]);
  });

  it('keeps the clicked selection pinned when hover moves elsewhere', () => {
    const visualizations: VisualizationConfig[] = [
      {
        id: 'viz-1',
        name: 'Visualization',
        datasetId: 'ds_dataset_1',
        type: 'choropleth' as VisualizationConfig['type'],
        enabled: true,
        style: {},
        mapping: {
          valueColumn: 'directive_ippc'
        }
      }
    ];

    const clickHandler = createClickHandler(() => visualizations);
    const hoverHandler = createHoverHandler(() => visualizations);

    clickHandler({
      picked: true,
      index: 0,
      x: 100,
      y: 120,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          __id: 42,
          directive_ippc: 'Soumis à la directive IPPC',
          nom_de_linstallation: 'SIAAP'
        }
      }
    } as PickingInfo);

    hoverHandler({
      picked: true,
      index: 1,
      x: 180,
      y: 190,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          __id: 77,
          directive_ippc: 'Autre installation',
          nom_de_linstallation: 'Autre site'
        }
      }
    } as PickingInfo);

    hoverHandler({
      picked: false,
      index: -1
    } as PickingInfo);

    expect(mapTooltipStore.state.visible).toBe(true);
    expect(mapTooltipStore.state.pinned).toBe(true);
    expect(mapTooltipStore.state.layerId).toBe(
      'polygon-layer-ds_dataset_1-mercator'
    );
    expect(mapTooltipStore.state.rowIndex).toBe(0);
  });

  it('ignores hover updates while a selection is pinned', () => {
    const visualizations: VisualizationConfig[] = [
      {
        id: 'viz-1',
        name: 'Visualization',
        datasetId: 'ds_dataset_1',
        type: 'choropleth' as VisualizationConfig['type'],
        enabled: true,
        style: {},
        mapping: {
          valueColumn: 'directive_ippc'
        }
      }
    ];

    const clickHandler = createClickHandler(() => visualizations);
    const hoverHandler = createHoverHandler(() => visualizations);

    clickHandler({
      picked: true,
      index: 0,
      x: 100,
      y: 120,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          __id: 42,
          directive_ippc: 'Soumis à la directive IPPC',
          nom_de_linstallation: 'SIAAP'
        }
      }
    } as PickingInfo);

    hoverHandler({
      picked: true,
      index: 1,
      x: 180,
      y: 190,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          __id: 77,
          directive_ippc: 'Autre installation',
          nom_de_linstallation: 'Autre site'
        }
      }
    } as PickingInfo);

    vi.advanceTimersByTime(MAP_TIMING.TOOLTIP_DELAY_MS);

    expect(mapTooltipStore.state.visible).toBe(true);
    expect(mapTooltipStore.state.pinned).toBe(true);
    expect(mapTooltipStore.state.rowIndex).toBe(0);
    expect(mapTooltipStore.state.entries).toEqual([
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

  it('keeps the same selection pinned until clicking away', () => {
    const visualizations: VisualizationConfig[] = [
      {
        id: 'viz-1',
        name: 'Visualization',
        datasetId: 'ds_dataset_1',
        type: 'choropleth' as VisualizationConfig['type'],
        enabled: true,
        style: {},
        mapping: {
          valueColumn: 'directive_ippc'
        }
      }
    ];

    const clickHandler = createClickHandler(() => visualizations);

    const pickedInfo = {
      picked: true,
      index: 0,
      x: 100,
      y: 120,
      layer: {
        id: 'polygon-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          __id: 42,
          directive_ippc: 'Soumis à la directive IPPC',
          nom_de_linstallation: 'SIAAP'
        }
      }
    } as PickingInfo;

    clickHandler(pickedInfo);
    clickHandler(pickedInfo);

    expect(mapTooltipStore.state.visible).toBe(true);
    expect(mapTooltipStore.state.pinned).toBe(true);
    expect(mapTooltipStore.state.layerId).toBe(
      'polygon-layer-ds_dataset_1-mercator'
    );
    expect(mapTooltipStore.state.rowIndex).toBe(0);

    clickHandler({
      picked: false,
      index: -1
    } as PickingInfo);

    expect(mapTooltipStore.state.visible).toBe(false);
    expect(mapTooltipStore.state.pinned).toBe(false);
  });

  it('delays hover tooltip display to avoid flicker on rapid pointer moves', () => {
    const hoverHandler = createHoverHandler();

    hoverHandler({
      picked: true,
      index: 0,
      x: 120,
      y: 180,
      layer: {
        id: 'point-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          city: 'Paris',
          population: 9_904_000
        }
      }
    } as PickingInfo);

    expect(mapTooltipStore.visible).toBe(false);

    vi.advanceTimersByTime(MAP_TIMING.TOOLTIP_DELAY_MS);

    expect(mapTooltipStore.visible).toBe(true);
    expect(mapTooltipStore.state.entries).toEqual([
      { key: 'city', value: 'Paris' },
      { key: 'population', value: '9 904 000' }
    ]);
  });

  it('cancels a pending hover tooltip when the pointer leaves the feature', () => {
    const hoverHandler = createHoverHandler();

    hoverHandler({
      picked: true,
      index: 0,
      x: 120,
      y: 180,
      layer: {
        id: 'point-layer-ds_dataset_1-mercator'
      },
      object: {
        properties: {
          city: 'Paris'
        }
      }
    } as PickingInfo);

    hoverHandler({
      picked: false,
      index: -1
    } as PickingInfo);

    vi.advanceTimersByTime(MAP_TIMING.TOOLTIP_DELAY_MS);

    expect(mapTooltipStore.visible).toBe(false);
    expect(mapTooltipStore.state.entries).toEqual([]);
  });
});
