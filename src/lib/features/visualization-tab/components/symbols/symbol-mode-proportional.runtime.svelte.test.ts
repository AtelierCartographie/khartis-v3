import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CategoryShapeMode,
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  ClassificationMethod,
  ScaleType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
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

vi.mock('../../adapters/facets-adapter', () => ({
  FACET_SLOT: {
    SYMBOL_SIZE: 'symbol.sizeColumn',
    SYMBOL_VALUE: 'symbol.valueColumn',
    SYMBOL_FILL_VALUE: 'symbol.fillValueColumn',
    SYMBOL_FILL_CATEGORY: 'symbol.fillCategoryColumn',
    SYMBOL_STROKE_VALUE: 'symbol.strokeValueColumn',
    SYMBOL_STROKE_CATEGORY: 'symbol.strokeCategoryColumn'
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

import SymbolModeProportional from './symbol-mode-proportional.svelte';

function buildVisualization(): VisualizationConfig {
  return {
    id: 'viz-points-proportional',
    datasetId: 'dataset-points',
    type: 'proportional',
    name: 'Visualization',
    enabled: true,
    primitiveFilters: ['point'],
    mapping: {
      sizeColumn: 'population'
    },
    style: {},
    modes: {
      symbol: SymbolMode.PROPORTIONAL,
      fill: FillMode.UNIQUE,
      stroke: StrokeMode.NONE,
      proportionalType: ProportionalType.SINGLE
    },
    symbol: {
      enabled: true,
      mode: SymbolMode.PROPORTIONAL,
      fillMode: FillMode.UNIQUE,
      strokeMode: StrokeMode.NONE,
      sizeColumn: 'population',
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
      categoryShape: CategoryShapeMode.UNIQUE,
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 2,
        numClasses: 2,
        colors: ['#ff595e', '#1982c4'],
        labels: []
      },
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 2,
        color: '#d9d9d9'
      }
    }
  } as VisualizationConfig;
}

describe('SymbolModeProportional runtime', () => {
  afterEach(() => {
    cleanup();
  });

  it('guards initial visualization sync while preserving user changes', async () => {
    const onModesChange = vi.fn();
    const onMappingChange = vi.fn();
    const onSymbolsChange = vi.fn();
    const onStyleChange = vi.fn();
    const onMissingDataChange = vi.fn();
    const onSymbolPrimitiveChange = vi.fn();

    render(SymbolModeProportional, {
      dataFields: [{ id: 1, text: 'population', type: 'number' }],
      visualization: buildVisualization(),
      fillVisualization: buildVisualization(),
      symbolMode: SymbolMode.PROPORTIONAL,
      onModesChange,
      onMappingChange,
      onSymbolsChange,
      onStyleChange,
      onMissingDataChange,
      onSymbolPrimitiveChange
    });

    const doubleRadio = await screen.findByLabelText('Doubles');

    await waitFor(() => {
      expect(onModesChange).not.toHaveBeenCalled();
      expect(onMappingChange).not.toHaveBeenCalled();
      expect(onSymbolsChange).not.toHaveBeenCalled();
      expect(onStyleChange).not.toHaveBeenCalled();
      expect(onMissingDataChange).not.toHaveBeenCalled();
      expect(onSymbolPrimitiveChange).not.toHaveBeenCalled();
    });

    await fireEvent.click(doubleRadio);

    await waitFor(() => {
      expect(onModesChange).toHaveBeenCalledWith({
        proportionalType: ProportionalType.DOUBLE
      });
    });
  });

  it('maps proportional size field selections through the shared handler', async () => {
    const onMappingChange = vi.fn();
    const { container } = render(SymbolModeProportional, {
      dataFields: [
        { id: 1, text: 'population', type: 'number' },
        { id: 2, text: 'revenue', type: 'number' }
      ],
      visualization: buildVisualization(),
      fillVisualization: buildVisualization(),
      symbolMode: SymbolMode.PROPORTIONAL,
      onMappingChange,
      onModesChange: vi.fn(),
      onSymbolsChange: vi.fn(),
      onStyleChange: vi.fn(),
      onMissingDataChange: vi.fn(),
      onSymbolPrimitiveChange: vi.fn()
    });

    const trigger = container.querySelector(
      '.variable-dropdown .dropdown-trigger'
    );
    expect(trigger).toBeInstanceOf(HTMLButtonElement);

    await waitFor(() => {
      expect(onMappingChange).not.toHaveBeenCalled();
    });
    await fireEvent.click(trigger as HTMLButtonElement);
    await fireEvent.click(screen.getByRole('option', { name: /revenue/i }));

    expect(onMappingChange).toHaveBeenCalledWith({ sizeColumn: 'revenue' });
  });
});
