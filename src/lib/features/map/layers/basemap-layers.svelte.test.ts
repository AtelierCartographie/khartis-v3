import { GeoJsonLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  BasemapCityCategory,
  BasemapCitySymbol,
  BasemapDottedPattern,
  BasemapGraticuleMode,
  BasemapRemarquables,
  BasemapRepresentation,
  BASEMAP_LAYER_CONFIG
} from '$lib/features/main-toolbar/constants';
import {
  BASEMAP_LAYER_ID,
  basemapLayersStore
} from '../stores/basemap-layers.store.svelte';
import type { GeometryInfo } from '../types';

const { arrowTableToGeoJSONMock, extractGeometryInfoMock, projectGeoJSONMock } =
  vi.hoisted(() => {
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
      projectGeoJSONMock: vi.fn()
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

vi.mock('../utils/geoarrow-stream-bridge', async () => {
  const actual = await vi.importActual<
    typeof import('../utils/geoarrow-stream-bridge')
  >('../utils/geoarrow-stream-bridge');

  return {
    ...actual,
    projectGeoJSON: projectGeoJSONMock
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
  createVillesLayer,
  type MetadataLayerEntry
} from './basemap-layers';

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

function createPolygonGeometryInfo(): GeometryInfo {
  return {
    type: 'Polygon',
    encoding: 'geojson',
    geoColumn: 'geometry',
    isNativeGeoArrow: false,
    isWkbEncoded: false,
    isGeoJsonEncoded: true
  };
}

function createNativePolygonGeometryInfo(): GeometryInfo {
  return {
    type: 'MultiPolygon',
    encoding: 'geoarrow.multipolygon',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false,
    isGeoJsonEncoded: false
  };
}

function createLineGeometryInfo(): GeometryInfo {
  return {
    type: 'LineString',
    encoding: 'geojson',
    geoColumn: 'geometry',
    isNativeGeoArrow: false,
    isWkbEncoded: false,
    isGeoJsonEncoded: true
  };
}

function createNativeLineGeometryInfo(): GeometryInfo {
  return {
    type: 'LineString',
    encoding: 'geoarrow.linestring',
    geoColumn: 'geometry',
    isNativeGeoArrow: true,
    isWkbEncoded: false,
    isGeoJsonEncoded: false
  };
}

function createPointGeometryInfo(): GeometryInfo {
  return {
    type: 'Point',
    encoding: 'geojson',
    geoColumn: 'geometry',
    isNativeGeoArrow: false,
    isWkbEncoded: false,
    isGeoJsonEncoded: true
  };
}

function createPolygonGeoJSON(
  id: string
): FeatureCollection<Polygon, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id },
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

function createPointGeoJSON(
  id: string
): FeatureCollection<Point, { id: string; adm0cap: number; pop_max: number }> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id,
          adm0cap: 1,
          pop_max: 1_000_000
        },
        geometry: {
          type: 'Point',
          coordinates: [2, 3]
        }
      }
    ]
  };
}

function createTerreConfig() {
  return {
    id: 'terre' as const,
    visible: true,
    fillColor: '#ffffff',
    fillShadow: false,
    fillOpacity: 100,
    strokeColor: '#333333',
    strokeDotted: false,
    strokeDottedPattern: BasemapDottedPattern.DOTS,
    strokeThickness: 0.5,
    strokeOpacity: 100
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  basemapLayersStore.resetToDefaults();
  projectGeoJSONMock.mockImplementation((geojson) => geojson);
});

describe('basemap projection fallbacks', () => {
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
        color: '#8d8d8d',
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

  it('projects terre GeoJSON fallback layers with the active projection', () => {
    const sourceGeoJSON = createPolygonGeoJSON('raw-land');
    const projectedGeoJSON = createPolygonGeoJSON('projected-land');
    const table = {} as ArrowTable;
    const ctx = createProjectionContext();

    extractGeometryInfoMock.mockReturnValue(createPolygonGeometryInfo());
    arrowTableToGeoJSONMock.mockReturnValue(sourceGeoJSON);
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layers = createTerreLayers(table, createTerreConfig(), ctx);
    const layer = layers[0] as GeoJsonLayer | undefined;

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.data).toBe(projectedGeoJSON);
  });

  it('uses the GeoJSON fallback for terre when a composite projection is active', () => {
    const sourceGeoJSON = createPolygonGeoJSON('raw-composite-land');
    const projectedGeoJSON = createPolygonGeoJSON('projected-composite-land');
    const table = {} as ArrowTable;
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockReturnValue(createNativePolygonGeometryInfo());
    arrowTableToGeoJSONMock.mockReturnValue(sourceGeoJSON);
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layers = createTerreLayers(table, createTerreConfig(), ctx);
    const layer = layers[0];

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer).not.toBeInstanceOf(SolidPolygonLayer);
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

  it('clips generated equator lines to the active basemap bbox', () => {
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
    expect(coordinates[0]).toEqual([2, 0]);
    expect(coordinates[coordinates.length - 1]).toEqual([10, 0]);
  });

  it('omits generated equator lines when the active bbox excludes latitude zero', () => {
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

    expect(data.features).toHaveLength(0);
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
    expect(layer?.props.updateTriggers.data[0]).toContain(
      BasemapGraticuleMode.REGULAR
    );
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

    expect(names).toContain('meridian-0');
    expect(names).toContain('meridian-5');
    expect(names).toContain('meridian-10');
    expect(names).toContain('parallel--5');
    expect(names).toContain('parallel-5');
    expect(names).not.toContain('parallel-0');
    expect(layer?.props.updateTriggers.data[0]).toContain(
      'regular:5:0,-5,10,5:exclude-equator'
    );
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

  it('uses generated equator and graticule layers even when metadata entries exist', () => {
    const graticuleTable = {
      id: 'metadata-graticule'
    } as unknown as ArrowTable;
    const geographicLinesTable = {
      id: 'metadata-geographic-lines'
    } as unknown as ArrowTable;

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.EQUATEUR, true);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERIDIENS, true);

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
    expect(foregroundIds).toContain('basemap-meridiens-basemap-default');
    expect(foregroundIds).not.toContain('basemap-meta-graticule');
    expect(foregroundIds).not.toContain('basemap-meta-geo-lines');
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

  it('projects city point overlays before rendering them', () => {
    const sourceCities = createPointGeoJSON('raw-city');
    const projectedCities = createPointGeoJSON('projected-city');
    const ctx = createProjectionContext();

    projectGeoJSONMock.mockReturnValue(projectedCities);

    const layer = createVillesLayer(
      sourceCities,
      {
        id: 'villes',
        visible: true,
        category: BasemapCityCategory.CAPITALS,
        symbol: BasemapCitySymbol.POINT,
        color: '#111111',
        size: 6,
        opacity: 100
      },
      ctx
    ) as GeoJsonLayer | null;

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceCities,
      ctx.projection
    );
    expect(layer?.props.data).toBe(projectedCities);
  });

  it('connects centroid metadata to city symbols and labels', () => {
    const centroidTable = { id: 'cities' } as unknown as ArrowTable;
    const citiesGeoJSON: FeatureCollection<
      Point,
      { id: string; name: string; pop_max: number; adm0cap: number }
    > = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'small',
            name: 'Small',
            pop_max: 10,
            adm0cap: 0
          },
          geometry: {
            type: 'Point',
            coordinates: [1, 1]
          }
        },
        {
          type: 'Feature',
          properties: {
            id: 'large',
            name: 'Large',
            pop_max: 100,
            adm0cap: 0
          },
          geometry: {
            type: 'Point',
            coordinates: [2, 2]
          }
        }
      ]
    };

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.VILLES, {
      count: 1,
      labelColor: '#ff0000',
      labelSize: 12,
      labelFontFamily: 'Cabin'
    });

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === centroidTable ? createPointGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === centroidTable ? citiesGeoJSON : null
    );

    const layers = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: centroidTable,
            style: null,
            type: BasemapLayerType.CENTROID,
            file: 'centroids.parquet'
          } satisfies MetadataLayerEntry
        ],
        availableMetadataLayerTypes: [BasemapLayerType.CENTROID],
        stylePresets: null
      }
    );

    const symbolLayer = layers.foreground.find((layer) =>
      String(layer.props.id).includes('basemap-villes')
    ) as GeoJsonLayer | undefined;
    const labelLayer = layers.foreground.find((layer) =>
      String(layer.props.id).includes('basemap-villes-labels')
    ) as GeoJsonLayer | undefined;
    const symbolData = symbolLayer?.props.data as
      | FeatureCollection<Point, { id: string }>
      | undefined;
    const labelData = labelLayer?.props.data as
      | FeatureCollection<Point, { name: string }>
      | undefined;

    expect(symbolLayer).toBeInstanceOf(GeoJsonLayer);
    expect(labelLayer).toBeInstanceOf(GeoJsonLayer);
    expect(symbolData?.features).toHaveLength(1);
    expect(symbolData?.features[0]?.properties.id).toBe('large');
    expect(labelData?.features).toHaveLength(1);
    expect(labelLayer?.props.getText(labelData?.features[0])).toBe('Large');
    expect(labelLayer?.props.getTextColor).toEqual([255, 0, 0, 255]);
  });

  it('normalizes single-coordinate centroid metadata to point city layers', () => {
    const centroidTable = { id: 'geoarrow-centroids' } as unknown as ArrowTable;
    const centroidsGeoJSON: FeatureCollection<
      LineString,
      { id: string; name: string; pop_max: number; adm0cap: number }
    > = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'centroid-city',
            name: 'Centroid City',
            pop_max: 100,
            adm0cap: 0
          },
          geometry: {
            type: 'LineString',
            coordinates: [[2, 2]]
          }
        }
      ]
    };

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === centroidTable
        ? {
            type: 'MULTIPOINT',
            encoding: 'geoarrow.multipoint',
            geoColumn: 'geometry',
            isNativeGeoArrow: true,
            isWkbEncoded: false,
            isGeoJsonEncoded: false
          }
        : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === centroidTable ? centroidsGeoJSON : null
    );

    const layers = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: centroidTable,
            style: null,
            type: BasemapLayerType.CENTROID,
            file: 'centroids.parquet'
          } satisfies MetadataLayerEntry
        ],
        availableMetadataLayerTypes: [BasemapLayerType.CENTROID],
        stylePresets: null
      }
    );

    const symbolLayer = layers.foreground.find(
      (layer) =>
        String(layer.props.id).includes('basemap-villes') &&
        !String(layer.props.id).includes('labels')
    ) as GeoJsonLayer | undefined;
    const labelLayer = layers.foreground.find((layer) =>
      String(layer.props.id).includes('basemap-villes-labels')
    ) as GeoJsonLayer | undefined;
    const symbolData = symbolLayer?.props.data as
      | FeatureCollection<Point, { id: string }>
      | undefined;
    const labelData = labelLayer?.props.data as
      | FeatureCollection<Point, { name: string }>
      | undefined;

    expect(symbolLayer).toBeInstanceOf(GeoJsonLayer);
    expect(labelLayer).toBeInstanceOf(GeoJsonLayer);
    expect(symbolData?.features[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [2, 2]
    });
    expect(labelLayer?.props.getText(labelData?.features[0])).toBe(
      'Centroid City'
    );
  });

  it('falls back to point metadata for city symbols and labels', () => {
    const pointTable = { id: 'point-cities' } as unknown as ArrowTable;
    const citiesGeoJSON: FeatureCollection<
      Point,
      { id: string; name: string; pop_max: number; adm0cap: number }
    > = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'point-city',
            name: 'Point City',
            pop_max: 100,
            adm0cap: 0
          },
          geometry: {
            type: 'Point',
            coordinates: [2, 2]
          }
        }
      ]
    };

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === pointTable ? createPointGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === pointTable ? citiesGeoJSON : null
    );

    const layers = createBasemapLayers(
      null,
      {},
      {
        metadataLayers: [
          {
            table: pointTable,
            style: null,
            type: BasemapLayerType.POINT,
            file: 'points.parquet'
          } satisfies MetadataLayerEntry
        ],
        availableMetadataLayerTypes: [BasemapLayerType.POINT],
        stylePresets: null
      }
    );

    const symbolLayer = layers.foreground.find(
      (layer) =>
        String(layer.props.id).includes('basemap-villes') &&
        !String(layer.props.id).includes('labels')
    ) as GeoJsonLayer | undefined;
    const labelLayer = layers.foreground.find((layer) =>
      String(layer.props.id).includes('basemap-villes-labels')
    ) as GeoJsonLayer | undefined;
    const labelData = labelLayer?.props.data as
      | FeatureCollection<Point, { name: string }>
      | undefined;

    expect(symbolLayer).toBeInstanceOf(GeoJsonLayer);
    expect(labelLayer).toBeInstanceOf(GeoJsonLayer);
    expect(labelLayer?.props.getText(labelData?.features[0])).toBe(
      'Point City'
    );
  });

  it('projects city symbols and labels with the active projection', () => {
    const centroidTable = { id: 'projected-cities' } as unknown as ArrowTable;
    const sourceCities: FeatureCollection<
      Point,
      { id: string; name: string; pop_max: number; adm0cap: number }
    > = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'raw-city',
            name: 'Raw City',
            pop_max: 100,
            adm0cap: 0
          },
          geometry: {
            type: 'Point',
            coordinates: [2, 2]
          }
        }
      ]
    };
    const projectedCities: FeatureCollection<
      Point,
      { id: string; name: string; pop_max: number; adm0cap: number }
    > = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'projected-city',
            name: 'Projected City',
            pop_max: 100,
            adm0cap: 0
          },
          geometry: {
            type: 'Point',
            coordinates: [20, 20]
          }
        }
      ]
    };
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.VILLES, true);
    projectGeoJSONMock.mockReturnValue(projectedCities);
    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === centroidTable ? createPointGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === centroidTable ? sourceCities : null
    );

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: centroidTable,
          style: null,
          type: BasemapLayerType.CENTROID,
          file: 'centroids.parquet'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.CENTROID],
      stylePresets: null
    });

    const symbolLayer = layers.foreground.find(
      (layer) =>
        String(layer.props.id).includes('basemap-villes') &&
        !String(layer.props.id).includes('labels')
    ) as GeoJsonLayer | undefined;
    const labelLayer = layers.foreground.find((layer) =>
      String(layer.props.id).includes('basemap-villes-labels')
    ) as GeoJsonLayer | undefined;

    expect(projectGeoJSONMock).toHaveBeenCalledTimes(2);
    expect(symbolLayer?.props.data).toBe(projectedCities);
    expect(labelLayer?.props.data).toBe(projectedCities);
  });

  it('projects metadata land fallbacks inside createBasemapLayers', () => {
    const metadataTable = { id: 'land' } as unknown as ArrowTable;
    const sourceGeoJSON = createPolygonGeoJSON('raw-meta-land');
    const projectedGeoJSON = createPolygonGeoJSON('projected-meta-land');
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createPolygonGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: null,
          type: BasemapLayerType.LAND,
          file: 'land.geojson'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LAND],
      stylePresets: null
    });

    const metaLandLayer = layers.background.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-land')
    ) as GeoJsonLayer | undefined;

    expect(metaLandLayer?.props.data).toBe(projectedGeoJSON);
  });

  it('adds metadata land beneath terre when both a basemap table and land metadata exist', () => {
    const worldBaseTable = { id: 'world-base' } as unknown as ArrowTable;
    const metadataTable = { id: 'land-backdrop' } as unknown as ArrowTable;
    const worldGeoJSON = createPolygonGeoJSON('raw-world-land');
    const metadataGeoJSON = createPolygonGeoJSON('raw-meta-backdrop');
    const projectedGeoJSON = createPolygonGeoJSON('projected-meta-backdrop');
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === worldBaseTable || table === metadataTable
        ? createPolygonGeometryInfo()
        : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) => {
      if (table === metadataTable) {
        return metadataGeoJSON;
      }
      if (table === worldBaseTable) {
        return worldGeoJSON;
      }
      return null;
    });
    projectGeoJSONMock.mockImplementation((geojson) => {
      if (geojson === metadataGeoJSON) {
        return projectedGeoJSON;
      }
      return geojson;
    });

    const layers = createBasemapLayers(worldBaseTable, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: 'land',
          type: BasemapLayerType.LAND,
          file: 'land.geojson'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LAND],
      stylePresets: {
        land: {
          fillColor: [220, 220, 220, 255],
          layer_type: 'solid-polygon',
          stroked: false,
          description_fr: 'land',
          description_en: 'land'
        }
      }
    });

    const metaLandLayer = layers.background.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-land')
    ) as GeoJsonLayer | undefined;
    const terreLayer = layers.background.find((layer) =>
      String(layer.props.id).includes('basemap-terre')
    );

    expect(metaLandLayer).toBeInstanceOf(GeoJsonLayer);
    expect(metaLandLayer?.props.data).toBe(projectedGeoJSON);
    expect(metaLandLayer?.props.getFillColor).toEqual([255, 255, 255, 255]);
    expect(terreLayer).toBeDefined();
  });

  it('uses the GeoJSON fallback for native metadata land with composite projections', () => {
    const metadataTable = { id: 'native-land' } as unknown as ArrowTable;
    const sourceGeoJSON = createPolygonGeoJSON('raw-native-meta-land');
    const projectedGeoJSON = createPolygonGeoJSON('projected-native-meta-land');
    const ctx = createCompositeProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativePolygonGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: null,
          type: BasemapLayerType.LAND,
          file: 'native-land.parquet'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LAND],
      stylePresets: null
    });

    const metaLandLayer = layers.background.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-land')
    );

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(metaLandLayer).toBeInstanceOf(GeoJsonLayer);
  });

  it('projects metadata limit fallbacks inside createBasemapLayers', () => {
    const metadataTable = { id: 'limit' } as unknown as ArrowTable;
    const sourceGeoJSON = createLineGeoJSON('raw-meta-limit');
    const projectedGeoJSON = createLineGeoJSON('projected-meta-limit');
    const ctx = createProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createLineGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

    const layers = createBasemapLayers(null, ctx, {
      metadataLayers: [
        {
          table: metadataTable,
          style: null,
          type: BasemapLayerType.LIMIT,
          file: 'limits.geojson'
        } satisfies MetadataLayerEntry
      ],
      availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
      stylePresets: null
    });

    const metaLimitLayer = layers.foreground.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-limit')
    ) as GeoJsonLayer | undefined;

    expect(metaLimitLayer?.props.data).toBe(projectedGeoJSON);
  });

  it('uses projected GeoJSON for native metadata limits under composite projections', () => {
    const metadataTable = {
      id: 'native-meta-limit-composite'
    } as unknown as ArrowTable;
    const sourceGeoJSON = createLineGeoJSON('raw-native-meta-limit');
    const projectedGeoJSON = createLineGeoJSON('projected-native-meta-limit');
    const ctx = createCompositeProjectionContext();

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? createNativeLineGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

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
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-limit')
    ) as GeoJsonLayer | undefined;

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(metaLimitLayer?.props.data).toBe(projectedGeoJSON);
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
            isWkbEncoded: true,
            isGeoJsonEncoded: false
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

  it('connects metadata limit frontieres thickness and dotted styling to Deck.gl layers', () => {
    const metadataTable = { id: 'limit-style' } as unknown as ArrowTable;
    const sourceGeoJSON = createLineGeoJSON('styled-meta-limit');

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
      table === metadataTable ? createLineGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) =>
      table === metadataTable ? sourceGeoJSON : null
    );

    const createLayers = () =>
      createBasemapLayers(
        null,
        {},
        {
          metadataLayers: [
            {
              table: metadataTable,
              style: null,
              type: BasemapLayerType.LIMIT,
              file: 'limits.geojson'
            } satisfies MetadataLayerEntry
          ],
          availableMetadataLayerTypes: [BasemapLayerType.LIMIT],
          stylePresets: null
        }
      );

    const solidLayer = createLayers().foreground.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-limit')
    ) as GeoJsonLayer | undefined;

    expect(solidLayer).toBeInstanceOf(GeoJsonLayer);
    if (!solidLayer) throw new Error('Expected metadata limit layer');

    const solidProps = solidLayer.props as typeof solidLayer.props & {
      getDashArray: [number, number];
    };

    expect(solidProps.getLineColor).toEqual([18, 52, 86, 255]);
    expect(solidProps.getLineWidth).toBe(BASEMAP_LAYER_CONFIG.thickness.max);
    expect(solidProps.lineWidthMaxPixels).toBe(
      BASEMAP_LAYER_CONFIG.thickness.max
    );
    expect(solidProps.getDashArray).toEqual([0, 0]);

    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.FRONTIERES, {
      dotted: true,
      dottedPattern: BasemapDottedPattern.DASHES
    });

    const dottedLayer = createLayers().foreground.find(
      (layer) =>
        layer instanceof GeoJsonLayer &&
        String(layer.props.id).includes('basemap-meta-limit')
    ) as GeoJsonLayer | undefined;

    expect(dottedLayer).toBeInstanceOf(GeoJsonLayer);
    if (!dottedLayer) throw new Error('Expected metadata limit layer');

    const dottedProps = dottedLayer.props as typeof dottedLayer.props & {
      getDashArray: [number, number];
      _subLayerProps: Record<
        'polygons-stroke' | 'linestrings',
        {
          getDashArray: [number, number];
          extensions: unknown[];
        }
      >;
    };

    expect(dottedProps.getLineWidth).toBe(BASEMAP_LAYER_CONFIG.thickness.max);
    expect(dottedProps.getDashArray).toEqual([8, 4]);
    expect(dottedProps.extensions).toHaveLength(1);
    expect(dottedProps._subLayerProps.linestrings.getDashArray).toEqual([8, 4]);
    expect(dottedProps._subLayerProps.linestrings.extensions).toHaveLength(1);
    expect(dottedProps.updateTriggers).toMatchObject({
      getLineColor: ['#123456', 1],
      getDashArray: [true, BasemapDottedPattern.DASHES],
      getLineWidth: [BASEMAP_LAYER_CONFIG.thickness.max]
    });
  });

  it('projects frontieres fallback outlines when metadata limits are absent', () => {
    const table = { id: 'frontieres-fallback' } as unknown as ArrowTable;
    const sourceGeoJSON = createLineGeoJSON('raw-frontieres');
    const projectedGeoJSON = createLineGeoJSON('projected-frontieres');
    const ctx = createProjectionContext();

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createLineGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

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
    ) as GeoJsonLayer | null;

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.data).toBe(projectedGeoJSON);
  });

  it('uses projected GeoJSON for native frontieres under composite projections', () => {
    const table = {
      id: 'native-frontieres-composite'
    } as unknown as ArrowTable;
    const sourceGeoJSON = createLineGeoJSON('raw-native-frontieres');
    const projectedGeoJSON = createLineGeoJSON('projected-native-frontieres');
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createNativeLineGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

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
    ) as GeoJsonLayer | null;

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.data).toBe(projectedGeoJSON);
  });

  it('connects imported frontieres thickness and dotted styling to fallback outlines', () => {
    const table = {
      id: 'imported-frontieres-fallback'
    } as unknown as ArrowTable;
    const sourceGeoJSON = createPolygonGeoJSON('nuts2-outline');

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createPolygonGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? sourceGeoJSON : null
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
    ) as GeoJsonLayer | null;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    if (!layer) throw new Error('Expected frontieres layer');

    const props = layer.props as typeof layer.props & {
      getDashArray: [number, number];
      _subLayerProps: Record<
        'polygons-stroke' | 'linestrings',
        {
          getDashArray: [number, number];
          extensions: unknown[];
        }
      >;
    };

    expect(props.getLineWidth).toBe(3);
    expect(props.lineWidthMaxPixels).toBe(BASEMAP_LAYER_CONFIG.thickness.max);
    expect(props.getDashArray).toEqual([8, 4]);
    expect(props.extensions).toHaveLength(1);
    expect(props._subLayerProps['polygons-stroke'].getDashArray).toEqual([
      8, 4
    ]);
    expect(props._subLayerProps['polygons-stroke'].extensions).toHaveLength(1);
    expect(props._subLayerProps.linestrings.getDashArray).toEqual([8, 4]);
    expect(props.updateTriggers).toMatchObject({
      getLineColor: ['#123456', 1],
      getDashArray: [true, BasemapDottedPattern.DASHES],
      getLineWidth: [3]
    });
  });

  it('connects lakes and rivers metadata to background and foreground Deck.gl layers', () => {
    const lakesTable = { id: 'lakes' } as unknown as ArrowTable;
    const riversTable = { id: 'rivers' } as unknown as ArrowTable;
    const lakesGeoJSON = createPolygonGeoJSON('lake');
    const riversGeoJSON = createLineGeoJSON('river');

    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.MERS, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.TERRE, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.FRONTIERES, false);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.LACS, true);
    basemapLayersStore.setLayerVisibility(BASEMAP_LAYER_ID.RIVIERES, true);
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.LACS, {
      color: '#00ff00',
      opacity: 40
    });
    basemapLayersStore.updateLayer(BASEMAP_LAYER_ID.RIVIERES, {
      color: '#00ff00',
      opacity: 40,
      thickness: 3
    });

    extractGeometryInfoMock.mockImplementation((table: ArrowTable) => {
      if (table === lakesTable) return createPolygonGeometryInfo();
      if (table === riversTable) return createLineGeometryInfo();
      return null;
    });
    arrowTableToGeoJSONMock.mockImplementation((table: ArrowTable) => {
      if (table === lakesTable) return lakesGeoJSON;
      if (table === riversTable) return riversGeoJSON;
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

    const lakesLayer = layers.background.find((layer) =>
      String(layer.props.id).includes('basemap-lacs')
    ) as GeoJsonLayer | undefined;
    const riversLayer = layers.foreground.find((layer) =>
      String(layer.props.id).includes('basemap-rivieres')
    ) as GeoJsonLayer | undefined;

    expect(lakesLayer).toBeInstanceOf(GeoJsonLayer);
    expect(lakesLayer?.props.getFillColor).toEqual([0, 255, 0, 51]);
    expect(lakesLayer?.props.getLineColor).toEqual([0, 255, 0, 102]);
    expect(lakesLayer?.props.lineWidthMinPixels).toBe(0);
    expect(lakesLayer?.props.updateTriggers).toEqual({
      getFillColor: ['#00ff00', 40],
      getLineColor: ['#00ff00', 40],
      lineWidthMinPixels: [0]
    });

    expect(riversLayer).toBeInstanceOf(GeoJsonLayer);
    expect(riversLayer?.props.getLineColor).toEqual([0, 255, 0, 102]);
    expect(riversLayer?.props.getLineWidth).toBe(3);
    expect(riversLayer?.props.updateTriggers).toEqual({
      getLineColor: ['#00ff00', 40],
      getLineWidth: [3],
      getDashArray: [false, BasemapDottedPattern.DOTS]
    });
  });

  it('connects relief representation, color, and opacity to Deck.gl layer props', () => {
    const table = { id: 'relief-world-base' } as unknown as ArrowTable;
    const sourceGeoJSON = createPolygonGeoJSON('relief');

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createPolygonGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? sourceGeoJSON : null
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

    const shadingLayer = createReliefLayers(
      table,
      createReliefConfig(BasemapRepresentation.SHADING, 50),
      {}
    )[0] as GeoJsonLayer | undefined;
    const elevationLayer = createReliefLayers(
      table,
      createReliefConfig(BasemapRepresentation.ELEVATION, 50),
      {}
    )[0] as GeoJsonLayer | undefined;
    const contourLayer = createReliefLayers(
      table,
      createReliefConfig(BasemapRepresentation.CONTOURS, 50),
      {}
    )[0] as GeoJsonLayer | undefined;

    expect(shadingLayer).toBeInstanceOf(GeoJsonLayer);
    expect(shadingLayer?.props.id).toContain('basemap-relief');
    expect(shadingLayer?.props.filled).toBe(true);
    expect(shadingLayer?.props.getFillColor).toEqual([51, 102, 153, 64]);
    expect(shadingLayer?.props.updateTriggers).toEqual({
      getFillColor: ['#336699', 50, BasemapRepresentation.SHADING],
      getLineColor: ['#336699', 50, BasemapRepresentation.SHADING],
      getLineWidth: [0.35]
    });

    expect(elevationLayer?.props.filled).toBe(true);
    expect(elevationLayer?.props.getFillColor).toEqual([51, 102, 153, 102]);
    expect(elevationLayer?.props.getLineColor).toEqual([96, 96, 96, 89]);
    expect(elevationLayer?.props.updateTriggers).toMatchObject({
      getFillColor: ['#336699', 50, BasemapRepresentation.ELEVATION],
      getLineColor: ['#336699', 50, BasemapRepresentation.ELEVATION],
      getLineWidth: [0.5]
    });

    expect(contourLayer?.props.filled).toBe(false);
    expect(contourLayer?.props.getFillColor).toEqual([51, 102, 153, 0]);
    expect(contourLayer?.props.getLineColor).toEqual([51, 102, 153, 128]);
    expect(contourLayer?.props.updateTriggers).toMatchObject({
      getFillColor: ['#336699', 50, BasemapRepresentation.CONTOURS],
      getLineColor: ['#336699', 50, BasemapRepresentation.CONTOURS],
      getLineWidth: [0.8]
    });
  });

  it('uses projected GeoJSON for native relief under composite projections', () => {
    const table = { id: 'native-relief-composite' } as unknown as ArrowTable;
    const sourceGeoJSON = createPolygonGeoJSON('raw-native-relief');
    const projectedGeoJSON = createPolygonGeoJSON('projected-native-relief');
    const ctx = createCompositeProjectionContext();

    extractGeometryInfoMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? createNativePolygonGeometryInfo() : null
    );
    arrowTableToGeoJSONMock.mockImplementation((candidate: ArrowTable) =>
      candidate === table ? sourceGeoJSON : null
    );
    projectGeoJSONMock.mockReturnValue(projectedGeoJSON);

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
    )[0] as GeoJsonLayer | undefined;

    expect(projectGeoJSONMock).toHaveBeenCalledWith(
      sourceGeoJSON,
      ctx.projection
    );
    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.data).toBe(projectedGeoJSON);
  });
});
