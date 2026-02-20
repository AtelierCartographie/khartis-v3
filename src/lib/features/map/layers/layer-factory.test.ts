import { TextLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import { DeckLayerId, GeometryType } from '../constants';
import type { GeometryInfo, LayerContext } from '../types';
import { createDeckLayers } from './layer-factory';

const geojsonFixture: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
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
      },
      properties: {
        featurecla: 'Admin-0 country',
        sovereignt: 'France'
      }
    }
  ]
};

const geometryInfoFixture: GeometryInfo = {
  type: GeometryType.POLYGON,
  encoding: null,
  geoColumn: 'geom',
  isNativeGeoArrow: false,
  isWkbEncoded: false,
  isGeoJsonEncoded: true
};

vi.mock('../io', () => ({
  arrowTableToGeoJSON: vi.fn(() => geojsonFixture),
  extractGeometryInfo: vi.fn(() => geometryInfoFixture)
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  },
  ScaleType: {
    LINEAR: 'linear',
    SQRT: 'sqrt',
    LOG: 'log'
  },
  VisualizationType: {
    CHOROPLETH: 'choropleth',
    PROPORTIONAL: 'proportional',
    CATEGORICAL: 'categorical',
    BIVARIATE: 'bivariate'
  }
}));

vi.mock('@geoarrow/deck.gl-layers', () => ({}));
vi.mock('@duckdb/duckdb-wasm', () => ({}));

interface TestVisualization {
  id: string;
  name: string;
  type: string;
  datasetId: string;
  enabled: boolean;
  primitiveFilters: string[];
  style: {
    labelOpacity?: number;
    textOpacity?: number;
    labelColor?: string;
    textColor?: string;
  };
  mapping: {
    labelColumn?: string;
    secondaryLabelColumn?: string;
  };
}

function createVisualization(
  overrides: Partial<TestVisualization> = {}
): TestVisualization {
  return {
    id: 'viz-1',
    name: 'Viz test',
    type: 'categorical',
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [],
    style: {
      labelOpacity: 1,
      textOpacity: 1,
      labelColor: '#2f74ff',
      textColor: '#1f9d55'
    },
    mapping: {
      labelColumn: 'featurecla',
      secondaryLabelColumn: 'sovereignt'
    },
    ...overrides
  };
}

function createLayerContext(
  overrides: Partial<LayerContext> = {}
): LayerContext {
  return {
    viz: createVisualization() as unknown as LayerContext['viz'],
    datasetId: 'dataset-1',
    fillColor: [0, 0, 0],
    strokeColor: [255, 255, 255],
    fillOpacity: 1,
    strokeWidth: 1,
    strokeOpacity: 1,
    statistics: { min: 0, max: 1 },
    categoryColorMap: null,
    ...overrides
  };
}

describe('layer-factory text overlays', () => {
  it('creates label and text layers when label/text are enabled', () => {
    const layers = createDeckLayers({} as ArrowTable, createLayerContext());

    const labelLayer = layers.find((layer) =>
      layer.id.includes(DeckLayerId.LABEL_LAYER)
    );
    const textLayer = layers.find((layer) =>
      layer.id.includes(DeckLayerId.TEXT_LAYER)
    );

    expect(labelLayer).toBeDefined();
    expect(textLayer).toBeDefined();
    expect(labelLayer).toBeInstanceOf(TextLayer);
    expect(textLayer).toBeInstanceOf(TextLayer);

    const labelData = (labelLayer as TextLayer<{ text: string }>).props
      .data as Array<{ text: string }>;
    const textData = (textLayer as TextLayer<{ text: string }>).props
      .data as Array<{ text: string }>;

    expect(labelData).toHaveLength(1);
    expect(textData).toHaveLength(1);
    expect(labelData[0]?.text).toBe('Admin-0 country');
    expect(textData[0]?.text).toBe('Admin-0 country\nFrance');
  });

  it('does not create text overlays when opacities are set to 0', () => {
    const visualization = createVisualization({
      style: {
        labelOpacity: 0,
        textOpacity: 0
      }
    });

    const layers = createDeckLayers(
      {} as ArrowTable,
      createLayerContext({
        viz: visualization as unknown as LayerContext['viz']
      })
    );

    // No text/label layers should be created (opacity 0).
    // The polygon layer IS created with visible: false (primitiveFilters: [])
    // because we preserve GPU buffers for instant re-display.
    const textLayers = layers.filter(
      (l) =>
        l.id.includes(DeckLayerId.LABEL_LAYER) ||
        l.id.includes(DeckLayerId.TEXT_LAYER)
    );
    expect(textLayers).toHaveLength(0);
  });
});
