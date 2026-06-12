import { describe, expect, it } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapLayer } from '../types/basemap.types';
import { getBasemapAuxLayerDefaultVisibility } from './basemap-aux-layer-visibility.utils';

function landLayer(style: string | null, file: string): BasemapLayer {
  return {
    type: BasemapLayerType.LAND,
    style,
    file
  };
}

describe('basemap aux layer visibility defaults', () => {
  it('keeps a single general land layer visible by default', () => {
    const layer = landLayer('land', 'world-land');

    expect(getBasemapAuxLayerDefaultVisibility(layer, [layer])).toBe(true);
  });

  it('hides the general land layer when a specialized land layer is available', () => {
    const nutsLand = landLayer('nuts-land', 'europe-nuts-land');
    const generalLand = landLayer('land', 'europe-land');

    expect(
      getBasemapAuxLayerDefaultVisibility(generalLand, [nutsLand, generalLand])
    ).toBe(false);
    expect(
      getBasemapAuxLayerDefaultVisibility(nutsLand, [nutsLand, generalLand])
    ).toBe(true);
  });
});
