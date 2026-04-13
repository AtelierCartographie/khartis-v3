import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';

const mocks = vi.hoisted(() => ({
  geometryInfoByTable: new Map<object, Record<string, unknown>>(),
  geojsonByTable: new Map<object, Record<string, unknown>>(),
  binaryPathData: {
    attributes: {
      getPath: {
        value: new Float32Array([0, 0, 1, 1]),
        size: 2
      }
    },
    featureIds: new Uint32Array([0]),
    length: 1,
    positions: new Float32Array([0, 0, 1, 1]),
    size: 2,
    startIndices: new Uint32Array([0])
  },
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  notifyChangeMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('@duckdb/duckdb-wasm', () => ({}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: null,
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  },
  ALL_PRIMITIVE_FILTERS: ['point', 'line', 'polygon'],
  visualizationStore: {
    visualizations: [],
    activeVisualizations: []
  }
}));

vi.mock('$lib/features/step-toolbar/tools/layers/layers.store.svelte', () => ({
  layersActions: {
    syncWithVisualizations: vi.fn()
  },
  layersState: {
    layers: []
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    MAP: 'MAP'
  },
  logger: {
    warn: mocks.loggerWarnMock,
    error: mocks.loggerErrorMock,
    info: mocks.loggerInfoMock,
    debug: mocks.loggerDebugMock
  }
}));

vi.mock('$lib/features/map/io', () => ({
  extractGeometryInfo: vi.fn(
    (table: object) => mocks.geometryInfoByTable.get(table) ?? null
  ),
  arrowTableToGeoJSON: vi.fn(
    (table: object) => mocks.geojsonByTable.get(table) ?? null
  )
}));

vi.mock('$lib/features/map/utils/geoarrow-stream-bridge', () => ({
  parsePaths: vi.fn(() => mocks.binaryPathData),
  parseSolidPolygons: vi.fn(),
  parsePathsWithProjection: vi.fn(() => mocks.binaryPathData),
  parseSolidPolygonsWithProjection: vi.fn(),
  pathColorAttr: vi.fn(
    (
      _data: unknown,
      colorLookup: (featureId: number) => [number, number, number, number]
    ) => ({
      value: new Uint8Array(colorLookup(0)),
      size: 4,
      normalized: true
    })
  ),
  pathWidthAttr: vi.fn(
    (_data: unknown, widthLookup: (featureId: number) => number) => ({
      value: new Float32Array([widthLookup(0)]),
      size: 1
    })
  ),
  projectGeoJSON: vi.fn()
}));

vi.mock('geoarrow-deck-stream', () => ({
  createPathLayerProps: vi.fn(() => ({
    data: {
      ...mocks.binaryPathData,
      attributes: { ...mocks.binaryPathData.attributes }
    }
  })),
  createSolidPolygonLayerProps: vi.fn(() => ({
    data: {
      attributes: {}
    }
  }))
}));

import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
import { createBasemapLayers } from '$lib/features/map/layers/basemap-layers';

function configureGeoJsonTable(
  table: object,
  type: string,
  geojson: Record<string, unknown>
): void {
  mocks.geometryInfoByTable.set(table, {
    type,
    geoColumn: 'geom',
    isGeoJsonEncoded: true,
    isWkbEncoded: false,
    isNativeGeoArrow: false
  });
  mocks.geojsonByTable.set(table, geojson);
}

function configureNativeGeoArrowTable(
  table: object,
  type: string,
  encoding: string,
  geojson: Record<string, unknown>
): void {
  mocks.geometryInfoByTable.set(table, {
    type,
    encoding,
    geoColumn: 'geom',
    isGeoJsonEncoded: false,
    isWkbEncoded: false,
    isNativeGeoArrow: true
  });
  mocks.geojsonByTable.set(table, geojson);
}

function hideAllBasemapLayers(): void {
  basemapLayersStore.resetToDefaults();
  for (const layer of basemapLayersStore.layers) {
    basemapLayersStore.setLayerVisibility(layer.id, false);
  }
}

describe('createBasemapLayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.geometryInfoByTable.clear();
    mocks.geojsonByTable.clear();
    hideAllBasemapLayers();
  });

  it('keeps seas below land in the default background stack', () => {
    const worldTable = {};

    configureGeoJsonTable(worldTable, 'POLYGON', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-10, -10],
                [10, -10],
                [10, 10],
                [-10, 10],
                [-10, -10]
              ]
            ]
          }
        }
      ]
    });

    basemapLayersStore.resetToDefaults();

    const { background } = createBasemapLayers(worldTable as never, {}, {});

    expect(background.map((layer) => layer.id)).toEqual([
      'basemap-mers-basemap-default',
      'basemap-terre-basemap-default'
    ]);
  });

  it('renders generic polygon, line and point metadata through the dedicated basemap controls', () => {
    const polygonTable = {};
    const lineTable = {};
    const pointTable = {};

    configureGeoJsonTable(polygonTable, 'POLYGON', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0]
              ]
            ]
          }
        }
      ]
    });
    configureGeoJsonTable(lineTable, 'LINESTRING', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1]
            ]
          }
        }
      ]
    });
    configureGeoJsonTable(pointTable, 'POINT', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            adm0cap: 1,
            pop_max: 1000000
          },
          geometry: {
            type: 'Point',
            coordinates: [2, 2]
          }
        }
      ]
    });

    basemapLayersStore.setLayerVisibility('lacs', true);
    basemapLayersStore.setLayerVisibility('rivieres', true);
    basemapLayersStore.setLayerVisibility('villes', true);

    const { background, foreground } = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: polygonTable as never,
            type: BasemapLayerType.POLYGON,
            style: null,
            file: 'custom-polygons'
          },
          {
            table: lineTable as never,
            type: BasemapLayerType.LINE,
            style: null,
            file: 'custom-lines'
          },
          {
            table: pointTable as never,
            type: BasemapLayerType.POINT,
            style: null,
            file: 'custom-points'
          }
        ],
        availableMetadataLayerTypes: [
          BasemapLayerType.POLYGON,
          BasemapLayerType.LINE,
          BasemapLayerType.POINT
        ]
      }
    );

    expect(background.map((layer) => layer.id)).toEqual([
      'basemap-lacs-basemap-default'
    ]);
    expect(foreground.map((layer) => layer.id).sort()).toEqual([
      'basemap-rivieres-basemap-default',
      'basemap-villes-basemap-default'
    ]);
  });

  it('reverses each basemap render group so the top UI item renders above lower siblings', () => {
    const polygonTable = {};
    const lineTable = {};
    const pointTable = {};

    configureGeoJsonTable(polygonTable, 'POLYGON', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0]
              ]
            ]
          }
        }
      ]
    });
    configureGeoJsonTable(lineTable, 'LINESTRING', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1]
            ]
          }
        }
      ]
    });
    configureGeoJsonTable(pointTable, 'POINT', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            adm0cap: 1,
            pop_max: 1000000
          },
          geometry: {
            type: 'Point',
            coordinates: [2, 2]
          }
        }
      ]
    });

    basemapLayersStore.setLayerVisibility('mers', true);
    basemapLayersStore.setLayerVisibility('lacs', true);
    basemapLayersStore.setLayerVisibility('rivieres', true);
    basemapLayersStore.setLayerVisibility('villes', true);
    basemapLayersStore.setLayerRenderGroupOrder('background', ['lacs', 'mers']);
    basemapLayersStore.setLayerRenderGroupOrder('foreground', [
      'villes',
      'rivieres'
    ]);

    const { background, foreground } = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: polygonTable as never,
            type: BasemapLayerType.POLYGON,
            style: null,
            file: 'custom-polygons'
          },
          {
            table: lineTable as never,
            type: BasemapLayerType.LINE,
            style: null,
            file: 'custom-lines'
          },
          {
            table: pointTable as never,
            type: BasemapLayerType.POINT,
            style: null,
            file: 'custom-points'
          }
        ],
        availableMetadataLayerTypes: [
          BasemapLayerType.POLYGON,
          BasemapLayerType.LINE,
          BasemapLayerType.POINT
        ]
      }
    );

    expect(background.map((layer) => layer.id)).toEqual([
      'basemap-mers-basemap-default',
      'basemap-lacs-basemap-default'
    ]);
    expect(foreground.map((layer) => layer.id)).toEqual([
      'basemap-rivieres-basemap-default',
      'basemap-villes-basemap-default'
    ]);
  });

  it('renders dotted meridiens from native GeoArrow graticules through the binary PathLayer path', () => {
    const graticuleTable = {};

    configureNativeGeoArrowTable(
      graticuleTable,
      'MULTILINESTRING',
      'geoarrow.multilinestring',
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [0, -10],
                  [0, 10]
                ]
              ]
            }
          }
        ]
      }
    );

    basemapLayersStore.setLayerVisibility('meridiens', true);

    const { foreground } = createBasemapLayers(
      null,
      { projectionSuffix: 'default' },
      {
        metadataLayers: [
          {
            table: graticuleTable as never,
            type: BasemapLayerType.GRATICULE,
            style: null,
            file: 'custom-graticule'
          }
        ],
        availableMetadataLayerTypes: [BasemapLayerType.GRATICULE]
      }
    );

    expect(foreground.map((layer) => layer.id)).toEqual([
      'basemap-meta-graticule-basemap-default-0'
    ]);
    expect(foreground[0]?.constructor.name).toBe('PathLayer');
  });
});
