import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickingInfo } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { TooltipEntry } from '../types';
import { ToolbarStep } from '$lib/features/commons/types/global';

const { mockGlobalState, mockMapTooltipStore } = vi.hoisted(() => ({
  mockGlobalState: {
    isMobileView: false,
    selectedStep: 'data'
  },
  mockMapTooltipStore: {
    showAtHover: vi.fn(),
    hide: vi.fn(),
    pinAt: vi.fn(),
    unpin: vi.fn(),
    pinned: false,
    visible: false,
    state: {
      layerId: null,
      rowIndex: -1
    }
  }
}));

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalState: mockGlobalState
}));

vi.mock('../stores/map-tooltip.store.svelte', () => ({
  mapTooltipStore: mockMapTooltipStore
}));

import {
  createClickHandler,
  createHoverHandler,
  extractTooltipEntries
} from './tooltip.service';
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

describe('tooltip handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobalState.isMobileView = false;
    mockGlobalState.selectedStep = ToolbarStep.Data;
    mockMapTooltipStore.pinned = false;
    mockMapTooltipStore.visible = false;
    mockMapTooltipStore.state = {
      layerId: null,
      rowIndex: -1
    };
  });

  it('unpins and suppresses map tooltips while the styling step is active', () => {
    mockGlobalState.selectedStep = ToolbarStep.Styling;
    const pickingInfo = {
      picked: true,
      index: 0
    } as PickingInfo;

    createHoverHandler()(pickingInfo);
    createClickHandler()(pickingInfo);

    expect(mockMapTooltipStore.unpin).toHaveBeenCalledTimes(2);
    expect(mockMapTooltipStore.showAtHover).not.toHaveBeenCalled();
    expect(mockMapTooltipStore.pinAt).not.toHaveBeenCalled();
  });
});
