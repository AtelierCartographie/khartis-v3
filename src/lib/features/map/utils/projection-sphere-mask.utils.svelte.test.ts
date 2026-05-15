import * as d3geo from 'd3-geo';
import { ScatterplotLayer } from '@deck.gl/layers';
import { describe, expect, it } from 'vitest';
import {
  applyProjectionSphereMask,
  createProjectionSphereMaskLayer,
  PROJECTION_SPHERE_MASK_LAYER_ID
} from './projection-sphere-mask.utils';

describe('projection sphere mask utils', () => {
  it('creates a Deck mask layer from the projected d3 sphere', () => {
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
    expect(layer?.props.operation).toBe('mask');
    expect(layer?.props.pickable).toBe(false);
  });

  it('prepends the mask layer and applies MaskExtension props to rendered layers', () => {
    const projection = d3geo.geoNaturalEarth1().fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      { type: 'Sphere' }
    );
    const maskLayer = createProjectionSphereMaskLayer({
      projection,
      modelMatrix: null
    });
    const pointLayer = new ScatterplotLayer({
      id: 'points',
      data: [{ position: [0, 0] }],
      getPosition: (item: { position: [number, number] }) => item.position
    });

    const maskedLayers = applyProjectionSphereMask([pointLayer], maskLayer);

    expect(maskedLayers).toHaveLength(2);
    expect(maskedLayers[0]).toBe(maskLayer);
    expect(maskedLayers[1].id).toBe('points');
    expect(maskedLayers[1].props.maskId).toBe(PROJECTION_SPHERE_MASK_LAYER_ID);
    expect(maskedLayers[1].props.extensions).toHaveLength(1);
  });
});
