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
    id === 'frontieres' ||
    id === 'rivieres' ||
    id === 'villes' ||
    id === 'equateur' ||
    id === 'meridiens' ||
    id === 'sphere'
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
import type { Layer } from '../../types/layers.types';
import {
  SEPIA_MIXTE_COLORS,
  VIF_MIXTE_COLORS
} from '$lib/features/commons/constants/qualitative-palette.constants';

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
  } as unknown as VisualizationConfig;
}

function flat(): Layer[] {
  return layersState.layers as Layer[];
}

function findById(id: string): Layer | undefined {
  return flat().find((layer) => layer.id === id);
}

function indexOf(id: string): number {
  const at = flat().findIndex((layer) => layer.id === id);
  expect(at, `expected layer ${id} to exist`).toBeGreaterThanOrEqual(0);
  return at;
}

function resetBasemapLayerMocks(): void {
  mockBasemapStyleStore.referenceBasemapId = null;
  mockBasemapService.availableBasemaps = [];
  mockBasemapService.currentMetadata = null;
  mockBasemapStyleStore.selectedStyle = 'blank-white';
  mockBasemapStyleStore.lastSelectedTiledStyle = undefined;
  mockBasemapStyleStore.preferredTiledStyle = 'monde-couleurs';
  mockBasemapStyleStore.groupVisibility = {};
  mockBasemapAuxLayersStore.version = 0;
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
    {
      id: 'mers',
      visible: true,
      color: '#d0e2ff',
      opacity: 100
    },
    {
      id: 'equateur',
      visible: true,
      renderBelowThematic: true,
      color: '#8d8d8d',
      dotted: false,
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
      dotted: false,
      dottedPattern: BasemapDottedPattern.DOTS,
      thickness: 1,
      opacity: 100
    },
    {
      id: 'meridiens',
      visible: true,
      renderBelowThematic: true,
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
});

describe('layers store flattened model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisualizationStore.activeVisualizations = [];
    mockVisualizationStore.visualizations = [];
    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
    resetBasemapLayerMocks();
  });

  it('produces a flat list with no standalone visualization parent rows', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    expect(flat().every((layer) => layer.kind !== undefined)).toBe(true);
    expect(findById('viz-1')).toBeUndefined();
    expect(
      flat().filter((layer) => layer.kind === 'viz-primitive').length
    ).toBeGreaterThan(0);
  });

  it('keeps hidden primitive rows available so they can be shown again', () => {
    const visualization = createVisualization({
      primitiveFilters: [PrimitiveFilterType.LINE, PrimitiveFilterType.POLYGON]
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    expect(flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'viz-1::point',
          parentId: 'viz-1',
          kind: 'viz-primitive',
          visible: false
        }),
        expect.objectContaining({
          id: 'viz-1::line',
          parentId: 'viz-1',
          kind: 'viz-primitive',
          visible: true
        })
      ])
    );
  });

  it('labels each primitive row with the primitive and its visualization name', () => {
    const visualization = createVisualization({ name: 'Population' });
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    const point = findById('viz-1::point');
    expect(point?.name).toContain('Population');
  });

  it('exposes a Textes primitive row for every visualization so it can be toggled later', () => {
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

    expect(findById('viz-1::text')).toEqual(
      expect.objectContaining({
        id: 'viz-1::text',
        parentId: 'viz-1',
        kind: 'viz-primitive',
        primitive: PrimitiveFilterType.TEXT,
        visible: false
      })
    );
  });

  it('marks the Textes row as visible when the visualization enables text', () => {
    const visualization = createVisualization({
      primitiveFilters: [PrimitiveFilterType.POLYGON, PrimitiveFilterType.TEXT]
    });

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();

    expect(findById('viz-1::text')).toEqual(
      expect.objectContaining({ visible: true })
    );
  });

  it('toggles the Textes row through togglePrimitiveFilter', () => {
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

  it('reorders Textes among the other primitive rows via setPrimitiveFilterOrder', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(
      indexOf('viz-1::text'),
      indexOf('viz-1::point')
    );

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

  it('renames a visualization addressed by id through the dedicated immediate path', () => {
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

  it('removes a visualization addressed by id', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.removeLayer('viz-1');

    expect(mockVisualizationStore.removeVisualization).toHaveBeenCalledWith(
      'viz-1'
    );
  });

  it('does not remove a visualization when the id is unknown', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.removeLayer('viz-1::point');

    expect(mockVisualizationStore.removeVisualization).not.toHaveBeenCalled();
  });

  it('reorders visualizations when one visualization block is dragged ahead of another', () => {
    const viz1 = createVisualization({ id: 'viz-1', name: 'Viz 1' });
    const viz2 = createVisualization({ id: 'viz-2', name: 'Viz 2' });

    mockVisualizationStore.visualizations = [viz1, viz2];
    mockVisualizationStore.activeVisualizations = [viz1, viz2];

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(
      indexOf('viz-2::point'),
      indexOf('viz-1::point')
    );

    expect(mockVisualizationStore.setVisualizationOrder).toHaveBeenCalledWith([
      'viz-2',
      'viz-1'
    ]);
  });

  it('duplicates a visualization addressed by id and returns one of its primitive rows', () => {
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
    expect(result?.parentId).toBe('viz-2');
  });

  it('toggles a whole visualization by id when no row matches', () => {
    const visualization = createVisualization();

    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];

    layersActions.syncWithVisualizations();
    layersActions.toggleLayerVisibility('viz-1');

    expect(mockVisualizationStore.toggleVisualization).toHaveBeenCalledWith(
      'viz-1'
    );
  });

  it('toggles a primitive row visibility', () => {
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

  it('gives each visualization a shared Vivid accent and a viz subtitle on its primitive rows (#182)', () => {
    const viz1 = createVisualization({ id: 'viz-1', name: 'Viz 1' });
    const viz2 = createVisualization({ id: 'viz-2', name: 'Viz 2' });

    mockVisualizationStore.visualizations = [viz1, viz2];
    mockVisualizationStore.activeVisualizations = [viz1, viz2];

    layersActions.syncWithVisualizations();

    const viz1Rows = flat().filter((layer) => layer.parentId === 'viz-1');
    const viz2Rows = flat().filter((layer) => layer.parentId === 'viz-2');

    expect(viz1Rows.length).toBeGreaterThan(0);
    expect(viz2Rows.length).toBeGreaterThan(0);

    // All primitives of one visualization share that visualization's accent…
    expect(new Set(viz1Rows.map((layer) => layer.accentColor))).toEqual(
      new Set([VIF_MIXTE_COLORS[0]])
    );
    expect(new Set(viz2Rows.map((layer) => layer.accentColor))).toEqual(
      new Set([VIF_MIXTE_COLORS[1]])
    );
    // …and distinct visualizations use distinct accents.
    expect(viz1Rows[0]?.accentColor).not.toBe(viz2Rows[0]?.accentColor);

    // Primitive rows carry a bold primitive label and the source viz as a subtitle.
    expect(viz1Rows[0]?.primitiveLabel).toBeTruthy();
    expect(viz1Rows[0]?.subtitle).toBe('Viz 1');
  });

  it('does not expose vector basemap rows when no reference basemap is active', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = null;
    mockBasemapService.currentMetadata = null;

    layersActions.syncWithVisualizations();

    expect(
      flat().some(
        (layer) =>
          layer.id === 'basemap::mers' || layer.id === 'basemap::sphere'
      )
    ).toBe(false);
  });

  it('deduplicates basemap auxiliary rows globally across multiple visualizations', () => {
    const viz1 = createVisualization({ id: 'viz-1', name: 'A' });
    const viz2 = createVisualization({ id: 'viz-2', name: 'B' });
    mockVisualizationStore.visualizations = [viz1, viz2];
    mockVisualizationStore.activeVisualizations = [viz1, viz2];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = { file: 'world', layers: [] };

    layersActions.syncWithVisualizations();

    const mersRows = flat().filter((layer) => layer.basemapLayerId === 'mers');
    expect(mersRows).toHaveLength(1);
    expect(mersRows[0].id).toBe('basemap::mers');
    expect(mersRows[0].parentId).toBeUndefined();
  });

  it('uses LAND metadata to expose Terre only as a generic basemap row', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = {
      file: 'world',
      layers: [
        {
          title_fr: 'Territoire',
          title_en: 'Territory',
          type: BasemapLayerType.LAND,
          file: 'world-land.parquet'
        }
      ]
    };

    layersActions.syncWithVisualizations();

    expect(flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'basemap::terre',
          kind: 'basemap-aux',
          basemapLayerId: 'terre',
          name: 'Terre'
        })
      ])
    );
    expect(flat().some((layer) => layer.name === 'Territoire')).toBe(false);
  });

  it('builds basemap rows from active metadata instead of static legacy layers', () => {
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

    expect(flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'basemap::mers',
          basemapLayerId: 'mers'
        }),
        expect.objectContaining({
          id: 'basemap::sphere',
          basemapLayerId: 'sphere'
        }),
        expect.objectContaining({
          id: 'basemap::frontieres',
          kind: 'basemap-aux',
          basemapLayerId: 'frontieres',
          basemapFile: 'world',
          basemapLayerKeys: [
            'world-limit-countries.parquet',
            'world-limit-admin.parquet'
          ],
          name: 'Frontières/Limites'
        }),
        expect.objectContaining({
          id: 'basemap::meridiens',
          basemapLayerId: 'meridiens',
          basemapLayerKey: 'world-graticule.parquet',
          name: 'Méridiens/Parallèles'
        })
      ])
    );
    expect(
      flat().some(
        (layer) => layer.basemapLayerKey === 'world-geographic-lines.parquet'
      )
    ).toBe(false);

    // Every basemap row shares the single muted Sepia accent (#182).
    const basemapRows = flat().filter((layer) => layer.kind === 'basemap-aux');
    expect(basemapRows.length).toBeGreaterThan(0);
    expect(
      basemapRows.every((layer) => layer.accentColor === SEPIA_MIXTE_COLORS[0])
    ).toBe(true);
  });

  it('toggles the generic Frontieres row through metadata aux visibility and the basemap layer store', () => {
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
    layersActions.toggleLayerVisibility('basemap::frontieres');

    expect(mockBasemapAuxLayersStore.setVisible).toHaveBeenCalledWith(
      'world',
      'world-limit-countries.parquet',
      false
    );
    expect(mockBasemapLayersStore.setLayerVisibility).toHaveBeenCalledWith(
      'frontieres',
      false
    );
  });

  it('moves a foreground basemap layer above the thematic block when dragged above the primitives', () => {
    const visualization = createVisualization({ id: 'viz-place-above' });
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = { file: 'world', layers: [] };

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(indexOf('basemap::equateur'), 0);

    expect(
      mockBasemapLayersStore.setLayerThematicPlacement
    ).toHaveBeenCalledWith('equateur', false);
  });

  it('keeps a foreground basemap layer below the thematic block when it stays under the primitives', () => {
    const visualization = createVisualization({ id: 'viz-place-below' });
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = { file: 'world', layers: [] };

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(
      indexOf('basemap::sphere'),
      indexOf('basemap::equateur')
    );

    expect(
      mockBasemapLayersStore.setLayerThematicPlacement
    ).toHaveBeenCalledWith('sphere', true);
  });

  it('reorders basemap rows inside their render groups', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.referenceBasemapId = 'world';
    mockBasemapService.currentMetadata = { file: 'world', layers: [] };

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(
      indexOf('basemap::sphere'),
      indexOf('basemap::equateur')
    );

    expect(
      mockBasemapLayersStore.setLayerRenderGroupOrder
    ).toHaveBeenCalledWith('foreground', ['sphere', 'equateur', 'meridiens']);
    expect(mockVisualizationStore.setVisualizationOrder).not.toHaveBeenCalled();
  });

  it('keeps same-type metadata entries grouped behind the generic basemap row', () => {
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
        }
      ]
    };

    layersActions.syncWithVisualizations();
    const frontieresLayer = findById('basemap::frontieres');

    expect(frontieresLayer).toEqual(
      expect.objectContaining({
        basemapLayerId: 'frontieres',
        basemapLayerKeys: [
          'world-limit-countries.parquet',
          'world-limit-admin.parquet'
        ],
        name: 'Frontières/Limites'
      })
    );
    expect(
      flat().some((layer) => layer.id.includes('world-limit-admin.parquet'))
    ).toBe(false);
  });

  it('exposes tiled basemap groups and toggles MapLibre group visibility', () => {
    const visualization = createVisualization();
    mockVisualizationStore.visualizations = [visualization];
    mockVisualizationStore.activeVisualizations = [visualization];
    mockBasemapStyleStore.selectedStyle = 'monde-couleurs';
    mockBasemapStyleStore.groupVisibility = {
      labels: false
    };

    layersActions.syncWithVisualizations();

    expect(flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'basemap::tiled-basemap::streets',
          kind: 'basemap-aux',
          type: 'geographic',
          tiledLayerGroupIds: ['streets'],
          visible: true
        }),
        expect.objectContaining({
          id: 'basemap::tiled-basemap::labels',
          kind: 'basemap-aux',
          type: 'geographic',
          tiledLayerGroupIds: ['labels'],
          visible: false
        })
      ])
    );
    expect(flat().some((layer) => layer.id === 'basemap::mers')).toBe(false);

    layersActions.toggleLayerVisibility('basemap::tiled-basemap::labels');

    expect(mockBasemapStyleStore.setGroupVisibility).toHaveBeenCalledWith(
      'labels',
      true
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

    const facetPrimitives = flat().filter(
      (layer) => layer.parentId === 'viz-2'
    );
    expect(facetPrimitives.length).toBeGreaterThan(0);
    expect(facetPrimitives[0].name).toContain('Facet');

    // The base visualization is not shown as its own rows in facets mode.
    expect(flat().some((layer) => layer.parentId === 'viz-1')).toBe(false);

    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
  });

  it('shows the base visualization name in facet row titles', () => {
    const baseViz = createVisualization({ id: 'viz-1', name: 'Monde' });
    const facetViz = createVisualization({ id: 'viz-2', name: 'Monde' });

    mockVisualizationStore.visualizations = [baseViz, facetViz];
    mockVisualizationStore.activeVisualizations = [baseViz, facetViz];

    mockFacetsStore.enabled = true;
    mockFacetsStore.baseVisualizationId = 'viz-1';
    mockFacetsStore.generatedVisualizationIds = ['viz-2'];

    layersActions.syncWithVisualizations();

    const facetPrimitive = flat().find((layer) => layer.parentId === 'viz-2');
    expect(facetPrimitive?.name).toContain('1');
    expect(facetPrimitive?.name).toContain('Monde');

    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
  });

  it('routes facet reordering through facetsStore.reorderVariables', () => {
    const baseViz = createVisualization({ id: 'viz-1', name: 'Base' });
    const facetA = createVisualization({ id: 'facet-a', name: 'A' });
    const facetB = createVisualization({ id: 'facet-b', name: 'B' });
    const facetC = createVisualization({ id: 'facet-c', name: 'C' });

    mockVisualizationStore.visualizations = [baseViz, facetA, facetB, facetC];
    mockVisualizationStore.activeVisualizations = [
      baseViz,
      facetA,
      facetB,
      facetC
    ];
    mockFacetsStore.enabled = true;
    mockFacetsStore.baseVisualizationId = 'viz-1';
    mockFacetsStore.generatedVisualizationIds = [
      'facet-a',
      'facet-b',
      'facet-c'
    ];

    layersActions.syncWithVisualizations();
    layersActions.reorderLayers(
      indexOf('facet-c::point'),
      indexOf('facet-a::point')
    );

    expect(mockFacetsStore.reorderVariables).toHaveBeenCalledWith(2, 0);
    expect(mockVisualizationStore.setVisualizationOrder).not.toHaveBeenCalled();

    mockFacetsStore.enabled = false;
    mockFacetsStore.baseVisualizationId = null;
    mockFacetsStore.generatedVisualizationIds = [];
  });
});
