import * as d3geo from 'd3-geo';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { FeatureCollection, Polygon } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogCategory } from '$lib/features/commons/utils/logger';
import {
  applyProjectionSphereMask,
  createProjectionSphereMaskLayer,
  createProjectionSphereOutlineLayer,
  PROJECTION_SPHERE_MASK_LAYER_ID,
  PROJECTION_SPHERE_OUTLINE_LAYER_ID
} from './projection-sphere-mask.utils';

function createCompositeProjection(): ProjectionLike {
  return {
    stream: vi.fn(),
    getSubProjections: () => [
      {
        id: 'mainland',
        projection: d3geo.geoEquirectangular(),
        bounds: [-10, 35, 40, 72],
        screenExtent: [
          [20, 20],
          [780, 580]
        ]
      },
      {
        id: 'overseas',
        projection: d3geo.geoEquirectangular(),
        bounds: [50, -22, 56, -12],
        screenExtent: [
          [20, 500],
          [140, 580]
        ]
      }
    ]
  } as unknown as ProjectionLike;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@ateliercartographie/geoarrow-deck-stream');
  vi.doUnmock('./solid-polygon-layer-props.utils');
});

describe('projection sphere mask utils', () => {
  it('creates a Deck polygon layer from the projected d3 sphere', () => {
    const projection = d3geo.geoNaturalEarth1().fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      { type: 'Sphere' }
    );

    const layer = createProjectionSphereMaskLayer({
      projection,
      modelMatrix: null
    });

    expect(layer?.id).toBe(PROJECTION_SPHERE_MASK_LAYER_ID);
    expect(layer?.props.pickable).toBe(false);
    expect(layer?.props.coordinateSystem).toBeDefined();
    expect(layer?.props.parameters).toMatchObject({
      depthCompare: 'always',
      depthWriteEnabled: false
    });
  });

  it('returns null when projection has no stream method', () => {
    const layer = createProjectionSphereMaskLayer({
      projection: undefined,
      modelMatrix: null
    });

    expect(layer).toBeNull();
  });

  it('prepends the sphere layer when applied to layers', () => {
    const projection = d3geo.geoNaturalEarth1().fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      { type: 'Sphere' }
    );
    const sphereLayer = createProjectionSphereMaskLayer({
      projection,
      modelMatrix: null
    });
    const pointLayer = new ScatterplotLayer({
      id: 'points',
      data: [{ position: [0, 0] }],
      getPosition: (item: { position: [number, number] }) => item.position
    });

    const orderedLayers = applyProjectionSphereMask([pointLayer], sphereLayer);

    expect(orderedLayers).toHaveLength(2);
    expect(orderedLayers[0]).toBe(sphereLayer);
    expect(orderedLayers[1].id).toBe('points');
  });

  it('returns layers unchanged when no sphere layer is provided', () => {
    const pointLayer = new ScatterplotLayer({
      id: 'points',
      data: [{ position: [0, 0] }],
      getPosition: (item: { position: [number, number] }) => item.position
    });

    const orderedLayers = applyProjectionSphereMask([pointLayer], null);

    expect(orderedLayers).toHaveLength(1);
    expect(orderedLayers[0]).toBe(pointLayer);
  });

  it('uses the supplied fillColor for the mask layer', () => {
    const projection = d3geo.geoNaturalEarth1().fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      { type: 'Sphere' }
    );

    const layer = createProjectionSphereMaskLayer({
      projection,
      modelMatrix: null,
      fillColor: [10, 20, 30, 200]
    });

    expect(layer?.props.getFillColor).toEqual([10, 20, 30, 200]);
  });

  it('uses the supplied color and width for the outline layer', () => {
    const projection = d3geo.geoNaturalEarth1().fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      { type: 'Sphere' }
    );

    const layer = createProjectionSphereOutlineLayer({
      projection,
      modelMatrix: null,
      color: [40, 50, 60, 128],
      width: 2.5
    });

    expect(layer?.id).toBe(PROJECTION_SPHERE_OUTLINE_LAYER_ID);
    expect(layer?.props.getColor).toEqual([40, 50, 60, 128]);
    expect(layer?.props.getWidth).toBe(2.5);
  });

  it('uses every composite frame for the mask layer', () => {
    const layer = createProjectionSphereMaskLayer({
      projection: createCompositeProjection(),
      modelMatrix: null,
      fillColor: [10, 20, 30, 200]
    }) as GeoJsonLayer | null;
    const data = layer?.props.data as FeatureCollection<Polygon> | undefined;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.filled).toBe(true);
    expect(layer?.props.stroked).toBe(false);
    expect(layer?.props.getFillColor).toEqual([10, 20, 30, 200]);
    expect(data?.features).toHaveLength(2);
  });

  it('uses every composite frame for the outline layer', () => {
    const layer = createProjectionSphereOutlineLayer({
      projection: createCompositeProjection(),
      modelMatrix: null,
      color: [40, 50, 60, 128],
      width: 2.5
    }) as GeoJsonLayer | null;
    const data = layer?.props.data as FeatureCollection<Polygon> | undefined;

    expect(layer).toBeInstanceOf(GeoJsonLayer);
    expect(layer?.props.filled).toBe(false);
    expect(layer?.props.stroked).toBe(true);
    expect(layer?.props.getLineColor).toEqual([40, 50, 60, 128]);
    expect(layer?.props.getLineWidth).toBe(2.5);
    expect(data?.features).toHaveLength(2);
  });

  it('logs and returns null when sphere parsing fails', async () => {
    vi.resetModules();
    const parseError = new Error('sphere parse failed');
    vi.doMock('@ateliercartographie/geoarrow-deck-stream', async () => {
      const actual = await vi.importActual<
        typeof import('@ateliercartographie/geoarrow-deck-stream')
      >('@ateliercartographie/geoarrow-deck-stream');

      return {
        ...actual,
        parseSphere: vi.fn(() => {
          throw parseError;
        })
      };
    });

    const utils = await import('./projection-sphere-mask.utils');
    const { logger } = await import('$lib/features/commons/utils/logger');
    const loggerWarn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const projection = {
      stream: vi.fn()
    } as unknown as Parameters<
      typeof utils.createProjectionSphereMaskLayer
    >[0]['projection'];

    expect(
      utils.createProjectionSphereMaskLayer({ projection, modelMatrix: null })
    ).toBeNull();
    expect(
      utils.createProjectionSphereOutlineLayer({
        projection,
        modelMatrix: null
      })
    ).toBeNull();
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to parse projection sphere polygon',
      LogCategory.MAP,
      expect.objectContaining({
        error: parseError,
        flow: 'projection_sphere_polygon_parse'
      })
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to parse projection sphere outline path',
      LogCategory.MAP,
      expect.objectContaining({
        error: parseError,
        flow: 'projection_sphere_outline_path_parse'
      })
    );
  });

  it('logs and returns null when sphere layer builders fail', async () => {
    vi.resetModules();
    const maskError = new Error('mask layer failed');
    const outlineError = new Error('outline layer failed');
    const sphereData = {
      length: 1,
      positions: {
        length: 2,
        value: new Float32Array([0, 0])
      }
    };

    vi.doMock('./solid-polygon-layer-props.utils', () => ({
      createCompatibleSolidPolygonLayerProps: vi.fn(() => {
        throw maskError;
      })
    }));
    vi.doMock('@ateliercartographie/geoarrow-deck-stream', async () => {
      const actual = await vi.importActual<
        typeof import('@ateliercartographie/geoarrow-deck-stream')
      >('@ateliercartographie/geoarrow-deck-stream');

      return {
        ...actual,
        createPathLayerProps: vi.fn(() => {
          throw outlineError;
        }),
        parseSphere: vi.fn(() => sphereData)
      };
    });

    const utils = await import('./projection-sphere-mask.utils');
    const { logger } = await import('$lib/features/commons/utils/logger');
    const loggerWarn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const projection = {
      stream: vi.fn()
    } as unknown as Parameters<
      typeof utils.createProjectionSphereMaskLayer
    >[0]['projection'];

    expect(
      utils.createProjectionSphereMaskLayer({ projection, modelMatrix: null })
    ).toBeNull();
    expect(
      utils.createProjectionSphereOutlineLayer({
        projection,
        modelMatrix: null
      })
    ).toBeNull();
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to create projection sphere mask layer',
      LogCategory.MAP,
      expect.objectContaining({
        error: maskError,
        flow: 'projection_sphere_mask_layer_create',
        extra: expect.objectContaining({
          layerId: PROJECTION_SPHERE_MASK_LAYER_ID
        })
      })
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to create projection sphere outline layer',
      LogCategory.MAP,
      expect.objectContaining({
        error: outlineError,
        flow: 'projection_sphere_outline_layer_create',
        extra: expect.objectContaining({
          layerId: PROJECTION_SPHERE_OUTLINE_LAYER_ID
        })
      })
    );
  });
});
