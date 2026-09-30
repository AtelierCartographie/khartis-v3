import {
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer
} from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
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
  SHAPE_ORDINAL,
  ShapeType,
  SizeMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode,
  SLIDER_LIMITS
} from '$lib/features/commons/constants/visualization.constants';
import {
  MAX_TEXT_OUTLINE_WIDTH,
  resolveTextHaloWidthPx
} from './text-character-set';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { GeometryInfo, LayerContext } from '../types';

const {
  createCompatibleSolidPolygonLayerPropsMock,
  createPathLayerPropsMock,
  createPolygonFillColorAttributeMock,
  createScatterplotLayerPropsMock,
  getPatternAtlasForPatternMock,
  getPatternPaletteAtlasMock,
  parsePathsMock,
  parsePathsWithProjectionMock,
  parsePointDataMock,
  parsePointDataWithProjectionMock,
  parseSolidPolygonsMock,
  parseSolidPolygonsWithProjectionMock,
  pathColorAttrMock,
  pathWidthAttrMock,
  pointPositionsMock,
  rowAccessorMock
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
    createCompatibleSolidPolygonLayerPropsMock: vi.fn(),
    createPathLayerPropsMock: vi.fn(),
    createPolygonFillColorAttributeMock: vi.fn(),
    createScatterplotLayerPropsMock: vi.fn(),
    getPatternAtlasForPatternMock: vi.fn(),
    getPatternPaletteAtlasMock: vi.fn(),
    parsePathsMock: vi.fn(),
    parsePathsWithProjectionMock: vi.fn(),
    parsePointDataMock: vi.fn(),
    parsePointDataWithProjectionMock: vi.fn(),
    parseSolidPolygonsMock: vi.fn(),
    parseSolidPolygonsWithProjectionMock: vi.fn(),
    pathColorAttrMock: vi.fn(),
    pathWidthAttrMock: vi.fn(),
    pointPositionsMock: vi.fn(),
    rowAccessorMock: vi.fn()
  };
});

vi.mock('@ateliercartographie/geoarrow-deck-stream', async () => {
  const actual = await vi.importActual<
    typeof import('@ateliercartographie/geoarrow-deck-stream')
  >('@ateliercartographie/geoarrow-deck-stream');

  return {
    ...actual,
    createPathLayerProps: createPathLayerPropsMock,
    createPolygonFillColorAttribute: createPolygonFillColorAttributeMock,
    createScatterplotLayerProps: createScatterplotLayerPropsMock
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
    rowAccessor: rowAccessorMock
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
    getPatternAtlasForPattern: getPatternAtlasForPatternMock,
    getPatternPaletteAtlas: getPatternPaletteAtlasMock
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
  createPolygonLayers,
  resolveEffectiveCategoryColorMap,
  resolveSplitMappingFeatureIdColumn,
  type TextLayerDatum
} from './layer-factory';
import { MultiShapeLayer } from './multi-shape-layer';
import { createHighlightedFeatureOverlay } from './layer-selection-overlays';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { EXPLICIT_TEXT_CHARACTER_SET } from './text-character-set';

const source = [
  'src/lib/features/map/layers/layer-factory.ts',
  'src/lib/features/map/layers/text-layer-factory.ts'
]
  .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
  .join('\n');

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

function createVectorOnlyTableWithRows(
  rows: Record<string, unknown>[],
  fieldNames: string[]
): ArrowTable {
  return {
    numRows: rows.length,
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    },
    get: vi.fn(() => {
      throw new Error('row proxy should not be materialized');
    }),
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
      }
    }
  };
}

function createGeometryInfo(): GeometryInfo {
  return {
    type: 'Polygon',
    encoding: 'geoarrow.polygon',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false
  };
}

function createPointGeometryInfo(): GeometryInfo {
  return {
    type: 'Point',
    encoding: 'geoarrow.point',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false
  };
}

function createLineGeometryInfo(): GeometryInfo {
  return {
    type: 'LineString',
    encoding: 'geoarrow.linestring',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false
  };
}

function getPatternLayer(
  layers: ReturnType<typeof createPolygonLayers>
): SolidPolygonLayer | undefined {
  return layers.find(
    (layer) =>
      layer instanceof SolidPolygonLayer &&
      String(layer.props.id).includes('-pattern-')
  ) as SolidPolygonLayer | undefined;
}

function getLayerIds(layers: ReturnType<typeof createPolygonLayers>): string[] {
  return layers.map((layer) => String(layer.props.id));
}

type ScatterBinaryTestData = {
  attributes: Record<string, { value: Uint8Array } | undefined>;
};

function hasScatterBinaryTestData(
  data: unknown
): data is ScatterBinaryTestData {
  return typeof data === 'object' && data !== null && 'attributes' in data;
}

beforeEach(() => {
  vi.clearAllMocks();
  rowAccessorMock.mockImplementation(
    (
      table: ArrowTable & {
        get?: (index: number) => Record<string, unknown>;
      },
      accessor: (row: Record<string, unknown>) => unknown
    ) =>
      (featureId: number) =>
        accessor(table.get?.(featureId) ?? {})
  );
  getPatternAtlasForPatternMock.mockReturnValue({
    atlas: {} as HTMLCanvasElement,
    mapping: {
      diagonal: { x: 0, y: 0, width: 8, height: 8 },
      dots: { x: 8, y: 0, width: 8, height: 8 }
    }
  });
  getPatternPaletteAtlasMock.mockImplementation(
    (patterns: { type: string }[]) => ({
      atlas: {} as HTMLCanvasElement,
      mapping: Object.fromEntries(
        patterns.map((_, index) => [
          `c${index}`,
          { x: index * 8, y: 0, width: 8, height: 8 }
        ])
      )
    })
  );
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

describe('createTextOverlayLayers', () => {
  it('keeps only the rows the Texts filter scopes on a raw point dataset', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 3,
      featureIds: new Uint32Array([0, 1, 2]),
      positions: new Float32Array([0, 0, 10, 10, 20, 20])
    });

    const visualization = createTextVisualization();
    const layers = createDeckLayers(
      createTableWithRows(
        [
          { __id: 1, name: 'Kept' },
          { __id: 2, name: 'Filtered out' },
          { __id: 3, name: 'Also kept' }
        ],
        ['__id', 'name']
      ),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        },
        scopedPrimitive: PrimitiveFilterType.TEXT,
        scopedRowIdsByPrimitive: {
          [PrimitiveFilterType.TEXT]: new Set([1, 3])
        }
      }
    );

    const textLayer = layers.find(
      (layer) =>
        layer instanceof TextLayer &&
        String(layer.props.id).includes('text-layer')
    ) as TextLayer | undefined;
    const data = textLayer?.props.data as TextLayerDatum[] | undefined;

    expect(data?.map((datum) => datum.primaryText)).toEqual([
      'Kept',
      'Also kept'
    ]);
  });

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
      TextLayer | undefined;
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

  it('uses explicit character sets extended with rendered text glyphs', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0])
    });

    const visualization = createTextVisualization();
    visualization.text = {
      ...visualization.text!,
      secondaryLabels: {
        ...visualization.text!.secondaryLabels,
        enabled: true,
        labelColumn: 'city'
      },
      missingData: {
        ...visualization.text!.missingData!,
        label: '欠測'
      }
    };

    const layers = createDeckLayers(
      createTableWithRows([{ name: '東京', city: '大阪' }], ['name', 'city']),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const primaryLayer = layers.find(
      (layer) =>
        layer instanceof TextLayer &&
        String(layer.props.id).includes('text-layer')
    ) as TextLayer | undefined;
    const secondaryLayer = layers.find(
      (layer) =>
        layer instanceof TextLayer &&
        String(layer.props.id).includes('label-layer')
    ) as TextLayer | undefined;
    const primaryCharacterSet = primaryLayer?.props.characterSet as
      string[] | undefined;
    const secondaryCharacterSet = secondaryLayer?.props.characterSet as
      string[] | undefined;

    expect(primaryCharacterSet).not.toBe('auto');
    expect(primaryCharacterSet).not.toBe(EXPLICIT_TEXT_CHARACTER_SET);
    expect(primaryCharacterSet).toContain('東');
    expect(primaryCharacterSet).toContain('京');
    expect(primaryCharacterSet).toContain('欠');
    expect(primaryCharacterSet).toContain('測');
    expect(secondaryCharacterSet).not.toBe('auto');
    expect(secondaryCharacterSet).not.toBe(EXPLICIT_TEXT_CHARACTER_SET);
    expect(secondaryCharacterSet).toContain('大');
    expect(secondaryCharacterSet).toContain('阪');
  });

  it('logs an error and renders no text layer when binary text layer data fails', () => {
    const binaryError = new Error('binary text failed');
    parsePointDataWithProjectionMock.mockImplementationOnce(() => {
      throw binaryError;
    });
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const visualization = createTextVisualization();
    visualization.primitiveFilters = [PrimitiveFilterType.TEXT];
    visualization.symbol = { ...visualization.symbol!, enabled: false };

    const layers = createDeckLayers(
      createTableWithRows([{ name: 'Binary label' }], ['name']),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    expect(layers.some((layer) => layer instanceof TextLayer)).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to build binary text layer data',
      LogCategory.MAP,
      expect.objectContaining({
        error: binaryError,
        flow: 'text_binary_layer_data',
        extra: expect.objectContaining({
          geometryType: 'POINT',
          geoColumn: 'geometry',
          hasRepresentativePointSource: false,
          hasSecondaryLabel: false
        })
      })
    );
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
      TextLayer | undefined;
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

  it('keeps centroid labels centered without a text background box', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0])
    });

    const visualization = createTextVisualization();
    visualization.primitiveFilters = [PrimitiveFilterType.TEXT];
    visualization.symbol = { ...visualization.symbol!, enabled: false };

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
      TextLayer | undefined;
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

  const resolveTextOutlineProps = (haloWidth: number, textSize: number) => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0])
    });

    const visualization = createTextVisualization();
    visualization.text = {
      ...visualization.text!,
      size: textSize,
      halo: true,
      haloWidth
    };

    const layers = createDeckLayers(
      createTableWithRows([{ name: 'Contour' }], ['name']),
      {
        ...createContext(visualization),
        geometryInfo: {
          ...createPointGeometryInfo(),
          type: 'POINT' as GeometryInfo['type']
        }
      }
    );

    const textLayer = layers.find((layer) => layer instanceof TextLayer) as
      TextLayer | undefined;
    return textLayer?.props as
      | {
          fontSettings?: {
            buffer?: number;
            radius?: number;
            sdf?: boolean;
            smoothing?: number;
          };
          outlineWidth?: number;
        }
      | undefined;
  };

  it('turns the configured contour thickness into that many pixels of halo', () => {
    for (const [haloWidth, textSize] of [
      [0.5, 12],
      [1, 12],
      [2, 12],
      [2, 24]
    ]) {
      const textProps = resolveTextOutlineProps(haloWidth, textSize);
      expect(
        resolveTextHaloWidthPx(textProps?.outlineWidth ?? 0, textSize)
      ).toBeCloseTo(haloWidth, 5);
    }
  });

  it('keeps a thick text contour inside the SDF atlas so the halo is not clipped', () => {
    const textProps = resolveTextOutlineProps(SLIDER_LIMITS.haloWidth.max, 6);

    expect(textProps?.outlineWidth).toBe(MAX_TEXT_OUTLINE_WIDTH);
    expect(textProps?.fontSettings?.sdf).toBe(true);
    expect(MAX_TEXT_OUTLINE_WIDTH * 0.75).toBeLessThan(
      textProps?.fontSettings?.buffer ?? 0
    );
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
  it('projects the pattern overlay from the same binary polygons as the fill', () => {
    const projectedPolygons = {
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0, 1, 0, 1, 1]),
      polygonIndices: new Uint32Array([0, 3]),
      size: 2
    };
    parseSolidPolygonsWithProjectionMock.mockReturnValue(projectedPolygons);
    const context = createContext(createVisualization(FillMode.UNIQUE));

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      context
    );

    const fillLayer = layers.find(
      (layer) =>
        layer instanceof SolidPolygonLayer &&
        !String(layer.props.id).includes('-pattern-')
    );
    const patternLayer = getPatternLayer(layers);

    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      expect.anything(),
      context.customProjection
    );
    expect(fillLayer).toBeDefined();
    expect(patternLayer).toBeInstanceOf(SolidPolygonLayer);
    expect(
      createCompatibleSolidPolygonLayerPropsMock.mock.calls.map(
        ([polyData]) => polyData
      )
    ).toEqual([projectedPolygons, projectedPolygons]);
  });

  it('parses projected WKB polygons through the binary path', () => {
    const context = createContext(createVisualization(FillMode.UNIQUE));
    const layers = createPolygonLayers(
      createTableWithFields([]),
      {
        ...createGeometryInfo(),
        encoding: 'geoarrow.wkb',
        isWkbEncoded: true
      },
      context
    );

    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalledWith(
      expect.anything(),
      context.customProjection
    );
    expect(layers.some((layer) => layer instanceof SolidPolygonLayer)).toBe(
      true
    );
  });

  it('renders binary polygons without a visualization context', () => {
    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      {
        ...createContext(createVisualization(FillMode.UNIQUE)),
        viz: null
      }
    );

    const polygonLayer = layers.find(
      (layer) =>
        layer instanceof SolidPolygonLayer &&
        String(layer.props.id).startsWith('polygon-layer')
    ) as SolidPolygonLayer | undefined;

    expect(polygonLayer).toBeDefined();
    expect(polygonLayer?.props.getFillColor).toEqual([51, 102, 204, 255]);
  });

  it('skips the pattern overlay when polygon fill is disabled', () => {
    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(createVisualization(FillMode.NONE))
    );

    expect(getPatternLayer(layers)).toBeUndefined();
  });

  it('renders representative point symbols over projected binary polygons', () => {
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

    expect(parseSolidPolygonsWithProjectionMock).toHaveBeenCalled();
    expect(parsePointDataWithProjectionMock).toHaveBeenCalled();
    expect(layers.some((layer) => layer instanceof ScatterplotLayer)).toBe(
      true
    );
    expect(
      layers.some(
        (layer) =>
          layer instanceof SolidPolygonLayer &&
          String(layer.props.id).startsWith('polygon-layer')
      )
    ).toBe(false);
  });

  it('maps split representative point symbols through representative feature ids', () => {
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

  it('reads imported-geometry symbol attributes from the representative point table when a POINT filter subsets it', () => {
    // Regression for #201: a Symbols (POINT) filter subsets the
    // representative-point table but not the POLYGON-filtered geometry table.
    // The binary featureIds index the representative-point table, so radii must
    // follow that table's surviving row, not the geometry table's row at the
    // same positional index.
    const singlePointData = {
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float64Array([0, 0])
    };
    parsePointDataMock.mockReturnValue(singlePointData);
    parsePointDataWithProjectionMock.mockReturnValue(singlePointData);
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

    // Full imported geometry: row 0 is the small feature, row 1 the large one.
    const geometryTable = createTableWithRows(
      [
        { population_2023: 10, geometry: null },
        { population_2023: 100, geometry: null }
      ],
      ['population_2023', 'geometry']
    );
    // POINT filter kept only the large feature; it now sits at index 0.
    const representativeTable = createTableWithRows(
      [{ population_2023: 100, geometry: null }],
      ['population_2023', 'geometry']
    );

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      statistics: { min: 10, max: 100 },
      representativePointTable: representativeTable,
      representativePointGeometryInfo: {
        ...createPointGeometryInfo(),
        type: 'POINT' as GeometryInfo['type']
      }
    });

    const pointLayer = layers.find((layer) =>
      String(layer.props.id).includes('point-layer')
    );
    const radii = (
      pointLayer?.props.data as {
        attributes?: { getRadius?: { value?: Float32Array } };
      }
    )?.attributes?.getRadius?.value;

    expect(radii).toBeDefined();
    // Value 100 at domainMax 100 -> the maximum radius (20). Reading the
    // geometry table at index 0 (value 10) would have produced ~6.3.
    expect(radii![0]).toBeCloseTo(20, 5);
  });

  it('does not apply category patterns to split representative point symbols', () => {
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
    expect(
      (pointLayer?.props as Record<string, unknown>).patternEnabled
    ).toBeUndefined();
    expect(
      (pointLayer?.props as Record<string, unknown>).patternAtlas
    ).toBeUndefined();
  });

  it('hides disabled split representative symbol categories across fill, stroke and radius attributes', () => {
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

  it('applies the selected dash pattern to dashed polygon strokes', () => {
    const buildStroke = (pattern: BasemapDottedPattern) => {
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
        { getDashArray?: [number, number]; capRounded?: boolean } | undefined;
      return { dash: props?.getDashArray, capRounded: props?.capRounded };
    };

    const dots = buildStroke(BasemapDottedPattern.DOTS);
    const dashes = buildStroke(BasemapDottedPattern.DASHES);
    const dashDot = buildStroke(BasemapDottedPattern.DASH_DOT);

    expect(dots.dash?.[0]).toBeGreaterThan(0);
    expect(dots.capRounded).toBe(true);
    expect(dashDot.dash).not.toEqual(dashes.dash);
    expect(dashes.capRounded).toBe(false);
  });

  it('omits the binary polygon stroke layer when contour mode is none', () => {
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

    expect(
      layers.some(
        (layer) =>
          layer instanceof SolidPolygonLayer &&
          String(layer.props.id).startsWith('polygon-layer')
      )
    ).toBe(true);
    expect(
      layers.some((layer) => String(layer.props.id).includes('-stroke'))
    ).toBe(false);
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
      createGeometryInfo(),
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

  it('keeps disabled binary polygon categories transparent', () => {
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

    const fillLayer = layers.find(
      (layer) =>
        layer instanceof SolidPolygonLayer &&
        String(layer.props.id).startsWith('polygon-layer') &&
        !String(layer.props.id).includes('-pattern')
    );
    const fillColorAttribute = (
      fillLayer?.props.data as
        | { attributes: { getFillColor?: { value: Uint8ClampedArray } } }
        | undefined
    )?.attributes.getFillColor;

    expect(fillColorAttribute?.value).toEqual(
      new Uint8ClampedArray([0, 0, 0, 0])
    );
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

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      customProjection: undefined,
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });

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

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      customProjection: undefined,
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });
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

  it('keeps unmatched split polygons out of the binary unique fill and pattern overlay', () => {
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

    const layers = createPolygonLayers(geometryTable, createGeometryInfo(), {
      ...createContext(visualization),
      customProjection: undefined,
      splitDatasetTable: datasetTable,
      splitFeatureIdColumn: 'id'
    });
    const readFillColors = (layer: (typeof layers)[number] | undefined) =>
      Array.from(
        (
          layer?.props.data as
            | { attributes: { getFillColor?: { value: Uint8ClampedArray } } }
            | undefined
        )?.attributes.getFillColor?.value ?? []
      );
    const fillLayer = layers.find(
      (layer) =>
        layer instanceof SolidPolygonLayer &&
        !String(layer.props.id).includes('-pattern-')
    );
    const patternFillColors = readFillColors(getPatternLayer(layers));

    expect(readFillColors(fillLayer)).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(patternFillColors[3]).toBe(255);
    expect(patternFillColors.slice(4)).toEqual([0, 0, 0, 0]);
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
      createGeometryInfo(),
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
    expect(getPatternLayer(layers)).toBeInstanceOf(SolidPolygonLayer);
  });

  it('renders a binary missing-data pattern overlay only for missing polygon class values', () => {
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
    const loggerWarn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const visualization = createVisualization(FillMode.CLASSES);
    visualization.mapping = { valueColumn: 'value' };
    visualization.missingData = {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 2,
      color: '#c6c6c6',
      pattern: true
    };
    visualization.polygon = {
      ...visualization.polygon!,
      fillMode: FillMode.CLASSES,
      valueColumn: 'value',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        breaks: [0, 1],
        colors: ['#d0d7df', '#1b5eaa'],
        patternId: 'diagonal'
      },
      missingData: visualization.missingData
    };

    const layers = createPolygonLayers(
      createTableWithRows([{ value: null }, { value: 1 }], ['value']),
      createGeometryInfo(),
      {
        ...createContext(visualization),
        customProjection: undefined
      }
    );

    const patternLayers = layers.filter(
      (layer) =>
        layer instanceof SolidPolygonLayer &&
        String(layer.props.id).includes('-pattern')
    );
    const missingPatternLayer = patternLayers.find((layer) =>
      String(layer.props.id).includes('missing-data-pattern')
    );
    const missingPatternFill = (
      missingPatternLayer?.props.data as {
        attributes: { getFillColor?: { value: Uint8ClampedArray } };
      }
    ).attributes.getFillColor?.value;

    expect(patternLayers).toHaveLength(2);
    expect(missingPatternFill).toEqual(
      new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0])
    );
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('resolves binary selection overlay features through their row id, not their index', () => {
    parseSolidPolygonsMock.mockReturnValue({
      featureIds: new Uint32Array([0, 1])
    });
    parsePathsMock.mockReturnValue({
      length: 2,
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 2, 2]),
      startIndices: new Uint32Array([0, 2, 4]),
      featureIds: new Uint32Array([0, 1]),
      size: 2
    });
    pathColorAttrMock.mockImplementation(
      (
        pathData: { featureIds?: Uint32Array },
        getColor: (featureId: number) => [number, number, number, number]
      ) => {
        const featureIds = Array.from(pathData.featureIds ?? new Uint32Array());
        return {
          value: new Uint8ClampedArray(
            featureIds.flatMap((featureId) => Array.from(getColor(featureId)))
          ),
          size: 4
        };
      }
    );
    pathWidthAttrMock.mockImplementation(
      (
        pathData: { featureIds?: Uint32Array },
        getWidth: (featureId: number) => number
      ) => {
        const featureIds = Array.from(pathData.featureIds ?? new Uint32Array());
        return {
          value: new Float32Array(
            featureIds.map((featureId) => getWidth(featureId))
          ),
          size: 1
        };
      }
    );

    const visualization = createVisualization(FillMode.UNIQUE);
    visualization.polygon = {
      ...visualization.polygon!,
      classification: undefined
    };

    // Row ids are 1-based, so highlighting id 2 must light the feature at
    // index 1 — matching featureIds against row ids picks the wrong entity.
    const layers = createPolygonLayers(
      createTableWithRows([{ __id: 1 }, { __id: 2 }], ['__id']),
      createGeometryInfo(),
      {
        ...createContext(visualization),
        customProjection: undefined,
        highlightedRowIds: new Set([2])
      }
    );

    const selectionLayer = layers.find((layer) =>
      String(layer.props.id).includes('selection-overlay')
    ) as PathLayer | undefined;
    const selectionData = selectionLayer?.props.data as
      | {
          attributes: {
            getColor?: { value: Uint8ClampedArray };
            getWidth?: { value: Float32Array };
          };
        }
      | undefined;

    expect(selectionLayer).toBeInstanceOf(PathLayer);
    expect(selectionData?.attributes.getColor?.value).toEqual(
      new Uint8ClampedArray([0, 0, 0, 0, 15, 98, 254, 255])
    );
    expect(selectionData?.attributes.getWidth?.value).toEqual(
      new Float32Array([0, 3])
    );
  });

  it('logs an error and renders no polygon layer when the binary parse fails', () => {
    const binaryError = new Error('binary polygon failed');
    parseSolidPolygonsMock.mockImplementationOnce(() => {
      throw binaryError;
    });
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      {
        ...createContext(createVisualization(FillMode.UNIQUE)),
        customProjection: undefined
      }
    );

    expect(layers).toEqual([]);
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to create binary polygon layers',
      LogCategory.MAP,
      expect.objectContaining({
        error: binaryError,
        flow: 'polygon_binary_layers',
        extra: expect.objectContaining({
          layerId: expect.stringContaining('polygon-layer'),
          geoColumn: 'geometry',
          arrowExtension: 'geoarrow.polygon',
          geometryType: 'Polygon',
          hasCustomProjection: false
        })
      })
    );
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

    const layers = createPolygonLayers(
      createTableWithFields([]),
      createGeometryInfo(),
      createContext(visualization)
    );
    const patternLayer = getPatternLayer(layers);
    const patternLayerProps = patternLayer?.props as
      Record<string, unknown> | undefined;

    expect(getPatternAtlasForPatternMock).toHaveBeenCalledWith('diagonal', {
      angle: 315,
      size: 9,
      scale: 16
    });
    // size/scale are baked into the atlas tile (asserted above). The shader
    // consumes getFillPatternScale as the tile size in CSS pixels; the design
    // tile edge equals the user's scale slider value, independent of the
    // devicePixelRatio-scaled atlas frame.
    expect(patternLayerProps?.getFillPatternScale).toBe(16);
    expect(patternLayerProps?.getFillPatternRotation).toBe(315);
    expect(patternLayer?.props.updateTriggers).toMatchObject({
      getFillPatternScale: [16],
      getFillPatternRotation: [315]
    });
  });

  it('renders one pattern overlay layer per class with increasing sizes when classification.pattern is set', () => {
    const visualization = createVisualization(FillMode.CLASSES);
    visualization.mapping = { valueColumn: 'metric' };
    visualization.polygon = {
      ...visualization.polygon!,
      valueColumn: 'metric',
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 4,
        numClasses: 4,
        breaks: [10, 20, 30],
        colors: ['#eeeeee', '#cccccc', '#999999', '#333333'],
        pattern: { shape: 'line' }
      }
    };

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
    parseSolidPolygonsWithProjectionMock.mockReturnValue({
      featureIds: new Uint32Array([0, 1, 2, 3])
    });

    const layers = createPolygonLayers(
      createTableWithRows(
        [5, 15, 25, 35].map((metric, index) => ({
          id: `feature-${index}`,
          metric
        })),
        ['id', 'metric']
      ),
      createGeometryInfo(),
      createContext(visualization)
    );

    const classPatternLayers = layers.filter((layer) =>
      String(layer.props.id).includes('-pattern-c')
    );

    expect(classPatternLayers).toHaveLength(4);
    const propsPerClass = classPatternLayers.map(
      (layer) => layer.props as Record<string, unknown>
    );
    propsPerClass.forEach((props, index) => {
      expect((props.getFillPattern as () => string)()).toBe(`c${index}`);
    });
    const sizes = propsPerClass.map(
      (props) => props.khartisPatternSize as number
    );
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    }
    propsPerClass.forEach((props) => {
      expect(props.getFillPatternScale).toBe(7);
      expect(props.opacity).toBe(1);
    });
  });

  it('renders a binary missing-data pattern overlay for unmapped polygon categories', () => {
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
    parseSolidPolygonsWithProjectionMock.mockReturnValue({
      featureIds: new Uint32Array([0, 1])
    });

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
    );
    const missingPatternFill = (
      missingPatternLayer?.props.data as
        | { attributes: { getFillColor?: { value: Uint8ClampedArray } } }
        | undefined
    )?.attributes.getFillColor?.value;

    expect(missingPatternLayer).toBeInstanceOf(SolidPolygonLayer);
    expect(missingPatternFill).toEqual(
      new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255])
    );
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
  });
});

describe('createPointLayers', () => {
  it('fully disables point circle stroke props when contour mode is none', () => {
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

  it('renders every selectable unique symbol shape without SVG icon layers', () => {
    const shapes = [
      ShapeType.CIRCLE,
      ShapeType.SQUARE,
      ShapeType.CROSS,
      ShapeType.DIAMOND,
      ShapeType.TRIANGLE,
      ShapeType.STAR,
      ShapeType.RECTANGLE
    ];

    for (const shape of shapes) {
      parsePointDataWithProjectionMock.mockReturnValue({
        length: 1,
        featureIds: new Uint32Array([0])
      });
      createScatterplotLayerPropsMock.mockReturnValue({
        data: { attributes: {}, featureIds: new Uint32Array([0]) }
      });

      const visualization = createSymbolVisualization();
      visualization.symbol = {
        ...visualization.symbol!,
        shape
      };

      const layers = createPointLayers(
        createTableWithFields([]),
        createPointGeometryInfo(),
        createContext(visualization)
      );

      const pointLayer = layers[0] as ScatterplotLayer | MultiShapeLayer;

      expect(
        (pointLayer.props as Record<string, unknown>).pointType
      ).toBeUndefined();
      if (shape === ShapeType.CIRCLE) {
        expect(pointLayer).toBeInstanceOf(ScatterplotLayer);
      } else {
        expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
        expect((pointLayer as MultiShapeLayer).props.getShape).toBe(
          SHAPE_ORDINAL[shape]
        );
      }
    }
  });

  it('renders proportional square, bar and spike symbols through MultiShapeLayer', () => {
    const shapes = [ShapeType.SQUARE, ShapeType.BAR, ShapeType.SPIKE];

    for (const shape of shapes) {
      parsePointDataWithProjectionMock.mockReturnValue({
        length: 1,
        featureIds: new Uint32Array([0])
      });
      createScatterplotLayerPropsMock.mockReturnValue({
        data: { attributes: {}, featureIds: new Uint32Array([0]) }
      });

      const visualization = createSymbolVisualization();
      visualization.symbol = {
        ...visualization.symbol!,
        mode: SymbolMode.PROPORTIONAL,
        shape,
        sizeColumn: 'population',
        minSize: 4,
        maxSize: 20
      };

      const layers = createPointLayers(
        createTableWithRows([{ population: 100 }], ['population']),
        createPointGeometryInfo(),
        { ...createContext(visualization), statistics: { min: 0, max: 100 } }
      );

      const pointLayer = layers[0] as MultiShapeLayer;
      expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
      expect(pointLayer.props.getShape).toBe(SHAPE_ORDINAL[shape]);
    }
  });

  it('turns off point symbol filling when the background fill mode is none', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0])
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      fillMode: FillMode.NONE,
      strokeMode: StrokeMode.UNIQUE,
      strokeWidth: 2,
      strokeOpacity: 1
    };

    const layers = createPointLayers(
      createTableWithFields([]),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as ScatterplotLayer;

    expect(pointLayer).toBeInstanceOf(ScatterplotLayer);
    expect(pointLayer.props.filled).toBe(false);
    expect(pointLayer.props.stroked).toBe(true);
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

  it('uses MultiShapeLayer for categorical circle symbols without applying any pattern', () => {
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
    expect(
      (pointLayer.props as Record<string, unknown>).patternEnabled
    ).toBeUndefined();
    expect(String(pointLayer.props.id)).not.toContain('-pattern-');
  });

  it('keeps categorical circle symbols on a stable MultiShapeLayer regardless of classification pattern fields', () => {
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
        colors: ['#3366cc']
      }
    };

    const layers = createPointLayers(
      createTableWithRows([{ category: 'north' }], ['category']),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as MultiShapeLayer;
    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(
      (pointLayer.props as Record<string, unknown>).patternEnabled
    ).toBeUndefined();
    expect(String(pointLayer.props.id)).not.toContain('-pattern-');
  });

  it('renders every custom category shape through a getShape binary attribute', () => {
    const categoryShapes = [
      ShapeType.CIRCLE,
      ShapeType.SQUARE,
      ShapeType.CROSS,
      ShapeType.DIAMOND,
      ShapeType.TRIANGLE,
      ShapeType.STAR,
      ShapeType.RECTANGLE
    ];
    const labels = categoryShapes.map((shape) => `label-${shape}`);

    parsePointDataWithProjectionMock.mockReturnValue({
      length: labels.length,
      featureIds: new Uint32Array(labels.map((_, index) => index))
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: {
        attributes: {},
        featureIds: new Uint32Array(labels.map((_, index) => index))
      }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.CATEGORIES,
      categoryColumn: 'category',
      categoryShape: CategoryShapeMode.DIFFERENT,
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: labels.length,
        labels,
        categoryValues: labels,
        colors: labels.map(() => '#3366cc'),
        categoryShapes
      }
    };

    const layers = createPointLayers(
      createTableWithRows(
        labels.map((category) => ({ category })),
        ['category']
      ),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as MultiShapeLayer;
    const shapeAttribute = (
      pointLayer.props.data as {
        attributes?: { getShape?: { value?: Float32Array } };
      }
    ).attributes?.getShape;

    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(Array.from(shapeAttribute?.value ?? [])).toEqual(
      categoryShapes.map((shape) => SHAPE_ORDINAL[shape])
    );
  });

  it('builds native category shape and radius attributes from vectors without row proxies', () => {
    rowAccessorMock.mockImplementation(
      (
        _table: ArrowTable,
        accessor: (row: Record<string, unknown>) => unknown
      ) =>
        () =>
          accessor({})
    );
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 3,
      featureIds: new Uint32Array([0, 1, 2])
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: {
        attributes: {},
        featureIds: new Uint32Array([0, 1, 2])
      }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.CATEGORIES,
      categoryColumn: 'category',
      categoryShape: CategoryShapeMode.ORDERED,
      shape: ShapeType.CIRCLE,
      minSize: 2,
      maxSize: 10,
      missingData: {
        show: true,
        shape: MissingDataShape.SQUARE,
        color: '#bbbbbb',
        size: 6
      },
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 3,
        labels: ['low', 'middle', 'off'],
        categoryValues: ['low', 'middle', 'off'],
        colors: ['#3366cc', '#ff832b', '#24a148'],
        disabledLabels: ['off']
      }
    };
    const table = createVectorOnlyTableWithRows(
      [{ category: 'low' }, { category: null }, { category: 'off' }],
      ['category']
    );

    const layers = createPointLayers(
      table,
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as MultiShapeLayer;
    const layerData = pointLayer.props.data as {
      attributes?: {
        getRadius?: { value?: Float32Array };
        getShape?: { value?: Float32Array };
      };
    };

    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(
      (table as unknown as { get: ReturnType<typeof vi.fn> }).get
    ).not.toHaveBeenCalled();
    expect(Array.from(layerData.attributes?.getShape?.value ?? [])).toEqual([
      SHAPE_ORDINAL[ShapeType.CIRCLE],
      SHAPE_ORDINAL[ShapeType.SQUARE],
      SHAPE_ORDINAL[ShapeType.CIRCLE]
    ]);
    expect(Array.from(layerData.attributes?.getRadius?.value ?? [])).toEqual([
      2, 6, 0
    ]);
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
    expect(pointLayer.props.radiusMinPixels).toBe(0);
  });

  it('merges overlaid double proportional symbols into one descending radius order', () => {
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

    // Overlay stacks the two variables in one layer so a small symbol is never
    // buried under a large one: A radii are 20/40/0 and B radii 40/20/0, which
    // have to interleave instead of sorting per variable.
    expect(layers).toHaveLength(1);

    const overlayData = layers[0].props.data as {
      length?: number;
      featureIds?: Uint32Array;
      attributes?: { getRadius?: { value?: Float32Array } };
    };

    expect(overlayData.length).toBe(6);
    expect(Array.from(overlayData.featureIds ?? [])).toEqual([
      1, 0, 0, 1, 2, 2
    ]);
    expect(Array.from(overlayData.attributes?.getRadius?.value ?? [])).toEqual([
      40, 40, 20, 20, 0, 0
    ]);
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

  it('never applies a fill-classification pattern to symbols even in categories fill mode (REV-SYM-2)', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0])
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: { attributes: {}, featureIds: new Uint32Array([0]) }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.PROPORTIONAL,
      shape: ShapeType.CIRCLE,
      sizeColumn: 'population',
      fillMode: FillMode.CATEGORIES,
      categoryColumn: 'category',
      fillClassification: {
        method: ClassificationMethod.MANUAL,
        classes: 1,
        labels: ['North'],
        categoryValues: ['north'],
        colors: ['#3366cc'],
        patternId: 'cross'
      }
    };

    const layers = createPointLayers(
      createTableWithRows(
        [{ category: 'north', population: 10 }],
        ['category', 'population']
      ),
      createPointGeometryInfo(),
      { ...createContext(visualization), statistics: { min: 10, max: 10 } }
    );

    const pointLayer = layers[0] as MultiShapeLayer;
    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(
      (pointLayer.props as Record<string, unknown>).patternEnabled
    ).toBeUndefined();
  });

  it('renders every selectable missing-data representation shape on native points (REV-SYM-6)', () => {
    const cases = [
      {
        missingShape: MissingDataShape.SQUARE,
        expectedShape: ShapeType.SQUARE
      },
      { missingShape: MissingDataShape.CROSS, expectedShape: ShapeType.CROSS }
    ];

    for (const { missingShape, expectedShape } of cases) {
      parsePointDataWithProjectionMock.mockReturnValue({
        length: 3,
        featureIds: new Uint32Array([0, 1, 2])
      });
      createScatterplotLayerPropsMock.mockReturnValue({
        data: { attributes: {}, featureIds: new Uint32Array([0, 1, 2]) }
      });

      const visualization = createSymbolVisualization();
      visualization.symbol = {
        ...visualization.symbol!,
        mode: SymbolMode.PROPORTIONAL,
        shape: ShapeType.CIRCLE,
        sizeColumn: 'population',
        minSize: 4,
        maxSize: 20,
        missingData: {
          show: true,
          shape: missingShape,
          color: '#bbbbbb',
          size: 6
        }
      };

      const layers = createPointLayers(
        createTableWithRows(
          [{ population: 25 }, { population: 100 }, { population: null }],
          ['population']
        ),
        createPointGeometryInfo(),
        { ...createContext(visualization), statistics: { min: 25, max: 100 } }
      );

      const pointLayer = layers[0] as MultiShapeLayer;
      const shapeAttribute = (
        pointLayer.props.data as {
          attributes?: { getShape?: { value?: Float32Array } };
        }
      ).attributes?.getShape;

      expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
      expect(Array.from(shapeAttribute?.value ?? [])).toContain(
        SHAPE_ORDINAL[expectedShape]
      );
    }
  });

  it('hides a disabled category on the symbol FILL channel (Fond En catégories) (REV-SYM-3)', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1])
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: { attributes: {}, featureIds: new Uint32Array([0, 1]) }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.UNIQUE,
      shape: ShapeType.CIRCLE,
      fillMode: FillMode.CATEGORIES,
      categoryColumn: 'category',
      fillClassification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        labels: ['public', 'private'],
        categoryValues: ['public', 'private'],
        colors: ['#00ad92', '#f287ac'],
        disabledLabels: ['private']
      }
    };

    const layers = createPointLayers(
      createTableWithRows(
        [{ category: 'public' }, { category: 'private' }],
        ['category']
      ),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const fillColorAttribute = (
      layers[0].props.data as {
        attributes: { getFillColor?: { value: Uint8ClampedArray } };
      }
    ).attributes.getFillColor;
    expect(fillColorAttribute).toBeDefined();

    const values = Array.from(fillColorAttribute!.value);
    // public (row 0) visible; private (row 1) disabled → transparent (alpha 0).
    expect(values[3]).toBeGreaterThan(0);
    expect(values[7]).toBe(0);
  });

  it('applies the fill-classification choropleth to circle symbols (REV-SYM-4)', () => {
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
      mode: SymbolMode.UNIQUE,
      shape: ShapeType.CIRCLE,
      fillMode: FillMode.CLASSES,
      fillValueColumn: 'population',
      fillClassification: {
        method: ClassificationMethod.KMEANS,
        classes: 3,
        breaks: [100, 1000],
        colors: ['#e4e6e7', '#7fa3ca', '#1b5eaa']
      }
    };

    const layers = createPointLayers(
      createTableWithRows(
        [{ population: 50 }, { population: 500 }, { population: 5000 }],
        ['population']
      ),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const fillColorAttribute = (
      layers[0].props.data as {
        attributes: { getFillColor?: { value: Uint8ClampedArray } };
      }
    ).attributes.getFillColor;
    expect(fillColorAttribute).toBeDefined();

    const values = Array.from(fillColorAttribute!.value);
    const tuples: string[] = [];
    for (let i = 0; i < values.length; i += 4) {
      tuples.push(values.slice(i, i + 4).join(','));
    }
    // Choropleth gradient applied (distinct per-class colors), not a uniform fallback.
    expect(new Set(tuples).size).toBeGreaterThan(1);
  });

  it('routes a dashed circle stroke through MultiShapeLayer with dash params (REV-SYM-5)', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0])
    });
    createScatterplotLayerPropsMock.mockReturnValue({
      data: { attributes: {}, featureIds: new Uint32Array([0]) }
    });

    const visualization = createSymbolVisualization();
    visualization.symbol = {
      ...visualization.symbol!,
      mode: SymbolMode.UNIQUE,
      shape: ShapeType.CIRCLE,
      strokeMode: StrokeMode.UNIQUE,
      strokeColor: '#1f1f1f',
      strokeWidth: 4,
      strokeOpacity: 1,
      strokeDashed: true,
      strokeDashedPattern: BasemapDottedPattern.DOTS
    };

    const layers = createPointLayers(
      createTableWithFields([]),
      createPointGeometryInfo(),
      createContext(visualization)
    );

    const pointLayer = layers[0] as MultiShapeLayer;
    expect(pointLayer).toBeInstanceOf(MultiShapeLayer);
    expect(pointLayer.props.dashed).toBe(true);
    expect(pointLayer.props.dotLength).toBeGreaterThan(0);
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

  it('renders binary lines without a visualization context', () => {
    const layers = createLineLayers(
      createTableWithRows([{ route_name: 'A' }], ['route_name']),
      createLineGeometryInfo(),
      {
        ...createContext(createVisualization(FillMode.UNIQUE)),
        viz: null
      }
    );
    const lineLayer = layers.find((layer) => layer instanceof PathLayer) as
      PathLayer | undefined;

    expect(lineLayer).toBeDefined();
    expect(lineLayer?.props.getColor).toEqual([51, 102, 204, 255]);
  });

  it('renders dotted lines as round dots and dash-dot distinctly from dashes', () => {
    const buildLineLayer = (pattern: BasemapDottedPattern) => {
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
        createLineGeometryInfo(),
        createContext(visualization)
      );
      const lineLayer = layers.find((layer) => layer instanceof PathLayer) as
        PathLayer | undefined;
      const props = lineLayer?.props as
        { getDashArray?: [number, number]; capRounded?: boolean } | undefined;
      return { dash: props?.getDashArray, capRounded: props?.capRounded };
    };

    const dots = buildLineLayer(BasemapDottedPattern.DOTS);
    const dashes = buildLineLayer(BasemapDottedPattern.DASHES);
    const dashDot = buildLineLayer(BasemapDottedPattern.DASH_DOT);

    expect(dots.dash?.[0]).toBeGreaterThan(0);
    expect(dots.capRounded).toBe(true);

    expect(dashDot.dash).not.toEqual(dashes.dash);
    expect(dashDot.capRounded).toBe(true);

    expect(dashes.capRounded).toBe(false);
  });

  it('applies missing-data color, width and dash style to binary lines', () => {
    parsePathsWithProjectionMock.mockReturnValue({
      length: 1,
      featureIds: new Uint32Array([0]),
      positions: new Float32Array([0, 0, 1, 1]),
      startIndices: new Uint32Array([0, 2]),
      size: 2
    });
    pathColorAttrMock.mockImplementation(
      (
        pathData: { featureIds?: Uint32Array },
        getColor: (featureId: number) => [number, number, number, number]
      ) => ({
        value: new Uint8ClampedArray(
          Array.from(pathData.featureIds ?? new Uint32Array()).flatMap(
            (featureId) => Array.from(getColor(featureId))
          )
        ),
        size: 4
      })
    );
    pathWidthAttrMock.mockImplementation(
      (
        pathData: { featureIds?: Uint32Array },
        getWidth: (featureId: number) => number
      ) => ({
        value: new Float32Array(
          Array.from(pathData.featureIds ?? new Uint32Array()).map(
            (featureId) => getWidth(featureId)
          )
        ),
        size: 1
      })
    );

    const visualization: VisualizationConfig = {
      id: 'viz-line-missing-binary-style',
      name: 'Line missing data binary style test',
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
      createLineGeometryInfo(),
      createContext(visualization)
    );
    const lineLayer = layers.find((layer) => layer instanceof PathLayer) as
      PathLayer | undefined;
    const attributes = (
      lineLayer?.props.data as
        | {
            attributes: {
              getColor?: { value: Uint8ClampedArray };
              getWidth?: { value: Float32Array };
              getDashArray?: { value: Float32Array };
            };
          }
        | undefined
    )?.attributes;

    expect(attributes?.getColor?.value).toEqual(
      new Uint8ClampedArray([18, 52, 86, 255])
    );
    expect(attributes?.getWidth?.value).toEqual(new Float32Array([7]));
    expect(Array.from(attributes?.getDashArray?.value ?? [])).toEqual([
      12, 4, 12, 4
    ]);
  });

  it('draws dashed native lines on the binary PathLayer', () => {
    const visualization: VisualizationConfig = {
      id: 'viz-line-dashed-binary',
      name: 'Binary dashed line test',
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
      style: { fillOpacity: 1, strokeOpacity: 1, strokeWidth: 1 },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows([{ route_name: 'A' }], ['route_name']),
      createLineGeometryInfo(),
      createContext(visualization)
    );
    const lineLayer = layers.find((layer) => layer instanceof PathLayer) as
      PathLayer | undefined;

    expect(lineLayer?.props.id).toMatch(/-dashed$/);
    expect(lineLayer?.props.extensions).toHaveLength(1);
    expect(
      (lineLayer?.props as { getDashArray?: unknown } | undefined)?.getDashArray
    ).toEqual([6, 4]);
  });

  it('gives missing native lines their own binary dash array', () => {
    parsePathsWithProjectionMock.mockReturnValue({
      length: 2,
      featureIds: new Uint32Array([0, 1]),
      positions: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]),
      startIndices: new Uint32Array([0, 2, 4]),
      size: 2
    });
    const visualization: VisualizationConfig = {
      id: 'viz-line-missing-binary',
      name: 'Binary missing line test',
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
      style: { fillOpacity: 1, strokeOpacity: 1, strokeWidth: 1 },
      mapping: {}
    };

    const layers = createLineLayers(
      createTableWithRows(
        [
          { route_name: 'A', flow: 4 },
          { route_name: 'B', flow: null }
        ],
        ['route_name', 'flow']
      ),
      createLineGeometryInfo(),
      createContext(visualization)
    );
    const lineLayer = layers.find((layer) => layer instanceof PathLayer) as
      PathLayer | undefined;
    const dashArrays = (
      lineLayer?.props.data as
        { attributes: { getDashArray?: { value: Float32Array } } } | undefined
    )?.attributes.getDashArray?.value;

    expect(lineLayer?.props.extensions).toHaveLength(1);
    expect(Array.from(dashArrays ?? [])).toEqual([0, 0, 0, 0, 12, 4, 12, 4]);
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
    expect(source).toContain('outlineWidth: resolveTextOutlineWidth(');
  });
});

describe('createHighlightedFeatureOverlay', () => {
  const rows = [{ __id: 1 }, { __id: 2 }, { __id: 3 }];

  it('outlines highlighted polygons from binary paths', () => {
    parsePathsWithProjectionMock.mockReturnValue({
      length: 3,
      featureIds: new Uint32Array([0, 1, 2]),
      positions: new Float32Array(12),
      startIndices: new Uint32Array([0, 2, 4, 6]),
      size: 2
    });
    const context = createContext(createVisualization(FillMode.UNIQUE));

    const overlay = createHighlightedFeatureOverlay(
      'polygon-layer',
      createTableWithRows(rows, ['__id']),
      createGeometryInfo(),
      new Set([2]),
      0,
      context
    );

    expect(overlay).toBeInstanceOf(PathLayer);
    expect(parsePathsWithProjectionMock).toHaveBeenCalledWith(
      expect.anything(),
      context.customProjection
    );
  });

  it('rings only the highlighted points', () => {
    parsePointDataWithProjectionMock.mockReturnValue({
      length: 3,
      featureIds: new Uint32Array([0, 1, 2]),
      positions: new Float32Array([10, 11, 20, 21, 30, 31]),
      size: 2
    });

    const overlay = createHighlightedFeatureOverlay(
      'point-layer',
      createTableWithRows(rows, ['__id']),
      createPointGeometryInfo(),
      new Set([1, 3]),
      0,
      createContext(createVisualization(FillMode.UNIQUE))
    ) as ScatterplotLayer | null;
    const data = overlay?.props.data as unknown as {
      length: number;
      attributes: { getPosition: { value: Float64Array } };
    };

    expect(overlay).toBeInstanceOf(ScatterplotLayer);
    expect(overlay?.props.filled).toBe(false);
    expect(overlay?.props.stroked).toBe(true);
    expect(data.length).toBe(2);
    expect(Array.from(data.attributes.getPosition.value)).toEqual([
      10, 11, 30, 31
    ]);
  });

  it('returns no overlay when nothing is highlighted', () => {
    expect(
      createHighlightedFeatureOverlay(
        'polygon-layer',
        createTableWithRows(rows, ['__id']),
        createGeometryInfo(),
        new Set(),
        0,
        createContext(createVisualization(FillMode.UNIQUE))
      )
    ).toBeNull();
  });
});
