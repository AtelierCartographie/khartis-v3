import { GeoJsonLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  BasemapCityCategory,
  BasemapCitySymbol,
  BasemapDottedPattern
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
});
