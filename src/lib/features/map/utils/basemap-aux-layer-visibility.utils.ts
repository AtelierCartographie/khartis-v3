import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapLayer } from '../types/basemap.types';

export function getBasemapAuxLayerDefaultVisibility(
  layer: BasemapLayer,
  siblingLayers: readonly BasemapLayer[]
): boolean {
  if (
    layer.type !== BasemapLayerType.LAND ||
    layer.style !== 'land' ||
    !siblingLayers.some(
      (sibling) =>
        sibling !== layer &&
        sibling.type === BasemapLayerType.LAND &&
        sibling.style !== 'land'
    )
  ) {
    return true;
  }

  return false;
}
