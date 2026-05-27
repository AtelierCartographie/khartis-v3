import * as d3geo from 'd3-geo';
import { ScatterplotLayer } from '@deck.gl/layers';
import { describe, expect, it } from 'vitest';
import {
  applyProjectionSphereMask,
  createProjectionSphereMaskLayer,
  createProjectionSphereOutlineLayer,
  PROJECTION_SPHERE_MASK_LAYER_ID,
  PROJECTION_SPHERE_OUTLINE_LAYER_ID
} from './projection-sphere-mask.utils';

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
});
