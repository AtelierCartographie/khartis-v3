import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import {
  GeoJsonLayer,
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer
} from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { geoEquirectangular } from 'd3-geo';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type {
  FeatureCollection,
  LineString,
  MultiLineString,
  Polygon
} from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import {
  BasemapCityCategory,
  BasemapCitySymbol,
  BasemapDottedPattern,
  BasemapGraticuleMode,
  BasemapRemarquables,
  BasemapRepresentation,
  BASEMAP_LAYER_CONFIG
} from '$lib/features/commons/constants/visualization.constants';
import {
  BASEMAP_LAYER_ID,
  basemapLayersStore
} from '../stores/basemap-layers.store.svelte';
import type { BBox, GeometryInfo } from '../types';
import { buildKhartisCompositeProjection } from '../utils/khartis-projection-factories.utils';
import projectionPresets from '../../../../../static/basemaps/projection-presets.json';

const {
  arrowTableToGeoJSONMock,
  extractGeometryInfoMock,
  projectGeoJSONMock,
  parseSolidPolygonsMock,
  parseSolidPolygonsWithProjectionMock,
  parsePathsMock,
  parsePathsWithProjectionMock,
  parsePointDataMock,
  cityPointData
} = vi.hoisted(() => {
  class WorkerStub {
    terminate() {}

    postMessage() {}

    addEventListener() {}

    removeEventListener() {}
  }

  Object.assign(globalThis, {
    Worker: WorkerStub
  });

  return {
    arrowTableToGeoJSONMock: vi.fn(),
    extractGeometryInfoMock: vi.fn(),
    projectGeoJSONMock: vi.fn(),
    parseSolidPolygonsMock: vi.fn(),
    parseSolidPolygonsWithProjectionMock: vi.fn(),
    parsePathsMock: vi.fn(),
    parsePathsWithProjectionMock: vi.fn(),
    parsePointDataMock: vi.fn(),
    cityPointData: new WeakMap<object, unknown>()
  };
});

vi.mock('../io', async () => {
  const actual = await vi.importActual<typeof import('../io')>('../io');

  return {
    ...actual,
    arrowTableToGeoJSON: arrowTableToGeoJSONMock,
    extractGeometryInfo: extractGeometryInfoMock
  };
});

vi.mock('../utils/geoarrow-stream-bridge.utils', async () => {
  const actual = await vi.importActual<
    typeof import('../utils/geoarrow-stream-bridge.utils')
  >('../utils/geoarrow-stream-bridge.utils');

  return {
    ...actual,
    projectGeoJSON: projectGeoJSONMock,
    parseSolidPolygons: parseSolidPolygonsMock,
    parseSolidPolygonsWithProjection: parseSolidPolygonsWithProjectionMock,
    parsePaths: parsePathsMock,
    parsePathsWithProjection: parsePathsWithProjectionMock,
    parsePointData: parsePointDataMock
  };
});

import {
  createBasemapLayers,
  createEquateurLayer,
  createFrontieresLayer,
  createMeridiensLayer,
  createMersLayer,
  createReliefLayers,
  createTerreLayers,
  createVillesLayers,
  type MetadataLayerEntry
} from './basemap-layers';
import type { BasemapCity } from './basemap-cities';

function createProjectionContext() {
  return {
    projection: {
      stream: (sink: {
        point: (x: number, y: number) => void;
        lineStart: () => void;
        lineEnd: () => void;
        polygonStart: () => void;
        polygonEnd: () => void;
      }) => sink
    } as ProjectionLike
  };
}

function createCompositeProjectionContext() {
  return {
    projection: {
      stream: (sink: {
        point: (x: number, y: number) => void;
        lineStart: () => void;
        lineEnd: () => void;
        polygonStart: () => void;
        polygonEnd: () => void;
      }) => sink,
      getSubProjections: () => []
    } as unknown as ProjectionLike
  };
}

function createClippedTestProjection(
  bounds: BBox,
  screenExtent: [[number, number], [number, number]]
): ProjectionLike {
  const [[x0, y0], [x1, y1]] = screenExtent;
  const [west, south, east, north] = bounds;
  const width = x1 - x0;
  const height = y1 - y0;
  return {
    stream: (sink: {
      point: (x: number, y: number) => void;
      lineStart: () => void;
      lineEnd: () => void;
      polygonStart: () => void;
      polygonEnd: () => void;
    }) => ({
      point: (longitude: number, latitude: number) => {
        const x = x0 + ((longitude - west) / (east - west)) * width;
        const y = y1 - ((latitude - south) / (north - south)) * height;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
          sink.point(x, y);
        }
      },
      lineStart: () => sink.lineStart(),
      lineEnd: () => sink.lineEnd(),
      polygonStart: () => sink.polygonStart(),
      polygonEnd: () => sink.polygonEnd()
    })
  } as ProjectionLike;
}

function createCompositeGraticuleProjectionContext() {
  const bounds: BBox = [-10, 35, 30, 70];
  const screenExtent: [[number, number], [number, number]] = [
    [0, 0],
    [400, 300]
  ];
  const acoresBounds: BBox = [-32, 35, -24, 42];
  const acoresScreenExtent: [[number, number], [number, number]] = [
    [420, 220],
    [500, 300]
  ];
  return {
    projection: {
      stream: (sink: {
        point: (x: number, y: number) => void;
        lineStart: () => void;
        lineEnd: () => void;
        polygonStart: () => void;
        polygonEnd: () => void;
      }) => sink,
      getSubProjections: () => [
        {
          id: 'mainland',
          projection: createClippedTestProjection(bounds, screenExtent),
          bounds,
          screenExtent
        },
        {
          id: 'acores',
          projection: createClippedTestProjection(
            acoresBounds,
            acoresScreenExtent
          ),
          bounds: acoresBounds,
          screenExtent: acoresScreenExtent
        }
      ]
    } as unknown as ProjectionLike
  };
}

function createNativePolygonGeometryInfo(): GeometryInfo {
  return {
    type: 'MultiPolygon',
    encoding: 'geoarrow.multipolygon',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false
  };
}

function createNativeLineGeometryInfo(): GeometryInfo {
  return {
    type: 'LineString',
    encoding: 'geoarrow.linestring',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false
  };
}

function createNativePointGeometryInfo(): GeometryInfo {
  return {
    type: 'Point',
    encoding: 'geoarrow.point',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false
  };
}

function createLineGeoJSON(
  id: string
): FeatureCollection<LineString, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [10, 0]
          ]
        }
      }
    ]
  };
}

type CityLabel = { position: [number, number]; text: string };

function createScalingProjectionContext(factor: number) {
  return {
    projection: {
      stream: (sink: {
        point: (x: number, y: number) => void;
        lineStart: () => void;
        lineEnd: () => void;
        polygonStart: () => void;
        polygonEnd: () => void;
      }) => ({
        ...sink,
        point: (x: number, y: number) => sink.point(x * factor, y * factor)
      })
    } as ProjectionLike
  };
}

function createCityTable(
  rows: Record<string, unknown>[],
  positions: [number, number][],
  featureIds = positions.map((_, index) => index)
): ArrowTable {
  const table = {
    getChild(name: string) {
      return rows.some((row) => name in row)
        ? { get: (index: number) => rows[index]?.[name] }
        : null;
    }
  } as unknown as ArrowTable;
  cityPointData.set(table, {
    length: positions.length,
    positions: new Float64Array(positions.flat()),
    featureIds: new Uint32Array(featureIds),
    size: 2
  });
  return table;
}

function createCityMetadata(table: ArrowTable, type: BasemapLayerType) {
  extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
    candidate === table ? createNativePointGeometryInfo() : null
  );
  return {
    metadataLayers: [
      {
        table,
        style: null,
        type,
        file: 'cities.parquet'
      } satisfies MetadataLayerEntry
    ],
    availableMetadataLayerTypes: [type],
    stylePresets: null
  };
}

function findCitySymbolLayer(layers: Layer[]): Layer | undefined {
  return layers.find(
    (layer) =>
      String(layer.props.id).includes('basemap-villes') &&
      !String(layer.props.id).includes('labels')
  );
}

function findCityLabelLayer(layers: Layer[]): Layer | undefined {
  return layers.find((layer) =>
    String(layer.props.id).includes('basemap-villes-labels')
  );
}

function readBinaryPositions(layer: Layer | undefined): number[] {
  const data = layer?.props.data as
    { attributes: { getPosition: { value: Float64Array } } } | undefined;
  return Array.from(data?.attributes.getPosition.value ?? []);
}

function readBinaryPolygon(layer: Layer | undefined): Float64Array | undefined {
  const data = layer?.props.data as
    { attributes: { getPolygon: { value: Float64Array } } } | undefined;
  return data?.attributes.getPolygon.value;
}

function readFirstVertexAttribute(
  layer: Layer | undefined,
  name: 'getColor' | 'getWidth'
): number[] {
  const data = layer?.props.data as
    | {
        attributes?: Partial<
          Record<string, { value: ArrayLike<number>; size: number }>
        >;
      }
    | undefined;
  const attribute = data?.attributes?.[name];
  return attribute ? Array.from(attribute.value).slice(0, attribute.size) : [];
}

function createTerreConfig() {
  return {
    id: 'terre' as const,
    visible: true,
    fillColor: '#ffffff',
    fillShadow: false,
    fillOpacity: 100,
    strokeVisible: true,
    strokeColor: '#333333',
    strokeDotted: false,
    strokeDottedPattern: BasemapDottedPattern.DOTS,
    strokeThickness: 0.5,
    strokeOpacity: 100
  };
}

function clearDocumentFonts(): void {
  Reflect.deleteProperty(document, 'fonts');
  fontAssetsStore.reset();
}

beforeEach(() => {
  vi.clearAllMocks();
  parsePointDataMock.mockImplementation((table: object) =>
    cityPointData.get(table)
  );
  clearDocumentFonts();
  basemapLayersStore.resetToDefaults();
  projectGeoJSONMock.mockImplementation((geojson) => geojson);
  const polygonData = {
    length: 1,
    positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    polygonIndices: new Uint32Array([0, 4]),
    holeIndices: new Uint32Array([]),
    featureIds: new Uint32Array([0]),
    size: 2
  };
  const pathData = {
    length: 1,
    positions: new Float32Array([0, 0, 1, 0, 1, 1]),
    startIndices: new Uint32Array([0, 3]),
    featureIds: new Uint32Array([0]),
    size: 2
  };
  parseSolidPolygonsMock.mockReturnValue(polygonData);
  parseSolidPolygonsWithProjectionMock.mockReturnValue(polygonData);
  parsePathsMock.mockReturnValue(pathData);
  parsePathsWithProjectionMock.mockReturnValue(pathData);
});

describe('basemap projection fallbacks', () => {
  it('uses contrast-safe neutral defaults for generated basemap layers', () => {
    expect(basemapLayersStore.getLayer(BASEMAP_LAYER_ID.TERRE)).toMatchObject({
      fillColor: NEUTRAL_CARTOGRAPHY_COLORS.land,
      strokeColor: NEUTRAL_CARTOGRAPHY_COLORS.boundaryMedium
    });
    expect(basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERS)).toMatchObject({
      color: NEUTRAL_CARTOGRAPHY_COLORS.sea
    });
    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.FRONTIERES)
    ).toMatchObject({
      color: NEUTRAL_CARTOGRAPHY_COLORS.boundaryMedium
    });
    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS)
    ).toMatchObject({
      color: NEUTRAL_CARTOGRAPHY_COLORS.graticule
    });
    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.EQUATEUR)
    ).toMatchObject({
      color: NEUTRAL_CARTOGRAPHY_COLORS.geographicLine
    });
  });

  it('keeps basemap frontieres thickness in a cartographic pixel range', () => {
    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.FRONTIERES)?.thickness
    ).toBe(0.5);

    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.FRONTIERES, {
      thickness: 100
    });
    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.FRONTIERES)?.thickness
    ).toBe(BASEMAP_LAYER_CONFIG.thickness.max);

    basemapLayersStore.restoreFromSerialized([
      {
        id: 'frontieres',
        visible: true,
        color: NEUTRAL_CARTOGRAPHY_COLORS.boundaryMedium,
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 0,
        opacity: 100
      }
    ] as Parameters<typeof basemapLayersStore.restoreFromSerialized>[0]);

    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.FRONTIERES)?.thickness
    ).toBe(BASEMAP_LAYER_CONFIG.thickness.min);
  });

  it('connects mers config to the Deck.gl ocean layer style and triggers', () => {
    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#123456',
        opacity: 25
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.id).toContain('basemap-mers');
    expect(layer?.props.getFillColor).toEqual([18, 52, 86, 64]);
    expect(layer?.props.parameters).toMatchObject({
      depthCompare: 'always',
      depthWriteEnabled: false
    });
    expect(layer?.props.updateTriggers).toEqual({
      getFillColor: ['#123456', 25]
    });

    expect(
      createMersLayer(
        {
          id: 'mers',
          visible: false,
          color: '#123456',
          opacity: 25
        },
        {}
      )
    ).toBeNull();
  });

  it('renders projected mers from the projection sphere polygon', () => {
    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#006dff',
        opacity: 100
      },
      { projection: geoEquirectangular() as ProjectionLike }
    ) as SolidPolygonLayer | null;

    expect(layer).toBeInstanceOf(SolidPolygonLayer);
    expect(layer?.props.coordinateSystem).toBe(COORDINATE_SYSTEM.CARTESIAN);
    expect(layer?.props.getFillColor).toEqual([0, 109, 255, 255]);
    expect(layer?.props.parameters).toMatchObject({
      depthCompare: 'always',
      depthWriteEnabled: false
    });
    const polygonData = layer?.props.data as
      | {
          length: number;
          attributes: {
            getPolygon: {
              value: Float32Array;
            };
          };
        }
      | undefined;
    expect(polygonData?.length).toBeGreaterThan(0);
    expect(polygonData?.attributes.getPolygon.value).toBeInstanceOf(
      Float32Array
    );
  });

  it('prefers the sphere polygon over the projected canvas extent', () => {
    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#006dff',
        opacity: 100
      },
      {
        projection: geoEquirectangular() as ProjectionLike,
        graticuleClipExtent: [
          [-180, -90],
          [180, 90]
        ]
      }
    ) as SolidPolygonLayer | null;

    expect(layer).toBeInstanceOf(SolidPolygonLayer);
    expect(layer?.props.coordinateSystem).toBe(COORDINATE_SYSTEM.CARTESIAN);
    expect(layer?.props.getFillColor).toEqual([0, 109, 255, 255]);
  });

  it('renders one ocean polygon per composite frame when projected sphere parsing is empty', () => {
    const mainlandBounds: BBox = [-10, 35, 40, 72];
    const emptyProjection = {
      stream: () => ({
        point: () => {},
        lineStart: () => {},
        lineEnd: () => {},
        polygonStart: () => {},
        polygonEnd: () => {}
      }),
      getSubProjections: () => [
        {
          id: 'mainland',
          projection: createClippedTestProjection(mainlandBounds, [
            [0, 0],
            [960, 600]
          ]),
          bounds: mainlandBounds,
          screenExtent: [
            [0, 0],
            [960, 600]
          ]
        },
        {
          id: 'overseas',
          projection: createClippedTestProjection(
            [50, -20, 56, -12],
            [
              [0, 500],
              [96, 600]
            ]
          ),
          bounds: [50, -20, 56, -12] as BBox,
          screenExtent: [
            [0, 500],
            [96, 600]
          ]
        }
      ]
    } as unknown as ProjectionLike;

    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#e0e0e0',
        opacity: 100
      },
      { projection: emptyProjection, bbox: mainlandBounds }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<Polygon> | undefined;
    const mainlandCoordinates =
      data?.features[0]?.geometry.coordinates[0] ?? [];
    const overseasCoordinates =
      data?.features[1]?.geometry.coordinates[0] ?? [];

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.coordinateSystem).toBe(COORDINATE_SYSTEM.CARTESIAN);
    expect(layer?.props.parameters).toMatchObject({
      depthCompare: 'always',
      depthWriteEnabled: false
    });
    expect(data?.features).toHaveLength(2);
    expect(mainlandCoordinates).toEqual([
      [0, 0],
      [960, 0],
      [960, 600],
      [0, 600],
      [0, 0]
    ]);
    expect(overseasCoordinates).toEqual([
      [0, 500],
      [96, 500],
      [96, 600],
      [0, 600],
      [0, 500]
    ]);
  });

  it('clips composite ocean frames to the visible projected extent', () => {
    const mainlandBounds: BBox = [-10, 35, 40, 72];
    const emptyProjection = {
      stream: () => ({
        point: () => {},
        lineStart: () => {},
        lineEnd: () => {},
        polygonStart: () => {},
        polygonEnd: () => {}
      }),
      getSubProjections: () => [
        {
          id: 'mainland',
          projection: createClippedTestProjection(mainlandBounds, [
            [0, 0],
            [960, 600]
          ]),
          bounds: mainlandBounds,
          screenExtent: [
            [0, 0],
            [960, 600]
          ]
        }
      ]
    } as unknown as ProjectionLike;

    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#e0e0e0',
        opacity: 100
      },
      {
        projection: emptyProjection,
        bbox: mainlandBounds,
        graticuleClipExtent: [
          [100, 50],
          [800, 550]
        ]
      }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<Polygon> | undefined;
    const coordinates = data?.features[0]?.geometry.coordinates[0] ?? [];

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(data?.features).toHaveLength(1);
    expect(coordinates).toEqual([
      [100, 50],
      [800, 50],
      [800, 550],
      [100, 550],
      [100, 50]
    ]);
  });

  it('skips the mainland-only sphere polygon for composite projections so DOM-TOM insets stay covered (#195)', () => {
    const composite = Object.assign(geoEquirectangular(), {
      getSubProjections: () => [
        {
          id: 'mainland',
          projection: geoEquirectangular(),
          bounds: [-10, 35, 40, 72] as BBox,
          screenExtent: [
            [0, 0],
            [960, 600]
          ] as [[number, number], [number, number]]
        },
        {
          id: 'overseas',
          projection: geoEquirectangular(),
          bounds: [50, -22, 56, -12] as BBox,
          screenExtent: [
            [0, 500],
            [120, 600]
          ] as [[number, number], [number, number]]
        }
      ]
    }) as unknown as ProjectionLike;

    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#006dff',
        opacity: 100
      },
      {
        projection: composite,
        graticuleClipExtent: [
          [0, 0],
          [1030, 704]
        ]
      }
    );

    // geoEquirectangular alone yields a SolidPolygonLayer sphere (see above);
    // wrapped as a composite, the mainland-only sphere must be bypassed in
    // favour of the full composite coverage so the insets are not clipped out.
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer).not.toBeInstanceOf(SolidPolygonLayer);
    expect(
      (layer?.props.data as FeatureCollection<Polygon>).features
    ).toHaveLength(2);
  });

  it('does not fall back to a raw lon/lat ocean rectangle when projected sphere parsing is empty', () => {
    const emptyProjection = {
      stream: () => ({
        point: () => {},
        lineStart: () => {},
        lineEnd: () => {},
        polygonStart: () => {},
        polygonEnd: () => {}
      })
    } as unknown as ProjectionLike;

    const layer = createMersLayer(
      {
        id: 'mers',
        visible: true,
        color: '#e0e0e0',
        opacity: 100
      },
      { projection: emptyProjection }
    );

    expect(layer).toBeNull();
  });

  it('uses Arrow native path for terre when a composite projection is active', () => {
    const table = {} as ArrowTable;
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockReturnValue(createNativePolygonGeometryInfo());

    const layers = createTerreLayers(table, createTerreConfig(), ctx);
    const layer = layers[0];

    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      table,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(SolidPolygonLayer);
  });

  it('renders no stroke layer on the Arrow native path when strokeThickness is 0', () => {
    const table = {} as ArrowTable;
    const ctx = createProjectionContext();

    extractGeometryInfoMock.mockReturnValue(createNativePolygonGeometryInfo());

    const layers = createTerreLayers(
      table,
      { ...createTerreConfig(), strokeThickness: 0 },
      ctx
    );

    expect(layers).toHaveLength(1);
    expect(layers[0]).toBeInstanceOf(SolidPolygonLayer);
    expect(layers.some((layer) => String(layer.id).endsWith('-stroke'))).toBe(
      false
    );
  });

  it('projects generated equator lines when a custom projection is active', () => {
    const projectedGeoJSON = createLineGeoJSON('projected-equator');
    const ctx = createProjectionContext();

    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layer = createEquateurLayer(
      {
        id: 'equateur',
        visible: true,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      ctx
    ) as GeoJsonLayer | null;

    expect(projectGeoJSONMock).toHaveBeenCalledTimes(1);
    expect(layer?.props.data).toBe(projectedGeoJSON);
  });

  it('keeps generated equator lines visible when dotted styling is disabled', () => {
    const layer = createEquateurLayer(
      {
        id: 'equateur',
        visible: true,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.extensions).toHaveLength(1);
    expect(Reflect.get(layer?.props ?? {}, 'getDashArray')).toEqual([1, 0]);
  });

  it('keeps generated equator lines on the complete domain with a regional bbox', () => {
    const layer = createEquateurLayer(
      {
        id: 'equateur',
        visible: true,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [2, -5, 10, 5] }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<LineString>;
    const coordinates = data.features[0]?.geometry.coordinates ?? [];

    expect(data.features).toHaveLength(1);
    expect(coordinates[0]).toEqual([-180, 0]);
    expect(coordinates[coordinates.length - 1]).toEqual([180, 0]);
  });

  it('keeps generated equator lines even when the active bbox excludes latitude zero', () => {
    const layer = createEquateurLayer(
      {
        id: 'equateur',
        visible: true,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [2, 40, 10, 50] }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<LineString>;
    const coordinates = data.features[0]?.geometry.coordinates ?? [];

    expect(data.features).toHaveLength(1);
    expect(coordinates[0]).toEqual([-180, 0]);
    expect(coordinates[coordinates.length - 1]).toEqual([180, 0]);
  });

  it('projects generated meridians and parallels with regular spacing', () => {
    const projectedGeoJSON = createLineGeoJSON('projected-graticule');
    const ctx = createProjectionContext();

    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 15,
        color: '#666666',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      ctx
    ) as GeoJsonLayer | null;

    expect(projectGeoJSONMock).toHaveBeenCalledTimes(1);
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.data).toBe(projectedGeoJSON);
    expect(layer?.props.updateTriggers).not.toHaveProperty('data');
  });

  it('projects generated graticule data through composite sub-projections', () => {
    const ctx = createCompositeGraticuleProjectionContext();

    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 10,
        color: '#666666',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { ...ctx, bbox: [-10, 35, 30, 70] }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<
      LineString,
      { name: string; subProjectionId?: string }
    >;
    const names = data.features.map((feature) => feature.properties.name);
    const meridian = data.features.find(
      (feature) => feature.properties.name === 'meridian-0'
    );
    const meridianCoordinates = meridian?.geometry.coordinates ?? [];
    const subProjectionIds = new Set(
      data.features.map((feature) => feature.properties.subProjectionId)
    );

    expect(projectGeoJSONMock).not.toHaveBeenCalled();
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(data.features.length).toBeGreaterThan(0);
    expect(names).toContain('meridian-0');
    expect(names).toContain('parallel-40');
    expect(names).not.toContain('parallel--66.5634');
    expect(names.filter((name) => name === 'parallel-40')).toHaveLength(1);
    expect(subProjectionIds).toEqual(new Set(['mainland']));
    expect(meridian?.properties.subProjectionId).toBe('mainland');
    expect(meridianCoordinates.length).toBeGreaterThan(0);
  });

  it('does not reuse composite graticule projections across routing bboxes', () => {
    const westBounds: BBox = [-10, -10, 10, 10];
    const eastBounds: BBox = [20, -10, 40, 10];
    const projection = {
      stream: (sink: {
        point: (x: number, y: number) => void;
        lineStart: () => void;
        lineEnd: () => void;
        polygonStart: () => void;
        polygonEnd: () => void;
      }) => sink,
      getSubProjections: () => [
        {
          id: 'west',
          projection: createClippedTestProjection(westBounds, [
            [0, 0],
            [100, 100]
          ]),
          bounds: westBounds,
          screenExtent: [
            [0, 0],
            [100, 100]
          ]
        },
        {
          id: 'east',
          projection: createClippedTestProjection(eastBounds, [
            [200, 0],
            [300, 100]
          ]),
          bounds: eastBounds,
          screenExtent: [
            [200, 0],
            [300, 100]
          ]
        }
      ]
    } as unknown as ProjectionLike;
    const config = {
      id: 'equateur' as const,
      visible: true,
      color: '#666666',
      dotted: false,
      dottedPattern: BasemapDottedPattern.DOTS,
      thickness: 1,
      opacity: 100
    };

    const westLayer = createEquateurLayer(config, {
      projection,
      bbox: westBounds
    }) as GeoJsonLayer | null;
    const eastLayer = createEquateurLayer(config, {
      projection,
      bbox: eastBounds
    }) as GeoJsonLayer | null;

    const westData = westLayer?.props.data as FeatureCollection<
      LineString,
      { subProjectionId?: string }
    >;
    const eastData = eastLayer?.props.data as FeatureCollection<
      LineString,
      { subProjectionId?: string }
    >;

    expect(
      new Set(
        westData.features.map((feature) => feature.properties.subProjectionId)
      )
    ).toEqual(new Set(['west']));
    expect(
      new Set(
        eastData.features.map((feature) => feature.properties.subProjectionId)
      )
    ).toEqual(new Set(['east']));
  });

  it('streams composite graticule lines through projection clipping to reach frame edges', () => {
    const screenExtent: [[number, number], [number, number]] = [
      [25, 25],
      [75, 75]
    ];
    const projection = geoEquirectangular()
      .scale(100)
      .translate([50, 50])
      .clipExtent(screenExtent);

    const layer = createEquateurLayer(
      {
        id: 'equateur',
        visible: true,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {
        bbox: [-20, -10, 20, 10],
        projection: {
          stream: (sink: {
            point: (x: number, y: number) => void;
            lineStart: () => void;
            lineEnd: () => void;
            polygonStart: () => void;
            polygonEnd: () => void;
          }) => sink,
          getSubProjections: () => [
            {
              id: 'main',
              projection,
              bounds: [-20, -10, 20, 10] as BBox,
              screenExtent
            }
          ]
        } as unknown as ProjectionLike
      }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<LineString>;
    const coordinates = data.features[0]?.geometry.coordinates ?? [];
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    expect(first[0]).toBeCloseTo(25, 6);
    expect(first[1]).toBeCloseTo(50, 6);
    expect(last[0]).toBeCloseTo(75, 6);
    expect(last[1]).toBeCloseTo(50, 6);
  });

  it('keeps composite graticules inside the sub-projection frame within the visible canvas', () => {
    const subFrameExtent: [[number, number], [number, number]] = [
      [25, 25],
      [75, 75]
    ];
    const canvasExtent: [[number, number], [number, number]] = [
      [0, 0],
      [100, 100]
    ];
    const projection = geoEquirectangular()
      .scale(100)
      .translate([50, 50])
      .clipExtent(subFrameExtent);

    const layer = createEquateurLayer(
      {
        id: 'equateur',
        visible: true,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {
        bbox: [-20, -10, 20, 10],
        graticuleClipExtent: canvasExtent,
        projection: {
          stream: (sink: {
            point: (x: number, y: number) => void;
            lineStart: () => void;
            lineEnd: () => void;
            polygonStart: () => void;
            polygonEnd: () => void;
          }) => sink,
          getSubProjections: () => [
            {
              id: 'main',
              projection,
              bounds: [-20, -10, 20, 10] as BBox,
              screenExtent: subFrameExtent
            }
          ]
        } as unknown as ProjectionLike
      }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<LineString>;
    const coordinates = data.features[0]?.geometry.coordinates ?? [];
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    expect(first[0]).toBeCloseTo(25, 6);
    expect(first[1]).toBeCloseTo(50, 6);
    expect(last[0]).toBeCloseTo(75, 6);
    expect(last[1]).toBeCloseTo(50, 6);
    expect(projection.clipExtent()).toEqual(subFrameExtent);
  });

  it('does not draw a chord across the frame where a conic sub-projection is cut', () => {
    const width = 1200;
    const height = 800;
    const preset = projectionPresets.BRESIL_ALBERS;
    const projection = buildKhartisCompositeProjection({
      width,
      height,
      entries: preset.entries.map((entry) => ({
        id: entry.id,
        proj4: entry.proj4,
        bounds: [...entry.bounds[0], ...entry.bounds[1]] as BBox,
        layout: entry.layout
      }))
    });

    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 5,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {
        bbox: [-76, -37, -29, 10],
        graticuleClipExtent: [
          [0, 0],
          [width, height]
        ],
        projection
      }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<
      LineString | MultiLineString
    >;
    const lines = data.features.flatMap((feature) =>
      feature.geometry.type === 'LineString'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
    );
    const longestStep = Math.max(
      ...lines.flatMap((line) =>
        line
          .slice(1)
          .map((point, index) =>
            Math.hypot(point[0] - line[index][0], point[1] - line[index][1])
          )
      )
    );

    expect(lines.length).toBeGreaterThan(0);
    expect(longestStep).toBeLessThan(width / 4);
  });

  it('keeps generated meridians and parallels visible when dotted styling is disabled', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 30,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.extensions).toHaveLength(1);
    expect(Reflect.get(layer?.props ?? {}, 'getDashArray')).toEqual([1, 0]);
  });

  it('builds regular meridians and parallels from spacing without duplicating the equator', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 5,
        color: '#666666',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [0, -5, 10, 5], excludeEquator: true }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<
      LineString,
      { name: string }
    >;
    const names = data.features.map((feature) => feature.properties.name);
    const meridian = data.features.find(
      (feature) => feature.properties.name === 'meridian-0'
    );
    const parallel = data.features.find(
      (feature) => feature.properties.name === 'parallel--5'
    );
    const meridianCoordinates = meridian?.geometry.coordinates ?? [];
    const parallelCoordinates = parallel?.geometry.coordinates ?? [];

    expect(names).toContain('meridian-0');
    expect(names).toContain('meridian--180');
    expect(names).toContain('meridian-5');
    expect(names).toContain('meridian-10');
    expect(names).toContain('meridian-180');
    expect(names).toContain('parallel--90');
    expect(names).toContain('parallel--5');
    expect(names).toContain('parallel-5');
    expect(names).toContain('parallel-90');
    expect(names).not.toContain('parallel-0');
    expect(meridianCoordinates[0]).toEqual([0, -90]);
    expect(meridianCoordinates[meridianCoordinates.length - 1]).toEqual([
      0, 90
    ]);
    expect(parallelCoordinates[0]).toEqual([-180, -5]);
    expect(parallelCoordinates[parallelCoordinates.length - 1]).toEqual([
      180, -5
    ]);
    expect(layer?.props.updateTriggers).not.toHaveProperty('data');
  });

  it('builds remarkable meridians and parallels without duplicating the equator', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10,
        color: '#666666',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [-180, -90, 180, 90], excludeEquator: true }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<
      LineString,
      { name: string }
    >;
    const names = data.features.map((feature) => feature.properties.name);

    expect(names).toContain('meridian-0');
    expect(names).toContain('parallel--66.5634');
    expect(names).toContain('parallel--23.4366');
    expect(names).toContain('parallel-23.4366');
    expect(names).toContain('parallel-66.5634');
    expect(names).not.toContain('parallel-0');
  });

  it('uses geographic-lines metadata for remarkable graticules when available', () => {
    const graticuleTable = {
      id: 'metadata-graticule'
    } as unknown as ArrowTable;
    const geographicLinesTable = {
      id: 'metadata-geographic-lines'
    } as unknown as ArrowTable;

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.EQUATEUR, true);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERIDIENS, true);
    extractGeometryInfoMock.mockImplementation((table) =>
      table === geographicLinesTable ? createNativeLineGeometryInfo() : null
    );

    const layers = createBasemapLayers(
      null,
      { bbox: [-10, -10, 10, 10] },
      {
        metadataLayers: [
          {
            table: graticuleTable,
            style: null,
            type: BasemapLayerType.GRATICULE,
            file: 'graticule.parquet'
          },
          {
            table: geographicLinesTable,
            style: null,
            type: BasemapLayerType.GEOGRAPHIC_LINES,
            file: 'geographic-lines.parquet'
          }
        ],
        availableMetadataLayerTypes: [
          BasemapLayerType.GRATICULE,
          BasemapLayerType.GEOGRAPHIC_LINES
        ],
        stylePresets: null
      }
    );
    const foregroundIds = layers.foreground.map((layer) =>
      String(layer.props.id)
    );

    expect(foregroundIds).toContain('basemap-equateur-basemap-default');
    expect(foregroundIds).toContain('basemap-meta-geo-lines-basemap-default-0');
    expect(foregroundIds).not.toContain('basemap-meridiens-basemap-default');
    expect(foregroundIds).not.toContain('basemap-meta-graticule');
  });

  it('renders the Territoire from land metadata using the style preset fill', () => {
    const landTable = { id: 'metadata-land' } as unknown as ArrowTable;
    const worldBaseTable = { id: 'world-base' } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockImplementation((table) =>
      table === landTable ? createNativePolygonGeometryInfo() : null
    );

    const layers = createBasemapLayers(worldBaseTable, ctx, {
      metadataLayers: [
        {
          table: landTable,
          style: 'land',
          type: BasemapLayerType.LAND,
          file: 'monde-land.parquet'
        }
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LAND],
      stylePresets: {
        land: {
          layer_type: 'solid-polygon',
          fillColor: [220, 220, 220, 255],
          stroked: false
        }
      }
    });

    const landLayer = layers.background.find(
      (layer) =>
        String(layer.props.id) === 'basemap-terre-basemap-default-land-0'
    ) as SolidPolygonLayer | undefined;

    expect(landLayer).toBeInstanceOf(SolidPolygonLayer);
    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      landTable,
      ctx.projection
    );
    expect(parseSolidPolygonsWithProjectionMock).not.toHaveBeenCalledWith(
      worldBaseTable,
      ctx.projection
    );
    expect(landLayer?.props.getFillColor).toEqual([220, 220, 220, 255]);
  });

  it('falls back to worldBaseTable for the Territoire when no land metadata exists', () => {
    const worldBaseTable = { id: 'world-base' } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockImplementation((table) =>
      table === worldBaseTable ? createNativePolygonGeometryInfo() : null
    );

    const layers = createBasemapLayers(worldBaseTable, ctx, {
      metadataLayers: [],
      availableMetadataLayerTypes: [],
      stylePresets: null
    });

    const ids = layers.background.map((layer) => String(layer.props.id));

    expect(ids).toContain('basemap-terre-basemap-default');
    expect(ids).not.toContain('basemap-terre-basemap-default-land-0');
    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      worldBaseTable,
      ctx.projection
    );
  });

  it('normalizes legacy meridiens remarquables while restoring serialized layers', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'meridiens',
        visible: true,
        remarquables: BasemapRemarquables.MAJOR,
        color: '#123456'
      }
    ] as unknown as Parameters<
      typeof basemapLayersStore.restoreFromSerialized
    >[0]);

    const layer = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS);

    expect(layer?.mode).toBe(BasemapGraticuleMode.REGULAR);
    expect(layer?.spacingDegrees).toBe(15);
    expect(layer?.color).toBe('#123456');
    expect('remarquables' in (layer ?? {})).toBe(false);
  });

  it('preserves serialized basemap layer order while restoring', () => {
    const meridiens = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS);
    const equateur = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.EQUATEUR);

    if (!meridiens || !equateur) {
      throw new Error('Expected default foreground basemap layers');
    }

    basemapLayersStore.restoreFromSerialized([
      {
        ...meridiens,
        visible: true
      },
      {
        ...equateur,
        visible: true
      }
    ]);

    expect(
      basemapLayersStore.layers.map((layer) => layer.id).slice(0, 2)
    ).toEqual([BASEMAP_LAYER_ID.MERIDIENS, BASEMAP_LAYER_ID.EQUATEUR]);
    expect(
      basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS)?.visible
    ).toBe(true);
    expect(basemapLayersStore.layers).toHaveLength(10);
  });

  it('falls back to the default meridiens mode when serialized mode is invalid', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'meridiens',
        visible: true,
        mode: 'invalid',
        spacingDegrees: 999
      }
    ] as unknown as Parameters<
      typeof basemapLayersStore.restoreFromSerialized
    >[0]);

    const layer = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS);

    expect(layer?.mode).toBe(BasemapGraticuleMode.REMARKABLE);
    expect(layer?.spacingDegrees).toBe(90);
  });

  it('returns null when meridiens layer is not visible', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: false,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10,
        color: '#666666',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {}
    );

    expect(layer).toBeNull();
  });

  it('applies color and opacity correctly to graticule lines', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 30,
        color: '#ff0000',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 50
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.getLineColor).toEqual([255, 0, 0, 128]);
    expect(layer?.props.updateTriggers.getLineColor).toEqual(['#ff0000', 50]);
  });

  it('transmits thickness to getLineWidth', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 2.5,
        opacity: 100
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.getLineWidth).toBe(2.5);
    expect(layer?.props.updateTriggers.getLineWidth).toEqual([2.5]);
  });

  it('maps dotted patterns to correct dash arrays', () => {
    const testCases: Array<{
      pattern: BasemapDottedPattern;
      expected: number[];
    }> = [
      { pattern: BasemapDottedPattern.DOTS, expected: [2, 4] },
      { pattern: BasemapDottedPattern.DASHES, expected: [8, 4] },
      { pattern: BasemapDottedPattern.DASH_DOT, expected: [8, 2] },
      { pattern: BasemapDottedPattern.LONG_DASH, expected: [16, 4] }
    ];

    for (const { pattern, expected } of testCases) {
      const layer = createMeridiensLayer(
        {
          id: 'meridiens',
          visible: true,
          mode: BasemapGraticuleMode.REGULAR,
          spacingDegrees: 30,
          color: '#666666',
          dotted: true,
          dottedPattern: pattern,
          thickness: 1,
          opacity: 100
        },
        {}
      ) as GeoJsonLayer | null;

      expect(Reflect.get(layer?.props ?? {}, 'getDashArray')).toEqual(expected);
    }
  });

  it('caches graticule data for identical config and regenerates on change', () => {
    const config = {
      id: 'meridiens' as const,
      visible: true,
      mode: BasemapGraticuleMode.REGULAR,
      spacingDegrees: 15,
      color: '#666666',
      dotted: true,
      dottedPattern: BasemapDottedPattern.DOTS,
      thickness: 1,
      opacity: 100
    };

    const layer1 = createMeridiensLayer(config, { bbox: [-10, -10, 10, 10] });
    const data1 = (layer1 as GeoJsonLayer)?.props.data;

    const layer2 = createMeridiensLayer(config, { bbox: [-10, -10, 10, 10] });
    const data2 = (layer2 as GeoJsonLayer)?.props.data;

    expect(data1).toBe(data2);

    const layer3 = createMeridiensLayer(
      { ...config, spacingDegrees: 30 },
      { bbox: [-10, -10, 10, 10] }
    );
    const data3 = (layer3 as GeoJsonLayer)?.props.data;

    expect(data1).not.toBe(data3);
  });

  it('uses the complete graticule domain even with a regional bbox', () => {
    const layerWorld = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 30,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [-180, -90, 180, 90] }
    ) as GeoJsonLayer | null;

    const dataWorld = layerWorld?.props.data as FeatureCollection<LineString>;
    const worldFeatureCount = dataWorld.features.length;

    const layerEurope = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 30,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [-10, 35, 30, 70] }
    ) as GeoJsonLayer | null;

    const dataEurope = layerEurope?.props.data as FeatureCollection<LineString>;
    const europeFeatureCount = dataEurope.features.length;
    const names = dataEurope.features.map(
      (feature) => feature.properties?.name
    );
    const europeMeridian = dataEurope.features.find(
      (feature) => feature.properties?.name === 'meridian-0'
    );
    const europeParallel = dataEurope.features.find(
      (feature) => feature.properties?.name === 'parallel-60'
    );
    const meridianCoordinates = europeMeridian?.geometry.coordinates ?? [];
    const parallelCoordinates = europeParallel?.geometry.coordinates ?? [];

    expect(europeFeatureCount).toBe(worldFeatureCount);
    expect(dataEurope).toBe(dataWorld);
    expect(names).toEqual(
      expect.arrayContaining([
        'meridian--180',
        'meridian--30',
        'meridian-0',
        'meridian-60',
        'meridian-180',
        'parallel--90',
        'parallel-0',
        'parallel-60',
        'parallel-90'
      ])
    );
    expect(meridianCoordinates[0]).toEqual([0, -90]);
    expect(meridianCoordinates[meridianCoordinates.length - 1]).toEqual([
      0, 90
    ]);
    expect(parallelCoordinates[0]).toEqual([-180, 60]);
    expect(parallelCoordinates[parallelCoordinates.length - 1]).toEqual([
      180, 60
    ]);
  });

  it('enforces lineWidthMinPixels of 0.5 for meridiens', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 0.25,
        opacity: 100
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.lineWidthMinPixels).toBe(0.5);
  });

  it('uses a stable layer id for meridiens', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10,
        color: '#666666',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      {}
    ) as GeoJsonLayer | null;

    expect(layer?.props.id).toBe('basemap-meridiens-basemap-default');
  });

  it('includes equator in remarkable mode when excludeEquator is false', () => {
    const layer = createMeridiensLayer(
      {
        id: 'meridiens',
        visible: true,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10,
        color: '#666666',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      { bbox: [-180, -90, 180, 90], excludeEquator: false }
    ) as GeoJsonLayer | null;

    const data = layer?.props.data as FeatureCollection<
      LineString,
      { name: string }
    >;
    const names = data.features.map((feature) => feature.properties.name);

    expect(names).toContain('parallel-0');
  });

  it('normalizes legacy remarquables ALL to regular spacing 10', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'meridiens',
        visible: true,
        remarquables: BasemapRemarquables.ALL,
        color: '#abcdef'
      }
    ] as unknown as Parameters<
      typeof basemapLayersStore.restoreFromSerialized
    >[0]);

    const layer = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS);

    expect(layer?.mode).toBe(BasemapGraticuleMode.REGULAR);
    expect(layer?.spacingDegrees).toBe(10);
    expect(layer?.color).toBe('#abcdef');
  });

  it('normalizes legacy remarquables MINOR to regular spacing 5', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'meridiens',
        visible: true,
        remarquables: BasemapRemarquables.MINOR,
        color: '#fedcba'
      }
    ] as unknown as Parameters<
      typeof basemapLayersStore.restoreFromSerialized
    >[0]);

    const layer = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS);

    expect(layer?.mode).toBe(BasemapGraticuleMode.REGULAR);
    expect(layer?.spacingDegrees).toBe(5);
    expect(layer?.color).toBe('#fedcba');
  });

  it('normalizes legacy remarquables EQUATOR_TROPICS to remarkable', () => {
    basemapLayersStore.restoreFromSerialized([
      {
        id: 'meridiens',
        visible: true,
        remarquables: BasemapRemarquables.EQUATOR_TROPICS,
        color: '#00ff00'
      }
    ] as unknown as Parameters<
      typeof basemapLayersStore.restoreFromSerialized
    >[0]);

    const layer = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERIDIENS);

    expect(layer?.mode).toBe(BasemapGraticuleMode.REMARKABLE);
    expect(layer?.spacingDegrees).toBe(10);
    expect(layer?.color).toBe('#00ff00');
  });

  it('projects city point overlays before rendering them', () => {
    const cities: BasemapCity[] = [
      { position: [2, 3], properties: { adm0cap: 1, pop_max: 1_000_000 } }
    ];

    const [layer] = createVillesLayers(
      cities,
      {
        id: 'villes',
        visible: true,
        category: BasemapCityCategory.CAPITALS,
        symbol: BasemapCitySymbol.POINT,
        color: '#111111',
        size: 6,
        opacity: 100
      },
      createScalingProjectionContext(10)
    );

    expect(layer).toBeInstanceOf(ScatterplotLayer);
    expect(readBinaryPositions(layer)).toEqual([20, 30]);
    expect(arrowTableToGeoJSONMock).not.toHaveBeenCalled();
    expect(projectGeoJSONMock).not.toHaveBeenCalled();
  });

  it('does not replace cached raw city polygons while rendering projected symbols', () => {
    const cities: BasemapCity[] = [
      { position: [2, 3], properties: { adm0cap: 1, pop_max: 1_000_000 } }
    ];
    const config = {
      id: 'villes' as const,
      visible: true,
      category: BasemapCityCategory.CAPITALS,
      symbol: BasemapCitySymbol.SQUARE,
      color: '#111111',
      size: 6,
      opacity: 100
    };

    const rawLayers = createVillesLayers(cities, config, {});
    const projectedLayers = createVillesLayers(
      cities,
      config,
      createScalingProjectionContext(10)
    );
    const nextRawLayers = createVillesLayers(cities, config, {});

    expect(rawLayers.map((layer) => layer.constructor)).toEqual([
      SolidPolygonLayer,
      PathLayer
    ]);
    expect(readBinaryPolygon(projectedLayers[0])).not.toBe(
      readBinaryPolygon(rawLayers[0])
    );
    expect(readBinaryPolygon(nextRawLayers[0])).toBe(
      readBinaryPolygon(rawLayers[0])
    );
  });

  it('connects centroid metadata to city symbols and labels', () => {
    const centroidTable = createCityTable(
      [
        { id: 'small', name: 'Small', pop_max: 10, adm0cap: 0 },
        { id: 'large', name: '東京', pop_max: 100n, adm0cap: 0 }
      ],
      [
        [1, 1],
        [2, 2]
      ]
    );

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.VILLES, {
      count: 1,
      labelColor: '#ff0000',
      labelSize: 12,
      labelFontFamily: 'Cabin'
    });

    const layers = createBasemapLayers(
      null,
      {},
      createCityMetadata(centroidTable, BasemapLayerType.CENTROID)
    );

    const symbolLayer = findCitySymbolLayer(layers.foreground);
    const labelLayer = findCityLabelLayer(layers.foreground) as
      TextLayer<CityLabel> | undefined;
    const labels = labelLayer?.props.data as CityLabel[] | undefined;
    const characterSet = labelLayer?.props.characterSet as string[] | undefined;

    expect(symbolLayer).toBeInstanceOf(ScatterplotLayer);
    expect(readBinaryPositions(symbolLayer)).toEqual([2, 2]);
    expect(labelLayer).toBeInstanceOf(TextLayer);
    expect(labels?.map((label) => label.text)).toEqual(['東京']);
    expect(labelLayer?.props.getColor).toEqual([255, 0, 0, 255]);
    expect(characterSet).not.toBe('auto');
    expect(characterSet).toContain('東');
    expect(characterSet).toContain('京');
    expect(arrowTableToGeoJSONMock).not.toHaveBeenCalled();
  });

  it('waits for font assets before rendering city labels', () => {
    const centroidTable = createCityTable(
      [{ id: 'city', name: 'City', pop_max: 100, adm0cap: 0 }],
      [[2, 2]]
    );

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: vi.fn(),
        ready: Promise.resolve()
      }
    });
    fontAssetsStore.reset();
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);

    const layers = createBasemapLayers(
      null,
      {},
      createCityMetadata(centroidTable, BasemapLayerType.CENTROID)
    );

    expect(fontAssetsStore.ready).toBe(false);
    expect(findCitySymbolLayer(layers.foreground)).toBeInstanceOf(
      ScatterplotLayer
    );
    expect(findCityLabelLayer(layers.foreground)).toBeUndefined();
  });

  it('expands multipoint centroids into one city per point', () => {
    const centroidTable = createCityTable(
      [{ id: 'archipelago', name: 'Archipel', pop_max: 100, adm0cap: 0 }],
      [
        [2, 2],
        [4, 4]
      ],
      [0, 0]
    );

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.VILLES, { count: 5 });

    const layers = createBasemapLayers(
      null,
      {},
      createCityMetadata(centroidTable, BasemapLayerType.CENTROID)
    );
    const labels = findCityLabelLayer(layers.foreground)?.props.data as
      CityLabel[] | undefined;

    expect(readBinaryPositions(findCitySymbolLayer(layers.foreground))).toEqual(
      [2, 2, 4, 4]
    );
    expect(labels?.map((label) => label.text)).toEqual([
      'Archipel',
      'Archipel'
    ]);
  });

  it('falls back to point metadata for city symbols and labels', () => {
    const pointTable = createCityTable(
      [{ id: 'point-city', name: 'Point City', pop_max: 100, adm0cap: 0 }],
      [[2, 2]]
    );

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.VILLES, { count: 5 });

    const layers = createBasemapLayers(
      null,
      {},
      createCityMetadata(pointTable, BasemapLayerType.POINT)
    );
    const labels = findCityLabelLayer(layers.foreground)?.props.data as
      CityLabel[] | undefined;

    expect(findCitySymbolLayer(layers.foreground)).toBeInstanceOf(
      ScatterplotLayer
    );
    expect(labels?.map((label) => label.text)).toEqual(['Point City']);
  });

  it('projects city symbols and labels with the active projection', () => {
    const centroidTable = createCityTable(
      [{ id: 'raw-city', name: 'Raw City', pop_max: 100, adm0cap: 0 }],
      [[2, 2]]
    );

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.VILLES, { count: 5 });

    const layers = createBasemapLayers(
      null,
      createScalingProjectionContext(10),
      createCityMetadata(centroidTable, BasemapLayerType.CENTROID)
    );
    const labels = findCityLabelLayer(layers.foreground)?.props.data as
      CityLabel[] | undefined;

    expect(readBinaryPositions(findCitySymbolLayer(layers.foreground))).toEqual(
      [20, 20]
    );
    expect(labels?.map((label) => label.position)).toEqual([[20, 20]]);
  });

  it('reuses the projected city subset across identical rebuilds', () => {
    const centroidTable = createCityTable(
      [{ id: 'city', name: 'City', pop_max: 100, adm0cap: 0 }],
      [[2, 2]]
    );
    const ctx = createScalingProjectionContext(10);

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.VILLES, { count: 5 });

    const metadata = createCityMetadata(
      centroidTable,
      BasemapLayerType.CENTROID
    );
    const first = findCityLabelLayer(
      createBasemapLayers(null, ctx, metadata).foreground
    );
    const second = findCityLabelLayer(
      createBasemapLayers(null, ctx, metadata).foreground
    );
    const firstLabels = first?.props.data as CityLabel[] | undefined;
    const secondLabels = second?.props.data as CityLabel[] | undefined;

    expect(secondLabels?.[0]?.position).toBe(firstLabels?.[0]?.position);
  });

  it('renders the Territoire from LAND metadata even when worldBaseTable is null', () => {
    const metadataTable = { id: 'land' } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativePolygonGeometryInfo() : null
    );

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: null,
          type: BasemapLayerType.LAND,
          file: 'land.parquet'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LAND],
      stylePresets: null
    });

    const terreLayer = layers.background.find((layer) =>
      String(layer.props.id).includes('basemap-terre')
    );

    expect(terreLayer).toBeDefined();
    expect(String(terreLayer?.props.id)).toBe(
      'basemap-terre-basemap-default-land-0'
    );
    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      metadataTable,
      ctx.projection
    );
  });

  it('renders the Territoire from LAND metadata, not worldBaseTable, when both exist', () => {
    const worldBaseTable = { id: 'world-base' } as unknown as ArrowTable;
    const metadataTable = { id: 'land-backdrop' } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativePolygonGeometryInfo() : null
    );

    const layers = createBasemapLayers(worldBaseTable, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: 'land',
          type: BasemapLayerType.LAND,
          file: 'land.parquet'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LAND],
      stylePresets: null
    });

    const terreLayer = layers.background.find((layer) =>
      String(layer.props.id).includes('basemap-terre')
    );

    expect(terreLayer).toBeDefined();
    expect(String(terreLayer?.props.id)).toBe(
      'basemap-terre-basemap-default-land-0'
    );
    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      metadataTable,
      ctx.projection
    );
    expect(parseSolidPolygonsWithProjectionMock).not.toHaveBeenCalledWith(
      worldBaseTable,
      ctx.projection
    );
  });

  it('places frontieres below the thematic block by default and above it when its placement is flipped', () => {
    const metadataTable = { id: 'limit-placement' } as unknown as ArrowTable;
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativeLineGeometryInfo() : null
    );

    const buildLayers = () =>
      createBasemapLayers(null, ctx, {
        metadataLayers: [
          {
            table: metadataTable,
            style: null,
            type: BasemapLayerType.LIMIT,
            file: 'limits-placement.parquet'
          } satisfies MetadataLayerEntry
        ],
        availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
        stylePresets: null
      });

    const isLimitLayer = (layer: { props: { id: unknown } }): boolean =>
      String(layer.props.id).includes('basemap-meta-limit');

    const belowDefault = buildLayers();
    expect(belowDefault.foregroundBelowThematic.some(isLimitLayer)).toBe(true);
    expect(belowDefault.foreground.some(isLimitLayer)).toBe(true);

    basemapLayersStore.setLayerThematicPlacement(
      BASEMAP_LAYER_ID.FRONTIERES,
      false
    );

    const aboveFlipped = buildLayers();
    expect(aboveFlipped.foregroundBelowThematic.some(isLimitLayer)).toBe(false);
    expect(aboveFlipped.foreground.some(isLimitLayer)).toBe(true);
  });

  it('uses Arrow native path for metadata limits under composite projections', () => {
    const metadataTable = {
      id: 'native-meta-limit-composite'
    } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativeLineGeometryInfo() : null
    );

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: null,
          type: BasemapLayerType.LIMIT,
          file: 'limits.parquet'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
      stylePresets: null
    });

    const metaLimitLayer = layers.foreground.find(
      (layer) =>
        layer instanceof PathLayer &&
        String(layer.props.id).includes('basemap-meta-limit')
    ) as PathLayer | undefined;

    expect(parsePathsWithProjectionMock).toHaveBeenCalledWith(
      metadataTable,
      ctx.projection
    );
    expect(metaLimitLayer).toBeInstanceOf(PathLayer);
  });

  it('skips empty metadata limit helper tables', () => {
    const metadataTable = { numRows: 0 } as unknown as ArrowTable;

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable
        ? ({
            type: 'MultiLineString',
            encoding: 'geoarrow.wkb',
            geoColumn: 'geometry',
            isNativeGeoArrow: true,
            isWkbEncoded: true
          } satisfies GeometryInfo)
        : null
    );

    const layers = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: metadataTable,
            style: null,
            type: BasemapLayerType.LIMIT,
            file: 'empty-innerlines'
          } satisfies MetadataLayerEntry
        ],
        availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
        stylePresets: null
      }
    );

    expect(
      layers.foreground.some((layer) =>
        String(layer.props.id).includes('basemap-meta-limit')
      )
    ).toBe(false);
  });

  it("keeps the Terre stroke under the layer's own toggle while metadata limits are visible", () => {
    const worldBaseTable = {
      id: 'world-base-stroke'
    } as unknown as ArrowTable;
    const metadataTable = { id: 'limit-stroke' } as unknown as ArrowTable;
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, true);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.TERRE, {
      strokeVisible: true
    });

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) => {
      if (table === worldBaseTable) return createNativePolygonGeometryInfo();
      if (table === metadataTable) return createNativeLineGeometryInfo();
      return null;
    });

    const buildTerreStrokeLayer = () => {
      const layers = createBasemapLayers(worldBaseTable, ctx, {
        metadataLayers: [
          {
            table: metadataTable,
            style: null,
            type: BasemapLayerType.LIMIT,
            file: 'limits.parquet'
          } satisfies MetadataLayerEntry
        ],
        availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
        stylePresets: null
      });
      expect(
        layers.foreground.some((layer) =>
          String(layer.props.id).includes('basemap-meta-limit')
        )
      ).toBe(true);
      return layers.background.find(
        (layer) =>
          layer instanceof PathLayer &&
          String(layer.props.id) === 'basemap-terre-basemap-default-stroke'
      ) as PathLayer | undefined;
    };

    const withStroke = buildTerreStrokeLayer();
    expect(withStroke).toBeInstanceOf(PathLayer);
    expect(withStroke?.props.getWidth).toBeGreaterThan(0);
    expect(withStroke?.props.getColor).not.toEqual([0, 0, 0, 0]);

    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.TERRE, {
      strokeVisible: false
    });

    expect(buildTerreStrokeLayer()).toBeUndefined();
  });

  it('connects metadata limit frontieres thickness and dotted styling to Deck.gl layers', () => {
    const metadataTable = { id: 'limit-style' } as unknown as ArrowTable;

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.FRONTIERES, {
      color: '#123456',
      dotted: false,
      dottedPattern: BasemapDottedPattern.DOTS,
      thickness: 100,
      opacity: 100
    });

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativeLineGeometryInfo() : null
    );

    const findLimitLayer = () =>
      createBasemapLayers(
        null,
        {},
        {
          metadataLayers: [
            {
              table: metadataTable,
              style: null,
              type: BasemapLayerType.LIMIT,
              file: 'limits.parquet'
            } satisfies MetadataLayerEntry
          ],
          availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
          stylePresets: null
        }
      ).foreground.find(
        (layer) =>
          layer instanceof PathLayer &&
          String(layer.props.id).includes('basemap-meta-limit')
      ) as PathLayer | undefined;

    const solidLayer = findLimitLayer();

    expect(solidLayer).toBeInstanceOf(PathLayer);
    expect(parsePathsMock).toHaveBeenCalledWith(metadataTable);
    expect(readFirstVertexAttribute(solidLayer, 'getColor')).toEqual([
      18, 52, 86, 255
    ]);
    expect(readFirstVertexAttribute(solidLayer, 'getWidth')).toEqual([
      BASEMAP_LAYER_CONFIG.thickness.max
    ]);
    expect(solidLayer?.props.widthMaxPixels).toBe(
      BASEMAP_LAYER_CONFIG.thickness.max
    );
    expect(Reflect.get(solidLayer?.props ?? {}, 'getDashArray')).toEqual([
      0, 0
    ]);
    expect(solidLayer?.props.extensions).toHaveLength(0);

    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.FRONTIERES, {
      dotted: true,
      dottedPattern: BasemapDottedPattern.DASHES
    });

    const dottedLayer = findLimitLayer();

    expect(dottedLayer).toBeInstanceOf(PathLayer);
    expect(readFirstVertexAttribute(dottedLayer, 'getWidth')).toEqual([
      BASEMAP_LAYER_CONFIG.thickness.max
    ]);
    expect(Reflect.get(dottedLayer?.props ?? {}, 'getDashArray')).toEqual([
      8, 4
    ]);
    expect(dottedLayer?.props.extensions).toHaveLength(1);
    expect(dottedLayer?.props.updateTriggers).toMatchObject({
      getLineColor: ['#123456', 1],
      getDashArray: [8, 4],
      getWidth: [BASEMAP_LAYER_CONFIG.thickness.max]
    });
  });

  it('uses Arrow native path for frontieres under composite projections', () => {
    const table = {
      id: 'native-frontieres-composite'
    } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createNativeLineGeometryInfo() : null
    );

    const layer = createFrontieresLayer(
      table,
      {
        id: 'frontieres',
        visible: true,
        color: '#123456',
        dotted: false,
        dottedPattern: BasemapDottedPattern.DOTS,
        thickness: 1,
        opacity: 100
      },
      ctx
    ) as PathLayer | null;

    expect(parsePathsWithProjectionMock).toHaveBeenCalledWith(
      table,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(PathLayer);
  });

  it('connects imported frontieres thickness and dotted styling to polygon outlines', () => {
    const table = {
      id: 'imported-frontieres-outline'
    } as unknown as ArrowTable;

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createNativePolygonGeometryInfo() : null
    );

    const layer = createFrontieresLayer(
      table,
      {
        id: 'frontieres',
        visible: true,
        color: '#123456',
        dotted: true,
        dottedPattern: BasemapDottedPattern.DASHES,
        thickness: 3,
        opacity: 100
      },
      {}
    );

    expect(layer).toBeInstanceOf(PathLayer);
    expect(parsePathsMock).toHaveBeenCalledWith(table);
    expect(readFirstVertexAttribute(layer ?? undefined, 'getColor')).toEqual([
      18, 52, 86, 255
    ]);
    expect(readFirstVertexAttribute(layer ?? undefined, 'getWidth')).toEqual([
      3
    ]);
    expect(Reflect.get(layer?.props ?? {}, 'widthMaxPixels')).toBe(
      BASEMAP_LAYER_CONFIG.thickness.max
    );
    expect(Reflect.get(layer?.props ?? {}, 'getDashArray')).toEqual([8, 4]);
    expect(layer?.props.extensions).toHaveLength(1);
    expect(layer?.props.updateTriggers).toMatchObject({
      getLineColor: ['#123456', 1],
      getDashArray: [true, BasemapDottedPattern.DASHES],
      getWidth: [3]
    });
  });

  it('connects lakes and rivers metadata to background and foreground Deck.gl layers', () => {
    const lakesTable = { id: 'lakes' } as unknown as ArrowTable;
    const riversTable = { id: 'rivers' } as unknown as ArrowTable;

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.LACS, true);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.RIVIERES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.LACS, {
      color: '#00ff00',
      opacity: 40,
      thickness: 2
    });
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.RIVIERES, {
      color: '#00ff00',
      opacity: 40,
      thickness: 3
    });

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) => {
      if (table === lakesTable) return createNativePolygonGeometryInfo();
      if (table === riversTable) return createNativeLineGeometryInfo();
      return null;
    });

    const layers = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: lakesTable,
            style: null,
            type: BasemapLayerType.POLYGON,
            file: 'lakes.parquet'
          },
          {
            table: riversTable,
            style: null,
            type: BasemapLayerType.LINE,
            file: 'rivers.parquet'
          }
        ],
        availableMetadataLayerTypes: [
          BasemapLayerType.POLYGON,
          BasemapLayerType.LINE
        ],
        stylePresets: null
      }
    );

    const isLakesLayer = (layer: Layer) =>
      String(layer.props.id).includes('basemap-lacs');
    const isRiversLayer = (layer: Layer) =>
      String(layer.props.id).includes('basemap-rivieres');
    const lakesFillLayer = layers.background.find(
      (layer) => layer instanceof SolidPolygonLayer && isLakesLayer(layer)
    ) as SolidPolygonLayer | undefined;
    const lakesStrokeLayer = layers.background.find(
      (layer) => layer instanceof PathLayer && isLakesLayer(layer)
    ) as PathLayer | undefined;
    const riversLayer = layers.foreground.find(
      (layer) => layer instanceof PathLayer && isRiversLayer(layer)
    ) as PathLayer | undefined;

    expect(layers.foreground.some(isLakesLayer)).toBe(false);
    expect(layers.background.some(isRiversLayer)).toBe(false);

    expect(lakesFillLayer).toBeInstanceOf(SolidPolygonLayer);
    expect(lakesFillLayer?.props.getFillColor).toEqual([0, 255, 0, 51]);
    expect(lakesFillLayer?.props.updateTriggers).toEqual({
      getFillColor: ['#00ff00', 40]
    });

    expect(lakesStrokeLayer).toBeInstanceOf(PathLayer);
    expect(readFirstVertexAttribute(lakesStrokeLayer, 'getColor')).toEqual([
      0, 255, 0, 102
    ]);
    expect(lakesStrokeLayer?.props.widthMinPixels).toBe(0);
    expect(lakesStrokeLayer?.props.updateTriggers).toEqual({
      getColor: ['#00ff00', 40],
      getWidth: [2]
    });

    expect(riversLayer).toBeInstanceOf(PathLayer);
    expect(readFirstVertexAttribute(riversLayer, 'getColor')).toEqual([
      0, 255, 0, 102
    ]);
    expect(readFirstVertexAttribute(riversLayer, 'getWidth')).toEqual([3]);
    expect(riversLayer?.props.updateTriggers).toEqual({
      getColor: ['#00ff00', 40],
      getWidth: [3],
      getDashArray: [false, BasemapDottedPattern.DOTS]
    });
  });

  it('uses binary layers for native lakes and rivers metadata', () => {
    const lakesTable = { id: 'native-lakes' } as unknown as ArrowTable;
    const riversTable = { id: 'native-rivers' } as unknown as ArrowTable;
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.LACS, true);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.RIVIERES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.LACS, {
      color: '#00ff00',
      opacity: 40,
      thickness: 2
    });
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.RIVIERES, {
      color: '#00ff00',
      opacity: 40,
      thickness: 3
    });

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) => {
      if (table === lakesTable) return createNativePolygonGeometryInfo();
      if (table === riversTable) return createNativeLineGeometryInfo();
      return null;
    });

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: lakesTable,
          style: null,
          type: BasemapLayerType.POLYGON,
          file: 'lakes.parquet'
        },
        {
          table: riversTable,
          style: null,
          type: BasemapLayerType.LINE,
          file: 'rivers.parquet'
        }
      ],
      availableMetadataLayerTypes: [
        BasemapLayerType.POLYGON,
        BasemapLayerType.LINE
      ],
      stylePresets: null
    });

    const lakesFillLayer = layers.background.find(
      (layer) =>
        layer instanceof SolidPolygonLayer &&
        String(layer.props.id).includes('basemap-lacs')
    ) as SolidPolygonLayer | undefined;
    const lakesStrokeLayer = layers.background.find(
      (layer) =>
        layer instanceof PathLayer &&
        String(layer.props.id).includes('basemap-lacs')
    ) as PathLayer | undefined;
    const riversLayer = layers.foreground.find(
      (layer) =>
        layer instanceof PathLayer &&
        String(layer.props.id).includes('basemap-rivieres')
    ) as PathLayer | undefined;

    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      lakesTable,
      ctx.projection
    );
    expect(parsePathsWithProjectionMock).toHaveBeenCalledWith(
      lakesTable,
      ctx.projection
    );
    expect(parsePathsWithProjectionMock).toHaveBeenCalledWith(
      riversTable,
      ctx.projection
    );
    expect(arrowTableToGeoJSONMock).not.toHaveBeenCalled();
    expect(lakesFillLayer).toBeInstanceOf(SolidPolygonLayer);
    expect(lakesFillLayer?.props.getFillColor).toEqual([0, 255, 0, 51]);
    expect(lakesStrokeLayer).toBeInstanceOf(PathLayer);
    expect(riversLayer).toBeInstanceOf(PathLayer);
    expect(Reflect.get(riversLayer?.props ?? {}, 'getDashArray')).toEqual([
      0, 0
    ]);
  });

  it('connects relief representation, color, and opacity to Deck.gl layer props', () => {
    const table = { id: 'relief-world-base' } as unknown as ArrowTable;

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createNativePolygonGeometryInfo() : null
    );

    const createReliefConfig = (
      representation: BasemapRepresentation,
      opacity: number
    ) => ({
      id: 'relief' as const,
      visible: true,
      representation,
      color: '#336699',
      opacity
    });
    const splitReliefLayers = (representation: BasemapRepresentation) => {
      const layers = createReliefLayers(
        table,
        createReliefConfig(representation, 50),
        {}
      );
      return {
        fill: layers.find((layer) => layer instanceof SolidPolygonLayer) as
          SolidPolygonLayer | undefined,
        stroke: layers.find((layer) => layer instanceof PathLayer) as
          PathLayer | undefined
      };
    };

    const shading = splitReliefLayers(BasemapRepresentation.SHADING);
    const elevation = splitReliefLayers(BasemapRepresentation.ELEVATION);
    const contours = splitReliefLayers(BasemapRepresentation.CONTOURS);

    expect(shading.fill).toBeInstanceOf(SolidPolygonLayer);
    expect(shading.fill?.props.id).toContain('basemap-relief');
    expect(shading.fill?.props.getFillColor).toEqual([51, 102, 153, 64]);
    expect(shading.fill?.props.updateTriggers).toEqual({
      getFillColor: ['#336699', 50, BasemapRepresentation.SHADING]
    });
    expect(shading.stroke?.props.updateTriggers).toEqual({
      getColor: ['#336699', 50, BasemapRepresentation.SHADING],
      getWidth: [0.35]
    });

    expect(elevation.fill?.props.getFillColor).toEqual([51, 102, 153, 102]);
    expect(elevation.stroke?.props.getColor).toEqual([96, 96, 96, 89]);
    expect(elevation.fill?.props.updateTriggers).toMatchObject({
      getFillColor: ['#336699', 50, BasemapRepresentation.ELEVATION]
    });
    expect(elevation.stroke?.props.updateTriggers).toMatchObject({
      getColor: ['#336699', 50, BasemapRepresentation.ELEVATION],
      getWidth: [0.5]
    });

    expect(contours.fill).toBeUndefined();
    expect(contours.stroke).toBeInstanceOf(PathLayer);
    expect(contours.stroke?.props.getColor).toEqual([51, 102, 153, 128]);
    expect(contours.stroke?.props.updateTriggers).toMatchObject({
      getColor: ['#336699', 50, BasemapRepresentation.CONTOURS],
      getWidth: [0.8]
    });
  });

  it('uses Arrow native path for relief under composite projections', () => {
    const table = { id: 'native-relief-composite' } as unknown as ArrowTable;
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createNativePolygonGeometryInfo() : null
    );

    const layer = createReliefLayers(
      table,
      {
        id: 'relief',
        visible: true,
        representation: BasemapRepresentation.SHADING,
        color: '#336699',
        opacity: 50
      },
      ctx
    )[0] as SolidPolygonLayer | undefined;

    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      table,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(SolidPolygonLayer);
  });
});
