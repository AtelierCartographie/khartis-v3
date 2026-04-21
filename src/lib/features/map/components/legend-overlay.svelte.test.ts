import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CategoryShapeMode,
  FillMode,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';

const { mockVisualizationStore, mockDatasetsStore } = vi.hoisted(() => ({
  mockVisualizationStore: {
    version: 0,
    visualizations: [] as VisualizationConfig[]
  },
  mockDatasetsStore: {
    getColumnStatistics: (columnName?: string) => {
      switch (columnName) {
        case 'population':
          return { min: 30_359, max: 15_907_951 };
        case 'secondary-population':
          return { min: 22_120, max: 9_431_204 };
        default:
          return null;
      }
    }
  }
}));

vi.mock(
  '$lib/features/commons/store/visualization.store.svelte',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('$lib/features/commons/store/visualization.store.svelte')
      >();

    return {
      ...actual,
      visualizationStore: mockVisualizationStore
    };
  }
);

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    getColumnStatistics: (_datasetId: string, columnName?: string) =>
      mockDatasetsStore.getColumnStatistics(columnName)
  }
}));

import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import LegendOverlay from './legend-overlay.svelte';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

describe('legend overlay visibility', () => {
  beforeEach(() => {
    cleanup();
    mockVisualizationStore.version = 0;
    mockVisualizationStore.visualizations = [];
    legendActions.reset();
    legendActions.setVisibility(true);
    legendActions.addLegendItem({
      name: 'Population',
      visible: true,
      title: 'Population',
      titleMode: 'custom',
      subtitle: '',
      subtitleMode: 'custom',
      note: '',
      variableId: undefined
    });
  });

  afterEach(() => {
    cleanup();
    legendActions.reset();
  });

  it('renders the legend content when visible', () => {
    render(LegendOverlay);

    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('keeps the legend mounted but hidden when requested', () => {
    const { container } = render(LegendOverlay, { hidden: true });

    expect(
      container.querySelector('.legend-overlay.hidden')
    ).toBeInTheDocument();
    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('compacts double proportional symbols when the map uses overlay mode', () => {
    mockVisualizationStore.version = 1;
    mockVisualizationStore.visualizations = [buildDoubleProportionalViz()];
    legendActions.reset();
    legendActions.setVisibility(true);

    const { container } = render(LegendOverlay);

    const pair = container.querySelector(
      '.legend-proportional-pair[data-position-mode="overlay"]'
    );

    expect(pair).toBeInTheDocument();
    expect(pair?.querySelectorAll('.legend-proportional-symbol')).toHaveLength(
      2
    );
    expect(screen.getByText('15,907,951')).toBeInTheDocument();
  });
});

function buildDoubleProportionalViz(): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Population',
    type: 'proportional',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: ['point'],
    primitiveOrder: ['point'],
    modes: {
      symbol: SymbolMode.PROPORTIONAL,
      proportionalType: ProportionalType.DOUBLE
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      size: 12,
      minSize: 4,
      maxSize: 24,
      sizeScale: 'linear',
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#4585f5',
      fillColorB: '#ff812a',
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1,
      proportionalType: ProportionalType.DOUBLE,
      categoryShape: CategoryShapeMode.UNIQUE,
      commonScale: true,
      positionMode: SymbolDoublePosition.OVERLAY,
      valueColumn: 'secondary-population',
      sizeColumn: 'population'
    },
    style: {
      fillColor: '#4585f5',
      fillColorB: '#ff812a',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 100
    },
    mapping: {
      sizeColumn: 'population',
      valueColumn: 'secondary-population',
      geometryColumn: 'geom'
    },
    symbols: {
      type: ShapeType.CIRCLE,
      minSize: 4,
      maxSize: 24,
      sizeScale: 'linear'
    }
  } as VisualizationConfig;
}
