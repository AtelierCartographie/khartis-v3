import { describe, expect, it } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '../types/basemap.types';
import { findBasemapLayerByType } from './basemap.service.svelte';

function createBasemapMetadata(): BasemapMetadata {
  return {
    file: 'monde-countries-2024-medium',
    title_fr: 'Monde',
    title_en: 'World',
    source: 'test',
    date: '2024',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'simple' },
    simplification_level: 'medium',
    layers: [
      {
        title_fr: 'Centroids des pays',
        title_en: 'Country centroids',
        type: BasemapLayerType.CENTROID,
        file: 'monde-countries-centroids-2024-medium',
        style: null
      },
      {
        title_fr: 'Limites des pays',
        title_en: 'Country boundaries',
        type: BasemapLayerType.LIMIT,
        file: 'monde-countries-limites-2024-medium',
        style: 'limit-level-0'
      }
    ]
  };
}

describe('findBasemapLayerByType', () => {
  it('returns the matching centroid layer when the basemap exposes one', () => {
    const layer = findBasemapLayerByType(
      createBasemapMetadata(),
      BasemapLayerType.CENTROID
    );

    expect(layer?.file).toBe('monde-countries-centroids-2024-medium');
  });

  it('returns null when the requested layer type is not present', () => {
    const layer = findBasemapLayerByType(
      createBasemapMetadata(),
      BasemapLayerType.POINT
    );

    expect(layer).toBeNull();
  });
});
