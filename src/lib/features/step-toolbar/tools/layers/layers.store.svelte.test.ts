import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import type { BasemapLayerConfig } from '$lib/features/map/stores/basemap-layers.store.svelte';

const {
  mockVisualizationStore,
  mockFacetsStore,
  mockBasemapLayersStore,
  mockBasemapAuxLayersStore,
  mockBasemapStyleStore,
  mockBasemapService
} = vi.hoisted(() => {
  const basemapLayersStore = {
    layers: [] as Array<Record<string, unknown>>,
    version: 0,
    getLayer: vi.fn((id: string) =>
      basemapLayersStore.layers.find((layer) => layer.id === id)
    ),
    setLayerVisibility: vi.fn(),
    setLayerRenderGroupOrder: vi.fn()
  };

  return {
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
    },
    mockFacetsStore: {
      enabled: false,
      baseVisualizationId: null as string | null,
      generatedVisualizationIds: [] as string[]
    },
    mockBasemapLayersStore: basemapLayersStore,
    mockBasemapAuxLayersStore: {
      version: 0,
      isVisible: vi.fn(() => true),
      setVisible: vi.fn()
    },
    mockBasemapStyleStore: {
      referenceBasemapId: null as string | null
    },
    mockBasemapService: {
      availableBasemaps: [] as Array<Record<string, unknown>>,
      currentMetadata: null as Record<string, unknown> | null
    }
  };
});

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => {
  const PrimitiveFilterType = {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon',
    TEXT: 'text'
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
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
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

  const getTextPrimitive = (visualization: VisualizationConfig) => ({
    enabled: getEnabledPrimitiveFilters(visualization).includes(
      PrimitiveFilterType.TEXT
    ),
    color: visualization.style.textColor,
    opacity: visualization.style.textOpacity ?? 1,
    fontFamily: visualization.style.textFontFamily ?? 'Cabin',
    secondaryLabels: {
      color: visualization.style.labelColor,
      fontFamily: visualization.style.labelFontFamily ?? 'Cabin',
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
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
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
  facetsStore: mockFacetsStore
}));

vi.mock('$lib/features/map/stores/basemap-layers.store.svelte', () => ({
  BASEMAP_LAYER_ID: {
    TERRE: 'terre',
    MERS: 'mers',
    LACS: 'lacs',
    RIVIERES: 'rivieres',
    RELIEF: 'relief',
    EQUATEUR: 'equateur',
    MERIDIENS: 'meridiens',
    FRONTIERES: 'frontieres',
    VILLES: 'villes',
    SPHERE: 'sphere'
  },
  basemapLayersStore: mockBasemapLayersStore,
  getBasemapRenderGroup: vi.fn((id: string) =>
    id === 'frontieres' || id === 'rivieres' || id === 'villes'
      ? 'foreground'
      : 'background'
  )
}));

vi.mock('$lib/features/map/stores/basemap-aux-layers.store.svelte', () => ({
  basemapAuxLayersStore: mockBasemapAuxLayersStore
}));

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: mockBasemapStyleStore
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: mockBasemapService,
  getPreferredBasemapFile: vi.fn(
    (_basemaps, referenceBasemapId: string) => referenceBasemapId
  )
}));

vi.mock('$lib/features/map/utils/basemap-metadata-resolution.utils', () => ({
  resolveActiveBasemapMetadata: vi.fn(
    ({ referenceBasemapId, currentMetadata }) =>
      referenceBasemapId ? currentMetadata : null
  )
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  BasemapDottedPattern,
  MissingDataShape,
  ShapeType
} from '$lib/features/commons/constants/visualization.constants';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
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
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
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

function resetBasemapLayerMocks(): void {
  mockBasemapStyleStore.referenceBasemapId = null;
  mockBasemapService.availableBasemaps = [];
  mockBasemapService.currentMetadata = null;
  mockBasemapAuxLayersStore.version = 0;
  mockBasemapAuxLayersStore.isVisible.mockReturnValue(true);
  mockBasemapLayersStore.layers = [
    {
      id: 'mers',
      visible: true,
      color: '#d0e2ff',
      opacity: 100
    },
    {
      id: 'sphere',
      visible: true,
      color: '#8d8d8d',
      thickness: 1,
      opacity: 100
    },
    {
      id: 'frontieres',
      visible: true,
      color: '#525252',
      dotted: false,
      dottedPattern: BasemapDottedPattern.DOTS,
      thickness: 1,
      opacity: 100
    },
    {
      id: 'meridiens',
      visible: true,
      color: '#e0e0e0',
      dotted: true,
      dottedPattern: BasemapDottedPattern.DOTS,
      thickness: 1,
      opacity: 100
    }
  ];
}

describe('layers color helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisualizationStore.activeVisualizations = [];
    mockVisualizationStore.visualizations = [];
    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
    resetBasemapLayerMocks();
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

  it('exposes a Textes sublayer for every visualization so it can be toggled later', () => {
    const visualization = createVisualization({
      primitiveFilters: [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        PrimitiveFilterType.POLYGON
      ]
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    const textSubLayer = layersState.layers.find(
      (layer) => layer.id === 'viz-1::text'
    );
    expect(textSubLayer).toEqual(
      expect.objectContaining({
        id: 'viz-1::text',
        parentId: 'viz-1',
        isSubLayer: true,
        primitive: PrimitiveFilterType.TEXT,
        visible: false
      })
    );
  });

  it('marks the Textes sublayer as visible when the visualization enables text', () => {
    const visualization = createVisualization({
      primitiveFilters: [PrimitiveFilterType.POLYGON, PrimitiveFilterType.TEXT]
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    const textSubLayer = layersState.layers.find(
      (layer) => layer.id === 'viz-1::text'
    );
    expect(textSubLayer).toEqual(
      expect.objectContaining({
        visible: true
      })
    );
  });

  it('toggles the Textes sublayer through togglePrimitiveFilter', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.toggleLayerVisibility('viz-1::text');

    expect(mockVisualizationStore.togglePrimitiveFilter).toHaveBeenCalledWith(
      'viz-1',
      PrimitiveFilterType.TEXT
    );
  });

  it('reorders Textes among other primitive sublayers via setPrimitiveFilterOrder', () => {
    const visualization = createVisualization({
      primitiveOrder: [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        PrimitiveFilterType.POLYGON,
        PrimitiveFilterType.TEXT
      ]
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.reorderSubLayers('viz-1', 3, 0);

    expect(mockVisualizationStore.setPrimitiveFilterOrder).toHaveBeenCalledWith(
      'viz-1',
      [
        PrimitiveFilterType.TEXT,
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        PrimitiveFilterType.POLYGON
      ]
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

  it('removes parent visualization layers', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.removeLayer('viz-1');

    expect(mockVisualizationStore.removeVisualization).toHaveBeenCalledWith(
      'viz-1'
    );
  });

  it('does not remove sublayers directly', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.removeLayer('viz-1::point');

    expect(mockVisualizationStore.removeVisualization).not.toHaveBeenCalled();
  });

  it('reorders visualization layers', () => {
    const viz1 = createVisualization({ id: 'viz-1', name: 'Viz 1' });
    const viz2 = createVisualization({ id: 'viz-2', name: 'Viz 2' });

    mockVisualizationStore.visualizations = [viz1, viz2];
    mockVisualizationStore.activeVisualizations = [viz1, viz2];

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers('visualization', 0, 1);

    expect(mockVisualizationStore.setVisualizationOrder).toHaveBeenCalledWith([
      'viz-2',
      'viz-1'
    ]);
  });

  it('duplicates parent visualization layers', () => {
    const visualization = createVisualization();
    const duplicated = createVisualization({
      id: 'viz-2',
      name: 'Visualization (1)'
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockVisualizationStore.duplicateVisualization.mockImplementation(() => {
      mockVisualizationStore.visualizations = [visualization, duplicated];
      return duplicated;
    });

    layersActions.syncWithVisualizations();
    const result = layersActions.duplicateLayer('viz-1');

    expect(mockVisualizationStore.duplicateVisualization).toHaveBeenCalledWith(
      'viz-1'
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe('viz-2');
  });

  it('toggles visualization parent visibility', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.toggleLayerVisibility('viz-1');

    expect(mockVisualizationStore.toggleVisualization).toHaveBeenCalledWith(
      'viz-1'
    );
  });

  it('toggles primitive sublayer visibility', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.toggleLayerVisibility('viz-1::point');

    expect(mockVisualizationStore.togglePrimitiveFilter).toHaveBeenCalledWith(
      'viz-1',
      PrimitiveFilterType.POINT
    );
  });

  it('builds Calques sublayers from active basemap metadata instead of static legacy layers', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = {
      file: 'world',
      layers: [
        {
          title_fr: 'Frontières des pays',
          title_en: 'Country borders',
          type: BasemapLayerType.LIMIT,
          file: 'world-limit-countries.parquet'
        },
        {
          title_fr: 'Frontières administratives',
          title_en: 'Administrative borders',
          type: BasemapLayerType.LIMIT,
          file: 'world-limit-admin.parquet'
        },
        {
          title_fr: 'Graticules (10°)',
          title_en: 'Graticules (10°)',
          type: BasemapLayerType.GRATICULE,
          file: 'world-graticule.parquet'
        },
        {
          title_fr: 'Lignes remarquables',
          title_en: 'Remarkable lines',
          type: BasemapLayerType.GEOGRAPHIC_LINES,
          file: 'world-geographic-lines.parquet'
        }
      ]
    };

    layersActions.syncWithVisualizations();

    expect(layersState.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'viz-1::basemap::synthetic:mers',
          basemapLayerId: 'mers'
        }),
        expect.objectContaining({
          id: 'viz-1::basemap::synthetic:sphere',
          basemapLayerId: 'sphere'
        }),
        expect.objectContaining({
          id: 'viz-1::basemap::world-limit-countries.parquet',
          basemapLayerId: 'frontieres',
          basemapFile: 'world',
          basemapLayerKey: 'world-limit-countries.parquet',
          name: 'Frontières des pays'
        }),
        expect.objectContaining({
          id: 'viz-1::basemap::world-limit-admin.parquet',
          basemapLayerId: 'frontieres',
          basemapFile: 'world',
          basemapLayerKey: 'world-limit-admin.parquet',
          name: 'Frontières administratives'
        }),
        expect.objectContaining({
          id: 'viz-1::basemap::world-graticule.parquet',
          basemapLayerId: 'meridiens',
          name: 'Graticules (10°)'
        })
      ])
    );
    expect(
      layersState.layers.some(
        (layer) => layer.basemapLayerKey === 'world-geographic-lines.parquet'
      )
    ).toBe(false);
  });

  it('toggles metadata LIMIT entries through entry-scoped aux visibility without disabling all Frontieres', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = {
      file: 'world',
      layers: [
        {
          title_fr: 'Frontières des pays',
          title_en: 'Country borders',
          type: BasemapLayerType.LIMIT,
          file: 'world-limit-countries.parquet'
        }
      ]
    };

    layersActions.syncWithVisualizations();
    layersActions.toggleLayerVisibility(
      'viz-1::basemap::world-limit-countries.parquet'
    );

    expect(mockBasemapAuxLayersStore.setVisible).toHaveBeenCalledWith(
      'world',
      'world-limit-countries.parquet',
      false
    );
    expect(mockBasemapLayersStore.setLayerVisibility).not.toHaveBeenCalledWith(
      'frontieres',
      false
    );
  });

  it('builds facet layers when facets mode is enabled', () => {
    const baseViz = createVisualization({ id: 'viz-1', name: 'Base' });
    const facetViz = createVisualization({ id: 'viz-2', name: 'Facet' });

    mockVisualizationStore.visualizations = [baseViz, facetViz];
    mockVisualizationStore.activeVisualizations = [baseViz, facetViz];

    mockFacetsStore.enabled = true;
    mockFacetsStore.baseVisualizationId = 'viz-1';
    mockFacetsStore.generatedVisualizationIds = ['viz-2'];

    layersActions.syncWithVisualizations();

    const layers = layersState.layers;
    const parentLayers = layers.filter((l) => !l.isSubLayer);

    expect(parentLayers).toHaveLength(1);
    expect(parentLayers[0].id).toBe('viz-2');
    expect(parentLayers[0].name).toContain('Facet');

    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
  });

  it('shows base visualization name in facet layer title', () => {
    const baseViz = createVisualization({ id: 'viz-1', name: 'Monde' });
    const facetViz = createVisualization({ id: 'viz-2', name: 'Monde' });

    mockVisualizationStore.visualizations = [baseViz, facetViz];
    mockVisualizationStore.activeVisualizations = [baseViz, facetViz];

    mockFacetsStore.enabled = true;
    mockFacetsStore.baseVisualizationId = 'viz-1';
    mockFacetsStore.generatedVisualizationIds = ['viz-2'];

    layersActions.syncWithVisualizations();

    const parentLayers = layersState.layers.filter((l) => !l.isSubLayer);
    expect(parentLayers[0].name).toContain('1');
    expect(parentLayers[0].name).toContain('Monde');

    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
  });
});
