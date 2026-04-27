import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { BasemapLayerConfig } from '$lib/features/map/stores/basemap-layers.store.svelte';

const { mockVisualizationStore } = vi.hoisted(() => ({
  mockVisualizationStore: {
    activeVisualizations: [] as VisualizationConfig[],
    visualizations: [] as VisualizationConfig[],
    togglePrimitiveFilter: vi.fn(),
    toggleVisualization: vi.fn(),
    removeVisualization: vi.fn(),
    setVisualizationOrder: vi.fn(),
    setPrimitiveFilterOrder: vi.fn(),
    duplicateVisualization: vi.fn(),
    updateVisualization: vi.fn(),
    renameVisualization: vi.fn()
  }
}));

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
  const FillMode = {
    NONE: 'none',
    UNIQUE: 'unique',
    CLASSES: 'classes',
    CATEGORIES: 'categories'
  } as const;

  const getEnabledPrimitiveFilters = (
    visualization: VisualizationConfig
  ): string[] =>
    (visualization.primitiveFilters as string[] | undefined) ?? [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON
    ];

  const getPolygonPrimitive = (visualization: VisualizationConfig) => ({
    enabled: getEnabledPrimitiveFilters(visualization).includes(
      PrimitiveFilterType.POLYGON
    ),
    fillMode:
      visualization.style.fillOpacity === 0 ? FillMode.NONE : FillMode.UNIQUE,
    fillColor: visualization.style.fillColor,
    fillOpacity: visualization.style.fillOpacity ?? 1,
    strokeColor: visualization.style.strokeColor
  });

  const getSymbolPrimitive = (visualization: VisualizationConfig) => ({
    enabled: getEnabledPrimitiveFilters(visualization).includes(
      PrimitiveFilterType.POINT
    ),
    fillColor:
      visualization.style.symbolFillColor ?? visualization.style.fillColor,
    opacity:
      visualization.symbols?.opacity ?? visualization.style.fillOpacity ?? 1,
    strokeColor: visualization.style.strokeColor
  });

  const getLinePrimitive = (visualization: VisualizationConfig) => ({
    enabled: getEnabledPrimitiveFilters(visualization).includes(
      PrimitiveFilterType.LINE
    ),
    color: visualization.style.lineColor,
    opacity: visualization.style.lineOpacity ?? 1
  });

  const getTextPrimitive = () => ({
    enabled: false,
    color: undefined,
    opacity: 0,
    fontFamily: 'Cabin',
    secondaryLabels: {
      color: undefined,
      fontFamily: 'Cabin',
      bold: false,
      italic: false
    }
  });

  const getPrimitiveClassification = (visualization: VisualizationConfig) =>
    visualization.classification;

  const getSymbolFillClassification = (visualization: VisualizationConfig) =>
    visualization.symbol?.fillClassification ?? visualization.classification;

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
    getEnabledPrimitiveFilters,
    getLinePrimitive,
    getPolygonPrimitive,
    getPrimitiveClassification,
    getSymbolFillClassification,
    getSymbolPrimitive,
    getTextPrimitive,
    visualizationStore: mockVisualizationStore
  };
});

vi.mock('$lib/features/step-toolbar/tools/facets/facets.store.svelte', () => ({
  facetsStore: {
    enabled: false,
    baseVisualizationId: null,
    generatedVisualizationIds: []
  }
}));

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
  getVisualizationPrimitiveColor,
  layersActions,
  layersState
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisualizationStore.activeVisualizations = [];
    mockVisualizationStore.visualizations = [];
  });

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
      strokeOpacity: 100
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

  it('keeps hidden primitive rows available so they can be shown again', () => {
    const visualization = createVisualization({
      primitiveFilters: [PrimitiveFilterType.LINE, PrimitiveFilterType.POLYGON]
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    expect(layersState.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'viz-1::point',
          parentId: 'viz-1',
          isSubLayer: true,
          visible: false
        }),
        expect.objectContaining({
          id: 'viz-1::line',
          parentId: 'viz-1',
          isSubLayer: true,
          visible: true
        })
      ])
    );
  });

  it('uses the canonical visualization name for parent layers', () => {
    const visualization = createVisualization({
      name: 'Audit viz'
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    expect(layersState.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'viz-1',
          name: 'Audit viz'
        })
      ])
    );
  });

  it('renames parent visualization layers through the dedicated immediate path', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.updateLayer('viz-1', { name: 'Renamed layer' });

    expect(mockVisualizationStore.renameVisualization).toHaveBeenCalledWith(
      'viz-1',
      'Renamed layer'
    );
    expect(mockVisualizationStore.updateVisualization).not.toHaveBeenCalled();
  });
});
