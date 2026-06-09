import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';

/**
 * Characterization (golden) tests for the flattened layers panel (#182).
 *
 * They lock the OBSERVABLE CONTRACT of the panel: a single flat reorder action
 * back-projects an absolute drag onto the three render stores
 * (`visualizationStore`, `basemapLayersStore`, `basemapAuxLayersStore`). The
 * render-store semantics — `getMapLayerRenderOrder` /
 * `getVisualizationRenderOrder` — never change, so the panel must keep emitting
 * the same store mutations. Any drift here flags a z-order / facets /
 * persistence regression.
 *
 * Model reminder (top of the panel = front of the render):
 *   - each row is one primitive·viz (`viz-id::primitive`) or one deduplicated
 *     global basemap layer (`basemap::layer`),
 *   - visualization order is re-derived from the first appearance of each
 *     parent, top→bottom,
 *   - a foreground basemap row is "below thematic" when it sits under the last
 *     marker (non-polygon) primitive in panel order.
 */

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
    setLayerRenderGroupOrder: vi.fn(),
    setLayerThematicPlacement: vi.fn()
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
      generatedVisualizationIds: [] as string[],
      reorderVariables: vi.fn()
    },
    mockBasemapLayersStore: basemapLayersStore,
    mockBasemapAuxLayersStore: {
      version: 0,
      isVisible: vi.fn(() => true),
      setVisible: vi.fn(),
      getOrderedLayerKeys: vi.fn(
        (_basemapFile: string, layerFiles: readonly string[]) => [...layerFiles]
      ),
      setOrder: vi.fn()
    },
    mockBasemapStyleStore: {
      referenceBasemapId: null as string | null,
      selectedStyle: 'blank-white',
      lastSelectedTiledStyle: undefined as string | undefined,
      preferredTiledStyle: 'monde-couleurs',
      groupVisibility: {} as Record<string, boolean>,
      setGroupVisibility: vi.fn()
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
  const FillMode = { NONE: 'none', UNIQUE: 'unique' } as const;

  const getEnabledPrimitiveFilters = (
    visualization: VisualizationConfig
  ): string[] =>
    (visualization.primitiveFilters as string[] | undefined) ?? [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ];

  return {
    PrimitiveFilterType,
    getEnabledPrimitiveFilters,
    getPolygonPrimitive: (visualization: VisualizationConfig) => ({
      enabled: getEnabledPrimitiveFilters(visualization).includes(
        PrimitiveFilterType.POLYGON
      ),
      fillMode:
        visualization.style.fillOpacity === 0 ? FillMode.NONE : FillMode.UNIQUE,
      fillColor: visualization.style.fillColor,
      fillOpacity: visualization.style.fillOpacity ?? 1,
      strokeColor: visualization.style.strokeColor
    }),
    getSymbolPrimitive: (visualization: VisualizationConfig) => ({
      enabled: getEnabledPrimitiveFilters(visualization).includes(
        PrimitiveFilterType.POINT
      ),
      fillColor: visualization.style.fillColor,
      opacity: 1,
      strokeColor: visualization.style.strokeColor
    }),
    getLinePrimitive: (visualization: VisualizationConfig) => ({
      enabled: getEnabledPrimitiveFilters(visualization).includes(
        PrimitiveFilterType.LINE
      ),
      color: visualization.style.lineColor,
      opacity: 1
    }),
    getTextPrimitive: (visualization: VisualizationConfig) => ({
      enabled: getEnabledPrimitiveFilters(visualization).includes(
        PrimitiveFilterType.TEXT
      ),
      color: visualization.style.textColor,
      opacity: 1,
      secondaryLabels: { color: undefined }
    }),
    getPrimitiveClassification: (visualization: VisualizationConfig) =>
      visualization.classification,
    getSymbolFillClassification: (visualization: VisualizationConfig) =>
      visualization.classification,
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
    [
      'frontieres',
      'rivieres',
      'villes',
      'equateur',
      'meridiens',
      'sphere'
    ].includes(id)
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

import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.store.svelte';
import { layersActions, layersState } from './layers.store.svelte';
import type { Layer } from '../../types/layers.types';

function createVisualization(
  overrides: Partial<VisualizationConfig> = {}
): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Visualization',
    type: 'choropleth',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ],
    primitiveOrder: [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ],
    style: { fillOpacity: 0.8, strokeColor: '#ffffff' },
    mapping: { geometryColumn: 'geometry' },
    classification: undefined,
    ...overrides
  } as unknown as VisualizationConfig;
}

function setVectorBasemap(): void {
  mockBasemapStyleStore.referenceBasemapId = 'world';
  mockBasemapService.currentMetadata = { file: 'world', layers: [] };
}

function resetMocks(): void {
  vi.clearAllMocks();
  mockVisualizationStore.activeVisualizations = [];
  mockVisualizationStore.visualizations = [];
  mockFacetsStore.enabled = false;
  mockFacetsStore.baseVisualizationId = null;
  mockFacetsStore.generatedVisualizationIds = [];
  mockBasemapStyleStore.referenceBasemapId = null;
  mockBasemapService.availableBasemaps = [];
  mockBasemapService.currentMetadata = null;
  mockBasemapStyleStore.selectedStyle = 'blank-white';
  mockBasemapStyleStore.lastSelectedTiledStyle = undefined;
  mockBasemapStyleStore.preferredTiledStyle = 'monde-couleurs';
  mockBasemapStyleStore.groupVisibility = {};
  mockBasemapAuxLayersStore.isVisible.mockReturnValue(true);
  mockBasemapAuxLayersStore.getOrderedLayerKeys.mockImplementation(
    (_basemapFile: string, layerFiles: readonly string[]) => [...layerFiles]
  );
  mockBasemapLayersStore.layers = [
    {
      id: 'terre',
      visible: true,
      fillColor: '#ffffff',
      fillOpacity: 100,
      strokeColor: '#a8a8a8',
      strokeOpacity: 100
    },
    { id: 'mers', visible: true, color: '#d0e2ff', opacity: 100 },
    {
      id: 'equateur',
      visible: true,
      renderBelowThematic: true,
      color: '#8d8d8d',
      thickness: 1,
      opacity: 100
    },
    {
      id: 'sphere',
      visible: true,
      renderBelowThematic: true,
      color: '#8d8d8d',
      thickness: 1,
      opacity: 100
    },
    {
      id: 'frontieres',
      visible: true,
      renderBelowThematic: true,
      color: '#525252',
      thickness: 1,
      opacity: 100
    },
    {
      id: 'meridiens',
      visible: true,
      renderBelowThematic: true,
      color: '#e0e0e0',
      thickness: 1,
      opacity: 100
    }
  ];
}

function flat(): Layer[] {
  return [...(layersState.layers as Layer[])];
}

function idx(id: string): number {
  const at = flat().findIndex((layer) => layer.id === id);
  expect(at, `expected layer ${id} to exist`).toBeGreaterThanOrEqual(0);
  return at;
}

describe('layers reorder characterization (golden contract)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('re-derives the visualization order from primitive first-appearance after a flat drag', () => {
    const viz1 = createVisualization({ id: 'viz-1', name: 'Viz 1' });
    const viz2 = createVisualization({ id: 'viz-2', name: 'Viz 2' });
    mockVisualizationStore.visualizations = [viz1, viz2];
    mockVisualizationStore.activeVisualizations = [viz1, viz2];

    layersActions.syncWithVisualizations();
    // Drag viz-2's first primitive above the entire viz-1 block.
    layersActions.reorderLayers(idx('viz-2::point'), idx('viz-1::point'));

    expect(mockVisualizationStore.setVisualizationOrder).toHaveBeenCalledWith([
      'viz-2',
      'viz-1'
    ]);
  });

  it('reorders the primitive filters when a primitive moves within its visualization', () => {
    const viz = createVisualization();
    mockVisualizationStore.visualizations = [viz];
    mockVisualizationStore.activeVisualizations = [viz];

    layersActions.syncWithVisualizations();
    // Drag Textes (bottom primitive) to the very top.
    layersActions.reorderLayers(idx('viz-1::text'), idx('viz-1::point'));

    expect(mockVisualizationStore.setPrimitiveFilterOrder).toHaveBeenCalledWith(
      'viz-1',
      [
        PrimitiveFilterType.TEXT,
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        PrimitiveFilterType.POLYGON
      ]
    );
    // A single visualization never reorders the visualization list.
    expect(mockVisualizationStore.setVisualizationOrder).not.toHaveBeenCalled();
  });

  it('reorders foreground basemap layers through the render-group setter, not the viz order', () => {
    const viz = createVisualization();
    mockVisualizationStore.visualizations = [viz];
    mockVisualizationStore.activeVisualizations = [viz];
    setVectorBasemap();

    layersActions.syncWithVisualizations();
    // sphere is the last of the three foreground layers; lift it above equateur.
    layersActions.reorderLayers(
      idx('basemap::sphere'),
      idx('basemap::equateur')
    );

    expect(
      mockBasemapLayersStore.setLayerRenderGroupOrder
    ).toHaveBeenCalledWith('foreground', ['sphere', 'equateur', 'meridiens']);
    expect(mockVisualizationStore.setVisualizationOrder).not.toHaveBeenCalled();
  });

  it('flips a foreground basemap layer above the thematic block when dragged above the primitives', () => {
    const viz = createVisualization({ id: 'viz-place-above' });
    mockVisualizationStore.visualizations = [viz];
    mockVisualizationStore.activeVisualizations = [viz];
    setVectorBasemap();

    layersActions.syncWithVisualizations();
    // Drag equateur to the very top, above every primitive.
    layersActions.reorderLayers(idx('basemap::equateur'), 0);

    expect(
      mockBasemapLayersStore.setLayerThematicPlacement
    ).toHaveBeenCalledWith('equateur', false);
  });

  it('keeps a foreground basemap layer below the thematic block when it stays under the primitives', () => {
    const viz = createVisualization({ id: 'viz-place-below' });
    mockVisualizationStore.visualizations = [viz];
    mockVisualizationStore.activeVisualizations = [viz];
    setVectorBasemap();

    layersActions.syncWithVisualizations();
    // Reorder sphere/equateur among themselves (both stay below the markers).
    layersActions.reorderLayers(
      idx('basemap::sphere'),
      idx('basemap::equateur')
    );

    expect(
      mockBasemapLayersStore.setLayerThematicPlacement
    ).toHaveBeenCalledWith('sphere', true);
  });

  it('propagates a deduplicated aux-key order when grouped aux entries move', () => {
    const viz = createVisualization();
    mockVisualizationStore.visualizations = [viz];
    mockVisualizationStore.activeVisualizations = [viz];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = {
      file: 'world',
      layers: [
        {
          title_fr: 'Frontières des pays',
          title_en: 'Country borders',
          type: 'limit',
          file: 'world-limit-countries.parquet'
        },
        {
          title_fr: 'Rivières',
          title_en: 'Rivers',
          type: 'line',
          file: 'world-rivers.parquet'
        }
      ]
    };

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(
      idx('basemap::rivieres'),
      idx('basemap::world-limit-countries.parquet')
    );

    const setOrderCalls = mockBasemapAuxLayersStore.setOrder.mock.calls;
    expect(setOrderCalls.length).toBeGreaterThan(0);
    const lastCall = setOrderCalls[setOrderCalls.length - 1];
    expect(lastCall[0]).toBe('world');
    const orderedKeys = lastCall[1] as string[];
    expect(new Set(orderedKeys).size).toBe(orderedKeys.length);
    expect(orderedKeys).toContain('world-limit-countries.parquet');
    expect(orderedKeys).toContain('world-rivers.parquet');
  });

  it('does not touch the visualization order when only basemap layers move', () => {
    const viz = createVisualization();
    mockVisualizationStore.visualizations = [viz];
    mockVisualizationStore.activeVisualizations = [viz];
    setVectorBasemap();

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(idx('basemap::mers'), idx('basemap::sphere'));

    expect(mockVisualizationStore.setVisualizationOrder).not.toHaveBeenCalled();
  });

  it('routes a facet reorder through facetsStore.reorderVariables instead of setVisualizationOrder', () => {
    const baseViz = createVisualization({ id: 'viz-base', name: 'Base' });
    const facetA = createVisualization({ id: 'facet-a', name: 'Facet A' });
    const facetB = createVisualization({ id: 'facet-b', name: 'Facet B' });
    const facetC = createVisualization({ id: 'facet-c', name: 'Facet C' });
    mockVisualizationStore.visualizations = [baseViz, facetA, facetB, facetC];
    mockVisualizationStore.activeVisualizations = [
      baseViz,
      facetA,
      facetB,
      facetC
    ];
    mockFacetsStore.enabled = true;
    mockFacetsStore.baseVisualizationId = 'viz-base';
    mockFacetsStore.generatedVisualizationIds = [
      'facet-a',
      'facet-b',
      'facet-c'
    ];

    layersActions.syncWithVisualizations();
    // Drag the first primitive of facet-c above every other facet block: an
    // unambiguous single move (index 2 → 0).
    layersActions.reorderLayers(idx('facet-c::point'), idx('facet-a::point'));

    expect(mockFacetsStore.reorderVariables).toHaveBeenCalledWith(2, 0);
    expect(mockVisualizationStore.setVisualizationOrder).not.toHaveBeenCalled();
  });
});
