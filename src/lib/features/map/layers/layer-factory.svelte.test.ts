import {
  GeoJsonLayer,
  PathLayer,
  ScatterplotLayer,
  TextLayer
} from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon
} from 'geojson';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClassificationMethod,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  BasemapDottedPattern,
  CategoryShapeMode,
  FillMode,
  ColorMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  SizeMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import type { GeometryInfo, LayerContext } from '../types';

const {
  arrowTableToGeoJSONMock,
  createCompatibleSolidPolygonLayerPropsMock,
  createPathLayerPropsMock,
  createPolygonFillColorAttributeMock,
  createScatterplotLayerPropsMock,
  getPatternAtlasForPatternMock,
  parsePathsMock,
  parsePathsWithProjectionMock,
  parsePointDataMock,
  parsePointDataWithProjectionMock,
  parseSolidPolygonsMock,
  parseSolidPolygonsWithProjectionMock,
  pathColorAttrMock,
  pathWidthAttrMock,
  pointPositionsMock,
  projectGeoJSONMock
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
    createCompatibleSolidPolygonLayerPropsMock: vi.fn(),
    createPathLayerPropsMock: vi.fn(),
    createPolygonFillColorAttributeMock: vi.fn(),
    createScatterplotLayerPropsMock: vi.fn(),
    getPatternAtlasForPatternMock: vi.fn(),
    parsePathsMock: vi.fn(),
    parsePathsWithProjectionMock: vi.fn(),
    parsePointDataMock: vi.fn(),
    parsePointDataWithProjectionMock: vi.fn(),
    parseSolidPolygonsMock: vi.fn(),
    parseSolidPolygonsWithProjectionMock: vi.fn(),
    pathColorAttrMock: vi.fn(),
    pathWidthAttrMock: vi.fn(),
    pointPositionsMock: vi.fn(),
    projectGeoJSONMock: vi.fn()
  };
});

vi.mock('geoarrow-deck-stream', async () => {
  const actual = await vi.importActual<typeof import('geoarrow-deck-stream')>(
    'geoarrow-deck-stream'
  );

  return {
    ...actual,
    createPathLayerProps: createPathLayerPropsMock,
    createPolygonFillColorAttribute: createPolygonFillColorAttributeMock,
    createScatterplotLayerProps: createScatterplotLayerPropsMock
  };
});

vi.mock('../io', async () => {
  const actual = await vi.importActual<typeof import('../io')>('../io');

  return {
    ...actual,
    arrowTableToGeoJSON: arrowTableToGeoJSONMock
  };
});

vi.mock('../utils/geoarrow-stream-bridge.utils', async () => {
  const actual = await vi.importActual<
    typeof import('../utils/geoarrow-stream-bridge.utils')
  >('../utils/geoarrow-stream-bridge.utils');

  return {
    ...actual,
    parsePaths: parsePathsMock,
    parsePathsWithProjection: parsePathsWithProjectionMock,
    parsePointData: parsePointDataMock,
    parsePointDataWithProjection: parsePointDataWithProjectionMock,
    parseSolidPolygons: parseSolidPolygonsMock,
    parseSolidPolygonsWithProjection: parseSolidPolygonsWithProjectionMock,
    pathColorAttr: pathColorAttrMock,
    pathWidthAttr: pathWidthAttrMock,
    pointPositions: pointPositionsMock,
    projectGeoJSON: projectGeoJSONMock,
    rowAccessor: vi.fn(
      (
        table: ArrowTable & {
          get?: (index: number) => Record<string, unknown>;
        },
        accessor: (row: Record<string, unknown>) => unknown
      ) =>
        (featureId: number) =>
          accessor(table.get?.(featureId) ?? {})
    )
  };
});

vi.mock('../utils/solid-polygon-layer-props.utils', () => ({
  createCompatibleSolidPolygonLayerProps:
    createCompatibleSolidPolygonLayerPropsMock
}));

vi.mock('./pattern-texture', async () => {
  const actual =
    await vi.importActual<typeof import('./pattern-texture')>(
      './pattern-texture'
    );

  return {
    ...actual,
    getPatternAtlas: vi.fn(() => ({
      atlas: {} as HTMLCanvasElement,
      mapping: {
        diagonal: { x: 0, y: 0, width: 8, height: 8 }
      }
    })),
    getPatternAtlasForPattern: getPatternAtlasForPatternMock
  };
});

vi.mock('$lib/features/commons/stores/font-assets.store.svelte', () => ({
  fontAssetsStore: {
    ready: true
  }
}));

import {
  createDeckLayers,
  createLineLayers,
  createPointLayers,
  createPointSymbolIcon,
  createPolygonLayers,
  resolveEffectiveCategoryColorMap,
  resolveSplitMappingFeatureIdColumn
} from './layer-factory';
import { MultiShapeLayer } from './multi-shape-layer';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';

const source = readFileSync(
  join(process.cwd(), 'src/lib/features/map/layers/layer-factory.ts'),
  'utf8'
);

function createTableWithFields(fieldNames: string[]): ArrowTable {
  return {
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    }
  } as unknown as ArrowTable;
}

function createTableWithRows(
  rows: Record<string, unknown>[],
  fieldNames: string[]
): ArrowTable {
  return {
    numRows: rows.length,
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    },
    get(index: number) {
      return rows[index];
    },
    getChild(name: string) {
      if (!fieldNames.includes(name)) {
        return null;
      }

      return {
        get(index: number) {
          return rows[index]?.[name];
        }
      };
    }
  } as unknown as ArrowTable;
}

function createCategoryTable(
  values: Array<string | null | undefined>
): ArrowTable {
  return {
    numRows: values.length,
    getChild(name: string) {
      if (name !== 'category') {
        return null;
      }

      return {
        get(index: number) {
          return values[index];
        }
      };
    }
  } as unknown as ArrowTable;
}

function createCategoricalSymbolVisualization(
  colors: string[]
): VisualizationConfig {
  const visualization = createSymbolVisualization();

  return {
    ...visualization,
    classification: undefined,
    symbol: {
      ...visualization.symbol!,
      fillMode: FillMode.CATEGORIES,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: colors.length,
        labels: ['North', 'South'],
        colors
      },
      fillClassification: {
        method: ClassificationMethod.MANUAL,
        classes: colors.length,
        labels: ['North', 'South'],
        colors
      }
    }
  };
}

function createPolygonFeature(
  id: string,
  year: number
): Feature<Polygon, { id: string; year: number }> {
  return {
    type: 'Feature',
    properties: { id, year },
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
  };
}

function createPointFeature(
  id: string,
  year: number
): Feature<Point, { id: string; year: number }> {
  return {
    type: 'Feature',
    properties: { id, year },
    geometry: {
      type: 'Point',
      coordinates: [0, 0]
    }
  };
}

function createLineFeature(
  id: string,
  routeName: string
): Feature<LineString, { id: string; route_name: string }> {
  return {
    type: 'Feature',
    properties: { id, route_name: routeName },
    geometry: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1]
      ]
    }
  };
}

function createVisualization(fillMode: FillMode): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Pattern test',
    type: VisualizationType.CHOROPLETH,
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [PrimitiveFilterType.POLYGON],
    polygon: {
      enabled: true,
      fillMode,
      fillOpacity: 1,
      strokeMode: StrokeMode.NONE,
      strokeWidth: 0,
      strokeOpacity: 0,
      strokeDashed: false,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 1,
        patternId: 'diagonal'
      }
    },
    style: {
      fillOpacity: 1,
      strokeOpacity: 0,
      strokeWidth: 0
    },
    mapping: {}
  };
}

function createSymbolVisualization(): VisualizationConfig {
  return {
    id: 'viz-point-1',
    name: 'Point stroke test',
    type: VisualizationType.PROPORTIONAL,
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [PrimitiveFilterType.POINT],
    symbol: {
      enabled: true,
      mode: SymbolMode.UNIQUE,
      shape: ShapeType.CIRCLE,
      size: 10,
      minSize: 2,
      maxSize: 10,
      sizeScale: ScaleType.LINEAR,
      opacity: 1,
      fillMode: FillMode.UNIQUE,
      fillColor: '#3366cc',
      fillColorB: '#ff832b',
      strokeMode: StrokeMode.NONE,
      strokeColor: '#1f1f1f',
      strokeWidth: 2,
      strokeOpacity: 1,
      strokeDashed: false,
      proportionalType: ProportionalType.SINGLE,
      categoryShape: CategoryShapeMode.UNIQUE
    },
    style: {
      fillOpacity: 1,
      strokeOpacity: 1,
      strokeWidth: 1
    },
    mapping: {}
  };
}

function createContext(viz: VisualizationConfig): LayerContext {
  return {
    viz,
    datasetId: 'dataset-1',
    fillColor: [51, 102, 204],
    symbolFillColor: [51, 102, 204],
    strokeColor: [20, 20, 20],
    fillOpacity: 1,
    strokeWidth: 1,
    strokeOpacity: 1,
    statistics: { min: 0, max: 1 },
    categoryColorMap: null,
    customProjection: {
      stream: (sink) => sink
    } as LayerContext['customProjection']
  };
}

function createTextVisualization(): VisualizationConfig {
  const visualization = createSymbolVisualization();

  return {
    ...visualization,
    primitiveFilters: [PrimitiveFilterType.POINT, PrimitiveFilterType.TEXT],
    text: {
      enabled: true,
      labelColumn: 'name',
      colorMode: ColorMode.UNIQUE,
      sizeMode: SizeMode.FIXED,
      fontFamily: 'Open Sans',
      color: '#111111',
      opacity: 1,
      size: 24,
      bold: false,
      italic: false,
      align: 'center',
      halo: false,
      haloColor: '#ffffff',
      haloWidth: 2,
      collisionDetection: true,
      dxpMasking: false,
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 6,
        color: '#c6c6c6',
        label: 'N/A'
      },
      secondaryLabels: {
        enabled: false,
        fontFamily: 'Open Sans',
        color: '#111111',
        opacity: 1,
        size: 12,
        bold: false,
        italic: false,
        align: 'center',
        halo: false,
        haloColor: '#ffffff',
        haloWidth: 2,
        collisionDetection: true,
        dxpMasking: false
      },
      background: {
        fillMode: FillMode.NONE,
        fillColor: '#ffffff',
        fillOpacity: 1,
        strokeMode: StrokeMode.NONE,
        strokeColor: '#000000',
        strokeWidth: 0,
        strokeOpacity: 1,
        strokeDashed: false
      }
    }
  };
}

function createGeometryInfo(): GeometryInfo {
  return {
    type: 'Polygon',
    encoding: 'geojson',
    geoColumn: 'geometry',
    isNativeGeoArrow: false,
    isWkbEncoded: false,
    isGeoJsonEncoded: true
  };
}

function createPointGeometryInfo(): GeometryInfo {
  return {
    type: 'Point',
    encoding: 'geoarrow.point',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false,
    isGeoJsonEncoded: false
  };
}

function createLineGeometryInfo(): GeometryInfo {
  return {
    type: 'LineString',
    encoding: 'geoarrow.linestring',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false,
    isGeoJsonEncoded: false
  };
}

function getPatternLayer(
  layers: ReturnType<typeof createPolygonLayers>
): GeoJsonLayer | undefined {
  return layers.find(
    (layer) =>
      layer instanceof GeoJsonLayer &&
      String(layer.props.id).includes('-pattern-')
  ) as GeoJsonLayer | undefined;
}

function getLayerIds(layers: ReturnType<typeof createPolygonLayers>): string[] {
  return layers.map((layer) => String(layer.props.id));
}

type ScatterBinaryTestData = {
  attributes: Record<string, { value: Uint8Array } | undefined>;
};

type TestLineFeature = Feature<LineString, Record<string, unknown>>;

function hasScatterBinaryTestData(
  data: unknown
): data is ScatterBinaryTestData {
  return typeof data === 'object' && data !== null && 'attributes' in data;
}

beforeEach(() => {
  vi.clearAllMocks();
  getPatternAtlasForPatternMock.mockReturnValue({
    atlas: {} as HTMLCanvasElement,
    mapping: {
      diagonal: { x: 0, y: 0, width: 8, height: 8 },
      dots: { x: 8, y: 0, width: 8, height: 8 }
    }
  });
  projectGeoJSONMock.mockImplementation((geojson) => geojson);
  parseSolidPolygonsMock.mockReturnValue({
    featureIds: new Uint32Array([0])
  });
  parseSolidPolygonsWithProjectionMock.mockReturnValue({
    featureIds: new Uint32Array([0]),
    positions: new Float32Array([0, 0, 1, 0, 1, 1]),
    polygonIndices: new Uint32Array([0, 3]),
    size: 2
  });
  parsePathsMock.mockReturnValue({
    featureIds: new Uint32Array([0])
  });
  parsePathsWithProjectionMock.mockReturnValue({
    featureIds: new Uint32Array([0]),
    positions: new Float32Array([0, 0, 1, 0, 1, 1]),
    startIndices: new Uint32Array([0, 3]),
    size: 2
  });
  createCompatibleSolidPolygonLayerPropsMock.mockImplementation((polyData) => ({
    data: {
      length: polyData.featureIds?.length ?? 0,
      attributes: {}
    }
  }));
  createPathLayerPropsMock.mockImplementation((pathData) => ({
    data: {
      length: pathData.featureIds?.length ?? 0,
      attributes: {}
    }
  }));
  createScatterplotLayerPropsMock.mockReturnValue({
    data: [{}],
    getPosition: () => [0, 0]
  });
  createPolygonFillColorAttributeMock.mockImplementation(
    (
      polyData: { featureIds?: Uint32Array },
      getFillColor: (featureId: number) => [number, number, number, number]
    ) => ({
      value: new Uint8ClampedArray(getFillColor(polyData.featureIds?.[0] ?? 0)),
      size: 4
    })
  );
  pathColorAttrMock.mockReturnValue({
    value: new Uint8ClampedArray([0, 0, 0, 255]),
    size: 4
  });
  pathWidthAttrMock.mockReturnValue({
    value: new Float32Array([3]),
    size: 1
  });
  parsePointDataMock.mockReturnValue({});
  parsePointDataWithProjectionMock.mockReturnValue({});
  pointPositionsMock.mockImplementation(
    (pointData: { positions?: Float32Array | Float64Array }) =>
      pointData.positions ?? new Float32Array()
  );
});

describe('resolveSplitMappingFeatureIdColumn', () => {
  it('prefers the split geometry feature id column when the table still exposes it', () => {
    const table = createTableWithFields(['__feature_id__', 'label']);

    expect(resolveSplitMappingFeatureIdColumn(table, '__feature_id__')).toBe(
      '__feature_id__'
    );
  });

  it('falls back to basemap_id for representative point tables built from joined datasets', () => {
    const table = createTableWithFields(['basemap_id', 'label']);

    expect(resolveSplitMappingFeatureIdColumn(table, '__feature_id__')).toBe(
      'basemap_id'
    );
  });
});

describe('resolveEffectiveCategoryColorMap', () => {
  it('rebuilds categorical colors when labels stay same but palette changes', () => {
    const staleColorMap = new Map([
      ['North', hexToRgb('#ff0000')],
      ['South', hexToRgb('#00ff00')]
    ]);

    const resolvedColorMap = resolveEffectiveCategoryColorMap(
      createCategoryTable(['North', 'South']),
      createCategoricalSymbolVisualization(['#123456', '#abcdef']),
      staleColorMap,
      'category',
      PrimitiveFilterType.POINT
    );

    expect(resolvedColorMap).not.toBe(staleColorMap);
    expect(resolvedColorMap?.get('North')).toEqual(hexToRgb('#123456'));
    expect(resolvedColorMap?.get('South')).toEqual(hexToRgb('#abcdef'));
  });

  it('keeps existing categorical map when labels and colors already match', () => {
    const currentColorMap = new Map([
      ['North', hexToRgb('#123456')],
      ['South', hexToRgb('#abcdef')]
    ]);

    const resolvedColorMap = resolveEffectiveCategoryColorMap(
      createCategoryTable(['North', 'South']),
      createCategoricalSymbolVisualization(['#123456', '#abcdef']),
      currentColorMap,
      'category',
      PrimitiveFilterType.POINT
    );

    expect(resolvedColorMap).toBe(currentColorMap);
  });
});

describe('binary scatter styling refresh', () => {
  it('clones shared scatterplot binary data before overriding fill/line/radius attributes', () => {
    expect(source).toContain('function cloneScatterBinaryData');
    expect(source).toContain('attributes: { ...sourceData.attributes }');
    const cloneCalls = source.match(/cloneScatterBinaryData\(scatterProps\)/g);
    expect(cloneCalls).not.toBeNull();
    expect((cloneCalls ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('applies secondary text bold and italic styles to the label layer', () => {
    expect(source).toContain("secondaryLabelsConfig.bold ? '700' : '400'");
    expect(source).toContain('secondaryLabelsConfig.italic');
    expect(source).toContain(
      'resolveDeckTextFontFamily(secondaryLabelsConfig.fontFamily)'
    );
    expect(source).toContain(
      'resolveDeckTextFontFamily(textConfig.fontFamily)'
    );
  });

  it('wires disabled category labels into text categorical rendering', () => {
    expect(source).toContain('textClassification?.disabledLabels ?? []');
    expect(source).toContain('textClassification?.disabledLabels,');
  });
});

describe('createTextOverlayLayers', () => {
  it('wraps text labels and places labels to the right when symbols are rendered', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1]),
      positions: new Float32Array([0, 0, 10, 10])
    });

    const visualization = createTextVisualization();
    const layers = createDeckLayers(
      createTableWithRows(
        [
          { name: 'Short label', metric: 10 },
          { name: 'A very long label that should wrap', metric: 90 }
        ],
        ['name', 'metric']
      ),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const textLayer = layers.find((layer) => layer instanceof TextLayer) as
      | TextLayer
      | undefined;
    const textProps = textLayer?.props as
      | {
          data: unknown[];
          maxWidth?: number;
          getTextAnchor?: (datum: unknown) => string;
          getPixelOffset?: (datum: unknown) => [number, number];
        }
      | undefined;
    const datum = textProps?.data[0];
    expect(textProps?.maxWidth).toBe(10);
    expect(textProps?.getTextAnchor?.(datum)).toBe('start');
    expect(textProps?.getPixelOffset?.(datum)).toEqual([9, 0]);
  });

  it('supports classed text sizes using the selected maximum size', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1]),
      positions: new Float32Array([0, 0, 10, 10])
    });

    const visualization = createTextVisualization();
    visualization.text = {
      ...visualization.text!,
      sizeMode: SizeMode.CLASSES,
      valueColumn: 'metric',
      size: 64,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 3,
        numClasses: 3,
        breaks: [0, 50, 100]
      }
    };

    const layers = createDeckLayers(
      createTableWithRows(
        [
          { name: 'Low', metric: 10 },
          { name: 'High', metric: 90 }
        ],
        ['name', 'metric']
      ),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const textLayer = layers.find((layer) => layer instanceof TextLayer) as
      | TextLayer
      | undefined;
    const getSize = (textLayer?.props as { getSize?: unknown } | undefined)
      ?.getSize as ((datum: { rowIndex: number }) => number) | undefined;

    expect(getSize?.({ rowIndex: 0 })).toBeLessThan(
      getSize?.({ rowIndex: 1 }) ?? 0
    );
    expect(getSize?.({ rowIndex: 1 })).toBeLessThanOrEqual(64);
    expect(textLayer?.props.updateTriggers?.getSize).toContain(
      visualization.text.classification?.breaks
    );
  });

  it('keeps centroid labels centered and ignores legacy text background boxes', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0])
    });

    const visualization = createTextVisualization();
    visualization.primitiveFilters = [PrimitiveFilterType.TEXT];
    visualization.symbol = { ...visualization.symbol!, enabled: false };
    visualization.text = {
      ...visualization.text!,
      background: {
        ...visualization.text!.background,
        fillMode: FillMode.UNIQUE,
        fillColor: '#ff0000',
        fillOpacity: 1,
        strokeMode: StrokeMode.UNIQUE,
        strokeColor: '#00ff00',
        strokeWidth: 4,
        strokeOpacity: 1
      }
    };

    const layers = createDeckLayers(
      createTableWithRows([{ name: 'Centroid' }], ['name']),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const textLayer = layers.find((layer) => layer instanceof TextLayer) as
      | TextLayer
      | undefined;
    const textProps = textLayer?.props as
      | {
          data: unknown[];
          getTextAnchor?: (datum: unknown) => string;
          getPixelOffset?: (datum: unknown) => [number, number];
          getBackgroundColor?:
            | ((datum: unknown) => [number, number, number, number])
            | [number, number, number, number];
          getBorderWidth?: number;
        }
      | undefined;
    const datum = textProps?.data[0];
    const backgroundColor = textProps?.getBackgroundColor;
    const resolvedBackgroundColor =
      typeof backgroundColor === 'function'
        ? backgroundColor(datum)
        : backgroundColor;

    expect(textProps?.getTextAnchor?.(datum)).toBe('middle');
    expect(textProps?.getPixelOffset?.(datum)).toEqual([0, 0]);
    expect(resolvedBackgroundColor).toEqual([0, 0, 0, 0]);
    expect(textProps?.getBorderWidth).toBe(0);
  });

  it('places text labels above point layers when primitiveOrder lists TEXT first', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0])
    });

    const visualization = createTextVisualization();
    visualization.primitiveFilters = [
      PrimitiveFilterType.TEXT,
      PrimitiveFilterType.POINT
    ];
    visualization.primitiveOrder = [
      PrimitiveFilterType.TEXT,
      PrimitiveFilterType.POINT
    ];

    const layers = createDeckLayers(
      createTableWithRows([{ name: 'A' }], ['name']),
      {
        ...createContext(visualization),
        primitiveOrder: visualization.primitiveOrder,
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const ids = layers.map((layer) => String(layer.id));
    const pointIndex = ids.findIndex((id) => id.startsWith('point-layer'));
    const textIndex = ids.findIndex((id) => id.startsWith('text-layer'));
    expect(pointIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(pointIndex);
  });

  it('places text labels below point layers when primitiveOrder lists POINT first', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0])
    });

    const visualization = createTextVisualization();
    visualization.primitiveFilters = [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ];
    visualization.primitiveOrder = [
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ];

    const layers = createDeckLayers(
      createTableWithRows([{ name: 'A' }], ['name']),
      {
        ...createContext(visualization),
        primitiveOrder: visualization.primitiveOrder,
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const ids = layers.map((layer) => String(layer.id));
    const pointIndex = ids.findIndex((id) => id.startsWith('point-layer'));
    const textIndex = ids.findIndex((id) => id.startsWith('text-layer'));
    expect(textIndex).toBeGreaterThanOrEqual(0);
    expect(pointIndex).toBeGreaterThan(textIndex);
  });
});

describe('createPolygonLayers', () => {
  it('projects the pattern overlay in the GeoJSON fallback path', () => {
    const sourceGeoJson: FeatureCollection<Polygon> = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature('keep', 2024),
        createPolygonFeature('drop', 2023)
      ]
    };
    const projectedGeoJson: FeatureCollection<Polygon> = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature('keep-projected', 2024),
        createPolygonFeature('drop-projected', 2023)
      ]
    };

    arrowTableToGeoJSONMock.mockReturnValue(sourceGeoJson);
    projectGeoJSONMock.mockReturnValue(projectedGeoJson);

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(createVisualization(FillMode.UNIQUE))
    );

    const fillLayer = layers.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        !String(layer.props.id).includes('-pattern-')
    ) as GeoJsonLayer | undefined;
    const patternLayer = getPatternLayer(layers);

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJson,
      expect.objectContaining({ stream: expect.any(Function) })
    );
    expect(fillLayer).toBeDefined();
    expect(patternLayer).toBeDefined();
    expect(
      (fillLayer?.props.data as FeatureCollection<Polygon>).features.map(
        (feature) => feature.properties?.id
      )
    ).toEqual(['keep-projected', 'drop-projected']);
    expect(
      (patternLayer?.props.data as FeatureCollection<Polygon>).features.map(
        (feature) => feature.properties?.id
      )
    ).toEqual(['keep-projected', 'drop-projected']);
  });

  it('uses the projected GeoJSON fallback for native polygons when a projection is active', () => {
    const sourceGeoJson: FeatureCollection<Polygon> = {
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    };
    const projectedGeoJson: FeatureCollection<Polygon> = {
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep-projected', 2024)]
    };

    arrowTableToGeoJSONMock.mockReturnValue(sourceGeoJson);
    projectGeoJSONMock.mockReturnValue(projectedGeoJson);

    const layers = createPolygonLayers(
      createTableWithFields([]),
      {
        ...createGeometryInfo(),
        encoding: 'geoarrow.wkb',
        isNativeGeoArrow: true,
        isWkbEncoded: true,
        isGeoJsonEncoded: false
      },
      createContext(createVisualization(FillMode.UNIQUE))
    );

    expect(parseSolidPolygonsMock).not.toHaveBeenCalled();
    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJson,
      expect.objectContaining({ stream: expect.any(Function) })
    );
    expect(layers[0]).toBeInstanceOf(GeoJsonLayer);
  });

  it('uses a distinct layer id for the projected GeoJSON fallback', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);

    const table = createTableWithFields([]);
    const geometryInfo = {
      ...createGeometryInfo(),
      encoding: 'geoarrow.wkb',
      isNativeGeoArrow: true,
      isWkbEncoded: true,
      isGeoJsonEncoded: false
    };
    const projectedLayers = createPolygonLayers(
      table,
      geometryInfo,
      createContext(createVisualization(FillMode.UNIQUE))
    );
    const binaryLayers = createPolygonLayers(table, geometryInfo, {
      ...createContext(createVisualization(FillMode.UNIQUE)),
      customProjection: undefined
    });

    const projectedLayer = projectedLayers.find(
      (layer) => layer instanceof GeoJsonLayer
    );

    expect(projectedLayer?.props.id).toMatch(/-projected-geojson$/);
    expect(binaryLayers[0]?.props.id).not.toBe(projectedLayer?.props.id);
  });

  it('renders GeoJSON polygon fallbacks without a visualization context', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      {
        ...createContext(createVisualization(FillMode.UNIQUE)),
        viz: null
      }
    );

    const polygonLayer = layers.find(
      (layer) => layer instanceof GeoJsonLayer
    ) as GeoJsonLayer | undefined;

    expect(polygonLayer).toBeDefined();
    expect(polygonLayer?.props.filled).toBe(true);
  });

  it('skips the pattern overlay when polygon fill is disabled', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(createVisualization(FillMode.NONE))
    );

    expect(getPatternLayer(layers)).toBeUndefined();
  });

  it('renders representative point symbols in the projected GeoJSON polygon fallback', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      {
        ...createContext(createSymbolVisualization()),
        representativePointTable: createTableWithFields([]),
        representativePointGeometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    expect(projectGeoJSONMock).toHaveBeenCalled();
    expect(parsePointDataWithProjectionMock).toHaveBeenCalled();
    expect(layers.some((layer) => layer instanceof ScatterplotLayer)).toBe(
      true
    );
    expect(
      layers.some(
        (layer) =>
          layer instanceof GeoJsonLayer &&
          String(layer.props.id).startsWith('polygon-layer')
      )
    ).toBe(false);
  });

  it('maps split representative point symbols through representative feature ids', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1]),
      positions: new Float64Array([0, 0, 1, 1])
    });
    createScatterplotLayerPropsMock.mockImplementation((pointData) => ({
      data: {
        length: pointData.length,
        featureIds: pointData.featureIds,
        attributes: {}
      }
    }));

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.PROPORTIONAL,
      sizeColumn: 'population_2023',
      minSize: 2,
      maxSize: 20
    };
    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const representativeTable = createTableWithRows(
      [
        { id: 'FRA', geometry: null },
        { id: 'DEU', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [
        { basemap_id: 'FRA', population_2023: 10 },
        { basemap_id: 'DEU', population_2023: 100 }
      ],
      ['basemap_id', 'population_2023']
    );

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      statistics: { min: 10, max: 100 },
      representativePointTable: representativeTable,
      representativePointGeometryInfo: {
        ...createPointGeometryInfo(),
        type: 'POINT' as GeometryInfo['type']
      },
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });

    const pointLayer = layers.find((layer) =>
      String(layer.props.id).includes('point-layer')
    );
    const radii = (
      pointLayer?.props.data as {
        featureIds?: Uint32Array;
        attributes?: { getRadius?: { value?: Float32Array } };
      }
    )?.attributes?.getRadius?.value;
    const featureIds = (pointLayer?.props.data as { featureIds?: Uint32Array })
      ?.featureIds;

    expect(radii).toBeDefined();
    expect(Array.from(featureIds ?? [])).toEqual([1, 0]);
    expect(radii![0]).toBeGreaterThan(radii![1]);
  });

  it('passes common category patterns to split representative point symbols', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1]),
      positions: new Float64Array([0, 0, 1, 1])
    });
    createScatterplotLayerPropsMock.mockImplementation((pointData) => ({
      data: {
        length: pointData.length,
        featureIds: pointData.featureIds,
        attributes: {}
      }
    }));

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.CATEGORIES,
      categoryColumn: 'kind',
      shape: ShapeType.CIRCLE,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        labels: ['Urban', 'Rural'],
        categoryValues: ['urban', 'rural'],
        colors: ['#3366cc', '#dc3912'],
        patternId: 'dots'
      }
    };
    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const representativeTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [
        { basemap_id: 'DEU', kind: 'urban' },
        { basemap_id: 'FRA', kind: 'rural' }
      ],
      ['basemap_id', 'kind']
    );

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      representativePointTable: representativeTable,
      representativePointGeometryInfo: {
        ...createPointGeometryInfo(),
        type: 'POINT' as GeometryInfo['type']
      },
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });

    const pointLayer = layers.find((layer) =>
      String(layer.props.id).includes('point-layer')
    ) as MultiShapeLayer | undefined;

    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(pointLayer?.props.patternEnabled).toBe(true);
    expect(pointLayer?.props.patternType).toBe(1);
  });

  it('hides disabled split representative symbol categories across fill, stroke and radius attributes', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1]),
      positions: new Float64Array([0, 0, 1, 1])
    });
    createScatterplotLayerPropsMock.mockImplementation((pointData) => ({
      data: {
        length: pointData.length,
        featureIds: pointData.featureIds,
        attributes: {}
      }
    }));

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.CATEGORIES,
      categoryColumn: 'kind',
      strokeMode: StrokeMode.UNIQUE,
      strokeWidth: 3,
      shape: ShapeType.CIRCLE,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        labels: ['Urban', 'Rural'],
        categoryValues: ['urban', 'rural'],
        colors: ['#3366cc', '#dc3912'],
        disabledLabels: ['rural']
      }
    };
    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const representativeTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [
        { basemap_id: 'DEU', kind: 'urban' },
        { basemap_id: 'FRA', kind: 'rural' }
      ],
      ['basemap_id', 'kind']
    );

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      representativePointTable: representativeTable,
      representativePointGeometryInfo: {
        ...createPointGeometryInfo(),
        type: 'POINT' as GeometryInfo['type']
      },
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });

    const pointLayer = layers.find((layer) =>
      String(layer.props.id).includes('point-layer')
    ) as MultiShapeLayer | undefined;
    const layerData = pointLayer?.props.data as
      | {
          attributes?: {
            getFillColor?: { value?: Uint8ClampedArray };
            getLineColor?: { value?: Uint8ClampedArray };
            getRadius?: { value?: Float32Array };
          };
        }
      | undefined;

    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(
      Array.from(layerData?.attributes?.getFillColor?.value ?? [])
    ).toEqual([51, 102, 204, 255, 0, 0, 0, 0]);
    expect(
      Array.from(layerData?.attributes?.getLineColor?.value ?? [])
    ).toEqual([31, 31, 31, 255, 0, 0, 0, 0]);
    expect(Array.from(layerData?.attributes?.getRadius?.value ?? [])).toEqual([
      5, 0
    ]);

    expect(pointLayer?.props.updateTriggers?.getLineColor).toContain(
      visualization.symbol.classification?.disabledLabels
    );
    expect(pointLayer?.props.updateTriggers?.getRadius).toContain(
      visualization.symbol.classification?.disabledLabels
    );
  });

  it('renders the GeoJSON fallback pattern below the polygon stroke', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);

    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 3,
      strokeOpacity: 1,
      classification: {
        ...visualization.polygon!.classification!,
        patternId: 'dots'
      }
    };

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(visualization)
    );
    const layerIds = getLayerIds(layers);
    const fillLayerIndex = layerIds.findIndex(
      (id) => !id.includes('-pattern-') && !id.includes('-stroke')
    );
    const patternLayerIndex = layerIds.findIndex((id) =>
      id.includes('-pattern-')
    );
    const strokeLayerIndex = layerIds.findIndex((id) => id.includes('-stroke'));

    expect(fillLayerIndex).toBeGreaterThanOrEqual(0);
    expect(patternLayerIndex).toBeGreaterThan(fillLayerIndex);
    expect(strokeLayerIndex).toBeGreaterThan(patternLayerIndex);
  });

  it('applies the selected dash pattern to dashed polygon strokes', () => {
    const buildStroke = (pattern: BasemapDottedPattern) => {
      arrowTableToGeoJSONMock.mockReturnValue({
        type: 'FeatureCollection',
        features: [createPolygonFeature('keep', 2024)]
      } satisfies FeatureCollection<Polygon>);

      const visualization = createVisualization(FillMode.UNIQUE);
      visualization.polygon = {
        ...visualization.polygon!,
        strokeMode: StrokeMode.UNIQUE,
        strokeColor: '#000000',
        strokeWidth: 3,
        strokeOpacity: 1,
        strokeDashed: true,
        strokeDashedPattern: pattern
      };

      const layers = createPolygonLayers(
        createTableWithFields([]),
        createGeometryInfo(),
        createContext(visualization)
      );
      const strokeLayer = layers.find((layer) => layer.id.includes('-stroke'));
      const props = strokeLayer?.props as
        | { getDashArray?: [number, number]; capRounded?: boolean }
        | undefined;
      return { dash: props?.getDashArray, capRounded: props?.capRounded };
    };

    const dots = buildStroke(BasemapDottedPattern.DOTS);
    const dashes = buildStroke(BasemapDottedPattern.DASHES);
    const dashDot = buildStroke(BasemapDottedPattern.DASH_DOT);

    expect(dots.dash?.[0]).toBe(0);
    expect(dots.capRounded).toBe(true);
    expect(dashDot.dash).not.toEqual(dashes.dash);
    expect(dashes.capRounded).toBe(false);
  });

  it('fully disables GeoJSON polygon stroke props when contour mode is none', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('keep', 2024)]
    } satisfies FeatureCollection<Polygon>);

    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      strokeMode: StrokeMode.NONE,
      strokeWidth: 3,
      strokeOpacity: 1,
      strokeDashed: true
    };

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(visualization)
    );

    const polygonLayer = layers[0] as GeoJsonLayer;
    const polygonLayerProps = polygonLayer.props as GeoJsonLayer['props'] & {
      getDashArray?: [number, number];
    };

    expect(polygonLayerProps.stroked).toBe(false);
    expect(polygonLayerProps.getLineColor).toEqual([0, 0, 0, 0]);
    expect(polygonLayerProps.extensions).toEqual([]);
    expect(polygonLayerProps.getDashArray).toEqual([0, 0]);
    expect(polygonLayerProps.lineWidthScale).toBe(0);
    expect(polygonLayerProps.lineWidthMinPixels).toBe(0);
  });

  it('propagates polygon missing-data styling to binary choropleth fills', () => {
    const visualization = createVisualization(FillMode.CLASSES);
    visualization.mapping = { valueColumn: 'value' };
    const basePolygon = visualization.polygon!;
    visualization.polygon = {
      ...basePolygon,
      enabled: true,
      fillMode: FillMode.CLASSES,
      valueColumn: 'value',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        breaks: [0, 1],
        colors: ['#d0d7df', '#1b5eaa']
      },
      missingData: {
        show: true,
        shape: MissingDataShape.CIRCLE,
        size: 2,
        color: '#ff00ff'
      }
    };

    const layers = createPolygonLayers(
      createTableWithRows([{ value: null }], ['value']),
      {
        ...createGeometryInfo(),
        encoding: 'geoarrow.polygon',
        isNativeGeoArrow: true,
        isGeoJsonEncoded: false
      },
      {
        ...createContext(visualization),
        customProjection: undefined
      }
    );

    const fillLayer = layers[0];
    const fillColorAttribute = (
      fillLayer?.props.data as {
        attributes: { getFillColor?: { value: Uint8ClampedArray } };
      }
    ).attributes.getFillColor;

    expect(createPolygonFillColorAttributeMock).toHaveBeenCalled();
    expect(fillColorAttribute).toBeDefined();
    expect(fillColorAttribute?.value).toEqual(
      new Uint8ClampedArray([255, 0, 255, 255])
    );
    expect(fillLayer?.props.updateTriggers?.getFillColor).toEqual(
      expect.arrayContaining(['#ff00ff', true])
    );
  });

  it('keeps disabled GeoJSON polygon categories transparent', () => {
    const disabledFeature: Feature<Polygon, { segment: string }> = {
      type: 'Feature',
      properties: { segment: 'Pause' },
      geometry: createPolygonFeature('disabled', 2024).geometry
    };
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [disabledFeature]
    } satisfies FeatureCollection<Polygon>);

    const visualization = createVisualization(FillMode.CATEGORIES);
    visualization.type = VisualizationType.CATEGORICAL;
    visualization.mapping = { categoryColumn: 'segment' };
    visualization.polygon = {
      ...visualization.polygon!,
      fillMode: FillMode.CATEGORIES,
      categoryColumn: 'segment',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        labels: ['Active', 'Pause'],
        categoryValues: ['Active', 'Pause'],
        colors: ['#3366cc', '#dc3912'],
        disabledLabels: ['Pause']
      }
    };

    const layers = createPolygonLayers(
      createTableWithRows([{ segment: 'Pause' }], ['segment']),
      createGeometryInfo(),
      createContext(visualization)
    );

    const polygonLayer = layers.find(
      (layer) => layer instanceof GeoJsonLayer
    ) as GeoJsonLayer | undefined;
    const getFillColor = polygonLayer?.props.getFillColor as
      | ((feature: typeof disabledFeature) => [number, number, number, number])
      | undefined;

    expect(getFillColor?.(disabledFeature)).toEqual([0, 0, 0, 0]);
  });

  it('maps split polygon choropleth fills through geometry ids and dataset basemap ids', () => {
    createPolygonFillColorAttributeMock.mockImplementation(
      (
        polyData: { featureIds?: Uint32Array },
        getFillColor: (featureId: number) => [number, number, number, number]
      ) => {
        const featureIds = Array.from(polyData.featureIds ?? new Uint32Array());
        return {
          value: new Uint8ClampedArray(
            featureIds.flatMap((featureId) =>
              Array.from(getFillColor(featureId))
            )
          ),
          size: 4
        };
      }
    );
    parseSolidPolygonsMock.mockReturnValue({
      featureIds: new Uint32Array([0, 1])
    });

    const visualization = createVisualization(FillMode.CLASSES);
    visualization.mapping = { valueColumn: 'growth_rate' };
    visualization.polygon = {
      ...visualization.polygon!,
      enabled: true,
      fillMode: FillMode.CLASSES,
      valueColumn: 'growth_rate',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 3,
        numClasses: 3,
        breaks: [1, 2],
        colors: ['#2166ac', '#f7f7f7', '#b2182b']
      }
    };

    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [
        { basemap_id: 'FRA', growth_rate: 2.5 },
        { basemap_id: 'DEU', growth_rate: 0.5 }
      ],
      ['basemap_id', 'growth_rate']
    );

    const layers = createPolygonLayers(
      geometryTable,
      {
        ...createGeometryInfo(),
        encoding: 'geoarrow.polygon',
        isNativeGeoArrow: true,
        isGeoJsonEncoded: false
      },
      {
        ...createContext(visualization),
        customProjection: undefined,
        splitDatasetTable: datasetTable,
        splitFeatureIdColumn: 'id'
      }
    );

    const fillLayer = layers[0];
    const fillColorAttribute = (
      fillLayer?.props.data as {
        attributes: { getFillColor?: { value: Uint8ClampedArray } };
      }
    ).attributes.getFillColor;

    expect(fillColorAttribute?.value).toEqual(
      new Uint8ClampedArray([33, 102, 172, 255, 178, 24, 43, 255])
    );
  });

  it('keeps unmatched split polygons transparent for unique binary fills', () => {
    createPolygonFillColorAttributeMock.mockImplementation(
      (
        polyData: { featureIds?: Uint32Array },
        getFillColor: (featureId: number) => [number, number, number, number]
      ) => {
        const featureIds = Array.from(polyData.featureIds ?? new Uint32Array());
        return {
          value: new Uint8ClampedArray(
            featureIds.flatMap((featureId) =>
              Array.from(getFillColor(featureId))
            )
          ),
          size: 4
        };
      }
    );
    parseSolidPolygonsMock.mockReturnValue({
      featureIds: new Uint32Array([0, 1])
    });

    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      fillColor: '#ff0000',
      classification: undefined
    };
    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'ESP', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [{ basemap_id: 'DEU', value: 10 }],
      ['basemap_id', 'value']
    );

    const layers = createPolygonLayers(
      geometryTable,
      {
        ...createGeometryInfo(),
        encoding: 'geoarrow.polygon',
        isNativeGeoArrow: true,
        isGeoJsonEncoded: false
      },
      {
        ...createContext(visualization),
        customProjection: undefined,
        splitDatasetTable: datasetTable,
        splitFeatureIdColumn: 'id'
      }
    );
    const fillLayer = layers[0];
    const fillColorAttribute = (
      fillLayer?.props.data as {
        attributes: { getFillColor?: { value: Uint8ClampedArray } };
      }
    ).attributes.getFillColor;

    expect(fillColorAttribute?.value).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0])
    );
  });

  it('maps split projected GeoJSON choropleth fills through geometry ids and dataset basemap ids', () => {
    const visualization = createVisualization(FillMode.CLASSES);
    visualization.mapping = { valueColumn: 'growth_rate' };
    visualization.polygon = {
      ...visualization.polygon!,
      enabled: true,
      fillMode: FillMode.CLASSES,
      valueColumn: 'growth_rate',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 3,
        numClasses: 3,
        breaks: [1, 2],
        colors: ['#2166ac', '#f7f7f7', '#b2182b']
      }
    };

    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'FRA', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [
        { basemap_id: 'FRA', growth_rate: 2.5 },
        { basemap_id: 'DEU', growth_rate: 0.5 }
      ],
      ['basemap_id', 'growth_rate']
    );
    const geojson = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature('DEU', 2024),
        createPolygonFeature('FRA', 2024)
      ]
    } satisfies FeatureCollection<Polygon>;
    arrowTableToGeoJSONMock.mockReturnValue(geojson);

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });

    const fillLayer = layers.find((layer) => layer instanceof GeoJsonLayer) as
      | GeoJsonLayer
      | undefined;
    const getFillColor = fillLayer?.props.getFillColor as
      | ((feature: Feature<Polygon, { id: string; year: number }>) => number[])
      | undefined;

    expect(projectGeoJSONMock).toHaveBeenCalled();
    expect(getFillColor?.(createPolygonFeature('DEU', 2024))).toEqual([
      33, 102, 172, 255
    ]);
    expect(getFillColor?.(createPolygonFeature('FRA', 2024))).toEqual([
      178, 24, 43, 255
    ]);
  });

  it('keeps unmatched split polygons transparent for unique GeoJSON fills and pattern overlays', () => {
    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      fillColor: '#ff0000'
    };
    const geometryTable = createTableWithRows(
      [
        { id: 'DEU', geometry: null },
        { id: 'ESP', geometry: null }
      ],
      ['id', 'geometry']
    );
    const datasetTable = createTableWithRows(
      [{ basemap_id: 'DEU', value: 10 }],
      ['basemap_id', 'value']
    );
    const geojson = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature('DEU', 2024),
        createPolygonFeature('ESP', 2024)
      ]
    } satisfies FeatureCollection<Polygon>;
    arrowTableToGeoJSONMock.mockReturnValue(geojson);

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });
    const fillLayer = layers.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        !String(layer.props.id).includes('-pattern-')
    ) as GeoJsonLayer | undefined;
    const getFillColor = fillLayer?.props.getFillColor as
      | ((feature: Feature<Polygon, { id: string; year: number }>) => number[])
      | undefined;
    const patternLayer = getPatternLayer(layers);
    const patternData = patternLayer?.props.data as FeatureCollection<Polygon>;

    expect(getFillColor?.(createPolygonFeature('DEU', 2024))).toEqual([
      255, 0, 0, 255
    ]);
    expect(getFillColor?.(createPolygonFeature('ESP', 2024))).toEqual([
      0, 0, 0, 0
    ]);
    expect(
      patternData.features.map((feature) => feature.properties?.id)
    ).toEqual(['DEU']);
  });

  it('renders the binary polygon pattern below the stroke layer', () => {
    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#ffffff',
      strokeWidth: 3,
      strokeOpacity: 1,
      classification: {
        ...visualization.polygon!.classification!,
        patternId: 'dots'
      }
    };

    const layers = createPolygonLayers(
      createTableWithFields([]),
      {
        ...createGeometryInfo(),
        encoding: 'geoarrow.polygon',
        isNativeGeoArrow: true,
        isGeoJsonEncoded: false
      },
      {
        ...createContext(visualization),
        customProjection: undefined
      }
    );
    const layerIds = getLayerIds(layers);
    const fillLayerIndex = layerIds.findIndex(
      (id) => !id.includes('-pattern-') && !id.includes('-stroke')
    );
    const patternLayerIndex = layerIds.findIndex((id) =>
      id.includes('-pattern-')
    );
    const strokeLayerIndex = layerIds.findIndex((id) => id.includes('-stroke'));

    expect(fillLayerIndex).toBeGreaterThanOrEqual(0);
    expect(patternLayerIndex).toBeGreaterThan(fillLayerIndex);
    expect(strokeLayerIndex).toBeGreaterThan(patternLayerIndex);
  });

  it('applies polygon pattern params to the rendered pattern layer', () => {
    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      classification: {
        ...visualization.polygon!.classification!,
        patternId: 'diagonal',
        patternParams: {
          angle: 315,
          size: 9,
          scale: 16
        }
      }
    };

    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPolygonFeature('patterned', 2024)]
    });

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(visualization)
    );
    const patternLayer = getPatternLayer(layers);
    const patternLayerProps = patternLayer?.props as
      | Record<string, unknown>
      | undefined;

    expect(getPatternAtlasForPatternMock).toHaveBeenCalledWith('diagonal', {
      angle: 315,
      size: 9,
      scale: 16
    });
    expect(patternLayerProps?.getFillPatternScale).toBe(400);
    expect(patternLayerProps?.getFillPatternRotation).toBe(315);
    expect(patternLayer?.props.updateTriggers).toMatchObject({
      getFillPatternScale: [400],
      getFillPatternRotation: [315]
    });
  });

  it('renders a missing-data pattern overlay only for missing polygon class values', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          ...createPolygonFeature('missing', 2024),
          properties: { id: 'missing', metric: null }
        },
        {
          ...createPolygonFeature('known', 2024),
          properties: { id: 'known', metric: 12 }
        }
      ]
    } satisfies FeatureCollection<Polygon>;
    arrowTableToGeoJSONMock.mockReturnValue(geojson);

    const visualization = createVisualization(FillMode.CLASSES);
    visualization.mapping = { valueColumn: 'metric' };
    visualization.missingData = {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 2,
      color: '#c6c6c6',
      pattern: true
    };
    visualization.polygon = {
      ...visualization.polygon!,
      valueColumn: 'metric',
      missingData: visualization.missingData,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        numClasses: 2,
        breaks: [10],
        colors: ['#2166ac', '#b2182b']
      }
    };

    const layers = createPolygonLayers(
      createTableWithRows(
        [
          { id: 'missing', metric: null },
          { id: 'known', metric: 12 }
        ],
        ['id', 'metric']
      ),
      createGeometryInfo(),
      createContext(visualization)
    );

    const missingPatternLayer = layers.find((layer) =>
      String(layer.props.id).includes('missing-data-pattern')
    ) as GeoJsonLayer | undefined;
    const patternData = missingPatternLayer?.props.data as
      | FeatureCollection<Polygon>
      | undefined;

    expect(missingPatternLayer).toBeInstanceOf(GeoJsonLayer);
    expect(
      patternData?.features.map((feature) => feature.properties?.id)
    ).toEqual(['missing']);
  });

  it('renders a missing-data pattern overlay for unmapped polygon categories', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          ...createPolygonFeature('known', 2024),
          properties: { id: 'known', segment: 'known' }
        },
        {
          ...createPolygonFeature('unknown', 2024),
          properties: { id: 'unknown', segment: 'unknown' }
        }
      ]
    } satisfies FeatureCollection<Polygon>;
    arrowTableToGeoJSONMock.mockReturnValue(geojson);

    const visualization = createVisualization(FillMode.CATEGORIES);
    visualization.type = VisualizationType.CATEGORICAL;
    visualization.mapping = { categoryColumn: 'segment' };
    visualization.missingData = {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 2,
      color: '#c6c6c6',
      pattern: true
    };
    visualization.polygon = {
      ...visualization.polygon!,
      fillMode: FillMode.CATEGORIES,
      categoryColumn: 'segment',
      missingData: visualization.missingData,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 1,
        labels: ['known'],
        categoryValues: ['known'],
        colors: ['#2166ac']
      }
    };

    const layers = createPolygonLayers(
      createTableWithRows(
        [
          { id: 'known', segment: 'known' },
          { id: 'unknown', segment: 'unknown' }
        ],
        ['id', 'segment']
      ),
      createGeometryInfo(),
      createContext(visualization)
    );

    const missingPatternLayer = layers.find((layer) =>
      String(layer.props.id).includes('missing-data-pattern')
    ) as GeoJsonLayer | undefined;
    const patternData = missingPatternLayer?.props.data as
      | FeatureCollection<Polygon>
      | undefined;

    expect(missingPatternLayer).toBeInstanceOf(GeoJsonLayer);
    expect(
      patternData?.features.map((feature) => feature.properties?.id)
    ).toEqual(['unknown']);
  });

  it('renders density from the dedicated density table without falling back to polygon fill', () => {
    const visualization = createVisualization(FillMode.DENSITY);
    visualization.density = {
      valueColumn: 'value',
      ratio: 250
    };

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      {
        ...createContext(visualization),
        customProjection: undefined,
        densityTable: createTableWithFields([]),
        densityGeometryInfo: createPointGeometryInfo()
      }
    );

    expect(
      layers.some(
        (layer) =>
          layer instanceof ScatterplotLayer &&
          String(layer.props.id).includes('-density')
      )
    ).toBe(true);
    const densityLayer = layers.find(
      (layer) =>
        layer instanceof ScatterplotLayer &&
        String(layer.props.id).includes('-density')
    ) as ScatterplotLayer | undefined;
    expect(densityLayer).toBeDefined();
    expect(
      (densityLayer?.props as Record<string, unknown>).radiusMinPixels
    ).toBe(0);
    expect(arrowTableToGeoJSONMock).not.toHaveBeenCalled();
  });
});

describe('createPointSymbolIcon (non-circle symbol sharpness)', () => {
  it('rasterizes the icon at 256px over a 64-unit viewBox so large Carré/Barre/Pic stay sharp', () => {
    const icon = createPointSymbolIcon(
      ShapeType.SQUARE,
      [255, 0, 0, 255],
      [0, 0, 0, 255],
      1
    );

    expect(icon.width).toBe(256);
    expect(icon.height).toBe(256);
    expect(icon.anchorX).toBe(128);
    expect(icon.anchorY).toBe(128);

    const svg = decodeURIComponent(
      icon.url.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
    );
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain('viewBox="0 0 64 64"');
  });

  it('renders true dots, dashes and dash-dot distinctly on the icon stroke', () => {
    const svgOf = (icon: { url: string }): string =>
      decodeURIComponent(
        icon.url.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
      );
    const dashOf = (icon: { url: string }): string | null =>
      svgOf(icon).match(/stroke-dasharray="([^"]+)"/)?.[1] ?? null;
    const capOf = (icon: { url: string }): string | null =>
      svgOf(icon).match(/stroke-linecap="([^"]+)"/)?.[1] ?? null;

    const solid = createPointSymbolIcon(
      ShapeType.CIRCLE,
      [255, 0, 0, 255],
      [0, 0, 0, 255],
      2,
      false
    );
    const dots = createPointSymbolIcon(
      ShapeType.CIRCLE,
      [255, 0, 0, 255],
      [0, 0, 0, 255],
      2,
      true,
      [0, 2.5],
      true
    );
    const dashes = createPointSymbolIcon(
      ShapeType.CIRCLE,
      [255, 0, 0, 255],
      [0, 0, 0, 255],
      2,
      true,
      [3, 2.5],
      false
    );
    const dashDot = createPointSymbolIcon(
      ShapeType.CIRCLE,
      [255, 0, 0, 255],
      [0, 0, 0, 255],
      2,
      true,
      [3, 2.5, 0, 2.5],
      true
    );

    expect(dashOf(solid)).toBeNull();
    // dots are round caps; plain dashes are squared (butt) caps
    expect(capOf(dots)).toBe('round');
    expect(capOf(dashes)).toBe('butt');
    // a real round dot is a 0-length segment + round caps (not a tiny dash)
    expect(dashOf(dots)?.split(/\s+/)[0]).toBe('0.01');
    // dash-dot is a real 4-segment pattern (dash, gap, dot, gap) with a 0-length dot
    expect(dashOf(dashes)?.split(/\s+/)).toHaveLength(2);
    expect(dashOf(dashDot)?.split(/\s+/)).toHaveLength(4);
    expect(dashOf(dashDot)?.split(/\s+/)[2]).toBe('0.01');
    // every style produces a visually distinct dash pattern
    expect(new Set([dashOf(dots), dashOf(dashes), dashOf(dashDot)]).size).toBe(
      3
    );
  });
});

describe('createPointLayers', () => {
  it('fully disables point circle stroke props when contour mode is none', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [createPointFeature('keep', 2024)]
    } satisfies FeatureCollection<Point>);

    const layers = createPointLayers(
      createTableWithFields([]),
      createPointGeometryInfo(),
      createContext(createSymbolVisualization())
    );

    const pointLayer = layers[0] as ScatterplotLayer;

    expect(pointLayer).toBeInstanceOf(ScatterplotLayer);
    expect(pointLayer.props.stroked).toBe(false);
    expect(pointLayer.props.lineWidthScale).toBe(0);
    expect(pointLayer.props.getLineColor).toEqual([0, 0, 0, 0]);
  });

  it('builds binary point color attributes when a symbol category is disabled', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0])
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.CATEGORIES,
      categoryColumn: 'category',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 1,
        labels: ['Pause label'],
        categoryValues: ['Pause'],
        colors: ['#3366cc'],
        disabledLabels: ['Pause']
      }
    };

    const layers = createPointLayers(
      createTableWithRows([{ category: 'Pause' }], ['category']),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as ScatterplotLayer;
    const layerData = pointLayer.props.data;

    expect(pointLayer).toBeInstanceOf(ScatterplotLayer);
    expect(hasScatterBinaryTestData(layerData)).toBe(true);

    if (!hasScatterBinaryTestData(layerData)) {
      return;
    }

    const fillTriggers = pointLayer.props.updateTriggers
      ?.getFillColor as unknown[];
    const radiusTriggers = pointLayer.props.updateTriggers
      ?.getRadius as unknown[];
    const lineTriggers = pointLayer.props.updateTriggers
      ?.getLineColor as unknown[];

    expect(fillTriggers).toContain(
      visualization.symbol.classification?.categoryValues
    );
    expect(fillTriggers).toContain(
      visualization.symbol.classification?.disabledLabels
    );
    expect(radiusTriggers).toContain(
      visualization.symbol.classification?.disabledLabels
    );
    expect(lineTriggers).toContain(
      visualization.symbol.classification?.disabledLabels
    );

    const fillColorAttribute = layerData.attributes.getFillColor;
    if (!fillColorAttribute) {
      expect(fillColorAttribute).toBeDefined();
      return;
    }

    expect(Array.from(fillColorAttribute.value)).toEqual([0, 0, 0, 0]);
  });

  it('uses MultiShapeLayer for categorical point patterns even with circle symbols', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0])
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: {
        attributes: {},
        featureIds: new Uint32Array([0])
      }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.CATEGORIES,
      categoryColumn: 'category',
      shape: ShapeType.CIRCLE,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 1,
        labels: ['North'],
        categoryValues: ['north'],
        colors: ['#3366cc'],
        patternId: 'cross'
      }
    };

    const layers = createPointLayers(
      createTableWithRows([{ category: 'north' }], ['category']),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as MultiShapeLayer;

    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(pointLayer.props.patternEnabled).toBe(true);
    expect(pointLayer.props.patternType).toBe(3);
  });

  it('uses zero-based square-root radii and sorts proportional point buffers by descending radius', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 3,
      featureIds: new Uint32Array([0, 1, 2])
    });
    createScatterplotLayerPropsMock.mockImplementation((pointData) => ({
      data: {
        length: pointData.length,
        featureIds: pointData.featureIds,
        attributes: {
          getPosition: {
            value: new Float32Array([0, 0, 10, 10, 20, 20]),
            size: 2
          }
        }
      }
    }));

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      sizeColumn: 'population',
      minSize: 8,
      maxSize: 40,
      sizeScale: ScaleType.LINEAR
    };

    const layers = createPointLayers(
      createTableWithRows(
        [{ population: 25 }, { population: 100 }, { population: 0 }],
        ['population']
      ),
      createPointGeometryInfo(),
      {
        ...createContext(visualization),
        statistics: { min: 25, max: 100 }
      }
    );

    const pointLayer = layers[0] as ScatterplotLayer;
    const layerData = pointLayer.props.data as {
      featureIds?: Uint32Array;
      attributes?: {
        getPosition?: { value?: Float32Array };
        getRadius?: { value?: Float32Array };
      };
    };

    expect(Array.from(layerData.featureIds ?? [])).toEqual([1, 0, 2]);
    expect(Array.from(layerData.attributes?.getRadius?.value ?? [])).toEqual([
      40, 20, 0
    ]);
    expect(Array.from(layerData.attributes?.getPosition?.value ?? [])).toEqual([
      10, 10, 0, 0, 20, 20
    ]);
  });

  it('sorts GeoJSON proportional point fallbacks by descending zero-based radius without pixel clamps', () => {
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'mid', population: 25 },
          geometry: { type: 'Point', coordinates: [0, 0] }
        },
        {
          type: 'Feature',
          properties: { id: 'max', population: 100 },
          geometry: { type: 'Point', coordinates: [1, 1] }
        },
        {
          type: 'Feature',
          properties: { id: 'zero', population: 0 },
          geometry: { type: 'Point', coordinates: [2, 2] }
        }
      ]
    } satisfies FeatureCollection<Point, { id: string; population: number }>);

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      sizeColumn: 'population',
      minSize: 8,
      maxSize: 40
    };

    const layers = createPointLayers(
      createTableWithFields(['geometry', 'population']),
      {
        type: 'Point',
        encoding: 'geojson',
        geoColumn: 'geometry',
        isNativeGeoArrow: false,
        isWkbEncoded: false,
        isGeoJsonEncoded: true
      },
      {
        ...createContext(visualization),
        customProjection: undefined,
        statistics: { min: 25, max: 100 }
      }
    );

    const pointLayer = layers[0] as GeoJsonLayer;
    const layerData = pointLayer.props.data as FeatureCollection<
      Point,
      { id: string; population: number }
    >;
    const getPointRadius = pointLayer.props.getPointRadius as (feature: {
      properties?: Record<string, unknown>;
    }) => number;

    expect(pointLayer).toBeInstanceOf(GeoJsonLayer);
    expect(layerData.features.map((feature) => feature.properties.id)).toEqual([
      'max',
      'mid',
      'zero'
    ]);
    expect(
      layerData.features.map((feature) => getPointRadius(feature))
    ).toEqual([40, 20, 0]);
    expect(
      (pointLayer.props as Record<string, unknown>).pointRadiusMinPixels
    ).toBe(0);
    expect(source).not.toContain('radiusMinPixels');
    expect(source).not.toContain('pointRadiusMinPixels');
  });

  it('sorts each double proportional symbol layer by its own descending radius while preserving feature ids', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 3,
      featureIds: new Uint32Array([0, 1, 2])
    });
    createScatterplotLayerPropsMock.mockImplementation((pointData) => ({
      data: {
        length: pointData.length,
        featureIds: pointData.featureIds,
        attributes: {
          getPosition: {
            value: new Float32Array([0, 0, 10, 10, 20, 20]),
            size: 2
          }
        }
      }
    }));

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.PROPORTIONAL,
      proportionalType: ProportionalType.DOUBLE,
      shape: ShapeType.CIRCLE,
      sizeColumn: 'population',
      valueColumn: 'income',
      minSize: 8,
      maxSize: 40
    };

    const layers = createPointLayers(
      createTableWithRows(
        [
          { population: 25, income: 100 },
          { population: 100, income: 25 },
          { population: 0, income: 0 }
        ],
        ['population', 'income']
      ),
      createPointGeometryInfo(),
      {
        ...createContext(visualization),
        statistics: { min: 25, max: 100 },
        secondaryStatistics: { min: 25, max: 100 }
      }
    );

    const primaryData = layers[0].props.data as {
      featureIds?: Uint32Array;
      attributes?: { getRadius?: { value?: Float32Array } };
    };
    const secondaryData = layers[1].props.data as {
      featureIds?: Uint32Array;
      attributes?: { getRadius?: { value?: Float32Array } };
    };

    expect(Array.from(primaryData.featureIds ?? [])).toEqual([1, 0, 2]);
    expect(Array.from(primaryData.attributes?.getRadius?.value ?? [])).toEqual([
      40, 20, 0
    ]);
    expect(Array.from(secondaryData.featureIds ?? [])).toEqual([0, 1, 2]);
    expect(
      Array.from(secondaryData.attributes?.getRadius?.value ?? [])
    ).toEqual([40, 20, 0]);
  });

  it('separates double proportional symbols in juxtaposition without overlap', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0])
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: {
        attributes: {},
        featureIds: new Uint32Array([0])
      }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.PROPORTIONAL,
      proportionalType: ProportionalType.DOUBLE,
      positionMode: SymbolDoublePosition.JUXTAPOSITION,
      sizeColumn: 'population',
      valueColumn: 'income',
      minSize: 4,
      maxSize: 20
    };

    const layers = createPointLayers(
      createTableWithRows(
        [{ population: 10, income: 20 }],
        ['population', 'income']
      ),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    expect(layers).toHaveLength(2);
    expect(layers[0]).toBeInstanceOf(MultiShapeLayer);
    expect(layers[1]).toBeInstanceOf(MultiShapeLayer);
    expect(layers[0].props.offsetX).toBe(0.5);
    expect(layers[1].props.offsetX).toBe(-0.5);
    expect(layers[0].props.shapeScale).toBe(0.7);
    expect(layers[1].props.shapeScale).toBe(0.7);
    expect(layers[0].props.radiusScale).toBe(2);
    expect(layers[1].props.radiusScale).toBe(2);
  });
});

describe('createLineLayers', () => {
  it('creates native categorical line layers without throwing', () => {
    const visualization: VisualizationConfig = {
      id: 'viz-line-1',
      name: 'Line categorical test',
      type: VisualizationType.CATEGORICAL,
      datasetId: 'dataset-1',
      enabled: true,
      primitiveFilters: [PrimitiveFilterType.LINE],
      line: {
        enabled: true,
        colorMode: ColorMode.CATEGORIES,
        thicknessMode: ThicknessMode.UNIQUE,
        color: '#3366cc',
        width: 3,
        maxWidth: 6,
        opacity: 1,
        dashed: false,
        categoryColumn: 'route_name',
        classification: {
          method: ClassificationMethod.MANUAL,
          classes: 2,
          colors: ['#ff0000', '#00ff00'],
          labels: ['A', 'B']
        }
      },
      style: {
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 1
      },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows([{ route_name: 'A' }], ['route_name']),
      createLineGeometryInfo(),
      {
        ...createContext(visualization),
        customProjection: undefined
      }
    );

    expect(pathColorAttrMock).toHaveBeenCalled();
    expect(layers.some((layer) => layer instanceof PathLayer)).toBe(true);
  });

  it('keeps disabled native categorical line labels transparent', () => {
    pathColorAttrMock.mockImplementationOnce(
      (
        pathData: { featureIds?: Uint32Array },
        getColor: (featureId: number) => [number, number, number, number]
      ) => ({
        value: new Uint8ClampedArray(getColor(pathData.featureIds?.[0] ?? 0)),
        size: 4
      })
    );

    const visualization: VisualizationConfig = {
      id: 'viz-line-disabled-native',
      name: 'Line disabled category test',
      type: VisualizationType.CATEGORICAL,
      datasetId: 'dataset-1',
      enabled: true,
      primitiveFilters: [PrimitiveFilterType.LINE],
      line: {
        enabled: true,
        colorMode: ColorMode.CATEGORIES,
        thicknessMode: ThicknessMode.UNIQUE,
        color: '#3366cc',
        width: 3,
        maxWidth: 6,
        opacity: 0.5,
        dashed: false,
        categoryColumn: 'route_name',
        classification: {
          method: ClassificationMethod.MANUAL,
          classes: 2,
          colors: ['#ff0000', '#00ff00'],
          labels: ['Active', 'Pause'],
          categoryValues: ['Active', 'Pause'],
          disabledLabels: ['Pause']
        }
      },
      style: {
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 1
      },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows([{ route_name: 'Pause' }], ['route_name']),
      createLineGeometryInfo(),
      {
        ...createContext(visualization),
        customProjection: undefined
      }
    );
    const lineLayer = layers[0] as PathLayer;
    const layerData = lineLayer.props.data as {
      attributes?: { getColor?: { value: Uint8ClampedArray } };
    };

    expect(layerData.attributes?.getColor?.value).toEqual(
      new Uint8ClampedArray([0, 0, 0, 0])
    );
  });

  it('keeps disabled GeoJSON categorical line labels transparent', () => {
    const disabledFeature = createLineFeature('disabled', 'Pause');
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [disabledFeature]
    } satisfies FeatureCollection<LineString>);

    const visualization: VisualizationConfig = {
      id: 'viz-line-disabled-geojson',
      name: 'Line disabled GeoJSON category test',
      type: VisualizationType.CATEGORICAL,
      datasetId: 'dataset-1',
      enabled: true,
      primitiveFilters: [PrimitiveFilterType.LINE],
      line: {
        enabled: true,
        colorMode: ColorMode.CATEGORIES,
        thicknessMode: ThicknessMode.UNIQUE,
        color: '#3366cc',
        width: 3,
        maxWidth: 6,
        opacity: 0.5,
        dashed: false,
        categoryColumn: 'route_name',
        classification: {
          method: ClassificationMethod.MANUAL,
          classes: 2,
          colors: ['#ff0000', '#00ff00'],
          labels: ['Active', 'Pause'],
          categoryValues: ['Active', 'Pause'],
          disabledLabels: ['Pause']
        }
      },
      style: {
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 1
      },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows([{ route_name: 'Pause' }], ['route_name']),
      {
        ...createLineGeometryInfo(),
        encoding: 'geojson',
        isNativeGeoArrow: false,
        isGeoJsonEncoded: true
      },
      createContext(visualization)
    );
    const lineLayer = layers.find((layer) => layer instanceof GeoJsonLayer) as
      | GeoJsonLayer
      | undefined;
    const getLineColor = lineLayer?.props.getLineColor as
      | ((feature: typeof disabledFeature) => [number, number, number, number])
      | undefined;

    expect(getLineColor?.(disabledFeature)).toEqual([0, 0, 0, 0]);
  });

  it('wires disabled line categories into Deck color update triggers', () => {
    expect(source).toContain('lineColorClassification?.disabledLabels');
  });

  it('uses the selected dash pattern for dashed GeoJSON line layers', () => {
    const feature = createLineFeature('dashed', 'A');
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [feature]
    } satisfies FeatureCollection<LineString>);

    const visualization: VisualizationConfig = {
      id: 'viz-line-dashed-pattern',
      name: 'Line dashed pattern test',
      type: VisualizationType.CATEGORICAL,
      datasetId: 'dataset-1',
      enabled: true,
      primitiveFilters: [PrimitiveFilterType.LINE],
      line: {
        enabled: true,
        colorMode: ColorMode.UNIQUE,
        thicknessMode: ThicknessMode.UNIQUE,
        color: '#3366cc',
        width: 3,
        maxWidth: 6,
        opacity: 1,
        dashed: true,
        dashedPattern: BasemapDottedPattern.DASHES
      },
      style: {
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 1
      },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows([{ route_name: 'A' }], ['route_name']),
      {
        ...createLineGeometryInfo(),
        encoding: 'geojson',
        isNativeGeoArrow: false,
        isGeoJsonEncoded: true
      },
      createContext(visualization)
    );
    const lineLayer = layers.find((layer) => layer instanceof GeoJsonLayer) as
      | GeoJsonLayer
      | undefined;
    const lineLayerProps = lineLayer?.props as
      | { getDashArray?: (item: TestLineFeature) => [number, number] }
      | undefined;

    expect(lineLayerProps?.getDashArray?.(feature)).toEqual([6, 4]);
  });

  it('renders dotted lines as round dots and dash-dot distinctly from dashes', () => {
    const buildLineLayer = (pattern: BasemapDottedPattern) => {
      const feature = createLineFeature('dashed', 'A');
      arrowTableToGeoJSONMock.mockReturnValue({
        type: 'FeatureCollection',
        features: [feature]
      } satisfies FeatureCollection<LineString>);

      const visualization: VisualizationConfig = {
        id: `viz-line-${pattern}`,
        name: 'Line dash pattern',
        type: VisualizationType.CATEGORICAL,
        datasetId: 'dataset-1',
        enabled: true,
        primitiveFilters: [PrimitiveFilterType.LINE],
        line: {
          enabled: true,
          colorMode: ColorMode.UNIQUE,
          thicknessMode: ThicknessMode.UNIQUE,
          color: '#3366cc',
          width: 3,
          maxWidth: 6,
          opacity: 1,
          dashed: true,
          dashedPattern: pattern
        },
        style: { fillOpacity: 1, strokeOpacity: 1, strokeWidth: 1 },
        mapping: {}
      };

      const layers = createLineLayers(
        createTableWithRows([{ route_name: 'A' }], ['route_name']),
        {
          ...createLineGeometryInfo(),
          encoding: 'geojson',
          isNativeGeoArrow: false,
          isGeoJsonEncoded: true
        },
        createContext(visualization)
      );
      const lineLayer = layers.find(
        (layer) => layer instanceof GeoJsonLayer
      ) as GeoJsonLayer | undefined;
      const props = lineLayer?.props as
        | {
            getDashArray?: (item: TestLineFeature) => [number, number];
            capRounded?: boolean;
          }
        | undefined;
      return {
        dash: props?.getDashArray?.(feature),
        capRounded: props?.capRounded
      };
    };

    const dots = buildLineLayer(BasemapDottedPattern.DOTS);
    const dashes = buildLineLayer(BasemapDottedPattern.DASHES);
    const dashDot = buildLineLayer(BasemapDottedPattern.DASH_DOT);

    expect(dots.dash?.[0]).toBe(0);
    expect(dots.capRounded).toBe(true);

    expect(dashDot.dash).not.toEqual(dashes.dash);
    expect(dashDot.capRounded).toBe(true);

    expect(dashes.capRounded).toBe(false);
  });

  it('applies missing-data color, width and dash style to GeoJSON lines', () => {
    const feature: Feature<
      LineString,
      { id: string; route_name: string; flow: null }
    > = {
      ...createLineFeature('missing', 'A'),
      properties: { id: 'missing', route_name: 'A', flow: null }
    };
    arrowTableToGeoJSONMock.mockReturnValue({
      type: 'FeatureCollection',
      features: [feature]
    } satisfies FeatureCollection<LineString>);

    const visualization: VisualizationConfig = {
      id: 'viz-line-missing-geojson',
      name: 'Line missing data GeoJSON test',
      type: VisualizationType.PROPORTIONAL,
      datasetId: 'dataset-1',
      enabled: true,
      primitiveFilters: [PrimitiveFilterType.LINE],
      line: {
        enabled: true,
        colorMode: ColorMode.UNIQUE,
        thicknessMode: ThicknessMode.PROPORTIONAL,
        color: '#3366cc',
        width: 3,
        maxWidth: 10,
        opacity: 1,
        dashed: false,
        sizeColumn: 'flow',
        missingData: {
          show: true,
          shape: MissingDataShape.CIRCLE,
          size: 7,
          color: '#123456',
          dashed: true,
          dashedPattern: BasemapDottedPattern.LONG_DASH
        }
      },
      style: {
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 1
      },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows(
        [{ route_name: 'A', flow: null }],
        ['route_name', 'flow']
      ),
      {
        ...createLineGeometryInfo(),
        encoding: 'geojson',
        isNativeGeoArrow: false,
        isGeoJsonEncoded: true
      },
      createContext(visualization)
    );
    const lineLayer = layers.find((layer) => layer instanceof GeoJsonLayer) as
      | GeoJsonLayer
      | undefined;
    const lineLayerProps = lineLayer?.props as
      | {
          getLineColor?: (
            item: TestLineFeature
          ) => [number, number, number, number];
          getLineWidth?: (item: TestLineFeature) => number;
          getDashArray?: (item: TestLineFeature) => [number, number];
        }
      | undefined;

    expect(lineLayerProps?.getLineColor?.(feature)).toEqual([18, 52, 86, 255]);
    expect(lineLayerProps?.getLineWidth?.(feature)).toBe(7);
    expect(lineLayerProps?.getDashArray?.(feature)).toEqual([12, 4]);
  });

  it('uses a dedicated thickness classification for classed line widths', () => {
    const visualization: VisualizationConfig = {
      id: 'viz-line-2',
      name: 'Line split classification test',
      type: VisualizationType.CATEGORICAL,
      datasetId: 'dataset-1',
      enabled: true,
      primitiveFilters: [PrimitiveFilterType.LINE],
      lineClassification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        colors: ['#ff0000', '#00ff00'],
        labels: ['A', 'B']
      },
      lineThicknessClassification: {
        method: ClassificationMethod.KMEANS,
        classes: 4,
        numClasses: 4,
        breaks: [10, 20, 30]
      },
      line: {
        enabled: true,
        colorMode: ColorMode.CATEGORIES,
        thicknessMode: ThicknessMode.CLASSES,
        color: '#3366cc',
        width: 3,
        maxWidth: 9,
        opacity: 1,
        dashed: false,
        valueColumn: 'flow',
        categoryColumn: 'route_name',
        classification: {
          method: ClassificationMethod.MANUAL,
          classes: 2,
          colors: ['#ff0000', '#00ff00'],
          labels: ['A', 'B']
        },
        thicknessClassification: {
          method: ClassificationMethod.KMEANS,
          classes: 4,
          numClasses: 4,
          breaks: [10, 20, 30]
        }
      },
      style: {
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 1
      },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows(
        [{ route_name: 'A', flow: 18 }],
        ['route_name', 'flow']
      ),
      createLineGeometryInfo(),
      {
        ...createContext(visualization),
        statistics: { min: 0, max: 40 },
        customProjection: undefined
      }
    );

    const lineLayer = layers[0] as PathLayer;
    const layerData = lineLayer.props.data as {
      attributes?: Record<string, unknown>;
    };

    expect(layerData.attributes?.getWidth).toBeDefined();
    expect(pathColorAttrMock).toHaveBeenCalled();
  });

  it('does not route text contour through legacy background boxes', () => {
    expect(source).not.toContain('textBackgroundConfig');
    expect(source).toContain('outlineWidth: textConfig.halo');
  });
});
