import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClassificationMethod,
  PrimitiveFilterType,
  VisualizationType,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  FillMode,
  MissingDataShape,
  StrokeMode
} from '$lib/features/main-toolbar/constants';
import type { GeometryInfo, LayerContext } from '../types';

const {
  arrowTableToGeoJSONMock,
  createCompatibleSolidPolygonLayerPropsMock,
  createPathLayerPropsMock,
  createPolygonFillColorAttributeMock,
  createScatterplotLayerPropsMock,
  parsePathsMock,
  parsePointDataMock,
  parsePointDataWithProjectionMock,
  parseSolidPolygonsMock,
  pathColorAttrMock,
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
    parsePathsMock: vi.fn(),
    parsePointDataMock: vi.fn(),
    parsePointDataWithProjectionMock: vi.fn(),
    parseSolidPolygonsMock: vi.fn(),
    pathColorAttrMock: vi.fn(),
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

vi.mock('../utils/geoarrow-stream-bridge', async () => {
  const actual = await vi.importActual<
    typeof import('../utils/geoarrow-stream-bridge')
  >('../utils/geoarrow-stream-bridge');

  return {
    ...actual,
    parsePaths: parsePathsMock,
    parsePointData: parsePointDataMock,
    parsePointDataWithProjection: parsePointDataWithProjectionMock,
    parseSolidPolygons: parseSolidPolygonsMock,
    pathColorAttr: pathColorAttrMock,
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

vi.mock('../utils/solid-polygon-layer-props', () => ({
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
    }))
  };
});

import {
  createPolygonLayers,
  resolveSplitMappingFeatureIdColumn
} from './layer-factory';

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
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    },
    get(index: number) {
      return rows[index];
    }
  } as unknown as ArrowTable;
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

function createContext(
  viz: VisualizationConfig,
  yearFilter?: LayerContext['yearFilter']
): LayerContext {
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
    yearFilter,
    customProjection: {
      stream: (sink) => sink
    } as LayerContext['customProjection']
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

function getPatternLayer(
  layers: ReturnType<typeof createPolygonLayers>
): GeoJsonLayer | undefined {
  return layers.find(
    (layer) =>
      layer instanceof GeoJsonLayer &&
      String(layer.props.id).includes('-pattern-')
  ) as GeoJsonLayer | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  projectGeoJSONMock.mockImplementation((geojson) => geojson);
  parseSolidPolygonsMock.mockReturnValue({
    featureIds: new Uint32Array([0])
  });
  parsePathsMock.mockReturnValue({
    featureIds: new Uint32Array([0])
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
  parsePointDataMock.mockReturnValue({});
  parsePointDataWithProjectionMock.mockReturnValue({});
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

describe('createPolygonLayers', () => {
  it('projects and year-filters the pattern overlay in the GeoJSON fallback path', () => {
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
      createContext(createVisualization(FillMode.UNIQUE), {
        column: 'year',
        value: 2024
      })
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
    ).toEqual(['keep-projected']);
    expect(
      (patternLayer?.props.data as FeatureCollection<Polygon>).features.map(
        (feature) => feature.properties?.id
      )
    ).toEqual(['keep-projected']);
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
    expect(arrowTableToGeoJSONMock).not.toHaveBeenCalled();
  });
});
