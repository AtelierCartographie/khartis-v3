import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FillMode,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import {
  ClassificationMethod,
  ScaleType,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    datasets: []
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: vi.fn()
  },
  initDuckDB: vi.fn(),
  duckDBOrchestrator: {},
  validateGPSColumns: vi.fn(),
  DuckDBSimplifiedType: {},
  RefineOperation: {},
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  }
}));

vi.mock('../../facets-adapter.svelte', () => ({
  FACET_SLOT: {
    SYMBOL_CATEGORY: 'symbol.categoryColumn',
    SYMBOL_VALUE: 'symbol.valueColumn'
  },
  facetsStore: {
    enabled: false,
    baseVisualizationId: undefined,
    primarySlotPath: null,
    variables: [],
    disable: vi.fn(),
    updateVariables: vi.fn()
  }
}));

import SymbolModeCategories from './symbol-mode-categories.svelte';

function buildVisualization(): VisualizationConfig {
  return {
    id: 'viz-points-categories',
    datasetId: 'dataset-points',
    type: 'categorical',
    name: 'Visualization',
    enabled: true,
    primitiveFilters: ['point'],
    mapping: {
      categoryColumn: 'category'
    },
    style: {},
    modes: {
      symbol: SymbolMode.CATEGORIES,
      fill: FillMode.CATEGORIES,
      stroke: StrokeMode.NONE
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.CATEGORIES,
      fillMode: FillMode.CATEGORIES,
      strokeMode: StrokeMode.NONE,
      categoryColumn: 'category',
      shape: ShapeType.CIRCLE,
      size: 12,
      minSize: 8,
      maxSize: 16,
      sizeScale: ScaleType.LINEAR,
      strokeWidth: 0,
      strokeOpacity: 1,
      strokeDashed: false,
      opacity: 1,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: 'unique',
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 2,
        numClasses: 2,
        colors: ['#ff595e', '#1982c4'],
        labels: []
      },
      missingData: {
        show: true,
        shape: 'circle',
        size: 2,
        color: '#d9d9d9'
      }
    }
  } as VisualizationConfig;
}

describe('SymbolModeCategories runtime', () => {
  afterEach(() => {
    cleanup();
  });

  it('falls back to the palette length for the displayed categories count when labels are missing', () => {
    render(SymbolModeCategories, {
      dataFields: [{ id: 1, text: 'category', type: 'text' }],
      visualization: buildVisualization()
    });

    expect(screen.getByText('2 catégories')).toBeInTheDocument();
  });

  it('opens the categories aspect popover from the dedicated settings control', async () => {
    const { container } = render(SymbolModeCategories, {
      dataFields: [{ id: 1, text: 'category', type: 'text' }],
      visualization: buildVisualization()
    });

    const trigger = container.querySelector('.categories-aspect-settings');

    expect(trigger).toBeInstanceOf(HTMLButtonElement);

    if (!(trigger instanceof HTMLButtonElement)) {
      return;
    }

    await fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('renders the contour section below missing data', () => {
    render(SymbolModeCategories, {
      dataFields: [{ id: 1, text: 'category', type: 'text' }],
      visualization: buildVisualization()
    });

    expect(screen.getByText('Contour')).toBeInTheDocument();
  });
});
