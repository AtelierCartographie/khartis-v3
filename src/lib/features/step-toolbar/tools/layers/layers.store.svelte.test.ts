import { describe, expect, it, vi } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { BasemapLayerConfig } from '$lib/features/map/stores/basemap-layers.store.svelte';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => {
  const PrimitiveFilterType = {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  } as const;
  const ScaleType = {
    SQRT: 'sqrt'
  } as const;
  const VisualizationType = {
    CHOROPLETH: 'choropleth'
  } as const;
  const ClassificationMethod = {
    QUANTILES: 'quantiles'
  } as const;

  return {
    ALL_PRIMITIVE_FILTERS: [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON
    ],
    PrimitiveFilterType,
    ScaleType,
    VisualizationType,
    ClassificationMethod,
    visualizationStore: {
      activeVisualizations: [],
      visualizations: [],
      togglePrimitiveFilter: vi.fn(),
      toggleVisualization: vi.fn(),
      removeVisualization: vi.fn(),
      setVisualizationOrder: vi.fn(),
      setPrimitiveFilterOrder: vi.fn(),
      duplicateVisualization: vi.fn(),
      updateVisualization: vi.fn()
    }
  };
});

vi.mock('$lib/features/map/stores/basemap-layers.store.svelte', () => ({
  BASEMAP_LAYER_ID: {
    TERRE: 'terre'
  },
  basemapLayersStore: {
    layers: [],
    version: 0,
    setLayerVisibility: vi.fn(),
    setLayerRenderGroupOrder: vi.fn()
  },
  getBasemapRenderGroup: vi.fn(() => 'background')
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  BasemapDottedPattern,
  MissingDataShape,
  ShapeType
} from '$lib/features/main-toolbar/constants';
import {
  getBasemapLayerColor,
  getVisualizationColor,
  getVisualizationPrimitiveColor
} from './layers.store.svelte';

function createVisualization(
  overrides: Partial<VisualizationConfig> = {}
): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Visualization',
    type: VisualizationType.CHOROPLETH,
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON
    ],
    primitiveOrder: [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON
    ],
    style: {
      fillOpacity: 0.8,
      strokeColor: '#ffffff',
      strokeWidth: 1,
      strokeOpacity: 1
    },
    mapping: {
      geometryColumn: 'geometry'
    },
    classification: undefined,
    symbols: {
      type: ShapeType.CIRCLE,
      minSize: 4,
      maxSize: 12,
      sizeScale: ScaleType.SQRT
    },
    missingData: {
      show: false,
      shape: MissingDataShape.CIRCLE,
      size: 2,
      color: '#c6c6c6'
    },
    ...overrides
  };
}

describe('layers color helpers', () => {
  it('uses the classification palette before a white outline for choropleths', () => {
    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.QUANTILES,
        classes: 4,
        colors: ['#c8ddf0', '#78a9cf', '#2171b5', '#084594']
      }
    });

    expect(getVisualizationColor(visualization)).toBe('#c8ddf0');
    expect(
      getVisualizationPrimitiveColor(visualization, PrimitiveFilterType.POLYGON)
    ).toBe('#c8ddf0');
  });

  it('keeps the actual primitive color when a line visualization has one', () => {
    const visualization = createVisualization({
      style: {
        lineColor: '#1e3a5f',
        lineOpacity: 1
      }
    });

    expect(
      getVisualizationPrimitiveColor(visualization, PrimitiveFilterType.LINE)
    ).toBe('#1e3a5f');
  });

  it('uses the neutral polygon stroke when support polygons have no fill', () => {
    const visualization = createVisualization({
      style: {
        fillColor: '#1192e8',
        fillOpacity: 0,
        strokeColor: '#8d8d8d',
        strokeOpacity: 1
      }
    });

    expect(
      getVisualizationPrimitiveColor(visualization, PrimitiveFilterType.POLYGON)
    ).toBe('#8d8d8d');
  });

  it('shows land with its contour color and water with its own color', () => {
    const terre = {
      id: 'terre',
      visible: true,
      fillColor: '#ffffff',
      fillShadow: false,
      fillOpacity: 100,
      strokeColor: '#a8a8a8',
      strokeDotted: false,
      strokeDottedPattern: BasemapDottedPattern.DOTS,
      strokeThickness: 1,
      strokeOpacity: 40
    } satisfies BasemapLayerConfig;
    const mers = {
      id: 'mers',
      visible: true,
      color: '#d0e2ff',
      opacity: 100
    } satisfies BasemapLayerConfig;

    expect(getBasemapLayerColor(terre)).toBe('#a8a8a8');
    expect(getBasemapLayerColor(mers)).toBe('#d0e2ff');
  });
});
